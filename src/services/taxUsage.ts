import { SYSTEM_ATCS, SYSTEM_TAX_CODES } from '../mocks/taxes';
import { itemGroups } from './inventoryMasters';
import { listItems } from './items';
import { accounts, companyTax, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from './masterData';
import { listPartners } from './partners';

/** What uses one tax record (a tax code, tax group, ATC, withholding tax or withholding group). */
export interface TaxUsage {
  /** Determination rules that pick it by name — it can never be deactivated. */
  rules: string[];
  taxCodes: string[];
  taxGroups: string[];
  withholdingGroups: string[];
  withholdingTaxes: string[];
  itemGroups: string[];
  items: number;
  partners: string[];
  accounts: string[];
  company: boolean;
}

const empty = (): TaxUsage => ({ rules: [], taxCodes: [], taxGroups: [], withholdingGroups: [], withholdingTaxes: [], itemGroups: [], items: 0, partners: [], accounts: [], company: false });

const taxUsageCount = (u?: TaxUsage) =>
  u ? u.rules.length + u.taxCodes.length + u.taxGroups.length + u.withholdingGroups.length + u.withholdingTaxes.length + u.itemGroups.length + u.items + u.partners.length + u.accounts.length + (u.company ? 1 : 0) : 0;

/** The rule behind each tax code the engine names directly (services/taxDetermination.ts). */
const CODE_RULES: Record<keyof typeof SYSTEM_TAX_CODES, string> = {
  VATABLE: 'government customer, and the default for sales',
  ZERO_RATED: 'zero-rated customer exemption',
  EXEMPT: 'exempt customer',
  PERCENTAGE_TAX: 'company not VAT-registered, with no percentage tax code set',
  DOMESTIC: 'the default for purchases',
  NR_SERVICES: 'services from a non-resident (reverse charge)',
  IMPORTATION: 'goods from a non-resident (import VAT)',
  NO_INPUT_TAX: 'supplier not VAT-registered',
  EXEMPT_IMPORTATION: 'exempt goods from a non-resident',
};

/** The rule behind each ATC the engine names directly. */
const ATC_RULES: Record<keyof typeof SYSTEM_ATCS, string> = {
  NR_LEASE_VAT_GOV: 'non-resident lease, government company',
  NR_LEASE_VAT_PRIVATE: 'non-resident lease',
  NR_VAT_GOV: 'non-resident services, government company',
  NR_VAT_PRIVATE: 'non-resident services',
  GMP_VAT_GOODS: 'government buying goods from a VAT supplier',
  GMP_VAT_SERVICES: 'government buying services from a VAT supplier',
  GMP_PT: 'government buying from a non-VAT supplier',
  NR_INDIVIDUAL: 'non-resident individual, when the group has no ATC of its own',
  NR_CORPORATE: 'non-resident company, when the group has no ATC of its own',
};

/** Tax records in use, keyed by kind and then by what other records store (code, ATC or id). */
export interface TaxUsageMaps {
  codes: Map<string, TaxUsage>;
  groups: Map<string, TaxUsage>;
  /** VAT, percentage-tax and withholding ATCs, by ATC. */
  atcs: Map<string, TaxUsage>;
  /** Withholding taxes, by id (partner overrides store the id). */
  withholding: Map<string, TaxUsage>;
  withholdingGroups: Map<string, TaxUsage>;
  /** BIR forms, by id. */
  forms: Map<string, TaxUsage>;
}

/** Every tax record in use, and by what — for the Settings › Accounting & Tax lists. */
export async function loadTaxUsage(): Promise<TaxUsageMaps> {
  const [codes, groups, wht, whGroups, igs, items, partners, chart, [company]] = await Promise.all([
    taxCodes.list(), taxGroups.list(), withholdingTaxes.list(), withholdingGroups.list(), itemGroups.list(), listItems(), listPartners(), accounts.list(), companyTax.list(),
  ]);
  const maps: TaxUsageMaps = { codes: new Map(), groups: new Map(), atcs: new Map(), withholding: new Map(), withholdingGroups: new Map(), forms: new Map() };
  const at = (map: Map<string, TaxUsage>, key: string) => {
    if (!map.has(key)) map.set(key, empty());
    return map.get(key)!;
  };

  for (const [k, code] of Object.entries(SYSTEM_TAX_CODES)) at(maps.codes, code).rules.push(CODE_RULES[k as keyof typeof SYSTEM_TAX_CODES]);
  for (const [k, atc] of Object.entries(SYSTEM_ATCS)) at(maps.atcs, atc).rules.push(ATC_RULES[k as keyof typeof SYSTEM_ATCS]);

  for (const c of codes) {
    if (c.atc) at(maps.atcs, c.atc).taxCodes.push(c.code);
    for (const id of c.returnFormIds ?? []) at(maps.forms, id).taxCodes.push(c.code);
  }
  for (const w of wht) for (const id of w.formIds ?? []) at(maps.forms, id).withholdingTaxes.push(w.atc);
  for (const g of groups) if (g.taxCode) at(maps.codes, g.taxCode).taxGroups.push(g.code);
  for (const g of whGroups) {
    const atcs = [g.atcIndividual, g.atcIndividualHigh, g.atcCorporate, g.atcCorporateHigh, g.atcNrIndividual, g.atcNrCorporate, g.atcIndividualGov, g.atcCorporateGov];
    for (const atc of new Set(atcs.filter((a): a is string => Boolean(a)))) at(maps.atcs, atc).withholdingGroups.push(g.code);
  }
  for (const g of igs) {
    for (const code of new Set([g.salesTaxGroup, g.purchaseTaxGroup].filter(Boolean))) at(maps.groups, code).itemGroups.push(g.name);
    if (g.withholdingGroup) at(maps.withholdingGroups, g.withholdingGroup).itemGroups.push(g.name);
  }
  for (const i of items) {
    for (const code of new Set([i.salesTaxGroup, i.purchaseTaxGroup].filter(Boolean))) at(maps.groups, code).items++;
    for (const code of new Set([i.salesTaxCode, i.purchaseTaxCode].filter(Boolean))) at(maps.codes, code).items++;
    if (i.withholdingGroup) at(maps.withholdingGroups, i.withholdingGroup).items++;
  }
  for (const p of partners) if (p.withholdingOverrideId) at(maps.withholding, p.withholdingOverrideId).partners.push(`${p.code} ${p.name}`);
  for (const a of chart) {
    if (a.defaultTaxCode) at(maps.codes, a.defaultTaxCode).accounts.push(a.code);
    if (a.defaultWithholdingGroup) at(maps.withholdingGroups, a.defaultWithholdingGroup).accounts.push(a.code);
  }
  if (company?.percentageTaxCode) at(maps.codes, company.percentageTaxCode).company = true;
  // A withholding tax is also in use wherever its ATC is.
  for (const w of wht) {
    const byAtc = w.atc ? maps.atcs.get(w.atc) : undefined;
    if (byAtc) {
      const own = at(maps.withholding, w.id);
      own.rules.push(...byAtc.rules);
      own.taxCodes.push(...byAtc.taxCodes);
      own.withholdingGroups.push(...byAtc.withholdingGroups);
    }
  }
  return maps;
}

/** "Tax rules (company not VAT-registered…) · 2 tax groups (S-VAT12, …) · 404 items". */
export function describeTaxUsage(u?: TaxUsage) {
  if (!u) return '';
  const list = (names: string[], noun: string, plural = `${noun}s`) =>
    names.length ? `${names.length} ${names.length === 1 ? noun : plural} (${names.slice(0, 4).join(', ')}${names.length > 4 ? ', …' : ''})` : '';
  return [
    u.rules.length ? `Tax rules (${u.rules.join('; ')})` : '',
    u.company ? 'Company percentage tax' : '',
    list(u.taxCodes, 'tax code'),
    list(u.taxGroups, 'tax group'),
    list(u.withholdingGroups, 'withholding group'),
    list(u.withholdingTaxes, 'withholding tax', 'withholding taxes'),
    list(u.itemGroups, 'item group'),
    u.items ? `${u.items} item${u.items === 1 ? '' : 's'}` : '',
    list(u.partners, 'business partner'),
    list(u.accounts, 'G/L account'),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Rows that can't be deactivated because something uses them, and the notice to show. */
export function blockedDeactivation<T>(rows: T[], active: boolean, usageOf: (row: T) => TaxUsage | undefined, label: (row: T) => string) {
  const blocked = active ? [] : rows.filter((r) => taxUsageCount(usageOf(r)) > 0);
  const notice = blocked.length
    ? `Not deactivated — still in use: ${blocked.map((r) => `${label(r)} (${describeTaxUsage(usageOf(r))})`).join('; ')}.`
    : undefined;
  return { allowed: rows.filter((r) => !blocked.includes(r)), notice };
}
