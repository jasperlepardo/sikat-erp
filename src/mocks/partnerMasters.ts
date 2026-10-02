/**
 * Master-data lists behind the business partner form (Settings › Sales & CRM, Banking, Company).
 * Seeded from the starter values in ./masters. A partner stores an entry's name (or a project's
 * "code name"), not its id, so the seeds and saved partners need no migration.
 */
import {
  BANKS,
  BANK_CHARGE_CODES,
  BP_GROUPS,
  CHANNELS,
  COUNTRIES,
  DUNNING_TERMS,
  EMAIL_GROUPS,
  EMPLOYEES,
  HOLIDAY_CALENDARS,
  INDUSTRIES,
  PAYMENT_TERMS,
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
export const SEED_PRICE_LISTS = named('prl', PRICE_LISTS);
export const SEED_EMAIL_GROUPS = named('emg', EMAIL_GROUPS);
export const SEED_PARTNER_PROPERTIES = named('bpp', PROPERTY_LABELS);

export const SEED_PAYMENT_TERMS: PaymentTerm[] = named('pt', PAYMENT_TERMS).map((t) => ({ ...t, days: Number(/Net (\d+)/.exec(t.name)?.[1] ?? 0) }));
export const SEED_DUNNING_TERMS = named('dun', DUNNING_TERMS);
export const SEED_HOLIDAY_CALENDARS = named('hol', HOLIDAY_CALENDARS);
export const SEED_BANKS: Bank[] = named('bnk', BANKS).map((b) => ({ ...b, swift: SWIFT[b.name] ?? '' }));
export const SEED_BANK_CHARGE_CODES = named('bcc', BANK_CHARGE_CODES);
export const SEED_CARD_BRANDS = named('crd', ['Visa', 'Mastercard', 'American Express', 'JCB', 'UnionPay']);
export const SEED_FACTORING_COMPANIES = named('fac', ['First Metro Factors Inc.', 'BDO Factoring', 'Asia Trade Receivables Corp.']);

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
