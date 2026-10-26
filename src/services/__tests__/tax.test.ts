import { describe, it, expect } from 'vitest';
import {
  SEED_COMPANY_TAX,
  SEED_TAX_CODES,
  SEED_TAX_GROUPS,
  SEED_WITHHOLDING,
  SEED_WITHHOLDING_GROUPS,
  SYSTEM_ATCS,
  SYSTEM_TAX_CODES,
  type CompanyTaxProfile,
} from '../../mocks/taxes';
import type { Item } from '../../mocks/items';
import type { Account } from '../../mocks/chartOfAccounts';
import type { ItemGroup } from '../../mocks/itemMasters';
import {
  determineTax,
  determineWithholding,
  type LineItem,
  type LineParty,
  type TaxMasterData,
} from '../taxDetermination';
import {
  recalcLineTaxes,
  editTaxCode,
  lineAtc,
  withTaxFiling,
  returnsOf,
  type RecalcableLine,
} from '../taxRecalc';
import {
  lineWithholdings,
  totalWithholding,
  stampWithholding,
  resolveCustomerWithholding,
  customerWithholds,
  withIncomeType,
  REVERSE_CHARGE_ATCS,
  type WithholdingLine,
} from '../withholding';
import { blockedDeactivation, type TaxUsage } from '../taxUsage';

// ── Shared fixtures ──────────────────────────────────────────────────────────
// Build TaxMasterData from the committed seed data; these are pure arrays so no
// collection reset is needed. Tests that need a tweaked company copy the profile.

const data = (company: CompanyTaxProfile = SEED_COMPANY_TAX[0]): TaxMasterData => ({
  company,
  codes: SEED_TAX_CODES,
  groups: SEED_TAX_GROUPS,
  withholding: SEED_WITHHOLDING,
  withholdingGroups: SEED_WITHHOLDING_GROUPS,
});

const nonVatCompany = (percentageTaxCode = ''): CompanyTaxProfile => ({
  ...SEED_COMPANY_TAX[0],
  vatRegistered: false,
  percentageTaxCode,
});

const govCompany = (): CompanyTaxProfile => ({ ...SEED_COMPANY_TAX[0], governmentEntity: true });

/** A plain vatable goods item (sales + purchase groups), no fixed codes, no withholding group. */
const goodsItem = (patch: Partial<LineItem> = {}): LineItem => ({
  taxLiable: true,
  salesTaxGroup: 'S-VAT12',
  salesTaxCode: '',
  purchaseTaxGroup: 'P-VAT12',
  purchaseTaxCode: '',
  withholdingGroup: '',
  ...patch,
});

/** A resident VAT-registered corporate party with no special status. */
const party = (patch: Partial<LineParty> = {}): LineParty => ({
  vatRegistered: true,
  vatExemptions: [],
  topWithholdingAgent: false,
  businessType: 'Corporation',
  nonResidentDigitalServices: false,
  nonResident: false,
  withholdingOverrideId: '',
  swornDeclarationRef: '',
  swornDeclarationDate: '',
  swornDeclarationAttachments: [],
  taxTreatyCountryCode: '',
  taxTreatyCertificate: '',
  taxTreatyCertificateExpiry: '',
  taxTreatyIncomes: [],
  ...patch,
});

const DATE = '2026-06-15';

