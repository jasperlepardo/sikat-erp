/**
 * Philippine tax master data (as of September 2026): VAT and percentage tax codes,
 * the tax groups items point to, withholding taxes (ATCs) and excise categories.
 *
 * Rates follow the NIRC as amended (TRAIN RA 10963, CREATE RA 11534, CREATE MORE
 * RA 12066, VAT on Digital Services RA 12023) and BIR/BOC issuances. Anything not
 * confirmed from a primary source is flagged in `notes` for your accountant to check.
 */

export type TaxDirection = 'Sales' | 'Purchase';
export type TaxCategory =
  | 'Standard'
  | 'Government'
  | 'Zero-rated'
  | 'Exempt'
  | 'Capital goods'
  | 'Services'
  | 'Importation'
  | 'Reverse charge'
  | 'Non-VAT'
  | 'Percentage tax';

/** A VAT or percentage tax code, applied on document rows. */
export interface TaxCode {
  id: string;
  code: string;
  name: string;
  direction: TaxDirection;
  category: TaxCategory;
  /** Rate history; a document uses the rate in force on its posting date. */
  rates: TaxRatePeriod[];
  glAccount: string;
  birReturn: string;
  legalBasis: string;
  active: boolean;
  notes: string;
}

export interface TaxRatePeriod {
  /** YYYY-MM-DD the rate takes effect. */
  from: string;
  rate: number;
}

/** The rate in force on `date` (latest period starting on or before it). */
export function rateAt(code: Pick<TaxCode, 'rates'>, date: string): number | undefined {
  return [...code.rates].sort((a, b) => b.from.localeCompare(a.from)).find((p) => p.from <= date)?.rate;
}

/** The rate in force today. */
export const currentRate = (code: Pick<TaxCode, 'rates'>) => rateAt(code, new Date().toISOString().slice(0, 10));

/**
 * What items carry: the default tax code for the item's nature (goods, services,
 * capital goods…). Partner and company status can override it — see
 * services/taxDetermination.ts.
 */
export interface TaxGroup {
  id: string;
  code: string;
  name: string;
  direction: TaxDirection;
  taxCode: string;
  active: boolean;
}

/** How a customer is treated for output VAT. */
export type SalesVatTreatment = 'Regular' | 'Government' | 'Zero-rated' | 'Exempt entity';
export const SALES_VAT_TREATMENTS: { value: SalesVatTreatment; label: string }[] = [
  { value: 'Regular', label: 'Regular (12% VAT)' },
  { value: 'Government', label: 'Government agency / GOCC' },
  { value: 'Zero-rated', label: 'Zero-rated (export, PEZA / registered export enterprise)' },
  { value: 'Exempt entity', label: 'VAT-exempt entity' },
];

/** A supplier's VAT status, which decides whether you get input VAT. */
export type SupplierVatStatus = 'VAT-registered' | 'Non-VAT' | 'Non-resident digital services';
export const SUPPLIER_VAT_STATUSES: { value: SupplierVatStatus; label: string }[] = [
  { value: 'VAT-registered', label: 'VAT-registered' },
  { value: 'Non-VAT', label: 'Non-VAT (percentage tax payer)' },
  { value: 'Non-resident digital services', label: 'Non-resident digital service provider' },
];

/** What an item's purchase is for withholding tax purposes. */
export type WithholdingCategory = 'Goods' | 'Services' | 'Rent' | 'Professional fees' | 'Contractor' | 'None';
export const WITHHOLDING_CATEGORIES: WithholdingCategory[] = ['Goods', 'Services', 'Rent', 'Professional fees', 'Contractor', 'None'];

/** The company's own tax registration (Settings › Accounting & Tax › Company tax profile). */
export interface CompanyTaxProfile {
  id: string;
  registeredName: string;
  tin: string;
  rdoCode: string;
  /** VAT-registered sellers charge VAT; non-VAT sellers pay 3% percentage tax instead. */
  vatRegistered: boolean;
  /** Top withholding agents withhold 1% on goods and 2% on services from regular suppliers. */
  topWithholdingAgent: boolean;
}

export const SEED_COMPANY_TAX: CompanyTaxProfile[] = [
  {
    id: 'company',
    registeredName: 'Sikat Tech Inc.',
    tin: '',
    rdoCode: '',
    vatRegistered: true,
    topWithholdingAgent: true,
  },
];

