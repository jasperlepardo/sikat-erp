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
  SYSTEM_ATCS,
  SYSTEM_TAX_CODES,
  type CompanyTaxProfile,
  type NonResidentVat,
  type TaxCode,
  type TaxDirection,
  type TaxGroup,
  type WithholdingGroup,
  type WithholdingTax,
} from '../mocks/taxes';

export interface TaxMasterData {
  company: CompanyTaxProfile;
  codes: TaxCode[];
  groups: TaxGroup[];
  withholding: WithholdingTax[];
  withholdingGroups: WithholdingGroup[];
}

export type LineItem = Pick<
  Item,
  'taxLiable' | 'salesTaxGroup' | 'salesTaxCode' | 'purchaseTaxGroup' | 'purchaseTaxCode' | 'withholdingGroup'
>;
export type LineParty = Pick<
  Partner,
  | 'vatRegistered'
  | 'vatExemptions'
  | 'topWithholdingAgent'
  | 'businessType'
  | 'nonResidentDigitalServices'
  | 'nonResident'
  | 'withholdingOverrideId'
  | 'swornDeclarationRef'
  | 'swornDeclarationDate'
  | 'swornDeclarationAttachments'
  | 'taxTreatyCountry'
  | 'taxTreatyCertificate'
  | 'taxTreatyCertificateExpiry'
  | 'taxTreatyIncomes'
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

/**
 * Whether the partner charges Philippine VAT. A non-resident only does when it's a digital
 * service provider registered with BIR (RA 12023); any other non-resident is outside the
 * VAT system, whatever the stored flag says.
 */
const chargesVat = (p: LineParty) => p.vatRegistered && (!p.nonResident || p.nonResidentDigitalServices);

type NonResidentVatResult =
  | { applies: true; kind: NonResidentVat; why: string }
  | { applies: false; why: string; warning?: boolean };

/**
 * VAT on a payment to a non-resident for services or the lease/use of property (NIRC Sec. 114(C)):
 * the buyer withholds the 12% (BIR Form 1600-VT) and claims it back as input tax. Goods are
 * importations instead, handled separately.
 */
