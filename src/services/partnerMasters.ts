import {
  SEED_BANKS,
  SEED_BANK_CHARGE_CODES,
  SEED_BP_GROUPS,
  SEED_CARD_BRANDS,
  SEED_CHANNELS,
  SEED_COUNTRIES,
  SEED_DUNNING_TERMS,
  SEED_EMAIL_GROUPS,
  SEED_FACTORING_COMPANIES,
  SEED_HOLIDAY_CALENDARS,
  SEED_INDUSTRIES,
  SEED_LEAD_SOURCES,
  SEED_PARTNER_PROPERTIES,
  SEED_PAYMENT_TERMS,
  SEED_PLANNING_GROUPS,
  SEED_PRICE_LISTS,
  SEED_PROJECTS,
  SEED_SALES_EMPLOYEES,
  SEED_TECHNICIANS,
  SEED_TERRITORIES,
  type Bank,
  type Country,
  type BpGroup,
  type NamedEntry,
  type PaymentTerm,
  type PriceList,
  type Project,
} from '../mocks/partnerMasters';
import { bpgId } from '../mocks/masters';
import { createCollection, type Collection } from './store';

/** A list entry's name for display — the id itself if the entry is gone. */
export const nameIn = (list: Collection<NamedEntry>, id: string) => list.snapshot().find((r) => r.id === id)?.name ?? id;

// Sales & CRM
export const bpGroups = createCollection<BpGroup>('sikat-erp:bp-groups', SEED_BP_GROUPS, 'bpg');
/** The group a lead sits in, and the one it moves to when converted to a customer. */
export const LEADS_GROUP_ID = bpgId('Leads');
export const DEFAULT_CUSTOMER_GROUP_ID = bpgId('Customers – Trade');
/** A BP group's name for display — the id itself if the group is gone. */
export const bpGroupName = (id: string) => bpGroups.snapshot().find((g) => g.id === id)?.name ?? id;
export const industries = createCollection<NamedEntry>('sikat-erp:industries', SEED_INDUSTRIES, 'ind');
export const salesEmployees = createCollection<NamedEntry>('sikat-erp:sales-employees', SEED_SALES_EMPLOYEES, 'emp');
export const territories = createCollection<NamedEntry>('sikat-erp:territories', SEED_TERRITORIES, 'ter');
export const channels = createCollection<NamedEntry>('sikat-erp:channels', SEED_CHANNELS, 'chn');
export const leadSources = createCollection<NamedEntry>('sikat-erp:lead-sources', SEED_LEAD_SOURCES, 'lds');
export const priceLists = createCollection<PriceList>('sikat-erp:price-lists:v3', SEED_PRICE_LISTS, 'prl');
export const emailGroups = createCollection<NamedEntry>('sikat-erp:email-groups', SEED_EMAIL_GROUPS, 'emg');
export const partnerProperties = createCollection<NamedEntry>('sikat-erp:partner-properties', SEED_PARTNER_PROPERTIES, 'bpp');

// Banking
export const paymentTerms = createCollection<PaymentTerm>('sikat-erp:payment-terms', SEED_PAYMENT_TERMS, 'pt');
export const dunningTerms = createCollection<NamedEntry>('sikat-erp:dunning-terms', SEED_DUNNING_TERMS, 'dun');
export const holidayCalendars = createCollection<NamedEntry>('sikat-erp:holiday-calendars', SEED_HOLIDAY_CALENDARS, 'hol');
export const banks = createCollection<Bank>('sikat-erp:banks', SEED_BANKS, 'bnk');
export const bankChargeCodes = createCollection<NamedEntry>('sikat-erp:bank-charge-codes', SEED_BANK_CHARGE_CODES, 'bcc');
export const cardBrands = createCollection<NamedEntry>('sikat-erp:card-brands', SEED_CARD_BRANDS, 'crd');
export const factoringCompanies = createCollection<NamedEntry>('sikat-erp:factoring-companies', SEED_FACTORING_COMPANIES, 'fac');

// Company
export const projects = createCollection<Project>('sikat-erp:projects', SEED_PROJECTS, 'prj');
export const technicians = createCollection<NamedEntry>('sikat-erp:technicians', SEED_TECHNICIANS, 'tec');
export const planningGroups = createCollection<NamedEntry>('sikat-erp:planning-groups', SEED_PLANNING_GROUPS, 'plg');
export const countries = createCollection<Country>('sikat-erp:countries:v2', SEED_COUNTRIES, 'cty');
/** A country's name by ISO code, as Settings names it — the code itself if unknown. */
export const countryName = (code: string) => nameIn(countries, code);
