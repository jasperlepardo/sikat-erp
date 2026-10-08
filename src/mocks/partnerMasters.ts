/**
 * Master-data lists behind the business partner form (Settings › Sales & CRM, Banking, Company).
 * Seeded from the starter values in ./masters. A partner stores an entry's name (or a project's
 * "code name"), not its id, so the seeds and saved partners need no migration.
 */
import {
  BANKS,
  BANK_CHARGE_CODES,
  BP_GROUPS,
  CARD_BRANDS,
  CHANNELS,
  COUNTRIES,
  DUNNING_TERMS,
  EMAIL_GROUPS,
  EMPLOYEES,
  FACTORING_COMPANIES,
  HOLIDAY_CALENDARS,
  INDUSTRIES,
  PAYMENT_TERMS,
  plId,
  PLANNING_GROUPS,
  PRICE_LISTS,
  PROJECTS,
  PROPERTY_LABELS,
  TECHNICIANS,
  TERRITORIES,
} from './masters';
import { LEAD_SOURCES, type PartnerRole } from './partners';

/** A list entry that is only a name. Entries are deactivated, never deleted, since partners refer to them. */
export interface NamedEntry {
  id: string;
  name: string;
  active: boolean;
}

export interface BpGroup extends NamedEntry {
  /** Which partners can be in the group. */
  role: PartnerRole;
}

export interface PaymentTerm extends NamedEntry {
  /** Days from posting date to due date; 0 for COD and down-payment terms. */
  days: number;
}

export interface Bank extends NamedEntry {
  swift: string;
}

/** How a dependent list rounds its calculated prices. */
export type PriceRounding = 'none' | 'peso' | 'ten-centavos' | 'tens' | 'hundreds';

export const PRICE_ROUNDING: { value: PriceRounding; label: string }[] = [
  { value: 'none', label: 'No rounding' },
  { value: 'peso', label: 'Round to full peso' },
  { value: 'ten-centavos', label: 'Round to ₱0.10' },
  { value: 'tens', label: 'Round to full tens' },
  { value: 'hundreds', label: 'Round to full hundreds' },
];

/** Where an independent list takes each item's price from (the item form holds one cost and one SRP). */
export type PriceSource = 'cost' | 'srp';

/**
 * A named price tier partners and document lines default to. Independent lists take the item's
 * own price; dependent lists are another list × factor, rounded — so changing the base reprices
 * every list down the chain. Prices are calculated when read, never stored per list.
 */
export interface PriceList extends NamedEntry {
  /** Id of the list prices are derived from; '' for an independent list. */
  basePriceListId: string;
  /** Multiplier on the base list's price (1.3 = 30% markup, 0.92 = 8% off). */
  factor: number;
  /** Independent lists only. */
  source: PriceSource;
  rounding: PriceRounding;
  /** Prices include VAT (gross) rather than exclude it (net). */
  gross: boolean;
  /** ISO dates; '' = open-ended. */
  validFrom: string;
  validTo: string;
  remarks: string;
  /** Prices set by hand for single items (Manual), overriding the list's calculation. */
  itemPrices: ItemListPrice[];
}

/** A hand-set price: PHP per inventory unit, gross or net as the list is. */
export interface ItemListPrice {
  itemId: string;
  price: number;
}

export interface Project extends NamedEntry {
  code: string;
}

/** Real products allow up to 64 partner properties. */
export const MAX_PARTNER_PROPERTIES = 64;

const named = (prefix: string, names: readonly string[]): NamedEntry[] =>
  names.map((name, i) => ({ id: `${prefix}-${String(i + 1).padStart(3, '0')}`, name, active: true }));

const SWIFT: Record<string, string> = {
  'BDO Unibank': 'BNORPHMM',
  BPI: 'BOPIPHMM',
  Metrobank: 'MBTCPHMM',
  'Land Bank of the Philippines': 'TLBPPHMM',
  'Security Bank': 'SETCPHMM',
  UnionBank: 'UBPHPHMM',
  'China Bank': 'CHBKPHMM',
  RCBC: 'RCBCPHMM',
};