function nonResidentVat(item: LineItem, partner: LineParty, data: TaxMasterData, date: string): NonResidentVatResult {
  if (!partner.nonResident) return { applies: false, why: 'Resident supplier.' };
  const group = data.withholdingGroups.find((g) => g.code === item.withholdingGroup && g.active);
  if (group?.nrExempt) return { applies: false, why: 'Goods — covered by the importation rule.' };
  if (partner.nonResidentDigitalServices && partner.vatRegistered) {
    return { applies: false, why: 'Digital service provider registered with BIR: it charges and remits the 12% VAT itself — claim input VAT from its invoice.' };
  }
  const kind = group ? group.nrVat : partner.nonResidentDigitalServices ? 'Services' : null;
  if (kind) {
    const what = partner.nonResidentDigitalServices ? 'digital services' : kind === 'Lease' ? 'lease or use of property' : 'services';
    const why = `Non-resident, ${what}${group ? ` (${group.name})` : ''}`;
    // An exempt purchase tax group on the item wins (a zero-rated one only counts for an export enterprise).
    const taxGroup = data.groups.find((g) => g.code === item.purchaseTaxGroup);
    const code = taxGroup && data.codes.find((c) => c.code === taxGroup.taxCode);
    if (taxGroup && code && rateAt(code, date) === 0 && !(taxGroup.zeroRated && !data.company.exportEnterprise)) {
      return { applies: false, why: `${why}, but item group ${taxGroup.code} is not subject to VAT.` };
    }
    return { applies: true, kind, why };
  }
  if (!group) return { applies: false, warning: true, why: 'Non-resident supplier but the item has no withholding group — set one so the VAT treatment can be decided.' };
  return { applies: false, why: `${group.name} from a non-resident is not subject to VAT.` };
}

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
    if (!data.company.vatRegistered) decide('Company is not VAT-registered', SYSTEM_TAX_CODES.PERCENTAGE_TAX, 'Non-VAT sellers pay percentage tax on every sale');
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

    // 4. Customer VAT exemption
    if (!decided) {
      if (partner.businessType === 'Government') {
        decide('Customer VAT exemption', SYSTEM_TAX_CODES.VATABLE, 'Government customer');
        notes.push('The government buyer withholds 5% creditable VAT (and 1%/2% EWT) and issues BIR Form 2307; claim it on 2550Q item 16.');
      } else {
        const active = partner.vatExemptions.find(
          (e) => e.attachments.length > 0 && (!e.validUntil || e.validUntil >= date),
        );
        const pending = !active && partner.vatExemptions.some((e) => e.attachments.length === 0);
        const expired = !active && partner.vatExemptions.some((e) => e.validUntil && e.validUntil < date);
        if (active?.type === 'Zero-rated') {
          decide('Customer VAT exemption', SYSTEM_TAX_CODES.ZERO_RATED, `Zero-rated (cert ${active.certificateRef || 'on file'})`);
        } else if (active?.type === 'Exempt entity') {
          decide('Customer VAT exemption', SYSTEM_TAX_CODES.EXEMPT, `Exempt entity${active.basis ? ` — ${active.basis}` : ''}`);
        } else if (pending) {
          step('Customer VAT exemption', 'warning', 'Exemption on file but no document attached yet — charging standard VAT.');
        } else if (expired) {
          step('Customer VAT exemption', 'warning', 'All exemption certificates have expired — charging standard VAT.');
        } else {
          step('Customer VAT exemption', 'skipped', 'No exemption on this customer.');
        }
      }
    }

    // 5. Item tax group, 6. company default
    if (!decided) {
      const g = data.groups.find((x) => x.code === item.salesTaxGroup);
      if (g) decide('Item sales tax group', g.taxCode, `Item group ${g.code}`);
      else step('Item sales tax group', 'skipped', 'The item has no sales tax group.');
    }
    if (!decided) decide('Company default', SYSTEM_TAX_CODES.VATABLE, 'VATable sales');
  } else {
    const group = data.groups.find((x) => x.code === item.purchaseTaxGroup);
    const groupRate = (g: TaxGroup) => {
      const c = data.codes.find((x) => x.code === g.taxCode);
      return c ? rateAt(c, date) : undefined;
    };
    const zeroRatingRefused = (g: TaxGroup) => g.zeroRated && !data.company.exportEnterprise;

    // 1. Imported goods: VAT is paid to the Bureau of Customs, whoever the seller is.
    const wGroup = data.withholdingGroups.find((g) => g.code === item.withholdingGroup);
    const imported = partner.nonResident && (wGroup?.nrExempt ?? false);
    if (imported) {
      if (item.purchaseTaxCode === SYSTEM_TAX_CODES.IMPORTATION || item.purchaseTaxCode === SYSTEM_TAX_CODES.EXEMPT_IMPORTATION) {
        decide('Imported goods', item.purchaseTaxCode, 'Goods from a non-resident supplier, code fixed on the item');
      } else if (group && groupRate(group) === 0 && !zeroRatingRefused(group)) {
        decide('Imported goods', SYSTEM_TAX_CODES.EXEMPT_IMPORTATION, `Goods from a non-resident supplier; item group ${group.code} is not subject to VAT`);
      } else decide('Imported goods', SYSTEM_TAX_CODES.IMPORTATION, 'Goods from a non-resident supplier: 12% import VAT paid to the Bureau of Customs');
      notes.push('Import VAT is paid to the Bureau of Customs on the import entry, not to the supplier.');
    } else step('Imported goods', 'skipped', partner.nonResident ? 'Not goods — see services from a non-resident below.' : 'Resident supplier.');

    // 2. Services from a non-resident: you withhold the VAT (reverse charge)
    if (!decided) {
      const nr = nonResidentVat(item, partner, data, date);
      if (nr.applies) {
        decide('Services from a non-resident', SYSTEM_TAX_CODES.NR_SERVICES, `${nr.why}: you withhold and remit the 12% VAT (BIR Form 1600-VT) and claim it as input tax`);
      } else step('Services from a non-resident', nr.warning ? 'warning' : 'skipped', nr.why);
    }

    // 3. Supplier VAT registration
    if (!decided) {
      if (!chargesVat(partner)) {
        decide('Supplier VAT registration', SYSTEM_TAX_CODES.NO_INPUT_TAX, partner.nonResident ? 'Non-resident supplier: no Philippine VAT on its invoice' : 'Non-VAT supplier: no input VAT to claim');
      } else step('Supplier VAT registration', 'skipped', 'VAT-registered supplier.');
    }

    // 4. Item fixed code
    if (!decided) {
      if (item.purchaseTaxCode) decide('Item has a fixed purchasing tax code', item.purchaseTaxCode, 'Fixed on the item');
      else step('Item has a fixed purchasing tax code', 'skipped', 'No fixed code on the item.');
    }

    // 5. Item tax group (zero-rating only for an export enterprise), 6. company default
    if (!decided) {
      if (!group) step('Item purchase tax group', 'skipped', 'The item has no purchase tax group.');
      else if (zeroRatingRefused(group)) {
        step(
          'Item purchase tax group',
          'warning',
          `Item group ${group.code} is zero-rated, but the company isn't a registered export enterprise (Company tax profile) — suppliers should charge 12%.`,
        );
      } else decide('Item purchase tax group', group.taxCode, `Item group ${group.code}`);
    }
    if (!decided) decide('Company default', SYSTEM_TAX_CODES.DOMESTIC, 'Domestic purchases');
  }

  const rate = taxCode ? rateAt(taxCode, date) : undefined;
  if (taxCode && rate === undefined) {
    trace.push({ rule: 'Rate on posting date', outcome: 'warning', detail: `${taxCode.code} has no rate in force on ${date}.` });
  }

  const { withholding, withholdingTrace } =
    direction === 'Purchase' ? determineWithholding(item, partner, data, date) : { withholding: [], withholdingTrace: [] };
  if (direction === 'Sales' && partner.businessType !== 'Government' && partner.topWithholdingAgent) {
    notes.push('This customer is a top withholding agent: it withholds 1% (goods) or 2% (services) from what it pays you and issues BIR Form 2307.');
  }

  return { taxCode, rate, trace, withholding, withholdingTrace, notes };
}


