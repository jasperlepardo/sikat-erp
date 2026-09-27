/**
 * Tax determination: which VAT/percentage tax code and which withholding tax apply
 * to a document line. Rules run in order and the first match wins, so a partner's
 * or the company's special status beats the item's default — the way SAP B1's
 * Philippine localization resolves VAT groups.
 *
 * Every step is recorded in `trace`, so the UI can explain the result.
 */
import type { Item } from '../mocks/items';
import type { Partner } from '../mocks/partners';
import {
  rateAt,
  type CompanyTaxProfile,
  type TaxCode,
  type TaxDirection,
  type TaxGroup,
  type WithholdingTax,
} from '../mocks/taxes';

export interface TaxMasterData {
  company: CompanyTaxProfile;
  codes: TaxCode[];
  groups: TaxGroup[];
  withholding: WithholdingTax[];
}

export type LineItem = Pick<
  Item,
  'taxLiable' | 'salesTaxGroup' | 'salesTaxCode' | 'purchaseTaxGroup' | 'purchaseTaxCode' | 'withholdingCategory'
>;
export type LineParty = Pick<
  Partner,
  | 'salesVatTreatment'
  | 'zeroRatedCertificate'
  | 'zeroRatedValidUntil'
  | 'supplierVatStatus'
  | 'withholdingOverrideId'
  | 'grossIncomeAboveThreshold'
  | 'businessType'
>;

export interface TraceStep {
  rule: string;
  outcome: 'applied' | 'skipped' | 'warning';
  detail: string;
}

export interface Determination {
  /** undefined = no tax on this line (item not tax liable). */
  taxCode?: TaxCode;
  rate?: number;
  trace: TraceStep[];
  withholding: WithholdingTax[];
  withholdingTrace: TraceStep[];
  /** Things the other side does, for information (e.g. government withholding). */
  notes: string[];
}

const payeeOf = (p: LineParty) =>
  ['Individual', 'Sole proprietorship'].includes(p.businessType) ? 'Individual' : 'Corporate';