export type WithholdingKind = 'Expanded (EWT)' | 'Withholding VAT';
export type WithholdingBase = 'Amount net of VAT' | 'Gross amount' | 'VAT-exclusive amount';
export const WITHHOLDING_BASES: WithholdingBase[] = ['Amount net of VAT', 'Gross amount', 'VAT-exclusive amount'];

/** A creditable withholding tax, by BIR Alphanumeric Tax Code (ATC). */
export interface WithholdingTax {
  id: string;
  /** BIR ATC, e.g. WC158. Blank when the ATC still has to be confirmed. */
  atc: string;
  /** Nature of the income payment, as worded in the BIR ATC table. */
  description: string;
  /** When this ATC applies instead of its sibling, e.g. "Gross income this year ≤ ₱3M". '' = always. */
  condition: string;
  kind: WithholdingKind;
  payee: 'Individual' | 'Corporate' | 'Any';
  rate: number;
  base: WithholdingBase;
  birForms: string;
  legalBasis: string;
  active: boolean;
  notes: string;
}

export type ExciseBasis = 'Specific' | 'Ad valorem' | 'Specific + ad valorem';

/** An excise tax category an item can fall under (NIRC Title VI). */
export interface ExciseCategory {
  id: string;
  code: string;
  name: string;
  basis: ExciseBasis;
  /** Rate as published — schedules mix pesos per unit and percentages. Blank = not confirmed. */
  rate: string;
  effective: string;
  legalBasis: string;
  active: boolean;
  notes: string;
}

export const TAX_CATEGORIES: TaxCategory[] = [
  'Standard', 'Government', 'Zero-rated', 'Exempt', 'Capital goods', 'Services', 'Importation', 'Reverse charge', 'Non-VAT', 'Percentage tax',
];
export const TAX_GL_ACCOUNTS = [
  '2310 Output VAT Payable',
  '2320 Percentage Tax Payable',
  '2330 VAT Withheld Payable',
  '1410 Input VAT',
  '1415 Deferred Input VAT – Capital Goods (pre-2022 balances)',
  '1420 Input VAT – Importation',
  '1430 Creditable Withholding VAT',
  '— None —',
];
export const BIR_RETURNS = ['2550Q', '2551Q', '1600-VT', '2550Q / 1600-VT', '—'];

/** VAT has been 12% since 1 Feb 2006 (RA 9337). */
const VAT_SINCE = '2006-02-01';
const ZERO_SINCE = '2006-02-01';

const tc = (
  code: string, name: string, direction: TaxDirection, category: TaxCategory, rate: number | TaxRatePeriod[],
  glAccount: string, birReturn: string, legalBasis: string, notes = '',
): TaxCode => ({
  id: `tc-${code}`, code, name, direction, category,
  rates: typeof rate === 'number' ? [{ from: rate ? VAT_SINCE : ZERO_SINCE, rate }] : rate,
  glAccount, birReturn, legalBasis, active: true, notes,
});

