/**
 * Tax determination edge cases that tax.test.ts doesn't reach: broken setup (missing, inactive or
 * wrong-direction groups and codes), non-resident VAT variants, importation, tax treaties, the
 * sworn-declaration tiers, government money payments, and vendor withholding overrides.
 */
import { describe, expect, it } from 'vitest';
import {
  SEED_COMPANY_TAX, SEED_TAX_CODES, SEED_TAX_GROUPS, SEED_WITHHOLDING, SEED_WITHHOLDING_GROUPS, SYSTEM_ATCS, SYSTEM_TAX_CODES,
  type CompanyTaxProfile,
} from '../../mocks/taxes';
import type { Attachment } from '../../mocks/common';
import { determineTax, determineWithholding, type LineItem, type LineParty, type TaxMasterData } from '../taxDetermination';

const DATE = '2026-06-15';
const company = SEED_COMPANY_TAX[0];
const data = (patch: Partial<TaxMasterData> = {}, co: Partial<CompanyTaxProfile> = {}): TaxMasterData => ({
  company: { ...company, ...co },
  codes: SEED_TAX_CODES,
  groups: SEED_TAX_GROUPS,
  withholding: SEED_WITHHOLDING,
  withholdingGroups: SEED_WITHHOLDING_GROUPS,
  ...patch,
});
const item = (patch: Partial<LineItem> = {}): LineItem => ({
  taxLiable: true, salesTaxGroup: 'S-VAT12', salesTaxCode: '', purchaseTaxGroup: 'P-VAT12', purchaseTaxCode: '', withholdingGroup: '', ...patch,
});
const party = (patch: Partial<LineParty> = {}): LineParty => ({
  vatRegistered: true, vatExemptions: [], topWithholdingAgent: false, businessType: 'Corporation', nonResidentDigitalServices: false,
  nonResident: false, withholdingOverrideId: '', swornDeclarationRef: '', swornDeclarationDate: '', swornDeclarationAttachments: [],
  taxTreatyCountryCode: '', taxTreatyCertificate: '', taxTreatyCertificateExpiry: '', taxTreatyIncomes: [], ...patch,
});
const doc = { id: 'a', name: 'doc.pdf', addedOn: '2026-01-01' } as unknown as Attachment;
const nr = (patch: Partial<LineParty> = {}) => party({ nonResident: true, vatRegistered: false, ...patch });
const traceOf = (steps: { rule: string; outcome: string; detail: string }[], rule: string) => steps.find((s) => s.rule === rule);

describe('broken tax setup falls back with a warning', () => {
  it('a missing, inactive or purchase-only sales group falls back to the company default', () => {
    const missing = determineTax('Sales', item({ salesTaxGroup: 'NOPE' }), party(), data(), DATE);
    expect(missing.taxCode?.code).toBe('OVAT');
    expect(traceOf(missing.trace, 'Item sales tax group')?.detail).toContain('missing from Settings');

    const inactive = determineTax('Sales', item({ salesTaxGroup: 'S-VATX' }), party(), data({ groups: SEED_TAX_GROUPS.map((g) => (g.code === 'S-VATX' ? { ...g, active: false } : g)) }), DATE);
    expect(traceOf(inactive.trace, 'Item sales tax group')?.detail).toContain('inactive');

    const wrongWay = determineTax('Sales', item({ salesTaxGroup: 'P-VAT12' }), party(), data(), DATE);
    expect(traceOf(wrongWay.trace, 'Item sales tax group')?.detail).toContain('purchase group, not a sales group');
  });

  it('a fixed code missing from Settings is a warning, and the rules carry on', () => {
    const r = determineTax('Sales', item({ salesTaxCode: 'GONE' }), party(), data(), DATE);
    expect(traceOf(r.trace, 'Item has a fixed sales tax code')).toMatchObject({ outcome: 'warning' });
    expect(r.taxCode?.code).toBe('OVAT');
  });

  it('a code with no rate in force on the date is flagged', () => {
    const r = determineTax('Sales', item(), party(), data(), '1990-01-01');
    expect(r.rate).toBeUndefined();
    expect(traceOf(r.trace, 'Rate on posting date')?.detail).toContain('no rate in force');
  });

  it('purchase groups: missing is a warning, none is skipped, zero-rating needs an export enterprise', () => {
    expect(traceOf(determineTax('Purchase', item({ purchaseTaxGroup: 'NOPE' }), party(), data(), DATE).trace, 'Item purchase tax group')?.outcome).toBe('warning');
    expect(traceOf(determineTax('Purchase', item({ purchaseTaxGroup: '' }), party(), data(), DATE).trace, 'Item purchase tax group')?.outcome).toBe('skipped');

    const refused = determineTax('Purchase', item({ purchaseTaxGroup: 'P-VAT0' }), party(), data({}, { exportEnterprise: false }), DATE);
    expect(traceOf(refused.trace, 'Item purchase tax group')?.detail).toContain("isn't a registered export enterprise");
    expect(refused.taxCode?.code).toBe('IVAT');
    expect(determineTax('Purchase', item({ purchaseTaxGroup: 'P-VAT0' }), party(), data({}, { exportEnterprise: true }), DATE).taxCode?.code).toBe('NVAT');
  });
});

