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

/** Classification of withholding taxes, as the BIR website names them (Withholding Tax page). */
export type WithholdingKind = 'Expanded (EWT)' | 'Final (FWT)' | 'Withholding VAT' | 'Percentage tax';
export const WITHHOLDING_KINDS: WithholdingKind[] = ['Expanded (EWT)', 'Final (FWT)', 'Withholding VAT', 'Percentage tax'];

/** Tax type code, BIR name and BIR definition of each kind (bir.gov.ph › Withholding Tax). */
export const WITHHOLDING_KIND_INFO: Record<WithholdingKind, { type: string; name: string; definition: string; forms: string }> = {
  'Expanded (EWT)': {
    type: 'WE',
    name: 'Expanded',
    definition:
      'A kind of withholding tax which is prescribed on certain income payments and is creditable against the income tax due of the payee for the taxable quarter/year in which the particular income was earned.',
    forms: '0619-E · 1601-EQ · 2307',
  },
  'Final (FWT)': {
    type: 'WF',
    name: 'Final Withholding Tax',
    definition:
      'The amount of income tax withheld by the withholding agent is constituted as a full and final payment of income tax due from the payee of the said income. The liability for payment of tax rests primarily on the payor as a withholding agent. Failure to withhold the tax or in case of under withholding, the deficiency tax shall be collected from payor/withholding agent. The payee is not required to file an income tax return for the particular income.',
    forms: '0619-F · 1601-FQ · 2306',
  },
  'Withholding VAT': {
    type: 'WV',
    name: 'Withholding Tax on GMP - Value Added Taxes (GVAT)',
    definition:
      'The tax withheld by National Government Agencies (NGAs) and instrumentalities, including government-owned and controlled corporations (GOCCs) and local government units (LGUs), before making any payments to VAT registered taxpayers/suppliers/payees on account of their purchases of goods and services.',
    forms: '1600-VT',
  },
  'Percentage tax': {
    type: 'WB',
    name: 'Withholding Tax on Government Money Payments (GMP) - Percentage Taxes',
    definition:
      'The tax withheld by National Government Agencies (NGAs) and instrumentalities, including government-owned and controlled corporations (GOCCs) and local government units (LGUs), before making any payments to non-VAT registered taxpayers/suppliers/payees.',
    forms: '1600-PT',
  },
};
/** From the BIR table's sections: "Applicable to Government Withholding Agent Only" or "… Both Government and Private". */
export type WithholdingAgent = 'Government' | 'Private' | 'Any';
export const WITHHOLDING_AGENTS: WithholdingAgent[] = ['Any', 'Government', 'Private'];
export type WithholdingBase = '' | 'Amount net of VAT' | 'Gross amount' | 'VAT-exclusive amount';
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
  /** Who may use this ATC as withholding agent. */
  agent: WithholdingAgent;
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
  kind: WithholdingKind, atc: string, payee: WithholdingTax['payee'], rate: number, description: string,
  condition = '', agent: WithholdingAgent = 'Any',
): WithholdingTax => ({
  id: `wt-${atc}`,
  atc, description, condition, kind, agent, payee, rate,
  base: '', birForms: WITHHOLDING_KIND_INFO[kind].forms, legalBasis: '', active: true, notes: '',
});

/*
 * The seed is the BIR ATC tables exactly as provided — descriptions and conditions verbatim,
 * nothing added. Rates in fractions are stored as percentages: 1/2% = 0.5, 6/10 of 1% = 0.6.
 */

// Expanded withholding tax (WE)
type Row = [atc: string, payee: WithholdingTax['payee'], rate: number, condition?: string];
const we = (description: string, rows: Row[]) =>
  rows.map(([atc, payee, rate, condition]) => wt('Expanded (EWT)', atc, payee, rate, description, condition));