export const SEED_TAX_CODES: TaxCode[] = [
  // Sales (output)
  tc('OV12', 'Output VAT 12%', 'Sales', 'Standard', 12, '2310 Output VAT Payable', '2550Q', 'NIRC Secs. 106, 108'),
  tc('OVG12', 'Output VAT 12% – sale to government', 'Sales', 'Government', 12, '2310 Output VAT Payable', '2550Q', 'NIRC Sec. 114(C)',
    'Government buyers withhold 5% as creditable VAT (final withholding ended 1 Jan 2021, except ODA-funded projects).'),
  tc('OV0', 'Zero-rated sale (export / registered export enterprise)', 'Sales', 'Zero-rated', 0, '2310 Output VAT Payable', '2550Q', 'NIRC Secs. 106(A)(2), 108(B); RA 12066 (CREATE MORE)'),
  tc('OVX', 'VAT-exempt sale', 'Sales', 'Exempt', 0, '— None —', '2550Q', 'NIRC Sec. 109'),
  tc('PT3', 'Percentage tax (non-VAT seller)', 'Sales', 'Percentage tax',
    [{ from: '2018-01-01', rate: 3 }, { from: '2020-07-01', rate: 1 }, { from: '2023-07-01', rate: 3 }],
    '2320 Percentage Tax Payable', '2551Q', 'NIRC Sec. 116 as amended by TRAIN and CREATE (RA 11534)',
    'Used on every sale when the company is not VAT-registered (gross sales ≤ ₱3M). CREATE cut it to 1% from 1 Jul 2020 to 30 Jun 2023.'),
  // Purchases (input)
  tc('IV12', 'Input VAT 12% – goods', 'Purchase', 'Standard', 12, '1410 Input VAT', '2550Q', 'NIRC Sec. 110'),
  tc('IVS12', 'Input VAT 12% – services', 'Purchase', 'Services', 12, '1410 Input VAT', '2550Q', 'NIRC Sec. 110'),
  tc('IVC12', 'Input VAT 12% – capital goods', 'Purchase', 'Capital goods', 12, '1410 Input VAT', '2550Q', 'NIRC Sec. 110(A)(2)(b) as amended by TRAIN',
    'Claimed in full. Spreading input VAT on capital goods over ₱1M ended 31 Dec 2021; only older deferred balances keep amortizing.'),
  tc('IVI12', 'Input VAT 12% – importation (paid to BOC)', 'Purchase', 'Importation', 12, '1420 Input VAT – Importation', '2550Q', 'NIRC Sec. 107',
    'Entered on the import entry / landed cost document, not on the foreign supplier’s bill.'),
  tc('IVD12', 'VAT 12% – digital services from non-resident (reverse charge)', 'Purchase', 'Reverse charge', 12, '1410 Input VAT', '1600-VT', 'RA 12023; effective 2 Jun 2025',
    'The buyer withholds and remits the 12% VAT, then claims it as input VAT.'),
  tc('IV0', 'Zero-rated purchase', 'Purchase', 'Zero-rated', 0, '— None —', '2550Q', 'NIRC Sec. 108(B)'),
  tc('IVX', 'VAT-exempt purchase', 'Purchase', 'Exempt', 0, '— None —', '2550Q', 'NIRC Sec. 109'),
  tc('INV', 'Purchase from non-VAT supplier (no input VAT)', 'Purchase', 'Non-VAT', 0, '— None —', '—', 'NIRC Sec. 110'),
];

const tg = (code: string, name: string, direction: TaxDirection, taxCode: string): TaxGroup => ({
  id: `tg-${code}`, code, name, direction, taxCode, active: true,
});

export const SEED_TAX_GROUPS: TaxGroup[] = [
  tg('S-VAT12', 'VAT 12% – output', 'Sales', 'OV12'),
  tg('S-VATX', 'VAT-exempt goods or services', 'Sales', 'OVX'),
  tg('S-VAT0', 'Zero-rated goods or services', 'Sales', 'OV0'),
  tg('P-VAT12', 'VAT 12% – input (goods)', 'Purchase', 'IV12'),
  tg('P-VAT12S', 'VAT 12% – input (services)', 'Purchase', 'IVS12'),
  tg('P-VAT12C', 'VAT 12% – input (capital goods)', 'Purchase', 'IVC12'),
  tg('P-VATX', 'VAT-exempt purchase', 'Purchase', 'IVX'),
  tg('P-VAT0', 'Zero-rated purchase', 'Purchase', 'IV0'),
];

const wt = (
  atc: string, description: string, payee: WithholdingTax['payee'], rate: number, legalBasis: string,
  patch: Partial<WithholdingTax> = {},
): WithholdingTax => ({
  id: `wt-${atc || description.toLowerCase().replace(/\W+/g, '-')}`,
  atc, description, condition: '', kind: 'Expanded (EWT)', payee, rate, base: 'Amount net of VAT',
  birForms: '2307 · 0619-E · 1601-EQ', legalBasis, active: true, notes: '', ...patch,
});

const EWT_BASIS = 'RR 2-98 Sec. 2.57.2, as amended';

// Income-based pairs: individuals switch at ₱3M gross income (or VAT registration), corporations at ₱720,000.
const IND_LOW = 'Gross income this year ≤ ₱3M';
const IND_HIGH = 'Gross income > ₱3M, or VAT-registered regardless of amount';
const CORP_LOW = 'Gross income this year ≤ ₱720,000';
const CORP_HIGH = 'Gross income > ₱720,000';