describe('customer VAT exemptions', () => {
  it('a zero-rated certificate without a reference reads "on file"; an exempt entity shows its basis', () => {
    const zero = determineTax('Sales', item(), party({ vatExemptions: [{ type: 'Zero-rated', certificateRef: '', attachments: [doc], validUntil: '' } as never] }), data(), DATE);
    expect(zero.taxCode?.code).toBe('ZVAT');
    expect(traceOf(zero.trace, 'Customer VAT exemption')?.detail).toContain('on file');

    const exempt = determineTax('Sales', item(), party({ vatExemptions: [{ type: 'Exempt entity', basis: 'RA 9520', attachments: [doc], validUntil: '' } as never] }), data(), DATE);
    expect(traceOf(exempt.trace, 'Customer VAT exemption')?.detail).toContain('RA 9520');
    const noBasis = determineTax('Sales', item(), party({ vatExemptions: [{ type: 'Exempt entity', basis: '', attachments: [doc], validUntil: '' } as never] }), data(), DATE);
    expect(traceOf(noBasis.trace, 'Customer VAT exemption')?.detail).not.toContain('—');
  });
});

describe('purchases from non-residents', () => {
  it('importation: a code fixed on the item wins; an exempt group imports VAT-free; zero-rating needs an export enterprise', () => {
    const goods = item({ withholdingGroup: 'WH-GDS' });
    expect(determineTax('Purchase', { ...goods, purchaseTaxCode: 'XIMP' }, nr(), data(), DATE).taxCode?.code).toBe('XIMP');
    expect(determineTax('Purchase', { ...goods, purchaseTaxGroup: 'P-VATX' }, nr(), data(), DATE).taxCode?.code).toBe('XIMP');
    expect(determineTax('Purchase', { ...goods, purchaseTaxGroup: 'P-VAT0' }, nr(), data({}, { exportEnterprise: false }), DATE).taxCode?.code).toBe('IMVAT');
    expect(determineTax('Purchase', { ...goods, purchaseTaxGroup: 'P-VAT0' }, nr(), data({}, { exportEnterprise: true }), DATE).taxCode?.code).toBe('XIMP');
  });

  it('a lease from a non-resident is reverse-charged, naming the group', () => {
    const r = determineTax('Purchase', item({ withholdingGroup: 'WH-RENT' }), nr(), data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.NR_SERVICES);
    expect(traceOf(r.trace, 'Services from a non-resident')?.detail).toContain('lease or use of property (Rent / property lease)');
  });

  it('an unregistered non-resident digital service provider with no group is reverse-charged as services', () => {
    const r = determineTax('Purchase', item(), nr({ nonResidentDigitalServices: true }), data(), DATE);
    expect(r.taxCode?.code).toBe(SYSTEM_TAX_CODES.NR_SERVICES);
    expect(traceOf(r.trace, 'Services from a non-resident')?.detail).toContain('digital services');
  });

  it('an exempt purchase group beats the reverse charge', () => {
    const r = determineTax('Purchase', item({ withholdingGroup: 'WH-SVC', purchaseTaxGroup: 'P-VATX' }), nr(), data(), DATE);
    expect(traceOf(r.trace, 'Services from a non-resident')?.detail).toContain('is not subject to VAT');
    expect(r.taxCode?.code).toBe('NVAT');
    expect(traceOf(r.trace, 'Supplier VAT registration')?.detail).toContain('Non-resident supplier');
  });

  it('warns when the item has no withholding group, and skips income not subject to VAT', () => {
    const none = determineTax('Purchase', item(), nr(), data(), DATE);
    expect(traceOf(none.trace, 'Services from a non-resident')?.outcome).toBe('warning');
    const interest = determineTax('Purchase', item({ withholdingGroup: 'WH-INT' }), nr(), data(), DATE);
    expect(traceOf(interest.trace, 'Services from a non-resident')).toMatchObject({ outcome: 'skipped' });
    expect(traceOf(interest.trace, 'Services from a non-resident')?.detail).toContain('not subject to VAT');
  });
});