const IND_LE_3M = 'if the gross income for the current year did not exceed ₱ 3M';
const IND_GT_3M = 'if gross income is more than ₱ 3M or VAT registered regardless of amount';
const CORP_LE = 'if gross income for the current year did not exceed ₱ 720,000.00';
const CORP_GT = 'if gross income exceeds ₱ 720,000.00';
const tiers = (wi: string, wiHigh: string, wc: string | null, wcHigh: string | null): Row[] => [
  [wi, 'Individual', 5, IND_LE_3M],
  [wiHigh, 'Individual', 10, IND_GT_3M],
  ...(wc && wcHigh ? ([[wc, 'Corporate', 10, CORP_LE], [wcHigh, 'Corporate', 15, CORP_GT]] as Row[]) : []),
];
const both = (wi: string | null, wc: string | null, rate: number): Row[] => [
  ...(wi ? ([[wi, 'Individual', rate]] as Row[]) : []),
  ...(wc ? ([[wc, 'Corporate', rate]] as Row[]) : []),
];

const EXPANDED: WithholdingTax[] = [
  ...we('Professional fees (Lawyers, CPAs, Engineers, etc.)', [
    ['WI010', 'Individual', 5, IND_LE_3M],
    ['WI011', 'Individual', 10, 'if gross income is more than ₱ 3M or VAT registered regardlessof amount'],
    ['WC010', 'Corporate', 10, CORP_LE],
    ['WC011', 'Corporate', 15, CORP_GT],
  ]),
  ...we('Professional entertainer such as, but not limited to actors and actresses, singers, lyricist, composers, emcees', tiers('WI020', 'WI021', 'WC020', 'WC021')),
  ...we('Professional athletes including basketball players, pelotaris and jockeys', tiers('WI030', 'WI031', 'WC030', 'WC031')),
  ...we('All directors and producers involved in movies, stage, television and musical productions', tiers('WI040', 'WI041', 'WC040', 'WC041')),
  ...we('Management and technical consultants', tiers('WI050', 'WI051', 'WC050', 'WC051')),
  ...we('Business and Bookkeeping agents and agencies', tiers('WI060', 'WI061', 'WC060', 'WC061')),
  ...we('Insurance agents and insurance adjusters', tiers('WI070', 'WI071', 'WC070', 'WC071')),
  ...we('Other Recipients of Talent Fees', tiers('WI080', 'WI081', 'WC080', 'WC081')),
  ...we('Fees of Director who are not employees of the company', tiers('WI090', 'WI091', null, null)),
  ...we(
    'Rentals: On gross rental or lease for the continued use or possession of personal property in excess of ₱ 10,000.00 annually and real property used in business which the payor or obligor has not taken title or is not taking title, or in which has no equity; poles, satellites, transmission facilities and billboards',
    both('WI100', 'WC100', 5),
  ),
  ...we('Cinematographic film rentals and other payments to resident individuals and corporate cinematographic film owners, lessors and distributors', both('WI110', 'WC110', 5)),
  ...we('Income payments to certain contractors', both('WI120', 'WC120', 2)),
  ...we('Income distribution to the beneficiaries of estate and trusts', both('WI130', null, 15)),
  ...we(
    'Gross Commission of service fees of customs, insurance, stock, immigration and commercial brokers, fees of agents of professional entertainers and real estate service practitioners (RESPs)(i.e. real estate consultants, real estate appraisers and real estate brokers',
    tiers('WI139', 'WI140', 'WC139', 'WC140'),
  ),
  ...we(
    'Professional fees paid to medical practitioners (includes doctors of medicine, doctors of veterinary science & dentist) by hospitals & clinics or paid directly by HMO and/or other similar establishments',
    tiers('WI151', 'WI150', 'WC151', 'WC150'),
  ),
  ...we('Payment by the General Professional Partnership (GPPs) to its partners', [
    ['WI152', 'Individual', 10, CORP_LE],
    ['WI153', 'Individual', 15, CORP_GT],
  ]),
  ...we('Income payments made by credit card companies', both('WI156', 'WC156', 0.5)),
  ...we('Additional Income Payments to govt personnel from importers, shipping and airline companies or their agents for overtime services', both('WI159', null, 15)),
  ...we('Income Payment made by NGAs, LGU, & etc to its local/resident suppliers of goods other than those covered by other rates of withholding tax', both('WI640', 'WC640', 1)),
  ...we('Income Payment made by NGAs, LGU, & etc to its local/resident suppliers of services other than those covered by other rates of withholding tax', both('WI157', 'WC157', 2)),
  ...we('Income Payment made by top withholding agents to their local/resident suppliers of goods other than those covered by other rates of withholding tax', both('WI158', 'WC158', 1)),
  ...we('Income Payment made by top withholding agents to their local/resident suppliers of services other than those covered by other rates of withholding tax', both('WI160', 'WC160', 2)),
  ...we(
    'Commissions, rebates, discounts and other similar considerations paid/granted to independent and/or exclusive sales representatives and marketing agents and sub-agents of companies, including multi-level marketing companies',
    [
      ['WI515', 'Individual', 5, IND_LE_3M],
      ['WI516', 'Individual', 10, 'if the gross income is more than ₱ 3M or VAT registered regardless of amount'],
    ],
  ),
  ...we('Gross payments to embalmers by funeral parlors', both('WI530', null, 1)),
  ...we('Payments made by pre-need companies to funeral parlors', both('WI535', 'WC535', 1)),
  ...we('Tolling fees paid to refineries', both('WI540', 'WC540', 5)),
  ...we('Income payments made to suppliers of agricultural supplier products in excess of cumulative amount of ₱ 300,000 within the same taxable year', both('WI610', 'WC610', 1)),
  ...we(
    'Income payments on purchases of minerals, mineral products and quarry resources, such as but not limited to silver, gold, granite, gravel, sand, boulders and other mineral products except purchases by Bangko Sentral ng Pilipinas',
    both('WI630', 'WC630', 5),
  ),
  ...we(
    'Income payments on purchases of minerals, mineral products and quarry resources by Bangko Sentral ng Pilipinas ((BSP) from gold miners/suppliers under PD 1899, as amended by RA No. 7076',
    both('WI632', 'WC632', 1),
  ),
  ...we('On gross amount of refund given by MERALCO to customers with active contracts as classified by MERALCO', both('WI650', 'WC650', 15)),
  ...we('On gross amount of refund given by MERALCO to customers with terminated contracts as classified by MERALCO', both('WI651', 'WC651', 15)),
  ...we(
    "On gross amount of interest on the refund of meter deposits whether paid directly to the customers or applied against customer's billings of Residential and General Service customers whose monthly electricity consumption exceeds 200 kwh as classified by MERALCO",
    both('WI660', 'WC660', 10),
  ),
  ...we(
    "On gross amount of interest on the refund of meter deposits whether paid directly to the customers or applied against customer's billings of Non-Residential customers whose monthly electricity consumption exceeds 200 kwh as classified by MERALCO",
    both('WI661', 'WC661', 15),
  ),
  ...we(
    "On gross amount of interest on the refund of meter deposits whether paid directly to the customers or applied against customer's billings of Residential and General Service customers whose monthly electricity consumption exceeds 200 kwh as classified by other by other electric Distribution Utilities (DU)",
    both('WI662', 'WC662', 10),
  ),
  ...we(
    "On gross amount of interest on the refund of meter deposits whether paid directly to the customers or applied against customer's billings of Non-Residential customers whose monthly electricity consumption exceeds 200 kwh as classified by other electric Distribution Utilities (DU)",
    both('WI663', 'WC663', 15),
  ),
  ...we(
    'Income payments made by political parties and candidates of local and national elections on all their purchases of goods and services related to campaign expenditures, and income payments made by individuals or juridical persons for their purchases of goods and services intented to be given as campaign contribution to political parties and candidates',
    both('WI680', 'WC680', 5),
  ),
  ...we('Income payments received by Real Estate Investment Trust (REIT)', both(null, 'WC690', 1)),
  ...we('Interest income derived from any other debt instruments not within the coverage of deposit substitutes and Revenue Regulations 14-2012', both('WI710', 'WC710', 15)),
  ...we('Income payments on locally produced raw sugar', both('WI720', 'WC720', 1)),
  ...we('Income payments made by joint ventures, whether incorporated or not, taxable or non-taxable, to their local/resident supplier of goods', both('WI770', 'WC770', 1)),
  ...we('Income payments made by joint ventures, whether incorporated or not, taxable or non-taxable, to their local/resident supplier of services', both('WI780', 'WC780', 2)),
  ...we(
    'On the share of each co-venturer/member from the net income of the joint venture/consortium not taxable as corporation prior to actual or constructive distribution thereof',
    both(null, 'WC790', 15),
  ),
  ...we('On the gross remittances by e-marketplace operators to the sellers/merchants for the goods or services sold/paid through their platform/facility', both('WI820', 'WC820', 0.5)),
  ...we('On the gross remittances by digital financial services providers to the sellers/merchants for the goods or services sold/paid through their platform/facility', both('WI830', 'WC830', 0.5)),
  ...we(
    'Income payments made by top withholding agents, either private corporations or individuals, to the manufacturers and direct importers of motor vehicles in Completely Built Units (CBUs) or Semi-Knockdown (SKD) units, motor vehicle parts and accessories.',
    both('WI840', 'WC840', 0.5),
  ),
  ...we(
    'Income payments made by top withholding agents, either private corporations or individuals, to the manufacturers and direct importers of medicine/pharmaceutical products',
    both('WI850', 'WC850', 0.5),
  ),
  ...we(
    'Income payments made by top withholding agents, either private corporations or individuals, to the manufacturers and direct importers of solid or liquid fuels and related products',
    both('WI860', 'WC860', 0.5),
  ),
];