/** One nature of income payment with the four threshold ATCs: [WI low, WI high, WC low, WC high]. */
const tiered = (description: string, [il, ih, cl, ch]: (string | null)[]): WithholdingTax[] => [
  ...(il ? [wt(il, description, 'Individual', 5, EWT_BASIS, { condition: IND_LOW })] : []),
  ...(ih ? [wt(ih, description, 'Individual', 10, EWT_BASIS, { condition: IND_HIGH })] : []),
  ...(cl ? [wt(cl, description, 'Corporate', 10, EWT_BASIS, { condition: CORP_LOW })] : []),
  ...(ch ? [wt(ch, description, 'Corporate', 15, EWT_BASIS, { condition: CORP_HIGH })] : []),
];

/** One nature of income payment at one rate, for individuals (WI…) and/or corporations (WC…). */
const flat = (
  description: string, rate: number, wi: string | null, wc: string | null, patch: Partial<WithholdingTax> = {},
): WithholdingTax[] => [
  ...(wi ? [wt(wi, description, 'Individual', rate, EWT_BASIS, patch)] : []),
  ...(wc ? [wt(wc, description, 'Corporate', rate, EWT_BASIS, patch)] : []),
];

const TWA = 'Top withholding agents only.';
const GOVT = 'Paid by national government agencies (NGAs), LGUs and other government offices.';

