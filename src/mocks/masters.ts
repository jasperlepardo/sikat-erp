/**
 * Master data behind the business partner dropdowns. In the real product these
 * are Settings lists; here they're fixed so the prototype has realistic choices.
 */
import type { PartnerRole } from './partners';

export const BP_GROUPS: { value: string; role: PartnerRole }[] = [
  { value: 'Customers – Trade', role: 'customer' },
  { value: 'Customers – Retail', role: 'customer' },
  { value: 'Customers – Government', role: 'customer' },
  { value: 'Vendors – Local', role: 'vendor' },
  { value: 'Vendors – Import', role: 'vendor' },
  { value: 'Vendors – Services', role: 'vendor' },
  { value: 'Leads', role: 'lead' },
];

export const INDUSTRIES = [
  'Retail', 'Wholesale', 'Technology', 'BPO / IT-BPM', 'Financial services', 'Education', 'Government', 'Cooperative',
  'Real estate', 'Logistics', 'Professional services', 'Media & advertising', 'Security services', 'Construction', 'Manufacturing', 'Services',
];
export const BUSINESS_TYPES = [
  'Company',
  'Resident foreign company',
  'Non-resident foreign company',
  'Sole proprietorship',
  'Partnership',
  'General professional partnership',
  'Resident foreign partnership',
  'Non-resident foreign partnership',
  'Cooperative',
  'Individual',
  'Government',
];
export const EMPLOYEES = ['— None —', 'Andrea Ramos', 'Ben Salazar', 'Carla Uy', 'Dino Pascual'];
export const TECHNICIANS = ['— None —', 'Edgar Bautista', 'Fe Lopez'];
export const TERRITORIES = ['— None —', 'NCR', 'North Luzon', 'South Luzon', 'Visayas', 'Mindanao'];
export const CHANNELS = ['— None —', 'Direct', 'Distributor', 'E-commerce', 'Walk-in'];
export const PROJECTS = ['— None —', 'PRJ-001 Northgate store renovation', 'PRJ-002 DepEd Pasig iPad rollout', 'PRJ-003 Cebu store opening'];
export const EMAIL_GROUPS = ['— None —', 'Newsletter', 'Promotions', 'Billing notices'];

export const PAYMENT_TERMS = ['COD', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', '50% DP, balance on delivery'];
export const PRICE_LISTS = ['Base price', 'Wholesale', 'Retail', 'Government', 'Last purchase price'];
export const DUNNING_TERMS = ['— None —', 'Standard (7 / 15 / 30 days)', 'Strict (3 / 7 / 14 days)'];
export const EFFECTIVE_DISCOUNT_GROUPS = ['Lowest discount', 'Highest discount', 'Average', 'Total', 'Discount multiples'];
export const EFFECTIVE_PRICE = ['Default priority', 'Lowest price', 'Highest price'];
export const PRIORITIES = ['— None —', 'High', 'Medium', 'Low'];
export const HOLIDAY_CALENDARS = ['— None —', 'Philippines (national)', 'Philippines (national + NCR)'];

/** Countries used on addresses, banks and items' country of origin. */
export const COUNTRIES = [
  'Philippines', 'China', 'Japan', 'South Korea', 'Taiwan', 'Vietnam', 'Thailand', 'Malaysia', 'Singapore',
  'Indonesia', 'India', 'Hong Kong', 'Ireland', 'United Kingdom', 'United States', 'Germany', 'France',
];

/** Countries with an existing tax treaty with the Philippines (BIR-recognized, as of 2024). */
export const TREATY_COUNTRIES = [
  'Australia', 'Austria', 'Bahrain', 'Bangladesh', 'Belgium', 'Brazil', 'Canada', 'China',
  'Czech Republic', 'Denmark', 'Finland', 'France', 'Germany', 'Hungary', 'India', 'Indonesia',
  'Israel', 'Italy', 'Japan', 'Kuwait', 'Malaysia', 'Netherlands', 'New Zealand', 'Nigeria',
  'Norway', 'Pakistan', 'Poland', 'Qatar', 'Romania', 'Russia', 'Singapore', 'South Korea',
  'Spain', 'Sri Lanka', 'Sweden', 'Switzerland', 'Thailand', 'Turkey', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Vietnam', 'Zimbabwe',
] as const;
export const PH_PROVINCES = [
  'Metro Manila', 'Bulacan', 'Cavite', 'Laguna', 'Rizal', 'Pampanga', 'Benguet', 'Batangas',
  'Cebu', 'Iloilo', 'Negros Occidental', 'Davao del Sur', 'Misamis Oriental', 'Other',
];
export const BANKS = ['BDO Unibank', 'BPI', 'Metrobank', 'Land Bank of the Philippines', 'Security Bank', 'UnionBank', 'China Bank', 'RCBC'];
export const HOUSE_BANKS: { bank: string; account: string; branch: string; swift: string }[] = [
  { bank: 'BDO Unibank', account: '0012-3456-7890', branch: 'Ortigas Center', swift: 'BNORPHMM' },
  { bank: 'BPI', account: '3141-5926-53', branch: 'Makati Ayala', swift: 'BOPIPHMM' },
  { bank: 'UnionBank', account: '1098-7654-3210', branch: 'Pasig Capitol Commons', swift: 'UBPHPHMM' },
];
export const BANK_CHARGE_CODES = ['— None —', 'Shared (SHA)', 'We pay (OUR)', 'They pay (BEN)'];

export const PAYMENT_METHODS = [
  { code: 'CASH', description: 'Cash' },
  { code: 'CHECK', description: 'Check' },
  { code: 'PDC', description: 'Post-dated check' },
  { code: 'BANK', description: 'Bank transfer (InstaPay / PESONet)' },
  { code: 'GCASH', description: 'GCash' },
  { code: 'MAYA', description: 'Maya' },
  { code: 'CARD', description: 'Corporate credit card' },
];

export const PLANNING_GROUPS = ['— None —', 'Fast movers', 'Project-based', 'Seasonal'];

/** Labels for the Properties tab (the real product lets admins rename up to 64). */
export const PROPERTY_LABELS = [
  'Key account', 'VAT exempt', 'Government entity', 'Requires PO', 'Top withholding agent',
  'Export', 'Wholesale', 'Retail', 'Accepts e-invoice', 'Credit hold watch', 'Consignment', 'Preferred supplier',
];