// ─────────────────────────────────────────────────────────────────────────────
// determineTax — Sales direction
// ─────────────────────────────────────────────────────────────────────────────
describe('determineTax — Sales VAT determination', () => {
  it('a plain vatable sale to a VAT-registered customer resolves to OVAT at 12%', () => {
    const r = determineTax('Sales', goodsItem(), party(), data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.VATABLE); // OVAT
    expect(r.rate).toBe(12);
  });

  it('an item that is not tax liable gets no tax code', () => {
    const r = determineTax('Sales', goodsItem({ taxLiable: false }), party(), data(), DATE);
    expect(r.taxCode).toBeUndefined();
    expect(r.rate).toBeUndefined();
  });

  it('a government customer is VATable and carries the creditable-VAT note', () => {
    const r = determineTax('Sales', goodsItem(), party({ businessType: 'Government' }), data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.VATABLE);
    expect(r.notes.some((n) => n.includes('government buyer withholds'))).toBe(true);
  });

  it('a zero-rated exemption cert resolves to ZVAT at 0%', () => {
    const customer = party({
      vatExemptions: [
        { id: 've1', type: 'Zero-rated', certificateRef: 'PEZA-1', basis: '', validUntil: '', attachments: [{} as never] },
      ],
    });
    const r = determineTax('Sales', goodsItem(), customer, data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.ZERO_RATED); // ZVAT
    expect(r.rate).toBe(0);
  });

  it('an exempt-entity cert resolves to XVAT at 0%', () => {
    const customer = party({
      vatExemptions: [
        { id: 've2', type: 'Exempt entity', certificateRef: '', basis: 'RA 9520', validUntil: '', attachments: [{} as never] },
      ],
    });
    const r = determineTax('Sales', goodsItem(), customer, data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.EXEMPT); // XVAT
    expect(r.rate).toBe(0);
  });

  it('an exemption with no attachment is ignored (pending) — charges standard VAT', () => {
    const customer = party({
      vatExemptions: [
        { id: 've3', type: 'Zero-rated', certificateRef: '', basis: '', validUntil: '', attachments: [] },
      ],
    });
    const r = determineTax('Sales', goodsItem(), customer, data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.VATABLE);
    expect(r.trace.some((t) => t.rule === 'Customer VAT exemption' && t.outcome === 'warning')).toBe(true);
  });

  it('an expired exemption is ignored — charges standard VAT with a warning', () => {
    const customer = party({
      vatExemptions: [
        { id: 've4', type: 'Zero-rated', certificateRef: '', basis: '', validUntil: '2020-01-01', attachments: [{} as never] },
      ],
    });
    const r = determineTax('Sales', goodsItem(), customer, data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.VATABLE);
    expect(r.trace.some((t) => t.rule === 'Customer VAT exemption' && t.detail.includes('expired'))).toBe(true);
  });

  it('a top-withholding-agent customer gets the informational note', () => {
    const r = determineTax('Sales', goodsItem(), party({ topWithholdingAgent: true }), data(), DATE);
    expect(r.notes.some((n) => n.includes('top withholding agent'))).toBe(true);
  });

  it('a fixed sales tax code on the item wins over the group', () => {
    const r = determineTax('Sales', goodsItem({ salesTaxCode: 'ZVAT' }), party(), data(), DATE);
    expect(r.taxCode?.code).toBe('ZVAT');
  });

  it('falls back to the company default (OVAT) when the item has no sales group', () => {
    const r = determineTax('Sales', goodsItem({ salesTaxGroup: '' }), party(), data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.VATABLE);
  });
});