export const SEED_BP_GROUPS: BpGroup[] = named('bpg', BP_GROUPS.map((g) => g.value)).map((g, i) => ({ ...g, role: BP_GROUPS[i].role }));
export const SEED_INDUSTRIES = named('ind', INDUSTRIES);
export const SEED_SALES_EMPLOYEES = named('emp', EMPLOYEES);
export const SEED_TERRITORIES = named('ter', TERRITORIES);
export const SEED_CHANNELS = named('chn', CHANNELS);
export const SEED_LEAD_SOURCES = named('lds', LEAD_SOURCES);
const PRICE_LIST_SETUP: Record<string, Partial<PriceList>> = {
  'Base price': { source: 'srp', gross: true, remarks: 'Apple SRP, VAT inclusive — the price on the item.' },
  'Last purchase price': { source: 'cost', gross: false, remarks: 'Item cost, for purchasing.' },
  Wholesale: { basePriceListId: plId('Base price'), factor: 0.92, rounding: 'tens', gross: true, remarks: 'Resellers and corporate accounts: 8% off SRP.' },
  Retail: { basePriceListId: plId('Base price'), factor: 1, rounding: 'none', gross: true, remarks: 'Walk-in and online store.' },
  Government: { basePriceListId: plId('Base price'), factor: 0.95, rounding: 'peso', gross: true, validFrom: '2026-01-01', validTo: '2026-12-31', remarks: 'Public bidding (RA 9184) quotes: 5% off SRP for the year.' },
};

export const SEED_PRICE_LISTS: PriceList[] = named('prl', PRICE_LISTS).map((l) => ({
  ...l,
  basePriceListId: '',
  factor: 1,
  source: 'srp',
  rounding: 'none',
  gross: true,
  validFrom: '',
  validTo: '',
  remarks: '',
  itemPrices: [],
  ...PRICE_LIST_SETUP[l.name],
}));
export const SEED_EMAIL_GROUPS = named('emg', EMAIL_GROUPS);
export const SEED_PARTNER_PROPERTIES = named('bpp', PROPERTY_LABELS);

export const SEED_PAYMENT_TERMS: PaymentTerm[] = named('pt', PAYMENT_TERMS).map((t) => ({ ...t, days: Number(/Net (\d+)/.exec(t.name)?.[1] ?? 0) }));
export const SEED_DUNNING_TERMS = named('dun', DUNNING_TERMS);
export const SEED_HOLIDAY_CALENDARS = named('hol', HOLIDAY_CALENDARS);
export const SEED_BANKS: Bank[] = named('bnk', BANKS).map((b) => ({ ...b, swift: SWIFT[b.name] ?? '' }));
export const SEED_BANK_CHARGE_CODES = named('bcc', BANK_CHARGE_CODES);
export const SEED_CARD_BRANDS = named('crd', CARD_BRANDS);
export const SEED_FACTORING_COMPANIES = named('fac', FACTORING_COMPANIES);

/** "PRJ-001 Northgate store renovation" → code PRJ-001, name "Northgate store renovation". */
export const SEED_PROJECTS: Project[] = PROJECTS.map((p, i) => {
  const [code, ...rest] = p.split(' ');
  return { id: `prj-${String(i + 1).padStart(3, '0')}`, code, name: rest.join(' '), active: true };
});
export const SEED_TECHNICIANS = named('tec', TECHNICIANS);
export const SEED_PLANNING_GROUPS = named('plg', PLANNING_GROUPS);
export const SEED_COUNTRIES = named('cty', COUNTRIES);

/** What a partner stores for a project, e.g. "PRJ-001 Northgate store renovation". */
export const projectValue = (p: Project) => `${p.code} ${p.name}`.trim();