/** Expanded withholding tax (WE) ATCs, in BIR table order, plus withholding VAT. */
export const SEED_WITHHOLDING: WithholdingTax[] = [
  ...tiered('Professional fees (lawyers, CPAs, engineers, etc.)', ['WI010', 'WI011', 'WC010', 'WC011']),
  ...tiered('Professional entertainers (actors and actresses, singers, lyricists, composers, emcees, etc.)', ['WI020', 'WI021', 'WC020', 'WC021']),
  ...tiered('Professional athletes, including basketball players, pelotaris and jockeys', ['WI030', 'WI031', 'WC030', 'WC031']),
  ...tiered('Directors and producers in movies, stage, television and musical productions', ['WI040', 'WI041', 'WC040', 'WC041']),
  ...tiered('Management and technical consultants', ['WI050', 'WI051', 'WC050', 'WC051']),
  ...tiered('Business and bookkeeping agents and agencies', ['WI060', 'WI061', 'WC060', 'WC061']),
  ...tiered('Insurance agents and insurance adjusters', ['WI070', 'WI071', 'WC070', 'WC071']),
  ...tiered('Other recipients of talent fees', ['WI080', 'WI081', 'WC080', 'WC081']),
  ...tiered('Fees of directors who are not employees of the company', ['WI090', 'WI091', null, null]),
  ...flat(
    'Rentals: gross rental or lease of personal property over ₱10,000 a year, and of real property used in business the payor has no title to or equity in; poles, satellites, transmission facilities and billboards',
    5, 'WI100', 'WC100',
  ),
  ...flat('Cinematographic film rentals and other payments to resident film owners, lessors and distributors', 5, 'WI110', 'WC110'),
  ...flat('Income payments to certain contractors', 2, 'WI120', 'WC120'),
  ...flat('Income distribution to the beneficiaries of estates and trusts', 15, 'WI130', null),
  ...tiered(
    'Gross commissions or service fees of customs, insurance, stock, immigration and commercial brokers, agents of professional entertainers and real estate service practitioners (consultants, appraisers and brokers)',
    ['WI139', 'WI140', 'WC139', 'WC140'],
  ),
  ...tiered(
    'Professional fees of medical practitioners (doctors of medicine and veterinary science, dentists) paid by hospitals, clinics, HMOs and similar establishments',
    ['WI151', 'WI150', 'WC151', 'WC150'],
  ),
  wt('WI152', 'Payments by general professional partnerships (GPPs) to their partners', 'Individual', 10, EWT_BASIS, { condition: CORP_LOW }),
  wt('WI153', 'Payments by general professional partnerships (GPPs) to their partners', 'Individual', 15, EWT_BASIS, { condition: CORP_HIGH }),
  ...flat('Income payments made by credit card companies', 0.5, 'WI156', 'WC156'),
  ...flat('Additional income payments to government personnel from importers, shipping and airline companies or their agents for overtime services', 15, 'WI159', null),
  ...flat('Payments by NGAs, LGUs, etc. to local/resident suppliers of goods not covered by other withholding rates', 1, 'WI640', 'WC640', { notes: GOVT }),
  ...flat('Payments by NGAs, LGUs, etc. to local/resident suppliers of services not covered by other withholding rates', 2, 'WI157', 'WC157', { notes: GOVT }),
  ...flat('Payments by top withholding agents to local/resident suppliers of goods not covered by other withholding rates', 1, 'WI158', 'WC158', { notes: TWA }),
  ...flat('Payments by top withholding agents to local/resident suppliers of services not covered by other withholding rates', 2, 'WI160', 'WC160', { notes: TWA }),
  wt('WI515', 'Commissions, rebates, discounts and similar considerations to independent or exclusive sales representatives and marketing agents and sub-agents, including multi-level marketing', 'Individual', 5, EWT_BASIS, { condition: IND_LOW }),
  wt('WI516', 'Commissions, rebates, discounts and similar considerations to independent or exclusive sales representatives and marketing agents and sub-agents, including multi-level marketing', 'Individual', 10, EWT_BASIS, { condition: IND_HIGH }),
  ...flat('Gross payments to embalmers by funeral parlors', 1, 'WI530', null),
  ...flat('Payments made by pre-need companies to funeral parlors', 1, 'WI535', 'WC535'),
  ...flat('Tolling fees paid to refineries', 5, 'WI540', 'WC540'),
  ...flat('Payments to suppliers of agricultural products over a cumulative ₱300,000 in the same taxable year', 1, 'WI610', 'WC610'),
  ...flat('Purchases of minerals, mineral products and quarry resources (silver, gold, granite, gravel, sand, boulders, etc.), except purchases by the BSP', 5, 'WI630', 'WC630'),
  ...flat('Purchases of minerals, mineral products and quarry resources by the Bangko Sentral ng Pilipinas from gold miners/suppliers (PD 1899 as amended by RA 7076)', 1, 'WI632', 'WC632'),
  ...flat('Gross amount of refunds by MERALCO to customers with active contracts', 15, 'WI650', 'WC650', { base: 'Gross amount' }),
  ...flat('Gross amount of refunds by MERALCO to customers with terminated contracts', 15, 'WI651', 'WC651', { base: 'Gross amount' }),
  ...flat('Interest on refunds of meter deposits — MERALCO residential and general service customers using over 200 kWh a month', 10, 'WI660', 'WC660', { base: 'Gross amount' }),
  ...flat('Interest on refunds of meter deposits — MERALCO non-residential customers using over 200 kWh a month', 15, 'WI661', 'WC661', { base: 'Gross amount' }),
  ...flat('Interest on refunds of meter deposits — other distribution utilities’ residential and general service customers using over 200 kWh a month', 10, 'WI662', 'WC662', { base: 'Gross amount' }),
  ...flat('Interest on refunds of meter deposits — other distribution utilities’ non-residential customers using over 200 kWh a month', 15, 'WI663', 'WC663', { base: 'Gross amount' }),
  ...flat(
    'Purchases of goods and services for campaign expenditures by political parties and candidates, and purchases intended as campaign contributions',
    5, 'WI680', 'WC680',
  ),
  ...flat('Income payments received by Real Estate Investment Trusts (REITs)', 1, null, 'WC690'),
  ...flat('Interest income from other debt instruments not covered by deposit substitutes and RR 14-2012', 15, 'WI710', 'WC710', { base: 'Gross amount' }),
  ...flat('Income payments on locally produced raw sugar', 1, 'WI720', 'WC720'),
  ...flat('Payments by joint ventures (incorporated or not, taxable or not) to local/resident suppliers of goods', 1, 'WI770', 'WC770'),
  ...flat('Payments by joint ventures (incorporated or not, taxable or not) to local/resident suppliers of services', 2, 'WI780', 'WC780'),
  ...flat('Each co-venturer’s share in the net income of a joint venture or consortium not taxable as a corporation, before distribution', 15, null, 'WC790'),
  ...flat('Gross remittances by e-marketplace operators to sellers/merchants for goods or services sold through their platform', 0.5, 'WI820', 'WC820', { base: 'Gross amount', legalBasis: 'RR 16-2023' }),
  ...flat('Gross remittances by digital financial services providers to sellers/merchants for goods or services paid through their platform', 0.5, 'WI830', 'WC830', { base: 'Gross amount', legalBasis: 'RR 16-2023' }),
  ...flat('Payments by top withholding agents to manufacturers and direct importers of motor vehicles (CBU or SKD), motor vehicle parts and accessories', 0.5, 'WI840', 'WC840', { notes: TWA }),
  ...flat('Payments by top withholding agents to manufacturers and direct importers of medicine and pharmaceutical products', 0.5, 'WI850', 'WC850', { notes: TWA }),
  ...flat('Payments by top withholding agents to manufacturers and direct importers of solid or liquid fuels and related products', 0.5, 'WI860', 'WC860', { notes: TWA }),

  // Withholding VAT (BIR Form 1600-VT)
  wt('', 'Creditable withholding VAT – government purchases', 'Any', 5, 'NIRC Sec. 114(C) as amended by TRAIN', {
    kind: 'Withholding VAT', base: 'VAT-exclusive amount', birForms: '2307 · 1600-VT',
    notes: 'Withheld by government buyers. Final only for ODA-funded projects. Assign the ATC from BIR Form 1600-VT.',
  }),
  wt('', 'VAT on digital services from non-residents (reverse charge)', 'Any', 12, 'RA 12023', {
    kind: 'Withholding VAT', base: 'VAT-exclusive amount', birForms: '1600-VT',
    notes: 'Applies to B2B purchases from non-resident digital service providers. Assign the ATC from BIR Form 1600-VT.',
  }),
];