describe('withholding: non-resident VAT and final tax', () => {
  it('withholds lease VAT at the private or government ATC', () => {
    const rent = item({ withholdingGroup: 'WH-RENT' });
    expect(determineWithholding(rent, nr(), data(), DATE).withholding.map((w) => w.atc)).toContain(SYSTEM_ATCS.NR_LEASE_VAT_PRIVATE);
    expect(determineWithholding(rent, nr(), data({}, { governmentEntity: true }), DATE).withholding.map((w) => w.atc)).toContain(SYSTEM_ATCS.NR_LEASE_VAT_GOV);
    const svc = item({ withholdingGroup: 'WH-CONT' });
    expect(determineWithholding(svc, nr(), data({}, { governmentEntity: true }), DATE).withholding.map((w) => w.atc)).toContain(SYSTEM_ATCS.NR_VAT_GOV);
  });

  it('reports a non-resident with no group as a VAT warning and withholds nothing', () => {
    const r = determineWithholding(item(), nr(), data(), DATE);
    expect(traceOf(r.withholdingTrace, 'Non-resident: VAT')?.outcome).toBe('warning');
    expect(r.withholding).toEqual([]);
  });

  it('final tax for an individual uses the default ATC, and warns when it is missing from Settings', () => {
    const prof = item({ withholdingGroup: 'WH-PROF' });
    const individual = nr({ businessType: 'Individual' });
    expect(determineWithholding(prof, individual, data(), DATE).withholding.map((w) => w.atc)).toContain(SYSTEM_ATCS.NR_INDIVIDUAL);
    const without = data({ withholding: SEED_WITHHOLDING.filter((w) => w.atc !== SYSTEM_ATCS.NR_CORPORATE) });
    const r = determineWithholding(prof, nr(), without, DATE);
    expect(traceOf(r.withholdingTrace, 'Non-resident: final tax')?.outcome).toBe('warning');
  });

  describe('tax treaty relief', () => {
    const prof = item({ withholdingGroup: 'WH-PROF' }); // treaty income type: Technical fees
    const treaty = (patch: Partial<LineParty> = {}, entry: Record<string, unknown> = {}) =>
      nr({
        taxTreatyCountryCode: 'JP',
        taxTreatyCertificate: 'COR-2026',
        taxTreatyCertificateExpiry: '2027-01-01',
        taxTreatyIncomes: [{ id: 't', incomeType: 'Technical fees', approvedRate: 10, ttraApprovalDate: '2026-01-01', attachments: [doc], ...entry } as never],
        ...patch,
      });
    const finalRate = (p: LineParty) => determineWithholding(prof, p, data(), DATE).withholding.find((w) => w.atc === SYSTEM_ATCS.NR_CORPORATE)?.rate;
    const treatyStep = (p: LineParty) => traceOf(determineWithholding(prof, p, data(), DATE).withholdingTrace, 'Tax treaty');

    it('applies the lower treaty rate when the paperwork is complete', () => {
      expect(finalRate(treaty())).toBe(10);
    });

    it('falls back to the domestic rate, with the reason, when anything is missing or expired', () => {
      expect(treatyStep(treaty({}, { approvedRate: 0 }))?.detail).toContain('no approved rate');
      expect(treatyStep(treaty({}, { attachments: [] }))?.detail).toContain('no document attached');
      expect(treatyStep(treaty({ taxTreatyCertificate: '' }))?.detail).toContain('no Certificate of Residence');
      expect(treatyStep(treaty({ taxTreatyCertificateExpiry: '2026-01-01' }))?.detail).toContain('expired 2026-01-01');
      expect(finalRate(treaty({ taxTreatyCertificate: '' }))).toBe(25);
    });

    it('ignores a treaty rate that is not lower, a treaty for other income, and a vendor without a treaty country', () => {
      expect(treatyStep(treaty({}, { approvedRate: 30 }))?.outcome).toBe('skipped');
      expect(treatyStep(treaty({}, { incomeType: 'Royalties' }))).toBeUndefined();
      expect(treatyStep(treaty({ taxTreatyCountryCode: '' }))).toBeUndefined();
      // A certificate with no expiry date stays valid.
      expect(finalRate(treaty({ taxTreatyCertificateExpiry: '' }))).toBe(10);
    });
  });
});

