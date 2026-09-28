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
  | 'businessType'
  | 'nonResidentDigitalServices'
  | 'nonResident'
  | 'withholdingOverrideId'
  | 'swornDeclarationRef'
  | 'swornDeclarationDate'
  | 'swornDeclarationAttachments'
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
    } else step('Imported goods', 'skipped', partner.nonResident ? 'Not goods — services from a non-resident are covered below.' : 'Resident supplier.');

    // 2. Supplier VAT registration
    if (!decided) {
      if (partner.nonResident && partner.nonResidentDigitalServices && !partner.vatRegistered) {
        decide('Supplier VAT registration', SYSTEM_TAX_CODES.NR_SERVICES, 'Non-resident digital service provider not registered with BIR: you withhold and remit the 12% VAT (BIR Form 1600-VT)');
      } else if (partner.nonResident && partner.nonResidentDigitalServices && partner.vatRegistered) {
        step('Supplier VAT registration', 'skipped', 'Non-resident digital service provider registered with BIR as NR-DSP: they charge and remit the 12% VAT directly — claim input VAT from their invoice.');
      } else if (!partner.vatRegistered) {
        decide('Supplier VAT registration', SYSTEM_TAX_CODES.NO_INPUT_TAX, 'Non-VAT supplier: no input VAT to claim');
      } else step('Supplier VAT registration', 'skipped', 'VAT-registered supplier.');
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
  if (direction === 'Sales' && partner.businessType !== 'Government') {
    notes.push('Customers who are top withholding agents withhold 1% (goods) or 2% (services) from what they pay you.');
  }

  return { taxCode, rate, trace, withholding, withholdingTrace, notes };
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
  const payee = payeeOf(partner);
  const byAtc = (atc: string) => data.withholding.find((w) => w.atc === atc && w.active);
  const take = (rule: string, atc: string, why: string) => {
    const w = byAtc(atc);
    if (!w) return step(rule, 'warning', `${why} — but ${atc} is missing or inactive in Settings.`);
    withholding.push(w);
    step(rule, 'applied', `${why} → ${w.atc} ${w.rate}% (${w.description})`);
  };

  // Resolve the group early — both GMP and EWT logic need it.
  const group = data.withholdingGroups.find((g) => g.code === item.withholdingGroup && g.active);
  const isGov = data.company.governmentEntity;

  // Income tier: validate the vendor's sworn declaration (RR 11-2018).
  // Without a valid declaration for this year, the higher rate applies.
  const docYear = new Date(date).getFullYear();
  const declYear = partner.swornDeclarationDate ? new Date(partner.swornDeclarationDate).getFullYear() : null;
  const declarationValid = !!partner.swornDeclarationRef && declYear === docYear && partner.swornDeclarationAttachments.length > 0;
  const threshold = payee === 'Individual' ? '₱3M' : '₱720,000';

  // A valid sworn declaration means the vendor is declaring income ≤ threshold → lower rate.
  // Without one, the higher rate applies by default (RR 11-2018).
  let grossAbove: boolean;
  if (!declarationValid) {
    grossAbove = true;
    if (!partner.swornDeclarationRef) {
      step('Sworn declaration', 'warning', `No sworn declaration on file — higher rate applies (RR 11-2018). Ask the vendor to submit one.`);
    } else if (declYear !== docYear) {
      step('Sworn declaration', 'warning', `Sworn declaration (ref ${partner.swornDeclarationRef}) is for ${declYear ?? 'an unknown year'}, not ${docYear} — higher rate applies. Ask the vendor to resubmit.`);
    } else {
      step('Sworn declaration', 'warning', `Sworn declaration ref ${partner.swornDeclarationRef} has no document attached — higher rate applies. Upload the signed declaration.`);
    }
  } else {
    grossAbove = false;
    step('Sworn declaration', 'applied', `Vendor declared gross income ≤ ${threshold} (ref ${partner.swornDeclarationRef}, ${partner.swornDeclarationDate}) — lower rate applies.`);
  }

  const high =
    payee === 'Individual'
      ? grossAbove || partner.vatRegistered
      : grossAbove;
  const tierLabel =
    payee === 'Individual'
      ? high ? (grossAbove ? 'no declaration — higher rate' : 'VAT-registered') : 'declared ≤ ₱3M'
      : high ? 'no declaration — higher rate' : 'declared ≤ ₱720,000';

  // Withholding VAT on non-resident digital services.
  // Government entities use WV060; private entities use WV070.
  if (partner.nonResident && partner.nonResidentDigitalServices && !partner.vatRegistered) {
    const vatAtc = isGov ? SYSTEM_ATCS.NR_VAT_GOV : SYSTEM_ATCS.NR_VAT_PRIVATE;
    const wv = byAtc(vatAtc);
    if (wv) {
      withholding.push(wv);
      step('Non-resident digital services', 'applied', `NR-DSP not registered with BIR — withhold the 12% VAT → ${wv.atc} ${wv.rate}% (BIR Form 1600-VT)`);
    } else step('Non-resident digital services', 'warning', `NR-DSP not registered with BIR — withhold the 12% VAT, but ${vatAtc} is missing or inactive in Settings.`);
  }

  // GMP: government entity money-payment taxes on resident supplier purchases (on top of EWT).
  // VAT-registered suppliers: 5% creditable VAT withheld (WV010 goods / WV020 services).
  // Non-VAT suppliers: 3% percentage tax withheld (WB080).
  if (isGov && !partner.nonResident && !partner.nonResidentDigitalServices) {
    if (partner.vatRegistered && item.taxLiable) {
      const gmpAtc = group?.nrExempt ? SYSTEM_ATCS.GMP_VAT_GOODS : SYSTEM_ATCS.GMP_VAT_SERVICES;
      take('GMP: VAT withholding', gmpAtc, `Government withholds 5% creditable VAT on ${group?.nrExempt ? 'goods' : 'services'} (BIR Form 1600-VT)`);
    } else if (!partner.vatRegistered) {
      take('GMP: Percentage tax withholding', SYSTEM_ATCS.GMP_PT, 'Government withholds 3% percentage tax on non-VAT supplier (BIR Form 1600-PT)');
    }
  }

  // 1. Vendor override for EWT (tiering still applies).
  if (partner.withholdingOverrideId) {
    const set = data.withholding.find((x) => x.id === partner.withholdingOverrideId);
    if (set) {
      let w = set;
      if (set.condition && set.kind === 'Expanded (EWT)') {
        const siblings = data.withholding.filter(
          (x) => x.active && x.condition && x.kind === set.kind && x.payee === set.payee && x.description === set.description,
        );
        const rates = siblings.map((x) => x.rate);
        w = siblings.find((x) => x.rate === (high ? Math.max(...rates) : Math.min(...rates))) ?? set;
      }
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
    step('Vendor override', 'warning', "The vendor's override points to a withholding tax that no longer exists.");
  } else step('Vendor override', 'skipped', 'No override on the vendor.');

  // 2. Withholding group lookup.
  if (!group) {
    if (item.withholdingGroup) {
      step('Withholding group', 'warning', `Withholding group '${item.withholdingGroup}' is missing or inactive in Settings.`);
    } else {
      step('Withholding group', 'skipped', 'No withholding group on the item.');
    }
    return { withholding, withholdingTrace };
  }

  // No-withholding group (all ATC fields null).
  const hasAnyAtc = group.atcIndividual || group.atcCorporate || group.atcIndividualGov || group.atcCorporateGov
    || group.atcNrIndividual || group.atcNrCorporate;
  if (!hasAnyAtc) {
    step('Withholding group', 'skipped', `${group.name}: not subject to withholding.`);
    return { withholding, withholdingTrace };
  }

  // 3. Non-resident vendor.
  if (partner.nonResident && group.nrExempt) {
    step('Non-resident: no withholding', 'skipped', `${group.name} from a non-resident: foreign-source income, no Philippine withholding.`);
    return { withholding, withholdingTrace };
  }
  if (partner.nonResident || partner.nonResidentDigitalServices) {
    const treaty = "A tax treaty may lower the rate — with a treaty ruling, set that rate as the vendor's override.";
    const nrAtc = payee === 'Individual' ? (group.atcNrIndividual ?? SYSTEM_ATCS.NR_INDIVIDUAL) : (group.atcNrCorporate ?? SYSTEM_ATCS.NR_CORPORATE);
    take('Non-resident: final tax', nrAtc, `${group.name}, non-resident payee. ${treaty}`);
    return { withholding, withholdingTrace };
  }
  step('Non-resident: final tax', 'skipped', 'Resident vendor.');

  // 4. Top withholding agent gate — government entities always withhold, so skip this gate for them.
  if (group.requiresTopWA && !data.company.topWithholdingAgent && !isGov) {
    step('Top withholding agent', 'skipped', `${group.name}: only withheld by top withholding agents — the company is not one.`);
    return { withholding, withholdingTrace };
  }

  // 5. GPP partner distributions use special ATCs regardless of the services group ATCs.
  if (group.code === 'WH-SVC' && partner.businessType === 'General professional partnership') {
    take('GPP partner distribution', high ? SYSTEM_ATCS.GPP_HIGH : SYSTEM_ATCS.GPP_LOW, `General professional partnership, ${tierLabel}`);
    return { withholding, withholdingTrace };
  }

  // 6. Pick the ATC for the payee type and income tier.
  // Government entities use their own ATCs when defined; otherwise fall back to the regular (tiered) set.
  const govAtc = isGov ? (payee === 'Individual' ? group.atcIndividualGov : group.atcCorporateGov) : null;
  const regularAtc = payee === 'Individual'
    ? ((high && group.atcIndividualHigh) ? group.atcIndividualHigh : group.atcIndividual)
    : ((high && group.atcCorporateHigh) ? group.atcCorporateHigh : group.atcCorporate);
  const atc = govAtc ?? regularAtc;

  if (!atc) {
    step('Withholding group', 'skipped', `${group.name}: not applicable to a ${payee.toLowerCase()} payee.`);
    return { withholding, withholdingTrace };
  }

  const tiered = !govAtc && !!(group.atcIndividualHigh || group.atcCorporateHigh);
  const govLabel = govAtc ? ' (government entity)' : '';
  take('Withholding group', atc, `${group.name}, ${payee.toLowerCase()} payee${govLabel}${tiered ? `, ${tierLabel}` : ''}`);
  return { withholding, withholdingTrace };
}