export function determineTax(
  direction: TaxDirection,
  item: LineItem,
  partner: LineParty,
  data: TaxMasterData,
  date = new Date().toISOString().slice(0, 10),
): Determination {
  const trace: TraceStep[] = [];
  const notes: string[] = [];
  const byCode = (code: string) => data.codes.find((c) => c.code === code);
  const step = (rule: string, outcome: TraceStep['outcome'], detail: string) => trace.push({ rule, outcome, detail });

  let taxCode: TaxCode | undefined;
  let decided = false;
  const decide = (rule: string, code: string, why: string) => {
    const c = byCode(code);
    if (!c) return step(rule, 'warning', `${why} — but tax code ${code} is missing from Settings.`);
    taxCode = c;
    decided = true;
    step(rule, 'applied', `${why} → ${c.code} (${c.name})`);
  };

  if (direction === 'Sales') {
    // 1. Company status
    if (!data.company.vatRegistered) decide('Company is not VAT-registered', 'PT3', 'Non-VAT sellers pay percentage tax on every sale');
    else step('Company is not VAT-registered', 'skipped', 'The company is VAT-registered.');

    // 2. Item not tax liable
    if (!decided) {
      if (!item.taxLiable) {
        decided = true;
        step('Item is not tax liable', 'applied', 'No tax is charged on this item.');
      } else step('Item is not tax liable', 'skipped', 'The item is tax liable.');
    }

    // 3. Item fixed code
    if (!decided) {
      if (item.salesTaxCode) decide('Item has a fixed sales tax code', item.salesTaxCode, 'Fixed on the item');
      else step('Item has a fixed sales tax code', 'skipped', 'No fixed code on the item.');
    }

    // 4. Customer VAT treatment
    if (!decided) {
      const t = partner.salesVatTreatment;
      if (t === 'Government') {
        decide('Customer VAT treatment', 'OVG12', 'Government customer');
        notes.push('The government buyer withholds 5% creditable VAT (and 1%/2% EWT) and issues BIR Form 2307.');
      } else if (t === 'Exempt entity') decide('Customer VAT treatment', 'OVX', 'VAT-exempt customer');
      else if (t === 'Zero-rated') {
        if (!partner.zeroRatedCertificate) {
          step('Customer VAT treatment', 'warning', 'Marked zero-rated but no certificate is on file — charging regular VAT.');
        } else if (partner.zeroRatedValidUntil && partner.zeroRatedValidUntil < date) {
          step(
            'Customer VAT treatment',
            'warning',
            `Zero-rating certificate ${partner.zeroRatedCertificate} expired on ${partner.zeroRatedValidUntil} — charging regular VAT.`,
          );
        } else decide('Customer VAT treatment', 'OV0', `Zero-rated customer (certificate ${partner.zeroRatedCertificate})`);
      } else step('Customer VAT treatment', 'skipped', 'Regular customer.');
    }

    // 5. Item tax group, 6. company default
    if (!decided) {
      const g = data.groups.find((x) => x.code === item.salesTaxGroup);
      if (g) decide('Item sales tax group', g.taxCode, `Item group ${g.code}`);
      else step('Item sales tax group', 'skipped', 'The item has no sales tax group.');
    }
    if (!decided) decide('Company default', 'OV12', 'Standard output VAT');
  } else {
    // 1. Supplier status
    const s = partner.supplierVatStatus;
    if (s === 'Non-VAT') decide('Supplier VAT status', 'INV', 'Non-VAT supplier: no input VAT to claim');
    else if (s === 'Non-resident digital services') {
      decide('Supplier VAT status', 'IVD12', 'Non-resident digital service provider: you withhold and remit the 12% VAT');
    } else step('Supplier VAT status', 'skipped', 'VAT-registered supplier.');

    // 2. Item fixed code
    if (!decided) {
      if (item.purchaseTaxCode) decide('Item has a fixed purchasing tax code', item.purchaseTaxCode, 'Fixed on the item');
      else step('Item has a fixed purchasing tax code', 'skipped', 'No fixed code on the item.');
    }

    // 3. Item tax group, 4. company default
    if (!decided) {
      const g = data.groups.find((x) => x.code === item.purchaseTaxGroup);
      if (g) decide('Item purchase tax group', g.taxCode, `Item group ${g.code}`);
      else step('Item purchase tax group', 'skipped', 'The item has no purchase tax group.');
    }
    if (!decided) decide('Company default', 'IV12', 'Standard input VAT');
    notes.push('Import VAT (IVI12) is entered on the import entry / landed cost, not on the supplier’s bill.');
  }

  const rate = taxCode ? rateAt(taxCode, date) : undefined;
  if (taxCode && rate === undefined) {
    trace.push({ rule: 'Rate on posting date', outcome: 'warning', detail: `${taxCode.code} has no rate in force on ${date}.` });
  }

  const { withholding, withholdingTrace } =
    direction === 'Purchase' ? determineWithholding(item, partner, data) : { withholding: [], withholdingTrace: [] };
  if (direction === 'Sales' && partner.salesVatTreatment !== 'Government') {
    notes.push('Customers who are top withholding agents withhold 1% (goods) or 2% (services) from what they pay you.');
  }

  return { taxCode, rate, trace, withholding, withholdingTrace, notes };
}