describe('withholding: residents', () => {
  const prof = item({ withholdingGroup: 'WH-PROF' });
  const individual = (patch: Partial<LineParty> = {}) => party({ businessType: 'Individual', vatRegistered: false, ...patch });
  const tier = (p: LineParty) => traceOf(determineWithholding(prof, p, data(), DATE).withholdingTrace, 'Income tier')?.detail;

  it('a declaration with no date or no document gives the higher rate', () => {
    expect(tier(individual({ swornDeclarationRef: 'SD-1', swornDeclarationDate: '' }))).toContain('an unknown year');
    expect(tier(individual({ swornDeclarationRef: 'SD-1', swornDeclarationDate: '2026-02-01', swornDeclarationAttachments: [] }))).toContain('no document attached');
  });

  it('a government buyer withholds creditable VAT on goods, percentage tax from non-VAT suppliers, nothing on non-taxable items', () => {
    const gov = data({}, { governmentEntity: true });
    expect(determineWithholding(item({ withholdingGroup: 'WH-GDS' }), party(), gov, DATE).withholding.map((w) => w.atc)).toContain(SYSTEM_ATCS.GMP_VAT_GOODS);
    expect(determineWithholding(item({ withholdingGroup: 'WH-GDS' }), party({ vatRegistered: false }), gov, DATE).withholding.map((w) => w.atc)).toContain(SYSTEM_ATCS.GMP_PT);
    const atcs = determineWithholding(item({ withholdingGroup: 'WH-GDS', taxLiable: false }), party(), gov, DATE).withholding.map((w) => w.atc);
    expect(atcs).not.toContain(SYSTEM_ATCS.GMP_VAT_GOODS);
    expect(atcs).not.toContain(SYSTEM_ATCS.GMP_PT);
  });

  it('a government buyer withholds even where only top withholding agents do, at its own ATC', () => {
    const r = determineWithholding(item({ withholdingGroup: 'WH-SVC' }), party(), data({}, { governmentEntity: true, topWithholdingAgent: false }), DATE);
    expect(r.withholding.map((w) => w.atc)).toContain('WC157');
    expect(traceOf(r.withholdingTrace, 'Withholding group')?.detail).toContain('(government entity)');
  });

  it('a group with no ATC for this payee, or none at all, withholds nothing', () => {
    expect(traceOf(determineWithholding(item({ withholdingGroup: 'WH-PRIZE' }), party(), data(), DATE).withholdingTrace, 'Withholding group')?.detail).toContain('not applicable to a corporate payee');
    expect(traceOf(determineWithholding(item({ withholdingGroup: 'WH-NONE' }), party(), data(), DATE).withholdingTrace, 'Withholding group')?.detail).toContain('not subject to withholding');
    expect(traceOf(determineWithholding(item({ withholdingGroup: 'GONE' }), party(), data(), DATE).withholdingTrace, 'Withholding group')?.outcome).toBe('warning');
  });

  it('warns when the chosen ATC is missing from Settings', () => {
    const r = determineWithholding(item({ withholdingGroup: 'WH-CONT' }), party(), data({ withholding: SEED_WITHHOLDING.filter((w) => w.atc !== 'WC120') }), DATE);
    expect(traceOf(r.withholdingTrace, 'Withholding group')?.outcome).toBe('warning');
  });
});

describe('withholding: vendor override', () => {
  const contractor = item({ withholdingGroup: 'WH-CONT' });

  it('falls back to the item group when the override is inactive or gone', () => {
    const inactive = data({ withholding: SEED_WITHHOLDING.map((w) => (w.id === 'wt-WC011' ? { ...w, active: false } : w)) });
    const r = determineWithholding(contractor, party({ withholdingOverrideId: 'wt-WC011' }), inactive, DATE);
    expect(traceOf(r.withholdingTrace, 'Vendor override')?.detail).toContain('is inactive');
    expect(r.withholding.map((w) => w.atc)).toContain('WC120');

    const gone = determineWithholding(contractor, party({ withholdingOverrideId: 'wt-nope' }), data(), DATE);
    expect(traceOf(gone.withholdingTrace, 'Vendor override')?.detail).toContain('no longer exists');
  });

  it('adjusts an income-tiered override to the vendor\'s tier', () => {
    // Overridden to the lower-tier WC010, but with no sworn declaration the higher WC011 applies.
    const r = determineWithholding(contractor, party({ withholdingOverrideId: 'wt-WC010' }), data(), DATE);
    expect(r.withholding.map((w) => w.atc)).toEqual(['WC011']);
    expect(traceOf(r.withholdingTrace, 'Vendor override')?.detail).toContain('adjusted for');
  });

  it('uses a non-resident\'s override as set', () => {
    const r = determineWithholding(item(), nr({ withholdingOverrideId: 'wt-WC010' }), data(), DATE);
    expect(r.withholding.map((w) => w.atc)).toContain('WC010');
    expect(traceOf(r.withholdingTrace, 'Vendor override')?.detail).toContain('Set on the vendor → WC010');
  });
});