// Final withholding tax (WF)
const wf = (description: string, rows: Row[]) => rows.map(([atc, payee, rate]) => wt('Final (FWT)', atc, payee, rate, description));

const FINAL: WithholdingTax[] = [
  ...wf('Interest on Foreign loans payable to Non-Resident Foreign Corporation (NRFCs)', both(null, 'WC180', 20)),
  ...wf('Interest and other income payments on foreign currency transactions/loans payable of Offshore Banking Units (OBUs)', both(null, 'WC190', 10)),
  ...wf('Interest and other income payments on foreign currency transactions/loans payable of Foreign Currency Deposits Units (FCDUs)', both(null, 'WC191', 10)),
  ...wf('Cash dividend payment by domestic corporation to citizens and residents aliens/NRFCs', [
    ['W1202', 'Individual', 10],
    ['WC212', 'Corporate', 25],
  ]),
  ...wf('Property dividend payment by domestic corporation to citizens and resident aliens/NRFCs', [
    ['WI203', 'Individual', 10],
    ['WC213', 'Corporate', 25],
  ]),
  ...wf('Cash dividend payment by domestic corporation to NFRCs whose countries allowed tax deemed paid credit (subject to tax sparing rule)', both(null, 'WC222', 15)),
  ...wf('Property dividend payment by domestic corporation to NFRCs whose countries allowed tax deemed paid credit (subject to tax sparing rule)', both(null, 'WC223', 15)),
  ...wf('Cash dividend payment by domestic corporation to non-resident alien engaged in Trade or Business within the Philippines (NRAETB)', both('WI224', null, 20)),
  ...wf('Property dividend payment by domestic corporation to NRAETB', both('WI225', null, 20)),
  ...wf(
    'Share of NRAETB in the distributable net income after tax of a partnership (except GPPs) of which he is a partner, or share in the net income after tax of an association, joint account or a joint venture taxable as a corporation of which he is a member or a co-venturer',
    both('WI226', null, 20),
  ),
  ...wf('On other payments to NRFCs', both(null, 'WC230', 25)),
  ...wf('Distributive share of individual partners in a taxable partnership, association, joint account or joint venture or consortium', both('WI240', null, 10)),
  ...wf(
    'All kinds of royalty payments to citizens, resident aliens and NRAETB (other than WI380 and WI341), domestic and resident foreign corporations',
    both('WI250', 'WC250', 20),
  ),
  ...wf('On prizes exceeding ₱ 10,000.00 and other winnings paid to individuals', both('WI260', null, 20)),
  ...wf('Branch profit remittance by all corporations except PEZA/SBMA/CDA registered', both(null, 'WC280', 15)),
  ...wf('On the gross rentals, lease and charter fees derived by non-resident owner or lessor of foreign vessels', both(null, 'WC290', 4.5)),
  ...wf('On gross rentals, charter and other fees derived by non-resident lessor or aircraft, machineries and equipment', both(null, 'WC300', 7.5)),
  ...wf('On payments to oil exploration service contractors/sub-contractors', both('WI310', 'WC310', 8)),
  ...wf(
    'Payments to non-resident alien not engage in trade or business within the Philippines (NRANETB) except on sale of shares in domestic corporation and real property',
    both('WI330', null, 25),
  ),
  ...wf('On payments to non-resident individual/foreign corporate cinematographic film owners, lessors or distributors', both('WI340', 'WC340', 25)),
  ...wf('Royalties paid to NRAETB on cinematographic films and similar works', both('WI341', null, 25)),
  ...wf(
    'Final tax on interest or other payments upon tax-free covenant bonds, mortgages, deeds of trust or other obligations under Sec. 57C of the NIRC of 1997, as amended',
    both('WI350', null, 30),
  ),
  ...wf('Royalties paid to citizens, resident aliens and nraetb on books, other literary works and musical compositions', both('WI380', null, 10)),
  ...wf('Informers cash reward to individuals/juridical persons', both('WI410', 'WC410', 10)),
  ...wf('Cash on property dividend paid by a Real Estate Investment Trust', both('WI700', 'WC700', 10)),
];