/** Which withholding taxes you deduct when paying a supplier for this item. */
export function determineWithholding(item: LineItem, partner: LineParty, data: TaxMasterData) {
  const withholdingTrace: TraceStep[] = [];
  const withholding: WithholdingTax[] = [];
  const step = (rule: string, outcome: TraceStep['outcome'], detail: string) =>
    withholdingTrace.push({ rule, outcome, detail });
  const payee = payeeOf(partner);
  const prefix = payee === 'Individual' ? 'WI' : 'WC';
  const byAtc = (atc: string) => data.withholding.find((w) => w.atc === atc && w.active);
  const take = (rule: string, atc: string, why: string) => {
    const w = byAtc(atc);
    if (!w) return step(rule, 'warning', `${why} — but ${atc} is missing or inactive in Settings.`);
    withholding.push(w);
    step(rule, 'applied', `${why} → ${w.atc} ${w.rate}% (${w.description})`);
  };

  // Income-tiered ATCs: individuals move up above ₱3M or when VAT-registered; corporations above ₱720,000.
  const high =
    payee === 'Individual'
      ? partner.grossIncomeAboveThreshold || partner.supplierVatStatus === 'VAT-registered'
      : partner.grossIncomeAboveThreshold;
  const tierLabel =
    payee === 'Individual'
      ? high
        ? partner.grossIncomeAboveThreshold ? 'gross income > ₱3M' : 'VAT-registered'
        : 'non-VAT, gross income ≤ ₱3M'
      : high ? 'gross income > ₱720,000' : 'gross income ≤ ₱720,000';
  /** The sibling of a tiered ATC (same income payment and payee) that matches the vendor's income. */
  const tierOf = (w: WithholdingTax) => {
    if (!w.condition) return w;
    const siblings = data.withholding.filter(
      (x) => x.active && x.condition && x.kind === w.kind && x.payee === w.payee && x.description === w.description,
    );
    const rates = siblings.map((x) => x.rate);
    return siblings.find((x) => x.rate === (high ? Math.max(...rates) : Math.min(...rates))) ?? w;
  };

  // Withholding VAT on non-resident digital services (on top of any EWT).
  if (partner.supplierVatStatus === 'Non-resident digital services') {
    const wv = data.withholding.find((w) => w.kind === 'Withholding VAT' && w.rate === 12 && w.active);
    if (wv) {
      withholding.push(wv);
      step('Non-resident digital services', 'applied', `Withhold the 12% VAT → ${wv.atc || 'ATC to confirm'} (BIR Form 1600-VT)`);
    }
  }

  // 1. Vendor override
  if (partner.withholdingOverrideId) {
    const set = data.withholding.find((x) => x.id === partner.withholdingOverrideId);
    if (set) {
      const w = tierOf(set);
      withholding.push(w);
      step(
        'Vendor override',
        'applied',
        w === set
          ? `Set on the vendor → ${w.atc || 'ATC to confirm'} ${w.rate}%`
          : `Set on the vendor as ${set.atc}, adjusted for ${tierLabel} → ${w.atc} ${w.rate}%`,
      );
      return { withholding, withholdingTrace };
    }
    step('Vendor override', 'warning', 'The vendor’s override points to a withholding tax that no longer exists.');
  } else step('Vendor override', 'skipped', 'No override on the vendor.');

  // 2. By what is bought
  const category = item.withholdingCategory;
  if (partner.supplierVatStatus === 'Non-resident digital services') {
    step(
      'Expanded withholding',
      'warning',
      'EWT covers resident suppliers only. Payments to a non-resident may carry final withholding income tax — check the tax treaty.',
    );
    return { withholding, withholdingTrace };
  }
  switch (category) {
    case 'None':
      step('Item withholding category', 'skipped', 'The item is marked as not subject to withholding.');
      break;
    case 'Rent':
      take('Item withholding category: rent', `${prefix}100`, `Rental, ${payee.toLowerCase()} payee`);
      break;
    case 'Contractor':
      take('Item withholding category: contractor', `${prefix}120`, `Contractor, ${payee.toLowerCase()} payee`);
      break;
    case 'Professional fees':
      take(
        'Item withholding category: professional fees',
        `${prefix}01${high ? 1 : 0}`,
        `${payee} professional, ${tierLabel}`,
      );
      break;
    case 'Goods':
    case 'Services':
      if (!data.company.topWithholdingAgent) {
        step('Top withholding agent', 'skipped', 'The company is not a top withholding agent, so regular goods and services aren’t withheld.');
      } else {
        take(
          'Top withholding agent',
          `${prefix}${category === 'Goods' ? '158' : '160'}`,
          `Top withholding agent buying ${category.toLowerCase()} from a ${payee.toLowerCase()} supplier`,
        );
      }
      break;
  }
  return { withholding, withholdingTrace };
}