const ex = (code: string, name: string, basis: ExciseBasis, rate: string, legalBasis: string, notes = '', effective = '2026'): ExciseCategory => ({
  id: `ex-${code}`, code, name, basis, rate, effective, legalBasis, active: true, notes,
});

export const SEED_EXCISE: ExciseCategory[] = [
  ex('EX-CIG', 'Cigarettes', 'Specific', '₱69.46 per pack of 20', 'RA 11346, RA 11467'),
  ex('EX-HTP', 'Heated tobacco products', 'Specific', '₱37.63 per pack', 'RA 11467'),
  ex('EX-VAP', 'Vapor products (nicotine salt / freebase)', 'Specific', '₱60.20 per mL', 'RA 11467'),
  ex('EX-SPR', 'Distilled spirits', 'Specific + ad valorem', '22% of net retail price + ₱74.16 per proof liter', 'RA 11467'),
  ex('EX-BER', 'Fermented liquors (beer)', 'Specific', '', 'RA 11467', 'Indexed yearly. Enter the 2026 BIR/BOC schedule rate.'),
  ex('EX-WIN', 'Wines', 'Specific', '', 'RA 11467', 'Indexed yearly. Enter the 2026 BIR/BOC schedule rate.'),
  ex('EX-SSB', 'Sweetened beverages', 'Specific', '₱6 per liter; ₱12 per liter with high-fructose corn syrup', 'RA 10963 (TRAIN), NIRC Sec. 150-B', '', '2018'),
  ex('EX-PET', 'Petroleum products', 'Specific', 'Gasoline ₱10/L · diesel ₱6/L · LPG ₱3/kg', 'RA 10963 (TRAIN), NIRC Sec. 148',
    'Excise on LPG and kerosene was suspended 16 Apr–16 Jul 2026.', '2020'),
  ex('EX-AUT', 'Automobiles', 'Ad valorem', '4% / 10% / 20% / 50% by net manufacturer price (≤₱600k / ≤₱1M / ≤₱4M / above)', 'RA 10963 (TRAIN), NIRC Sec. 149',
    'Hybrid vehicles are taxed at half the rate; pure electric vehicles are exempt.', '2018'),
  ex('EX-MIN', 'Mineral products', 'Ad valorem', '4% of market value; coal ₱150 per metric ton', 'RA 10963 (TRAIN), NIRC Sec. 151', '', '2018'),
  ex('EX-NEG', 'Non-essential goods (jewelry, perfumes, yachts)', 'Ad valorem', '20% of wholesale price or customs value', 'NIRC Sec. 150'),
  ex('EX-COS', 'Invasive cosmetic procedures', 'Ad valorem', '5% of gross receipts', 'RA 10963 (TRAIN), NIRC Sec. 150-A', '', '2018'),
];