/**
 * The vendor's treaty rate for this kind of income, if the paperwork is in place: a treaty
 * income entry with an approved rate and an attached document, and an unexpired Certificate
 * of Residence (RMO 14-2021).
 */
function treatyRelief(group: WithholdingGroup, partner: LineParty, date: string) {
  if (!group.treatyIncomeType || !partner.taxTreatyCountry) return undefined;
  const entry = partner.taxTreatyIncomes.find((e) => e.incomeType === group.treatyIncomeType);
  if (!entry) return undefined;
  const label = `${partner.taxTreatyCountry} treaty, ${entry.incomeType.toLowerCase()}`;
  if (!entry.approvedRate) return { valid: false as const, why: `${label}: no approved rate entered — domestic rate applies.` };
  if (!entry.attachments.length) return { valid: false as const, why: `${label}: no document attached — domestic rate applies.` };
  if (!partner.taxTreatyCertificate) return { valid: false as const, why: `${label}: no Certificate of Residence on file — domestic rate applies.` };
  if (partner.taxTreatyCertificateExpiry && partner.taxTreatyCertificateExpiry < date) {
    return { valid: false as const, why: `${label}: Certificate of Residence expired ${partner.taxTreatyCertificateExpiry} — domestic rate applies.` };
  }
  return { valid: true as const, rate: entry.approvedRate, label };
}