// Withholding tax on government money payments (GMP): VAT (WV) and percentage taxes (WB)
const gmp = (kind: 'Withholding VAT' | 'Percentage tax', agent: WithholdingAgent) =>
  (atc: string, rate: number, description: string, condition = '') => wt(kind, atc, 'Any', rate, description, condition, agent);
const wvGov = gmp('Withholding VAT', 'Government');
const wvBoth = gmp('Withholding VAT', 'Any');
const wbGov = gmp('Percentage tax', 'Government');
const wbBoth = gmp('Percentage tax', 'Any');

const BANKS = 'Tax on Banks and Non-banks Financial Intermediaries Performing Quasi Banking Dunctions';
const BANKS_A = 'A. On interest, commissions and discounts from lending activities as well as income from financial leasing on the basis of the remaining maturities of instruments from which receipts are derived';
const NON_BANKS = 'Tax on Other Non-Banks Financial Intermediaries nor performing Quasi-Banking Functions';
const NON_BANKS_A = 'A. On interest, commissions and discounts from lending activities as well as income from financial leasing on the basis of the remaining maturities of instruments from which such receipts are derived';
const IPO = 'Tax on shares of stocks sold or exchanged through initial and secondary public offering';

const GMP: WithholdingTax[] = [
  // Applicable to Government Withholding Agent Only
  wvGov('WV010', 5, 'VAT withholding on Purchase of Goods'),
  wvGov('WV020', 5, 'VAT Withholding on Purchase of Services'),
  // Applicable to Both Government and Private Withholding Agents
  wvBoth('WV040', 12, 'VAT Withholding from non-residents (Government Withholding Agents)'),
  wvBoth('WV050', 12, 'VAT Withholding from non-residents (Private Withholding Agents)'),
  wvBoth('WV060', 12, 'Final Withholding VAT on Other Services rendered in the Philippines by non-residents (Government Withholding Agent)'),
  wvBoth('WV070', 12, 'Final Withholding VAT on Other Services rendered in the Philippines by non-residents (Private Withholding Agent)'),
  wvBoth('WV012', 12, 'VAT Withholding on Purchases of Goods (with waiver of privilege to claim tax credit) creditable'),
  wvBoth('WV014', 12, 'VAT Withholding on Purchases of Goods (with waiver of privilege to claim input tax credit) final'),
  wvBoth('WV022', 12, 'VAT Withholding on Purchases of Services (with waiver of privilege to claim input tax credit) creditable'),
  wvBoth('WV024', 12, 'VAT Withholding on Purchases of Services (with waiver of privilege to claim input tax credit) final'),
  // Applicable to Government Withholding Agent Only
  wbGov('WB030', 3, 'Tax on Carriers and Keepers of Garages'),
  wbGov('WB040', 2, 'Franchise Tax on Gas and Utilities'),
  wbGov('WB050', 3, 'Franchise tax on radio & TV broadcasting companies whose annual gross receipts do not exceed ₱10M & who are not-VAT registered taxpayer'),
  wbGov('WB070', 2, 'Tax on Life insurance premiums'),
  wbGov('WB090', 10, 'Tax on Overseas Dispatch, Message or Conversation from the Philippines'),
  wbGov('WB120', 4, 'Business tax on Agents of Foreign Insurance companies - Insurance Agents'),
  wbGov('WB121', 5, 'Business tax on Agents of Foreign Insurance companies - owner of the property'),
  wbGov('WB130', 3, 'Tax on international carriers'),
  wbGov('WB140', 18, 'Tax on Cockpits'),
  wbGov('WB150', 18, 'Tax on amusement places, such as cabarets, night and day clubs, videoke bars, karaoke bars, karaoke televion, karaoke boxes, music lounges and other similar establishments'),
  wbGov('WB160', 10, 'Taxes on Boxing exhibitions'),
  wbGov('WB170', 15, 'Taxes on professional basketball games'),
  wbGov('WB180', 30, 'Tax on jai-alai and race tracks'),
  wbGov('WB200', 0.6, 'Tax on sale barter or exchange of stocks listed and traded through Local Stock Exchange'),
  wbGov('WB201', 4, IPO, 'Not over 25%'),
  wbGov('WB202', 2, IPO, 'Over 25% but not exceeding 33 1/3%'),
  wbGov('WB203', 1, IPO, 'Over 33 1/3%'),
  wbGov('WB301', 5, `${BANKS} — ${BANKS_A}`, 'Maturity period is five years or less'),
  wbGov('WB303', 1, `${BANKS} — ${BANKS_A}`, 'Maturity period is more than five years'),
  wbGov('WB102', 0, `${BANKS} — B. On dividends and equity shares and net income of subsidiaries`),
  wbGov('WB103', 7, `${BANKS} — C. On royalties, rentals of property, real or personal, profits from exchange and all other items treated as gross income under the Code`),
  wbGov('WB104', 7, `${BANKS} — D. On net trading gains within the taxable year on foreign currency, debt securities, derivatives and other similar financial instruments`),
  wbGov('WB108', 5, `${NON_BANKS} — ${NON_BANKS_A}`, 'Maturity period is five years or less'),
  wbGov('WB109', 1, `${NON_BANKS} — ${NON_BANKS_A}`, 'Maturity period is more than five years'),
  wbGov('WB110', 5, `${NON_BANKS} — B. On all other items treated as gross income under the Code`),
  // Applicable to Both Government and Private Withholding Agents
  wbBoth('WB080', 3, 'Persons exempt from VAT under Sec. 108BB (creditable) Government Withholding Agent'),
  wbBoth('WB082', 3, 'Persons exempt from VAT under Sec. 108BB (creditable) Private Withholding Agent'),
  wbBoth('WB084', 3, 'Persons exempt from VAT under Section 109BB (Section 116 applies)'),
];

export const SEED_WITHHOLDING: WithholdingTax[] = [...EXPANDED, ...FINAL, ...GMP];

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
