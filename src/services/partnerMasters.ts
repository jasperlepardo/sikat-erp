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
  type BpGroup,
  type NamedEntry,
  type PaymentTerm,
  type Project,
} from '../mocks/partnerMasters';
import { createCollection } from './store';

// Sales & CRM
export const bpGroups = createCollection<BpGroup>('sikat-erp:bp-groups', SEED_BP_GROUPS, 'bpg');
export const industries = createCollection<NamedEntry>('sikat-erp:industries', SEED_INDUSTRIES, 'ind');
export const salesEmployees = createCollection<NamedEntry>('sikat-erp:sales-employees', SEED_SALES_EMPLOYEES, 'emp');
export const territories = createCollection<NamedEntry>('sikat-erp:territories', SEED_TERRITORIES, 'ter');
export const channels = createCollection<NamedEntry>('sikat-erp:channels', SEED_CHANNELS, 'chn');
export const leadSources = createCollection<NamedEntry>('sikat-erp:lead-sources', SEED_LEAD_SOURCES, 'lds');
export const priceLists = createCollection<NamedEntry>('sikat-erp:price-lists', SEED_PRICE_LISTS, 'prl');
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
export const countries = createCollection<NamedEntry>('sikat-erp:countries:v2', SEED_COUNTRIES, 'cty');
