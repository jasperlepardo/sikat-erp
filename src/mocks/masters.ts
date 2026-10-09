/**
 * Starter values for the business partner lists, and the fixed choices the code branches on.
 * Lists users can add to are seeded from these into managed collections
 * (mocks/partnerMasters.ts, Settings › Sales & CRM, Banking and Company); read those, not these.
 */
import type { PartnerRole } from './partners';

/**
 * Seed id of a list entry: `prefix-` + its 1-based position in `list`, as `named()` numbers them.
 * Typed against the list, so a misspelt name fails the typecheck. Append to these lists; never reorder.
 */
export const idIn =
  <L extends readonly string[]>(prefix: string, list: L) =>
  (name: L[number]) =>
    `${prefix}-${String(list.indexOf(name) + 1).padStart(3, '0')}`;

export const BP_GROUPS = [
  { value: 'Customers – Trade', role: 'customer' },
  { value: 'Customers – Retail', role: 'customer' },
  { value: 'Customers – Government', role: 'customer' },
  { value: 'Vendors – Local', role: 'vendor' },
  { value: 'Vendors – Import', role: 'vendor' },
  { value: 'Vendors – Services', role: 'vendor' },
  { value: 'Leads', role: 'lead' },
] as const satisfies readonly { value: string; role: PartnerRole }[];
export const bpgId = idIn('bpg', BP_GROUPS.map((g) => g.value) as (typeof BP_GROUPS)[number]['value'][]);

export const INDUSTRIES = [
  'Retail', 'Wholesale', 'Technology', 'BPO / IT-BPM', 'Financial services', 'Education', 'Government', 'Cooperative',
  'Real estate', 'Logistics', 'Professional services', 'Media & advertising', 'Security services', 'Construction', 'Manufacturing', 'Services',
] as const;
export const industryId = idIn('ind', INDUSTRIES);
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
/** Sales employees and buyers. Jasper L. is the signed-in user (document owner). */
export const EMPLOYEES = ['Andrea Ramos', 'Ben Salazar', 'Carla Uy', 'Dino Pascual', 'Jasper L.'] as const;
export const employeeId = idIn('emp', EMPLOYEES);
export const TECHNICIANS = ['Edgar Bautista', 'Fe Lopez'] as const;
export const technicianId = idIn('tec', TECHNICIANS);
export const TERRITORIES = ['NCR', 'North Luzon', 'South Luzon', 'Visayas', 'Mindanao'] as const;
export const territoryId = idIn('ter', TERRITORIES);
export const CHANNELS = ['Direct', 'Distributor', 'E-commerce', 'Walk-in'] as const;
export const channelId = idIn('chn', CHANNELS);
export const PROJECTS = ['PRJ-001 Northgate store renovation', 'PRJ-002 DepEd Pasig iPad rollout', 'PRJ-003 Cebu store opening'];
export const EMAIL_GROUPS = ['Newsletter', 'Promotions', 'Billing notices'] as const;
export const emailGroupId = idIn('emg', EMAIL_GROUPS);

