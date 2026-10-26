/**
 * Withholding tax: resolving it per line from Settings (through the determination engine),
 * totalling it per ATC, and stamping it on added documents so later Settings changes don't move it.
 */
import { WITHHOLDING_PAYABLE, type StampedWithholding } from '../mocks/apInvoices';
import { CREDITABLE_VAT_ACCOUNT, CWT_ACCOUNT, type StampedCustomerWithholding } from '../mocks/arInvoices';
import { SEED_ITEMS, mergedItems, type Item } from '../mocks/items';
import type { LineWithholding } from '../mocks/purchLine';
import { SEED_PARTNERS, type Partner } from '../mocks/partners';
import {
  SEED_COMPANY_TAX, SEED_TAX_CODES, SEED_TAX_GROUPS, SEED_WITHHOLDING, SEED_WITHHOLDING_GROUPS, SYSTEM_ATCS,
  type CompanyTaxProfile, type WithholdingKind,
} from '../mocks/taxes';
import { accounts, companyTax, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from './masterData';
import { itemGroups } from './inventoryMasters';
import type { Account } from '../mocks/chartOfAccounts';
import type { ItemGroup } from '../mocks/itemMasters';
import { lineNet, type PricedLine } from './purchaseOrders';
import { determineWithholding, type LineItem, type LineParty, type TaxMasterData } from './taxDetermination';
import { round2 } from './num';

export interface WithholdingLine {
  atc: string;
  description: string;
  rate: number;
  kind: WithholdingKind;
  /** What it's worked out on (net, after the document discount), document currency. */
  base: number;
  amount: number;
  /**
   * Taken off the vendor's payment. False for the VAT you withhold on a non-resident's services
   * (reverse charge): the vendor never charged it, so you remit it on top instead.
   */
  deducted: boolean;
  /** The payable account, when stamped on an added document. */
  account?: string;
}

/** Withholding VAT on payments to non-residents: the reverse charge, remitted on 1600-VT. */
export const REVERSE_CHARGE_ATCS: string[] = [
  SYSTEM_ATCS.NR_LEASE_VAT_GOV, SYSTEM_ATCS.NR_LEASE_VAT_PRIVATE, SYSTEM_ATCS.NR_VAT_GOV, SYSTEM_ATCS.NR_VAT_PRIVATE,
];

/** Settings › Accounting & Tax as it is now, for callers that don't load it themselves. */
export const currentTaxData = (): TaxMasterData => ({
  company: companyTax.snapshot()[0],
  codes: [...taxCodes.snapshot()],
  groups: [...taxGroups.snapshot()],
  withholding: [...withholdingTaxes.snapshot()],
  withholdingGroups: [...withholdingGroups.snapshot()],
});

/**
 * The item as withholding sees it. Income type precedence: the item's own withholding group, then
 * the default on the expense account a non-stock item is costed to, then none. A vendor override
 * beats both (the engine applies it).
 */
export function withIncomeType(item: Item, groups: readonly ItemGroup[] = itemGroups.snapshot(), chart: readonly Account[] = accounts.snapshot()): Item {
  if (item.withholdingGroup || item.inventoryItem) return item;
  const expense = item.glBy === 'Item Level' ? item.cogsAccount : groups.find((g) => g.id === item.itemGroupId)?.cogsAccount || item.cogsAccount;
  const fallback = chart.find((a) => a.code === expense)?.defaultWithholdingGroup;
  return fallback ? { ...item, withholdingGroup: fallback } : item;
}

/** Sum the same ATC across lines. */
export function totalWithholding(lines: readonly WithholdingLine[]): WithholdingLine[] {
  const totals = new Map<string, WithholdingLine>();
  for (const w of lines) {
    const existing = totals.get(w.atc);
    if (existing) {
      existing.base = round2(existing.base + w.base);
      existing.amount = round2(existing.amount + w.amount);
    } else totals.set(w.atc, { ...w });
  }
  return [...totals.values()];
}

/**
 * Withholding on each line paying the vendor, in document currency. A line copied from an added
 * invoice carries that invoice's stamped withholding: it keeps those ATCs and rates (a debit memo
 * reverses what was withheld), on its own amount.
 */
export function lineWithholdings(
  po: Pick<{ discountPct: number }, 'discountPct'> & { lines: (PricedLine & { id: string; lineWithholding?: LineWithholding[] })[] },
  vendor: LineParty | undefined,
  items: readonly Item[],
  tax: TaxMasterData,
  date: string,
): Map<string, WithholdingLine[]> {
  const out = new Map<string, WithholdingLine[]>();
  if (!vendor) return out;
  const factor = 1 - po.discountPct / 100;
  for (const line of po.lines) {
    const item = items.find((i) => i.id === line.itemId);
    if (!item) continue;
    const withholding = line.lineWithholding
      ? line.lineWithholding.map((s) => ({ ...s, description: tax.withholding.find((w) => w.atc === s.atc)?.description ?? s.atc }))
      : determineWithholding(withIncomeType(item), vendor, tax, date).withholding;
    const base = lineNet(line) * factor;
    out.set(line.id, withholding.map((wt) => ({
      atc: wt.atc, description: wt.description, rate: wt.rate, kind: wt.kind, base: round2(base),
      amount: round2((base * wt.rate) / 100),
      deducted: !REVERSE_CHARGE_ATCS.includes(wt.atc),
    })));
  }
  return out;
}

/**
 * Withholding taxes on paying the vendor — one entry per ATC, amounts summed
 * across all lines, in document currency.
 */
export function poWithholding(
  po: Pick<{ discountPct: number }, 'discountPct'> & { lines: PricedLine[] },
  vendor: LineParty | undefined,
  items: readonly Item[],
  tax: TaxMasterData,
  date: string,
): WithholdingLine[] {
  const keyed = po.lines.map((l, i) => ({ ...l, id: String(i) }));
  return totalWithholding([...lineWithholdings({ ...po, lines: keyed }, vendor, items, tax, date).values()].flat());
}

/** Settings › Accounting & Tax as seeded: what seeded documents were "added" under. */
export const SEED_TAX: TaxMasterData = {
  company: SEED_COMPANY_TAX[0], codes: SEED_TAX_CODES, groups: SEED_TAX_GROUPS, withholding: SEED_WITHHOLDING, withholdingGroups: SEED_WITHHOLDING_GROUPS,
};

/** Seeded purchase documents count as added under the seeded Settings: stamp their withholding the same way. */
export function withSeedWithholding<D extends { status: string; vendorId: string; postingDate: string; discountPct: number; lines: (PricedLine & { id: string; lineWithholding?: LineWithholding[] })[]; withholdingSummary?: StampedWithholding[] }>(docs: D[]): D[] {
  const items = mergedItems(SEED_ITEMS);
  return docs.map((d) => {
    if (d.status === 'Draft' || d.status === 'Not Confirmed') return d;
    const vendor = SEED_PARTNERS.find((p) => p.id === d.vendorId);
    return { ...d, ...stampWithholding(d, vendor, items, SEED_TAX, d.postingDate) };
  });
}

/** The document's withholding: what was stamped when it was added, else (a draft) worked out live. */
export const docWithholding = (
  doc: Pick<{ discountPct: number }, 'discountPct'> & { status?: string; lines: PricedLine[]; withholdingSummary?: StampedWithholding[] },
  vendor: LineParty | undefined,
  items: readonly Item[],
  tax: TaxMasterData,
  date: string,
): WithholdingLine[] =>
  (doc.status !== 'Draft' && doc.withholdingSummary) || poWithholding(doc, vendor, items, tax, date);

/** Stamp each line's withholding and the per-ATC summary (with the account each credits) for adding the document. */
export function stampWithholding<L extends PricedLine & { id: string; lineWithholding?: LineWithholding[] }>(
  doc: { discountPct: number; lines: L[] },
  vendor: LineParty | undefined,
  items: readonly Item[],
  tax: TaxMasterData,
  date: string,
): { lines: L[]; withholdingSummary: StampedWithholding[] } {
  const perLine = lineWithholdings(doc, vendor, items, tax, date);
  const lines = doc.lines.map((l) => ({
    ...l,
    lineWithholding: (perLine.get(l.id) ?? []).map(({ atc, rate, kind, base, amount }) => ({ atc, rate, kind, base, amount })),
  }));
  const withholdingSummary = totalWithholding([...perLine.values()].flat()).map((w) => ({ ...w, account: WITHHOLDING_PAYABLE[w.kind] ?? '2340' }));
  return { lines, withholdingSummary };
}

// ── Customers withholding from us ────────────────────────────────────────────

/**
 * The same engine as purchases with the roles swapped: the customer is the withholding agent and the
 * company is the payee — a resident corporation, VAT-registered or not per its tax profile.
 */
export function resolveCustomerWithholding(
  item: LineItem,
  customer: Pick<Partner, 'businessType' | 'topWithholdingAgent'>,
  data: TaxMasterData,
  date: string,
) {
  const agent: CompanyTaxProfile = {
    ...data.company,
    topWithholdingAgent: customer.topWithholdingAgent,
    governmentEntity: customer.businessType === 'Government',
  };
  const payee: LineParty = {
    vatRegistered: data.company.vatRegistered,
    vatExemptions: [],
    topWithholdingAgent: data.company.topWithholdingAgent,
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
  };
  return determineWithholding(item, payee, { ...data, company: agent }, date).withholding;
}

/** Whether the customer withholds on what it pays us: a top withholding agent, or government. */
export const customerWithholds = (c: Pick<Partner, 'businessType' | 'topWithholdingAgent'> | undefined) =>
  Boolean(c && (c.businessType === 'Government' || c.topWithholdingAgent));

export type CustomerWithholding = StampedCustomerWithholding;

const CUSTOMER_WITHHOLDING_ACCOUNT: Record<WithholdingKind, string> = {
  'Expanded (EWT)': CWT_ACCOUNT,
  'Final (FWT)': CWT_ACCOUNT,
  'Withholding VAT': CREDITABLE_VAT_ACCOUNT,
  // Percentage tax a government buyer withholds is credited against our 2551Q.
  'Percentage tax': '2320',
};

/** A line on a service document has no item: it pays for services. */
export const SERVICE_LINE: LineItem = {
  taxLiable: true, salesTaxGroup: '', salesTaxCode: '', purchaseTaxGroup: '', purchaseTaxCode: '', withholdingGroup: 'WH-SVC',
};

/**
 * What a top withholding agent or government customer withholds from its payment, one entry per ATC,
 * on WTax Liable lines: resolved from each item's withholding group in Settings (EWT, plus creditable
 * VAT from government on VATable lines). The base is net of VAT, after the document discount, in the
 * document currency. `tax` defaults to Settings as it is now. Every sales document uses this.
 */
export function customerWithholding(
  doc: { discountPct: number; docType?: string; postingDate: string; lines: (PricedLine & { wtaxLiable?: boolean })[] },
  customer: Pick<Partner, 'businessType' | 'topWithholdingAgent'> | undefined,
  items: readonly Item[],
  rateOf: (code: string) => number,
  tax: TaxMasterData = currentTaxData(),
): CustomerWithholding[] {
  if (!customer || !customerWithholds(customer)) return [];
  const factor = 1 - doc.discountPct / 100;
  const out = new Map<string, CustomerWithholding & { exact: number; exactBase: number }>();
  for (const l of doc.lines.filter((x) => x.wtaxLiable)) {
    const net = lineNet(l) * factor;
    const item = doc.docType === 'Service' ? SERVICE_LINE : items.find((i) => i.id === l.itemId);
    if (!item) continue;
    for (const w of resolveCustomerWithholding(item, customer, tax, doc.postingDate)) {
      // Government withholds VAT only on what it was charged VAT on.
      if (w.kind === 'Withholding VAT' && rateOf(l.taxCode) <= 0) continue;
      const row = out.get(w.atc) ?? {
        kind: w.kind, atc: w.atc, label: `${w.description} (${w.rate}%)`, rate: w.rate, base: 0, amount: 0, exact: 0, exactBase: 0,
        account: CUSTOMER_WITHHOLDING_ACCOUNT[w.kind],
      };
      row.exactBase += net;
      row.exact += (net * w.rate) / 100;
      out.set(w.atc, row);
    }
  }
  return [...out.values()].map(({ exact, exactBase, ...w }) => ({ ...w, base: round2(exactBase), amount: round2(exact) }));
}