/** Which withholding taxes you deduct when paying a supplier for this item. */
export function determineWithholding(
  item: LineItem,
  partner: LineParty,
  data: TaxMasterData,
  date = new Date().toISOString().slice(0, 10),
) {
  const withholdingTrace: TraceStep[] = [];
  const withholding: WithholdingTax[] = [];
  const step = (rule: string, outcome: TraceStep['outcome'], detail: string) =>
    withholdingTrace.push({ rule, outcome, detail });
  const done = () => ({ withholding, withholdingTrace });
  const payee = payeeOf(partner);
  const byAtc = (atc: string) => data.withholding.find((w) => w.atc === atc && w.active);
  const take = (rule: string, atc: string, why: string) => {
    const w = byAtc(atc);
    if (!w) return step(rule, 'warning', `${why} — but ${atc} is missing or inactive in Settings.`);
    withholding.push(w);
    step(rule, 'applied', `${why} → ${w.atc} ${w.rate}% (${w.description})`);
  };

  const group = data.withholdingGroups.find((g) => g.code === item.withholdingGroup && g.active);
  const isGov = data.company.governmentEntity;

  // 1. Government payee: income payments to the government are not subject to withholding.
  if (partner.businessType === 'Government') {
    step('Government payee', 'applied', 'Payments to government agencies are not subject to withholding tax.');
    return done();
  }

  // 2. Income tier (residents only): the lower rate needs this year's sworn declaration (RR 11-2018).
  // A VAT-registered individual always gets the higher rate, declaration or not. Worked out here,
  // but only reported when an income-tiered ATC is picked — a flat rate doesn't depend on it.
  let high = true;
  let tierLabel = '';
  let tierStep: TraceStep | undefined;
  if (!partner.nonResident) {
    const threshold = payee === 'Individual' ? '₱3M' : '₱720,000';
    const docYear = new Date(date).getFullYear();
    const declYear = partner.swornDeclarationDate ? new Date(partner.swornDeclarationDate).getFullYear() : null;
    const tier = (outcome: TraceStep['outcome'], label: string, detail: string) => {
      tierLabel = label;
      tierStep = { rule: 'Income tier', outcome, detail };
    };
    if (payee === 'Individual' && chargesVat(partner)) {
      tier('applied', 'VAT-registered', 'VAT-registered individual — the higher rate applies regardless of income.');
    } else if (!partner.swornDeclarationRef) {
      tier('warning', 'no declaration — higher rate', 'No sworn declaration on file — higher rate applies (RR 11-2018). Ask the vendor to submit one.');
    } else if (declYear !== docYear) {
      tier('warning', 'no declaration — higher rate', `Sworn declaration (ref ${partner.swornDeclarationRef}) is for ${declYear ?? 'an unknown year'}, not ${docYear} — higher rate applies. Ask the vendor to resubmit.`);
    } else if (!partner.swornDeclarationAttachments.length) {
      tier('warning', 'no declaration — higher rate', `Sworn declaration ref ${partner.swornDeclarationRef} has no document attached — higher rate applies. Upload the signed declaration.`);
    } else {
      high = false;
      tier('applied', `declared ≤ ${threshold}`, `Vendor declared gross income ≤ ${threshold} (ref ${partner.swornDeclarationRef}, ${partner.swornDeclarationDate}) — lower rate applies.`);
    }
  }
  const reportTier = () => tierStep && withholdingTrace.push(tierStep);

  // 3. VAT withheld on services or property lease from a non-resident (Sec. 114(C), 1600-VT).
  const nr = nonResidentVat(item, partner, data, date);
  if (nr.applies) {
    const atc = nr.kind === 'Lease'
      ? (isGov ? SYSTEM_ATCS.NR_LEASE_VAT_GOV : SYSTEM_ATCS.NR_LEASE_VAT_PRIVATE)
      : (isGov ? SYSTEM_ATCS.NR_VAT_GOV : SYSTEM_ATCS.NR_VAT_PRIVATE);
    take('Non-resident: VAT', atc, `${nr.why} — withhold the 12% VAT (BIR Form 1600-VT)`);
  } else if (partner.nonResident) {
    step('Non-resident: VAT', nr.warning ? 'warning' : 'skipped', nr.why);
  }

  // 4. Government money payments (GMP) on resident suppliers, on top of EWT.
  // VAT-registered: 5% creditable VAT (WV010 goods / WV020 services). Non-VAT: 3% percentage tax (WB080).
  if (isGov && !partner.nonResident) {
    if (chargesVat(partner) && item.taxLiable) {
      const gmpAtc = group?.nrExempt ? SYSTEM_ATCS.GMP_VAT_GOODS : SYSTEM_ATCS.GMP_VAT_SERVICES;
      take('GMP: VAT withholding', gmpAtc, `Government withholds 5% creditable VAT on ${group?.nrExempt ? 'goods' : 'services'} (BIR Form 1600-VT)`);
    } else if (!chargesVat(partner)) {
      take('GMP: Percentage tax withholding', SYSTEM_ATCS.GMP_PT, 'Government withholds 3% percentage tax on non-VAT supplier (BIR Form 1600-PT)');
    }
  }

  // 5. Vendor override (income tiering still applies to residents).
  if (partner.withholdingOverrideId) {
    const set = data.withholding.find((x) => x.id === partner.withholdingOverrideId);
    if (set) {
      let w = set;
      if (!partner.nonResident && set.condition && set.kind === 'Expanded (EWT)') {
        const siblings = data.withholding.filter(
          (x) => x.active && x.condition && x.kind === set.kind && x.payee === set.payee && x.description === set.description,
        );
        const rates = siblings.map((x) => x.rate);
        w = siblings.find((x) => x.rate === (high ? Math.max(...rates) : Math.min(...rates))) ?? set;
        reportTier();
      }
      withholding.push(w);
      step(
        'Vendor override',
        'applied',
        w === set
          ? `Set on the vendor → ${w.atc || 'ATC to confirm'} ${w.rate}%`
          : `Set on the vendor as ${set.atc}, adjusted for ${tierLabel} → ${w.atc} ${w.rate}%`,
      );
      return done();
    }
    step('Vendor override', 'warning', "The vendor's override points to a withholding tax that no longer exists.");
  } else step('Vendor override', 'skipped', 'No override on the vendor.');

  // 6. Withholding group lookup.
  if (!group) {
    if (item.withholdingGroup) {
      step('Withholding group', 'warning', `Withholding group '${item.withholdingGroup}' is missing or inactive in Settings.`);
    } else {
      step('Withholding group', 'skipped', 'No withholding group on the item.');
    }
    return done();
  }

  const hasAnyAtc = group.atcIndividual || group.atcCorporate || group.atcIndividualGov || group.atcCorporateGov
    || group.atcNrIndividual || group.atcNrCorporate;
  if (!hasAnyAtc) {
    step('Withholding group', 'skipped', `${group.name}: not subject to withholding.`);
    return done();
  }

  // 7. Non-resident vendor: final tax, lowered by a tax treaty when the paperwork is in place.
  if (partner.nonResident && group.nrExempt) {
    step('Non-resident: final tax', 'skipped', `${group.name} from a non-resident: foreign-source income, no Philippine withholding.`);
    return done();
  }
  if (partner.nonResident) {
    const nrAtc = payee === 'Individual' ? (group.atcNrIndividual ?? SYSTEM_ATCS.NR_INDIVIDUAL) : (group.atcNrCorporate ?? SYSTEM_ATCS.NR_CORPORATE);
    const w = byAtc(nrAtc);
    if (!w) {
      step('Non-resident: final tax', 'warning', `${group.name}, non-resident payee — but ${nrAtc} is missing or inactive in Settings.`);
      return done();
    }
    const treaty = treatyRelief(group, partner, date);
    if (treaty?.valid && treaty.rate < w.rate) {
      withholding.push({ ...w, rate: treaty.rate, description: `${w.description} (${treaty.label} rate)` });
      step('Non-resident: final tax', 'applied', `${group.name}, non-resident payee, ${treaty.label} → ${w.atc} ${treaty.rate}% instead of ${w.rate}%`);
    } else {
      withholding.push(w);
      if (treaty && !treaty.valid) step('Tax treaty', 'warning', treaty.why);
      else if (treaty?.valid) step('Tax treaty', 'skipped', `${treaty.label}: ${treaty.rate}% is not lower than the domestic ${w.rate}%.`);
      step('Non-resident: final tax', 'applied', `${group.name}, non-resident payee → ${w.atc} ${w.rate}% (${w.description})`);
    }
    return done();
  }
  step('Non-resident: final tax', 'skipped', 'Resident vendor.');

  // 8. Top withholding agent gate — government entities always withhold.
  if (group.requiresTopWA && !data.company.topWithholdingAgent && !isGov) {
    step('Top withholding agent', 'skipped', `${group.name}: only withheld by top withholding agents — the company is not one.`);
    return done();
  }

  // 9. The ATC for the payee type and income tier. Government entities use their own ATCs when the
  // group defines them; otherwise the regular (tiered) set.
  const govAtc = isGov ? (payee === 'Individual' ? group.atcIndividualGov : group.atcCorporateGov) : null;
  const regularAtc = payee === 'Individual'
    ? ((high && group.atcIndividualHigh) ? group.atcIndividualHigh : group.atcIndividual)
    : ((high && group.atcCorporateHigh) ? group.atcCorporateHigh : group.atcCorporate);
  const atc = govAtc ?? regularAtc;

  if (!atc) {
    step('Withholding group', 'skipped', `${group.name}: not applicable to a ${payee.toLowerCase()} payee.`);
    return done();
  }

  const tiered = !govAtc && !!(payee === 'Individual' ? group.atcIndividualHigh : group.atcCorporateHigh);
  if (tiered) reportTier();
  const govLabel = govAtc ? ' (government entity)' : '';
  take('Withholding group', atc, `${group.name}, ${payee.toLowerCase()} payee${govLabel}${tiered ? `, ${tierLabel}` : ''}`);
  return done();
}