describe('determineTax — Sales for a non-VAT company (percentage tax)', () => {
  it('a non-VAT company with no percentageTaxCode falls back to PT', () => {
    const r = determineTax('Sales', goodsItem(), party(), data(nonVatCompany('')), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.PERCENTAGE_TAX); // PT
  });

  it('a non-VAT company uses its configured percentageTaxCode when set', () => {
    const r = determineTax('Sales', goodsItem(), party(), data(nonVatCompany('PT-060')), DATE);
    expect(r.taxCode?.code).toBe('PT-060');
    expect(r.rate).toBe(2);
  });

  it('percentage tax applies even to a government customer (company status wins first)', () => {
    const r = determineTax('Sales', goodsItem(), party({ businessType: 'Government' }), data(nonVatCompany('')), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.PERCENTAGE_TAX);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// determineTax — Purchase direction (input VAT variants, importation, reverse charge)
// ─────────────────────────────────────────────────────────────────────────────
describe('determineTax — Purchase input VAT variants', () => {
  it('goods from a VAT supplier resolve to IVAT (domestic goods input VAT)', () => {
    const r = determineTax('Purchase', goodsItem(), party(), data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.DOMESTIC); // IVAT
    expect(r.rate).toBe(12);
  });

  it('services from a VAT supplier resolve to IVAT-S via the P-VAT12S group', () => {
    const r = determineTax('Purchase', goodsItem({ purchaseTaxGroup: 'P-VAT12S' }), party(), data(), DATE);
    expect(r.taxCode?.code).toBe('IVAT-S');
  });

  it('capital goods from a VAT supplier resolve to IVAT-C via the P-VAT12C group', () => {
    const r = determineTax('Purchase', goodsItem({ purchaseTaxGroup: 'P-VAT12C' }), party(), data(), DATE);
    expect(r.taxCode?.code).toBe('IVAT-C');
  });

  it('a fixed purchase tax code on the item wins over the group', () => {
    const r = determineTax('Purchase', goodsItem({ purchaseTaxCode: 'IVAT-C' }), party(), data(), DATE);
    expect(r.taxCode?.code).toBe('IVAT-C');
  });

  it('a non-VAT supplier gets NO_INPUT_TAX (NVAT)', () => {
    const r = determineTax('Purchase', goodsItem(), party({ vatRegistered: false }), data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.NO_INPUT_TAX); // NVAT
  });

  it('no purchase group falls back to the company default IVAT', () => {
    const r = determineTax('Purchase', goodsItem({ purchaseTaxGroup: '' }), party(), data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.DOMESTIC);
  });
});

describe('determineTax — Purchase from a non-resident', () => {
  // WH-SVC has nrVat 'Services' and nrExempt false → reverse-charge services.
  const serviceItem = goodsItem({ purchaseTaxGroup: 'P-VAT12S', withholdingGroup: 'WH-SVC' });
  // WH-GDS has nrExempt true → imported goods.
  const importedGoodsItem = goodsItem({ withholdingGroup: 'WH-GDS' });

  it('services from a non-resident → NR_SERVICES (WVAT reverse charge)', () => {
    const r = determineTax('Purchase', serviceItem, party({ nonResident: true }), data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.NR_SERVICES); // WVAT
  });

  it('goods from a non-resident → IMVAT (import VAT paid to BoC)', () => {
    const r = determineTax('Purchase', importedGoodsItem, party({ nonResident: true }), data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.IMPORTATION); // IMVAT
    expect(r.notes.some((n) => n.includes('Bureau of Customs'))).toBe(true);
  });

  it('a non-resident digital service provider registered for VAT charges its own VAT → NO_INPUT_TAX', () => {
    const r = determineTax(
      'Purchase',
      serviceItem,
      party({ nonResident: true, nonResidentDigitalServices: true, vatRegistered: true }),
      data(),
      DATE,
    );
    // DSP bills its own VAT; nonResidentVat does not apply, and chargesVat() is true for a DSP,
    // so determination continues past the supplier-VAT rule to the item group (IVAT-S).
    expect(r.taxCode?.code).toBe('IVAT-S');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// determineWithholding — source precedence, payee tier, reverse charge
// ─────────────────────────────────────────────────────────────────────────────
describe('determineWithholding — source precedence', () => {
  it('a government payee is never withheld on', () => {
    const r = determineWithholding(goodsItem({ withholdingGroup: 'WH-SVC' }), party({ businessType: 'Government' }), data(), DATE);
    expect(r.withholding).toHaveLength(0);
  });

  it('withholding comes from the item withholding group (services, corporate, top-WA company)', () => {
    // WH-SVC requires a top withholding agent; SEED company is one.
    const r = determineWithholding(goodsItem({ withholdingGroup: 'WH-SVC' }), party(), data(), DATE);
    expect(r.withholding.map((w) => w.atc)).toContain('WC160'); // corporate services 2%
    expect(r.withholding.find((w) => w.atc === 'WC160')?.rate).toBe(2);
  });

  it('WH-SVC is skipped when the company is not a top withholding agent (requiresTopWA gate)', () => {
    const notTopWa: CompanyTaxProfile = { ...SEED_COMPANY_TAX[0], topWithholdingAgent: false };
    const r = determineWithholding(goodsItem({ withholdingGroup: 'WH-SVC' }), party(), data(notTopWa), DATE);
    expect(r.withholding).toHaveLength(0);
    expect(r.withholdingTrace.some((t) => t.rule === 'Top withholding agent' && t.outcome === 'skipped')).toBe(true);
  });

  it('a vendor override beats the item withholding group', () => {
    // WH-RENT has no requiresTopWA; override with a professional-fees FWT-style ATC record.
    const override = SEED_WITHHOLDING.find((w) => w.atc === 'WC120'); // contractor 2%, flat
    expect(override).toBeDefined();
    const r = determineWithholding(
      goodsItem({ withholdingGroup: 'WH-RENT' }),
      party({ withholdingOverrideId: override!.id }),
      data(),
      DATE,
    );
    expect(r.withholding.map((w) => w.atc)).toEqual(['WC120']);
  });

  it('the account-default withholding group is used when the item has none (via withIncomeType)', () => {
    // withIncomeType resolves this chain; test it directly below. Here: no item group, no override → none.
    const r = determineWithholding(goodsItem({ withholdingGroup: '' }), party(), data(), DATE);
    expect(r.withholding).toHaveLength(0);
    expect(r.withholdingTrace.some((t) => t.rule === 'Withholding group' && t.outcome === 'skipped')).toBe(true);
  });
});

describe('determineWithholding — payee tier (sworn declaration)', () => {
  // WH-PROF is tiered: individual WI010 (5%, low) / WI011 (10%, high); corporate WC010 / WC011.
  const profItem = goodsItem({ withholdingGroup: 'WH-PROF' });

  it('an individual with no sworn declaration gets the high tier (10%)', () => {
    const r = determineWithholding(profItem, party({ businessType: 'Individual', vatRegistered: false }), data(), DATE);
    expect(r.withholding.map((w) => w.atc)).toContain('WI011');
    expect(r.withholding.find((w) => w.atc === 'WI011')?.rate).toBe(10);
  });

  it('an individual with a current-year sworn declaration + attachment gets the low tier (5%)', () => {
    const r = determineWithholding(
      profItem,
      party({
        businessType: 'Individual',
        vatRegistered: false, // a VAT-registered individual always gets the high tier
        swornDeclarationRef: 'SD-1',
        swornDeclarationDate: '2026-01-10',
        swornDeclarationAttachments: [{} as never],
      }),
      data(),
      DATE,
    );
    expect(r.withholding.map((w) => w.atc)).toContain('WI010');
    expect(r.withholding.find((w) => w.atc === 'WI010')?.rate).toBe(5);
  });

  it('a VAT-registered individual always gets the high tier despite a valid declaration', () => {
    const r = determineWithholding(
      profItem,
      party({
        businessType: 'Individual',
        vatRegistered: true,
        swornDeclarationRef: 'SD-1',
        swornDeclarationDate: '2026-01-10',
        swornDeclarationAttachments: [{} as never],
      }),
      data(),
      DATE,
    );
    expect(r.withholding.map((w) => w.atc)).toContain('WI011');
  });

  it('a prior-year declaration is stale → high tier', () => {
    const r = determineWithholding(
      profItem,
      party({
        businessType: 'Individual',
        vatRegistered: false, // isolate the stale-declaration branch from the VAT-reg branch
        swornDeclarationRef: 'SD-OLD',
        swornDeclarationDate: '2024-01-10',
        swornDeclarationAttachments: [{} as never],
      }),
      data(),
      DATE,
    );
    expect(r.withholding.map((w) => w.atc)).toContain('WI011');
  });

  it("'General professional partnership' is treated as a Corporate payee", () => {
    const r = determineWithholding(profItem, party({ businessType: 'General professional partnership' }), data(), DATE);
    // corporate high tier (no declaration) = WC011
    expect(r.withholding.map((w) => w.atc)).toContain('WC011');
  });
});

describe('determineWithholding — non-resident and reverse charge', () => {
  it('reverse-charge VAT on a non-resident service is NOT deducted from the vendor', () => {
    // WH-SVC nrVat 'Services' on a non-resident → NR VAT withheld (reverse charge, private agent WV070).
    const r = determineWithholding(
      goodsItem({ purchaseTaxGroup: 'P-VAT12S', withholdingGroup: 'WH-SVC' }),
      party({ nonResident: true }),
      data(),
      DATE,
    );
    const nrVat = r.withholding.find((w) => w.atc === SYSTEM_ATCS.NR_VAT_PRIVATE); // WV070
    expect(nrVat).toBeDefined();
    expect(REVERSE_CHARGE_ATCS).toContain(SYSTEM_ATCS.NR_VAT_PRIVATE);
  });

  it('goods from a non-resident (nrExempt group) have no Philippine withholding', () => {
    const r = determineWithholding(goodsItem({ withholdingGroup: 'WH-GDS' }), party({ nonResident: true }), data(), DATE);
    // WH-GDS nrExempt → final-tax skipped; only possibly the NR VAT which doesn't apply to goods.
    expect(r.withholding.some((w) => w.atc === 'WC158' || w.atc === 'WI158')).toBe(false);
  });

  it('government company (GMP) withholds 5% creditable VAT on services on top of EWT', () => {
    const r = determineWithholding(
      goodsItem({ purchaseTaxGroup: 'P-VAT12S', withholdingGroup: 'WH-SVC' }),
      party(),
      data(govCompany()),
      DATE,
    );
    expect(r.withholding.map((w) => w.atc)).toContain(SYSTEM_ATCS.GMP_VAT_SERVICES); // WV020
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// taxRecalc
// ─────────────────────────────────────────────────────────────────────────────
describe('recalcLineTaxes', () => {
  const propose = (itemId: string) => (itemId === 'A' ? 'OVAT' : itemId === 'B' ? 'ZVAT' : '');

  it('re-proposes the tax code on a plain hand-entered line', () => {
    const lines: RecalcableLine[] = [{ id: '1', itemId: 'A', taxCode: 'XVAT' }];
    const [out] = recalcLineTaxes(lines, propose);
    expect(out.taxCode).toBe('OVAT');
  });

  it('leaves an overridden line alone', () => {
    const lines: RecalcableLine[] = [{ id: '1', itemId: 'A', taxCode: 'XVAT', taxOverridden: true }];
    const [out] = recalcLineTaxes(lines, propose);
    expect(out.taxCode).toBe('XVAT');
  });

  it('leaves a copied line (baseType) alone', () => {
    const lines: RecalcableLine[] = [{ id: '1', itemId: 'A', taxCode: 'XVAT', baseType: 'GR' }];
    const [out] = recalcLineTaxes(lines, propose);
    expect(out.taxCode).toBe('XVAT');
  });

  it('leaves a copied line (baseId) alone', () => {
    const lines: RecalcableLine[] = [{ id: '1', itemId: 'A', taxCode: 'XVAT', baseId: 'gr-1' }];
    const [out] = recalcLineTaxes(lines, propose);
    expect(out.taxCode).toBe('XVAT');
  });

  it('keeps the current code when the proposal comes back empty', () => {
    const lines: RecalcableLine[] = [{ id: '1', itemId: 'Z', taxCode: 'IVAT' }];
    const [out] = recalcLineTaxes(lines, propose);
    expect(out.taxCode).toBe('IVAT');
  });

  it('keeps a line with no item untouched', () => {
    const lines: RecalcableLine[] = [{ id: '1', itemId: '', taxCode: 'IVAT' }];
    const [out] = recalcLineTaxes(lines, propose);
    expect(out.taxCode).toBe('IVAT');
  });

  it('when the code changes, clears the stamped ATC and return', () => {
    const lines = [{ id: '1', itemId: 'A', taxCode: 'XVAT', taxAtc: 'OLD', taxReturn: '2550Q' }];
    const [out] = recalcLineTaxes(lines as RecalcableLine[], propose) as (RecalcableLine & { taxAtc?: string; taxReturn?: string })[];
    expect(out.taxCode).toBe('OVAT');
    expect(out.taxAtc).toBeUndefined();
    expect(out.taxReturn).toBeUndefined();
  });
});

describe('editTaxCode', () => {
  it('marks a non-empty code as overridden and unstamps', () => {
    expect(editTaxCode('ZVAT')).toEqual({ taxCode: 'ZVAT', taxOverridden: true, taxAtc: undefined, taxReturn: undefined });
  });

  it('clearing the code hands the line back to recalc (not overridden)', () => {
    expect(editTaxCode('')).toEqual({ taxCode: '', taxOverridden: false, taxAtc: undefined, taxReturn: undefined });
  });
});

describe('lineAtc', () => {
  const codes = [{ code: 'OVAT', atc: 'VT010' }];

  it('uses the stamped ATC on an added document', () => {
    expect(lineAtc({ taxCode: 'OVAT', taxAtc: 'STAMPED' }, codes, true)).toBe('STAMPED');
  });

  it('ignores the stamped ATC and reads from the code on a draft', () => {
    expect(lineAtc({ taxCode: 'OVAT', taxAtc: 'STAMPED' }, codes, false)).toBe('VT010');
  });

  it('falls back to the code lookup when added but unstamped', () => {
    expect(lineAtc({ taxCode: 'OVAT' }, codes, true)).toBe('VT010');
  });

  it('returns "" for an unknown code', () => {
    expect(lineAtc({ taxCode: 'NOPE' }, codes, false)).toBe('');
  });
});

describe('withTaxFiling / returnsOf', () => {
  const codes = [{ code: 'OVAT', atc: 'VT010', returnFormIds: ['f1'] }];
  const forms = [{ id: 'f1', form: '2550Q' } as never];

  it('returnsOf joins form numbers', () => {
    expect(returnsOf(codes[0], forms)).toBe('2550Q');
  });

  it('returnsOf returns "" for no code or no forms', () => {
    expect(returnsOf(undefined, forms)).toBe('');
    expect(returnsOf({ returnFormIds: [] }, forms)).toBe('');
  });

  it('stamps each line with its code ATC and return', () => {
    const [out] = withTaxFiling([{ taxCode: 'OVAT' }], codes, forms) as { taxCode: string; taxAtc: string; taxReturn: string }[];
    expect(out.taxAtc).toBe('VT010');
    expect(out.taxReturn).toBe('2550Q');
  });

  it('stamps blank ATC/return for an unknown code', () => {
    const [out] = withTaxFiling([{ taxCode: 'NOPE' }], codes, forms) as { taxCode: string; taxAtc: string; taxReturn: string }[];
    expect(out.taxAtc).toBe('');
    expect(out.taxReturn).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// withholding.ts
// ─────────────────────────────────────────────────────────────────────────────
describe('totalWithholding', () => {
  it('sums rows sharing the same ATC and keeps distinct ones apart', () => {
    const rows: WithholdingLine[] = [
      { atc: 'WC160', description: 's', rate: 2, kind: 'Expanded (EWT)', base: 100, amount: 2, deducted: true },
      { atc: 'WC160', description: 's', rate: 2, kind: 'Expanded (EWT)', base: 50, amount: 1, deducted: true },
      { atc: 'WV070', description: 'v', rate: 12, kind: 'Withholding VAT', base: 100, amount: 12, deducted: false },
    ];
    const out = totalWithholding(rows);
    expect(out).toHaveLength(2);
    const svc = out.find((w) => w.atc === 'WC160')!;
    expect(svc.base).toBe(150);
    expect(svc.amount).toBe(3);
  });
});

describe('withIncomeType — income-type precedence', () => {
  const baseItem = (): Item =>
    ({
      id: 'it-1', withholdingGroup: '', inventoryItem: false, glBy: 'Item Level',
      cogsAccount: '6100', itemGroupId: 'ig-x',
    } as unknown as Item);

  const groups: ItemGroup[] = [{ id: 'ig-x', cogsAccount: '6200' } as unknown as ItemGroup];
  const chart: Account[] = [
    { code: '6100', defaultWithholdingGroup: 'WH-RENT' } as unknown as Account,
    { code: '6200', defaultWithholdingGroup: 'WH-PROF' } as unknown as Account,
  ];

  it('keeps the item withholding group when it already has one', () => {
    const item = baseItem();
    item.withholdingGroup = 'WH-SVC';
    expect(withIncomeType(item, groups, chart).withholdingGroup).toBe('WH-SVC');
  });

  it('inventory items are never reclassified by account', () => {
    const item = baseItem();
    (item as { inventoryItem: boolean }).inventoryItem = true;
    expect(withIncomeType(item, groups, chart).withholdingGroup).toBe('');
  });

  it('falls back to the item-level expense account default (glBy Item Level)', () => {
    const item = baseItem(); // glBy Item Level, cogsAccount 6100 → WH-RENT
    expect(withIncomeType(item, groups, chart).withholdingGroup).toBe('WH-RENT');
  });

  it('falls back to the item-group expense account default (glBy Item Group)', () => {
    const item = baseItem();
    (item as { glBy: string }).glBy = 'Item Group'; // group ig-x cogsAccount 6200 → WH-PROF
    expect(withIncomeType(item, groups, chart).withholdingGroup).toBe('WH-PROF');
  });

  it('returns the item unchanged when no default is found', () => {
    const item = baseItem();
    (item as { cogsAccount: string }).cogsAccount = '9999';
    expect(withIncomeType(item, groups, chart).withholdingGroup).toBe('');
  });
});

describe('lineWithholdings / stampWithholding', () => {
  const svcItem = {
    id: 'it-svc', withholdingGroup: 'WH-SVC', inventoryItem: false, glBy: 'Item Level',
    cogsAccount: '6100', itemGroupId: '',
    purchaseTaxGroup: 'P-VAT12S', salesTaxGroup: '', salesTaxCode: '', purchaseTaxCode: '', taxLiable: true,
  } as unknown as Item;

  type DocLine = {
    id: string; itemId: string; quantity: number; unitPrice: number; discountPct: number; taxCode: string;
    lineWithholding?: { atc: string; rate: number; kind: WithholdingLine['kind']; base: number; amount: number }[];
  };
  const doc: { discountPct: number; lines: DocLine[] } = {
    discountPct: 0,
    lines: [{ id: 'L1', itemId: 'it-svc', quantity: 1, unitPrice: 1000, discountPct: 0, taxCode: 'IVAT-S' }],
  };
  const vendor = party(); // resident corporate, non top-WA party but company IS top-WA

  it('computes line withholding from the engine (corporate services 2%)', () => {
    const map = lineWithholdings(doc, vendor, [svcItem], data(), DATE);
    const line = map.get('L1')!;
    const ewt = line.find((w) => w.atc === 'WC160')!;
    expect(ewt.base).toBe(1000);
    expect(ewt.amount).toBe(20); // 2% of 1000
    expect(ewt.deducted).toBe(true);
  });

  it('stampWithholding writes per-line withholding and a per-ATC summary with accounts', () => {
    const { lines, withholdingSummary } = stampWithholding(doc, vendor, [svcItem], data(), DATE);
    expect(lines[0].lineWithholding?.some((w) => w.atc === 'WC160')).toBe(true);
    const summary = withholdingSummary.find((w) => w.atc === 'WC160')!;
    expect(summary.account).toBe('2340'); // EWT payable
    expect(summary.amount).toBe(20);
  });

  it('a line with pre-stamped lineWithholding keeps its stamped ATCs regardless of current Settings', () => {
    const copiedDoc = {
      discountPct: 0,
      lines: [{
        id: 'L1', itemId: 'it-svc', quantity: 1, unitPrice: 1000, discountPct: 0, taxCode: 'IVAT-S',
        lineWithholding: [{ atc: 'WC999', rate: 7, kind: 'Expanded (EWT)' as const, base: 1000, amount: 70 }],
      }],
    };
    const map = lineWithholdings(copiedDoc, vendor, [svcItem], data(), DATE);
    const line = map.get('L1')!;
    expect(line.map((w) => w.atc)).toEqual(['WC999']);
    expect(line[0].amount).toBe(70);
  });

  it('returns an empty map when there is no vendor', () => {
    expect(lineWithholdings(doc, undefined, [svcItem], data(), DATE).size).toBe(0);
  });
});

describe('resolveCustomerWithholding / customerWithholds', () => {
  const svcLineItem: LineItem = {
    taxLiable: true, salesTaxGroup: '', salesTaxCode: '', purchaseTaxGroup: '', purchaseTaxCode: '', withholdingGroup: 'WH-SVC',
  };

  it('customerWithholds is true for a top-WA or government customer, false otherwise', () => {
    expect(customerWithholds({ businessType: 'Company', topWithholdingAgent: true })).toBe(true);
    expect(customerWithholds({ businessType: 'Government', topWithholdingAgent: false })).toBe(true);
    expect(customerWithholds({ businessType: 'Company', topWithholdingAgent: false })).toBe(false);
    expect(customerWithholds(undefined)).toBe(false);
  });

  it('a top-WA customer withholds EWT from us on a service line (we are a VAT-reg corporate payee)', () => {
    const out = resolveCustomerWithholding(
      svcLineItem,
      { businessType: 'Company', topWithholdingAgent: true },
      data(),
      DATE,
    );
    // Company payee is corporate, high tier → WC160 (services 2%).
    expect(out.map((w) => w.atc)).toContain('WC160');
  });

  it('a government customer also withholds 5% creditable VAT (WV020) on a VATable service', () => {
    const out = resolveCustomerWithholding(
      svcLineItem,
      { businessType: 'Government', topWithholdingAgent: false },
      data(),
      DATE,
    );
    expect(out.map((w) => w.atc)).toContain(SYSTEM_ATCS.GMP_VAT_SERVICES); // WV020
  });
});

describe('stamped values survive a later Settings change', () => {
  // Simulate posting under "seed" settings, then a Settings change that moves the rate.
  const svcItem = {
    id: 'it-svc', withholdingGroup: 'WH-SVC', inventoryItem: false, glBy: 'Item Level',
    cogsAccount: '6100', itemGroupId: '',
    purchaseTaxGroup: 'P-VAT12S', salesTaxGroup: '', salesTaxCode: '', purchaseTaxCode: '', taxLiable: true,
  } as unknown as Item;
  const doc = {
    discountPct: 0,
    lines: [{ id: 'L1', itemId: 'it-svc', quantity: 1, unitPrice: 1000, discountPct: 0, taxCode: 'IVAT-S' }],
  };

  it('a posted doc with stamped lineWithholding ignores a changed Settings rate', () => {
    // 1. Stamp under current settings (2%).
    const stamped = stampWithholding(doc, party(), [svcItem], data(), DATE);
    expect(stamped.withholdingSummary.find((w) => w.atc === 'WC160')?.amount).toBe(20);

    // 2. "Change Settings": mutate a copy of WC160's rate to 99%.
    const bumped: TaxMasterData = {
      ...data(),
      withholding: SEED_WITHHOLDING.map((w) =>
        w.atc === 'WC160' ? { ...w, rates: [{ effectiveFrom: '2000-01-01', effectiveTo: '', rate: 99 }] } : w,
      ),
    };

    // 3. Re-read the posted doc via its stamped lines — amount stays 20, not 990.
    const stampedDoc = { discountPct: 0, lines: stamped.lines };
    const map = lineWithholdings(stampedDoc, party(), [svcItem], bumped, DATE);
    expect(map.get('L1')!.find((w) => w.atc === 'WC160')?.amount).toBe(20);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// taxUsage.blockedDeactivation
// ─────────────────────────────────────────────────────────────────────────────
describe('blockedDeactivation', () => {
  const used: TaxUsage = {
    rules: ['the default for sales'], taxCodes: [], taxGroups: [], withholdingGroups: [], withholdingTaxes: [],
    itemGroups: [], items: 0, partners: [], accounts: [], company: false,
  };
  const unused: TaxUsage = {
    rules: [], taxCodes: [], taxGroups: [], withholdingGroups: [], withholdingTaxes: [],
    itemGroups: [], items: 0, partners: [], accounts: [], company: false,
  };
  type Row = { code: string; usage: TaxUsage };
  const rows: Row[] = [{ code: 'IN-USE', usage: used }, { code: 'FREE', usage: unused }];

  it('activating never blocks anything', () => {
    const r = blockedDeactivation(rows, true, (x) => x.usage, (x) => x.code);
    expect(r.allowed).toHaveLength(2);
    expect(r.notice).toBeUndefined();
  });

  it('deactivating blocks rows still in use and allows the free ones', () => {
    const r = blockedDeactivation(rows, false, (x) => x.usage, (x) => x.code);
    expect(r.allowed.map((x) => x.code)).toEqual(['FREE']);
    expect(r.notice).toContain('IN-USE');
    expect(r.notice).toContain('still in use');
  });

  it('deactivating with nothing in use allows all and gives no notice', () => {
    const r = blockedDeactivation([{ code: 'FREE', usage: unused }], false, (x) => x.usage, (x) => x.code);
    expect(r.allowed).toHaveLength(1);
    expect(r.notice).toBeUndefined();
  });
});