export const PAYMENT_TERMS = ['COD', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', '50% DP, balance on delivery'] as const;
export const termId = idIn('pt', PAYMENT_TERMS);
export const PRICE_LISTS = ['Base price', 'Wholesale', 'Retail', 'Government', 'Last purchase price'] as const;
export const plId = idIn('prl', PRICE_LISTS);
export const DUNNING_TERMS = ['Standard (7 / 15 / 30 days)', 'Strict (3 / 7 / 14 days)'] as const;
export const dunningTermId = idIn('dun', DUNNING_TERMS);
export const EFFECTIVE_DISCOUNT_GROUPS = ['Lowest discount', 'Highest discount', 'Average', 'Total', 'Discount multiples'];
export const EFFECTIVE_PRICE = ['Default priority', 'Lowest price', 'Highest price'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const HOLIDAY_CALENDARS = ['Philippines (national)', 'Philippines (national + NCR)'] as const;
export const holidayCalendarId = idIn('hol', HOLIDAY_CALENDARS);

/** Countries used on addresses, banks and items' country of origin: [ISO 3166-1 alpha-2 code, name]. The code is the record id. */
export const COUNTRIES: readonly (readonly [code: string, name: string])[] = [
  ['AF', 'Afghanistan'], ['AX', 'Åland Islands'], ['AL', 'Albania'], ['DZ', 'Algeria'], ['AS', 'American Samoa'],
  ['AD', 'Andorra'], ['AO', 'Angola'], ['AI', 'Anguilla'], ['AQ', 'Antarctica'], ['AG', 'Antigua and Barbuda'],
  ['AR', 'Argentina'], ['AM', 'Armenia'], ['AW', 'Aruba'], ['AU', 'Australia'], ['AT', 'Austria'],
  ['AZ', 'Azerbaijan'], ['BS', 'Bahamas'], ['BH', 'Bahrain'], ['BD', 'Bangladesh'], ['BB', 'Barbados'],
  ['BY', 'Belarus'], ['BE', 'Belgium'], ['BZ', 'Belize'], ['BJ', 'Benin'], ['BM', 'Bermuda'], ['BT', 'Bhutan'],
  ['BO', 'Bolivia'], ['BQ', 'Bonaire, Sint Eustatius and Saba'], ['BA', 'Bosnia and Herzegovina'],
  ['BW', 'Botswana'], ['BV', 'Bouvet Island'], ['BR', 'Brazil'], ['IO', 'British Indian Ocean Territory'],
  ['VG', 'British Virgin Islands'], ['BN', 'Brunei'], ['BG', 'Bulgaria'], ['BF', 'Burkina Faso'], ['BI', 'Burundi'],
  ['CV', 'Cabo Verde'], ['KH', 'Cambodia'], ['CM', 'Cameroon'], ['CA', 'Canada'], ['KY', 'Cayman Islands'],
  ['CF', 'Central African Republic'], ['TD', 'Chad'], ['CL', 'Chile'], ['CN', 'China'], ['CX', 'Christmas Island'],
  ['CC', 'Cocos (Keeling) Islands'], ['CO', 'Colombia'], ['KM', 'Comoros'], ['CG', 'Congo'],
  ['CD', 'Congo (Democratic Republic)'], ['CK', 'Cook Islands'], ['CR', 'Costa Rica'], ['CI', 'Côte d’Ivoire'],
  ['HR', 'Croatia'], ['CU', 'Cuba'], ['CW', 'Curaçao'], ['CY', 'Cyprus'], ['CZ', 'Czech Republic'],
  ['DK', 'Denmark'], ['DJ', 'Djibouti'], ['DM', 'Dominica'], ['DO', 'Dominican Republic'], ['EC', 'Ecuador'],
  ['EG', 'Egypt'], ['SV', 'El Salvador'], ['GQ', 'Equatorial Guinea'], ['ER', 'Eritrea'], ['EE', 'Estonia'],
  ['SZ', 'Eswatini'], ['ET', 'Ethiopia'], ['FK', 'Falkland Islands'], ['FO', 'Faroe Islands'], ['FJ', 'Fiji'],
  ['FI', 'Finland'], ['FR', 'France'], ['GF', 'French Guiana'], ['PF', 'French Polynesia'],
  ['TF', 'French Southern Territories'], ['GA', 'Gabon'], ['GM', 'Gambia'], ['GE', 'Georgia'], ['DE', 'Germany'],
  ['GH', 'Ghana'], ['GI', 'Gibraltar'], ['GR', 'Greece'], ['GL', 'Greenland'], ['GD', 'Grenada'],
  ['GP', 'Guadeloupe'], ['GU', 'Guam'], ['GT', 'Guatemala'], ['GG', 'Guernsey'], ['GN', 'Guinea'],
  ['GW', 'Guinea-Bissau'], ['GY', 'Guyana'], ['HT', 'Haiti'], ['HM', 'Heard Island and McDonald Islands'],
  ['VA', 'Holy See'], ['HN', 'Honduras'], ['HK', 'Hong Kong'], ['HU', 'Hungary'], ['IS', 'Iceland'], ['IN', 'India'],
  ['ID', 'Indonesia'], ['IR', 'Iran'], ['IQ', 'Iraq'], ['IE', 'Ireland'], ['IM', 'Isle of Man'], ['IL', 'Israel'],
  ['IT', 'Italy'], ['JM', 'Jamaica'], ['JP', 'Japan'], ['JE', 'Jersey'], ['JO', 'Jordan'], ['KZ', 'Kazakhstan'],
  ['KE', 'Kenya'], ['KI', 'Kiribati'], ['KW', 'Kuwait'], ['KG', 'Kyrgyzstan'], ['LA', 'Laos'], ['LV', 'Latvia'],
  ['LB', 'Lebanon'], ['LS', 'Lesotho'], ['LR', 'Liberia'], ['LY', 'Libya'], ['LI', 'Liechtenstein'],
  ['LT', 'Lithuania'], ['LU', 'Luxembourg'], ['MO', 'Macao'], ['MG', 'Madagascar'], ['MW', 'Malawi'],
  ['MY', 'Malaysia'], ['MV', 'Maldives'], ['ML', 'Mali'], ['MT', 'Malta'], ['MH', 'Marshall Islands'],
  ['MQ', 'Martinique'], ['MR', 'Mauritania'], ['MU', 'Mauritius'], ['YT', 'Mayotte'], ['MX', 'Mexico'],
  ['FM', 'Micronesia'], ['MD', 'Moldova'], ['MC', 'Monaco'], ['MN', 'Mongolia'], ['ME', 'Montenegro'],
  ['MS', 'Montserrat'], ['MA', 'Morocco'], ['MZ', 'Mozambique'], ['MM', 'Myanmar'], ['NA', 'Namibia'],
  ['NR', 'Nauru'], ['NP', 'Nepal'], ['NL', 'Netherlands'], ['NC', 'New Caledonia'], ['NZ', 'New Zealand'],
  ['NI', 'Nicaragua'], ['NE', 'Niger'], ['NG', 'Nigeria'], ['NU', 'Niue'], ['NF', 'Norfolk Island'],
  ['KP', 'North Korea'], ['MK', 'North Macedonia'], ['MP', 'Northern Mariana Islands'], ['NO', 'Norway'],
  ['OM', 'Oman'], ['PK', 'Pakistan'], ['PW', 'Palau'], ['PS', 'Palestine'], ['PA', 'Panama'],
  ['PG', 'Papua New Guinea'], ['PY', 'Paraguay'], ['PE', 'Peru'], ['PH', 'Philippines'], ['PN', 'Pitcairn'],
  ['PL', 'Poland'], ['PT', 'Portugal'], ['PR', 'Puerto Rico'], ['QA', 'Qatar'], ['RE', 'Réunion'], ['RO', 'Romania'],
  ['RU', 'Russia'], ['RW', 'Rwanda'], ['BL', 'Saint Barthélemy'],
  ['SH', 'Saint Helena, Ascension and Tristan da Cunha'], ['KN', 'Saint Kitts and Nevis'], ['LC', 'Saint Lucia'],
  ['MF', 'Saint Martin (French part)'], ['PM', 'Saint Pierre and Miquelon'],
  ['VC', 'Saint Vincent and the Grenadines'], ['WS', 'Samoa'], ['SM', 'San Marino'], ['ST', 'São Tomé and Príncipe'],
  ['SA', 'Saudi Arabia'], ['SN', 'Senegal'], ['RS', 'Serbia'], ['SC', 'Seychelles'], ['SL', 'Sierra Leone'],
  ['SG', 'Singapore'], ['SX', 'Sint Maarten (Dutch part)'], ['SK', 'Slovakia'], ['SI', 'Slovenia'],
  ['SB', 'Solomon Islands'], ['SO', 'Somalia'], ['ZA', 'South Africa'],
  ['GS', 'South Georgia and the South Sandwich Islands'], ['KR', 'South Korea'], ['SS', 'South Sudan'],
  ['ES', 'Spain'], ['LK', 'Sri Lanka'], ['SD', 'Sudan'], ['SR', 'Suriname'], ['SJ', 'Svalbard and Jan Mayen'],
  ['SE', 'Sweden'], ['CH', 'Switzerland'], ['SY', 'Syria'], ['TW', 'Taiwan'], ['TJ', 'Tajikistan'],
  ['TZ', 'Tanzania'], ['TH', 'Thailand'], ['TL', 'Timor-Leste'], ['TG', 'Togo'], ['TK', 'Tokelau'], ['TO', 'Tonga'],
  ['TT', 'Trinidad and Tobago'], ['TN', 'Tunisia'], ['TR', 'Turkey'], ['TM', 'Turkmenistan'],
  ['TC', 'Turks and Caicos Islands'], ['TV', 'Tuvalu'], ['UG', 'Uganda'], ['UA', 'Ukraine'],
  ['AE', 'United Arab Emirates'], ['GB', 'United Kingdom'], ['US', 'United States'],
  ['UM', 'United States Minor Outlying Islands'], ['UY', 'Uruguay'], ['VI', 'U.S. Virgin Islands'],
  ['UZ', 'Uzbekistan'], ['VU', 'Vanuatu'], ['VE', 'Venezuela'], ['VN', 'Vietnam'], ['WF', 'Wallis and Futuna'],
  ['EH', 'Western Sahara'], ['YE', 'Yemen'], ['ZM', 'Zambia'], ['ZW', 'Zimbabwe'],
];
const COUNTRY_NAMES = new Map(COUNTRIES);
/** A country's seed name by ISO code — the code itself if unknown. Screens use `countryName()` in services/partnerMasters, which follows renames. */
export const seedCountryName = (code: string) => COUNTRY_NAMES.get(code) ?? code;

/** ISO codes of countries with an existing tax treaty with the Philippines (BIR-recognized, as of 2024). */
export const TREATY_COUNTRIES = [
  'AU', 'AT', 'BH', 'BD', 'BE', 'BR', 'CA', 'CN', 'CZ', 'DK', 'FI', 'FR', 'DE', 'HU', 'IN', 'ID', 'IL', 'IT',
  'JP', 'KW', 'MY', 'NL', 'NZ', 'NG', 'NO', 'PK', 'PL', 'QA', 'RO', 'RU', 'SG', 'KR', 'ES', 'LK', 'SE', 'CH',
  'TH', 'TR', 'AE', 'GB', 'US', 'VN', 'ZW'
] as const;
export const BANKS = ['BDO Unibank', 'BPI', 'Metrobank', 'Land Bank of the Philippines', 'Security Bank', 'UnionBank', 'China Bank', 'RCBC'] as const;
export const bankId = idIn('bnk', BANKS);
export const BANK_CHARGE_CODES = ['Shared (SHA)', 'We pay (OUR)', 'They pay (BEN)'] as const;
export const bankChargeCodeId = idIn('bcc', BANK_CHARGE_CODES);
export const CARD_BRANDS = ['Visa', 'Mastercard', 'American Express', 'JCB', 'UnionPay'] as const;
export const cardBrandId = idIn('crd', CARD_BRANDS);
export const FACTORING_COMPANIES = ['First Metro Factors Inc.', 'BDO Factoring', 'Asia Trade Receivables Corp.'] as const;

export const PAYMENT_METHODS = [
  { code: 'CASH', description: 'Cash' },
  { code: 'CHECK', description: 'Check' },
  { code: 'PDC', description: 'Post-dated check' },
  { code: 'BANK', description: 'Bank transfer (InstaPay / PESONet)' },
  { code: 'GCASH', description: 'GCash' },
  { code: 'MAYA', description: 'Maya' },
  { code: 'CARD', description: 'Corporate credit card' },
];

export const PLANNING_GROUPS = ['Fast movers', 'Project-based', 'Seasonal'] as const;
export const planningGroupId = idIn('plg', PLANNING_GROUPS);

/**
 * Labels for the Properties tab (the real product lets admins rename up to 64). Only facts with no
 * field of their own: VAT exemption, government, export (zero-rating), top withholding agent, group
 * and price list are real partner fields, so they aren't tags that could contradict them.
 */
export const PROPERTY_LABELS = ['Key account', 'Requires PO', 'Accepts e-invoice', 'Credit hold watch', 'Preferred supplier'] as const;
export const partnerPropertyId = idIn('bpp', PROPERTY_LABELS);
