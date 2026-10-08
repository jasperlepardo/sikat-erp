/**
 * Starter values for the business partner lists, and the fixed choices the code branches on.
 * Lists users can add to are seeded from these into managed collections
 * (mocks/partnerMasters.ts, Settings › Sales & CRM, Banking and Company); read those, not these.
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
export const EMPLOYEES = ['Andrea Ramos', 'Ben Salazar', 'Carla Uy', 'Dino Pascual'];
export const TECHNICIANS = ['Edgar Bautista', 'Fe Lopez'];
export const TERRITORIES = ['NCR', 'North Luzon', 'South Luzon', 'Visayas', 'Mindanao'];
export const CHANNELS = ['Direct', 'Distributor', 'E-commerce', 'Walk-in'];
export const PROJECTS = ['PRJ-001 Northgate store renovation', 'PRJ-002 DepEd Pasig iPad rollout', 'PRJ-003 Cebu store opening'];
export const EMAIL_GROUPS = ['Newsletter', 'Promotions', 'Billing notices'];

export const PAYMENT_TERMS = ['COD', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', '50% DP, balance on delivery'] as const;
/** Seed id of a payment term — `pt-` + its position above, as `named()` numbers them. Append new terms; never reorder. */
export const termId = (name: (typeof PAYMENT_TERMS)[number]) => `pt-${String(PAYMENT_TERMS.indexOf(name) + 1).padStart(3, '0')}`;
export const PRICE_LISTS = ['Base price', 'Wholesale', 'Retail', 'Government', 'Last purchase price'] as const;
/** Seed id of a price list — `prl-` + its position above, as `named()` numbers them. Append new lists; never reorder. */
export const plId = (name: (typeof PRICE_LISTS)[number]) => `prl-${String(PRICE_LISTS.indexOf(name) + 1).padStart(3, '0')}`;
export const DUNNING_TERMS = ['Standard (7 / 15 / 30 days)', 'Strict (3 / 7 / 14 days)'];
export const EFFECTIVE_DISCOUNT_GROUPS = ['Lowest discount', 'Highest discount', 'Average', 'Total', 'Discount multiples'];
export const EFFECTIVE_PRICE = ['Default priority', 'Lowest price', 'Highest price'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const HOLIDAY_CALENDARS = ['Philippines (national)', 'Philippines (national + NCR)'];

/** Countries used on addresses, banks and items' country of origin. */
export const COUNTRIES = [
  'Afghanistan', 'Åland Islands', 'Albania', 'Algeria', 'American Samoa', 'Andorra', 'Angola', 'Anguilla',
  'Antarctica', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Aruba', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bermuda', 'Bhutan',
  'Bolivia', 'Bonaire, Sint Eustatius and Saba', 'Bosnia and Herzegovina', 'Botswana', 'Bouvet Island', 'Brazil',
  'British Indian Ocean Territory', 'British Virgin Islands', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada', 'Cayman Islands', 'Central African Republic', 'Chad', 'Chile',
  'China', 'Christmas Island', 'Cocos (Keeling) Islands', 'Colombia', 'Comoros', 'Congo',
  'Congo (Democratic Republic)', 'Cook Islands', 'Costa Rica', 'Côte d’Ivoire', 'Croatia', 'Cuba', 'Curaçao',
  'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt',
  'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Falkland Islands',
  'Faroe Islands', 'Fiji', 'Finland', 'France', 'French Guiana', 'French Polynesia', 'French Southern Territories',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Gibraltar', 'Greece', 'Greenland', 'Grenada', 'Guadeloupe',
  'Guam', 'Guatemala', 'Guernsey', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Heard Island and McDonald Islands',
  'Holy See', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland',
  'Isle of Man', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jersey', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati',
  'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania',
  'Luxembourg', 'Macao', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands',
  'Martinique', 'Mauritania', 'Mauritius', 'Mayotte', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia',
  'Montenegro', 'Montserrat', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands',
  'New Caledonia', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'Niue', 'Norfolk Island', 'North Korea',
  'North Macedonia', 'Northern Mariana Islands', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Pitcairn', 'Poland', 'Portugal', 'Puerto Rico', 'Qatar',
  'Réunion', 'Romania', 'Russia', 'Rwanda', 'Saint Barthélemy', 'Saint Helena, Ascension and Tristan da Cunha',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Martin (French part)', 'Saint Pierre and Miquelon',
  'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'São Tomé and Príncipe', 'Saudi Arabia', 'Senegal',
  'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Sint Maarten (Dutch part)', 'Slovakia', 'Slovenia',
  'Solomon Islands', 'Somalia', 'South Africa', 'South Georgia and the South Sandwich Islands', 'South Korea',
  'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Svalbard and Jan Mayen', 'Sweden', 'Switzerland',
  'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tokelau', 'Tonga',
  'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Turks and Caicos Islands', 'Tuvalu', 'Uganda',
  'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'United States Minor Outlying Islands',
  'Uruguay', 'U.S. Virgin Islands', 'Uzbekistan', 'Vanuatu', 'Venezuela', 'Vietnam', 'Wallis and Futuna',
  'Western Sahara', 'Yemen', 'Zambia', 'Zimbabwe',
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
export const BANKS = ['BDO Unibank', 'BPI', 'Metrobank', 'Land Bank of the Philippines', 'Security Bank', 'UnionBank', 'China Bank', 'RCBC'];
export const HOUSE_BANKS: { bank: string; account: string; branch: string; swift: string }[] = [
  { bank: 'BDO Unibank', account: '0012-3456-7890', branch: 'Ortigas Center', swift: 'BNORPHMM' },
  { bank: 'BPI', account: '3141-5926-53', branch: 'Makati Ayala', swift: 'BOPIPHMM' },
  { bank: 'UnionBank', account: '1098-7654-3210', branch: 'Pasig Capitol Commons', swift: 'UBPHPHMM' },
];
export const BANK_CHARGE_CODES = ['Shared (SHA)', 'We pay (OUR)', 'They pay (BEN)'];

export const PAYMENT_METHODS = [
  { code: 'CASH', description: 'Cash' },
  { code: 'CHECK', description: 'Check' },
  { code: 'PDC', description: 'Post-dated check' },
  { code: 'BANK', description: 'Bank transfer (InstaPay / PESONet)' },
  { code: 'GCASH', description: 'GCash' },
  { code: 'MAYA', description: 'Maya' },
  { code: 'CARD', description: 'Corporate credit card' },
];

export const PLANNING_GROUPS = ['Fast movers', 'Project-based', 'Seasonal'];

/**
 * Labels for the Properties tab (the real product lets admins rename up to 64). Only facts with no
 * field of their own: VAT exemption, government, export (zero-rating), top withholding agent, group
 * and price list are real partner fields, so they aren't tags that could contradict them.
 */
export const PROPERTY_LABELS = ['Key account', 'Requires PO', 'Accepts e-invoice', 'Credit hold watch', 'Preferred supplier'];
