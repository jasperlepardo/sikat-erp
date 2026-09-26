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
export type WithholdingBase = 'Amount net of VAT' | 'One-half of gross remittance' | 'VAT-exclusive amount';

/** A creditable withholding tax, by BIR Alphanumeric Tax Code (ATC). */
export interface WithholdingTax {
  id: string;
  /** BIR ATC, e.g. WC158. Blank when the ATC still has to be confirmed. */
  atc: string;
  description: string;
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
  atc, description, kind: 'Expanded (EWT)', payee, rate, base: 'Amount net of VAT',
  birForms: '2307 · 0619-E · 1601-EQ', legalBasis, active: true, notes: '', ...patch,
});

export const SEED_WITHHOLDING: WithholdingTax[] = [
  wt('WI010', 'Professional fees – individual, gross ≤ ₱3M (non-VAT)', 'Individual', 5, 'RR 2-98 as amended by RR 11-2018'),
  wt('WI011', 'Professional fees – individual, gross > ₱3M or VAT-registered', 'Individual', 10, 'RR 2-98 as amended by RR 11-2018'),
  wt('WC010', 'Professional fees – corporate, gross ≤ ₱720,000', 'Corporate', 10, 'RR 2-98 as amended by RR 11-2018'),
  wt('WC011', 'Professional fees – corporate, gross > ₱720,000', 'Corporate', 15, 'RR 2-98 as amended by RR 11-2018'),
  wt('WI100', 'Rentals – real or personal property', 'Individual', 5, 'RR 2-98 as amended'),
  wt('WC100', 'Rentals – real or personal property', 'Corporate', 5, 'RR 2-98 as amended'),
  wt('WI120', 'Contractors and sub-contractors', 'Individual', 2, 'RR 2-98 as amended'),
  wt('WC120', 'Contractors and sub-contractors', 'Corporate', 2, 'RR 2-98 as amended'),
  wt('WI158', 'Goods bought by a top withholding agent', 'Individual', 1, 'RR 11-2018, RR 31-2020'),
  wt('WC158', 'Goods bought by a top withholding agent', 'Corporate', 1, 'RR 11-2018, RR 31-2020'),
  wt('WI160', 'Services bought by a top withholding agent', 'Individual', 2, 'RR 11-2018, RR 31-2020'),
  wt('WC160', 'Services bought by a top withholding agent', 'Corporate', 2, 'RR 11-2018, RR 31-2020'),
  wt('WI760', 'E-marketplace / digital financial services remittances to sellers', 'Individual', 1, 'RR 16-2023', {
    base: 'One-half of gross remittance',
    notes: 'BIR issued new ATCs in 2025 (RMO 18-2025). Confirm the current ATC before use.',
  }),
  wt('WC760', 'E-marketplace / digital financial services remittances to sellers', 'Corporate', 1, 'RR 16-2023', {
    base: 'One-half of gross remittance',
    notes: 'BIR issued new ATCs in 2025 (RMO 18-2025). Confirm the current ATC before use.',
  }),
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
