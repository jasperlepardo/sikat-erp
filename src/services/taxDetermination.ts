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
  | 'nonResident'
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
    if (!data.company.vatRegistered) decide('Company is not VAT-registered', 'PT010', 'Non-VAT sellers pay percentage tax on every sale');
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
        decide('Customer VAT treatment', '31', 'Government customer');
        notes.push('The government buyer withholds 5% creditable VAT (and 1%/2% EWT) and issues BIR Form 2307; claim it on 2550Q item 16.');
      } else if (t === 'Exempt entity') decide('Customer VAT treatment', '33', 'VAT-exempt customer');
      else if (t === 'Zero-rated') {
        if (!partner.zeroRatedCertificate) {
          step('Customer VAT treatment', 'warning', 'Marked zero-rated but no certificate is on file — charging regular VAT.');
        } else if (partner.zeroRatedValidUntil && partner.zeroRatedValidUntil < date) {
          step(
            'Customer VAT treatment',
            'warning',
            `Zero-rating certificate ${partner.zeroRatedCertificate} expired on ${partner.zeroRatedValidUntil} — charging regular VAT.`,
          );
        } else decide('Customer VAT treatment', '32', `Zero-rated customer (certificate ${partner.zeroRatedCertificate})`);
      } else step('Customer VAT treatment', 'skipped', 'Regular customer.');
    }

    // 5. Item tax group, 6. company default
    if (!decided) {
      const g = data.groups.find((x) => x.code === item.salesTaxGroup);
      if (g) decide('Item sales tax group', g.taxCode, `Item group ${g.code}`);
      else step('Item sales tax group', 'skipped', 'The item has no sales tax group.');
    }
    if (!decided) decide('Company default', '31', 'VATable sales');
  } else {
    const group = data.groups.find((x) => x.code === item.purchaseTaxGroup);
    const groupRate = (g: TaxGroup) => {
      const c = data.codes.find((x) => x.code === g.taxCode);
      return c ? rateAt(c, date) : undefined;
    };
    const zeroRatingRefused = (g: TaxGroup) => g.zeroRated && !data.company.exportEnterprise;

    // 1. Imported goods: VAT is paid to the Bureau of Customs, whoever the seller is.
    const imported = partner.nonResident && item.withholdingCategory === 'Goods';
    if (imported) {
      if (item.purchaseTaxCode === '46' || item.purchaseTaxCode === '49') {
        decide('Imported goods', item.purchaseTaxCode, 'Goods from a non-resident supplier, code fixed on the item');
      } else if (group && groupRate(group) === 0 && !zeroRatingRefused(group)) {
        decide('Imported goods', '49', `Goods from a non-resident supplier; item group ${group.code} is not subject to VAT`);
      } else decide('Imported goods', '46', 'Goods from a non-resident supplier: 12% import VAT paid to the Bureau of Customs');
      notes.push('Import VAT is paid to the Bureau of Customs on the import entry, not to the supplier.');
    } else step('Imported goods', 'skipped', partner.nonResident ? 'Not goods — services from a non-resident are covered below.' : 'Resident supplier.');

    // 2. Supplier status
    if (!decided) {
      const s = partner.supplierVatStatus;
      if (s === 'Non-VAT') decide('Supplier VAT status', '48', 'Non-VAT supplier: no input VAT to claim');
      else if (s === 'Non-resident digital services') {
        decide('Supplier VAT status', '45', 'Non-resident digital service provider: you withhold and remit the 12% VAT');
      } else step('Supplier VAT status', 'skipped', 'VAT-registered supplier.');
    }

    // 3. Item fixed code
    if (!decided) {
      if (item.purchaseTaxCode) decide('Item has a fixed purchasing tax code', item.purchaseTaxCode, 'Fixed on the item');
      else step('Item has a fixed purchasing tax code', 'skipped', 'No fixed code on the item.');
    }

    // 4. Item tax group (zero-rating only for an export enterprise), 5. company default
    if (!decided) {
      if (!group) step('Item purchase tax group', 'skipped', 'The item has no purchase tax group.');
      else if (zeroRatingRefused(group)) {
        step(
          'Item purchase tax group',
          'warning',
          `Item group ${group.code} is zero-rated, but the company isn’t a registered export enterprise (Company tax profile) — suppliers should charge 12%.`,
        );
      } else decide('Item purchase tax group', group.taxCode, `Item group ${group.code}`);
    }
    if (!decided) decide('Company default', '44', 'Domestic purchases');
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
    if (!w.condition || w.kind !== 'Expanded (EWT)') return w;
    const siblings = data.withholding.filter(
      (x) => x.active && x.condition && x.kind === w.kind && x.payee === w.payee && x.description === w.description,
    );
    const rates = siblings.map((x) => x.rate);
    return siblings.find((x) => x.rate === (high ? Math.max(...rates) : Math.min(...rates))) ?? w;
  };

  // Withholding VAT on non-resident digital services (on top of any EWT).
  if (partner.supplierVatStatus === 'Non-resident digital services') {
    // Private withholding agents use WV070 (final withholding VAT on services by non-residents).
    const wv = byAtc('WV070');
    if (wv) {
      withholding.push(wv);
      step('Non-resident digital services', 'applied', `Withhold the 12% VAT → ${wv.atc} ${wv.rate}% (BIR Form 1600-VT)`);
    } else step('Non-resident digital services', 'warning', 'Withhold the 12% VAT — but WV070 is missing or inactive in Settings.');
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

  // 2. Non-resident vendor → final withholding tax (EWT covers residents only)
  const category = item.withholdingCategory;
  if (partner.nonResident && category === 'Goods') {
    step('Non-resident: final tax', 'skipped', 'Goods bought from abroad are foreign-source income to the seller: no Philippine withholding.');
    return { withholding, withholdingTrace };
  }
  if (partner.nonResident || partner.supplierVatStatus === 'Non-resident digital services') {
    const treaty = 'A tax treaty may lower the rate — with a treaty ruling, set that rate as the vendor’s override.';
    if (category === 'None') step('Non-resident: final tax', 'skipped', 'The item is marked as not subject to withholding.');
    else if (payee === 'Individual') take('Non-resident: final tax', 'WI330', `Non-resident alien not engaged in business here. ${treaty}`);
    else if (category === 'Interest') take('Non-resident: final tax', 'WC180', `Interest on a foreign loan to a non-resident foreign corporation. ${treaty}`);
    else take('Non-resident: final tax', 'WC230', `Payment to a non-resident foreign corporation. ${treaty}`);
    return { withholding, withholdingTrace };
  }
  step('Non-resident: final tax', 'skipped', 'Resident vendor.');

  // 3. By what is bought
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
    case 'Royalties':
      take('Item withholding category: royalties', `${prefix}250`, `Royalties, ${payee.toLowerCase()} payee (final tax)`);
      break;
    case 'Interest':
      take('Item withholding category: interest', `${prefix}710`, `Interest on a debt instrument, ${payee.toLowerCase()} payee`);
      break;
    case 'Prizes':
      if (payee === 'Individual') take('Item withholding category: prizes', 'WI260', 'Prize to an individual (final tax, if the prize exceeds ₱10,000)');
      else step('Item withholding category: prizes', 'skipped', 'Final tax on prizes applies to individuals only.');
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
