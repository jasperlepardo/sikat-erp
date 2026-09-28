/**
 * Philippine tax master data (as of September 2026): VAT and percentage tax codes,
 * the tax groups items point to, withholding taxes (ATCs) and excise categories.
 *
 * Rates follow the NIRC as amended (TRAIN RA 10963, CREATE RA 11534, CREATE MORE
 * RA 12066, VAT on Digital Services RA 12023) and BIR/BOC issuances. Anything not
 * confirmed from a primary source is flagged in `notes` for your accountant to check.
 */
import { toAccountCode } from './chartOfAccounts';
import type { Attachment } from './common';

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
  /** G/L account code (Accounting › Chart of Accounts); '' for none. */
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

/** VAT on the line that the vendor isn't paid: reverse-charge VAT you remit yourself, and import VAT paid to the Bureau of Customs. */
export const vatNotPaidToVendor = (code?: Pick<TaxCode, 'category'>) =>
  code?.category === 'Reverse charge' || code?.category === 'Importation';

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
  /** Zero-rated goods or services: only allowed when the buyer qualifies (see CompanyTaxProfile.exportEnterprise). */
  zeroRated: boolean;
  active: boolean;
}

/** A VAT exemption entry on a business partner, backed by an attached document. */
export interface VatExemptionEntry {
  id: string;
  type: 'Zero-rated' | 'Exempt entity';
  /** Certificate, ruling, or registration number. */
  certificateRef: string;
  /** Legal ground — only relevant for Exempt entity. */
  basis: string;
  /** YYYY-MM-DD expiry, or empty if the exemption has no expiry. */
  validUntil: string;
  /** The actual document file(s). The exemption is active only when this is non-empty. */
  attachments: Attachment[];
}

export const newVatExemptionEntry = (): VatExemptionEntry => ({
  id: `ve-${crypto.randomUUID().slice(0, 8)}`,
  type: 'Zero-rated',
  certificateRef: '',
  basis: '',
  validUntil: '',
  attachments: [],
});

/**
 * What items point to for withholding tax determination. The group carries the
 * ATCs for each payee type and income tier so `determineWithholding` is table-driven.
 */
export interface WithholdingGroup {
  id: string;
  code: string;
  name: string;
  /** ATC for a resident individual payee at the low/default income tier. null = not applicable. */
  atcIndividual: string | null;
  /** ATC for a resident individual payee at the high income tier. null = not tiered (use atcIndividual). */
  atcIndividualHigh: string | null;
  /** ATC for a resident corporate payee at the low/default income tier. null = not applicable. */
  atcCorporate: string | null;
  /** ATC for a resident corporate payee at the high income tier. null = not tiered (use atcCorporate). */
  atcCorporateHigh: string | null;
  /** Only withhold when the company is a top withholding agent. */
  requiresTopWA: boolean;
  /** Goods from a non-resident are foreign-source income to the seller — no Philippine withholding applies. Also flags the item as tangible goods for import VAT purposes. */
  nrExempt: boolean;
  /** ATC for a non-resident individual payee. null = fall back to the catch-all WI330. */
  atcNrIndividual: string | null;
  /** ATC for a non-resident corporate payee. null = fall back to the catch-all WC230. */
  atcNrCorporate: string | null;
  /** ATC used instead of atcIndividual when the withholding agent is a government entity (NGA/LGU/GOCC). null = same as private. */
  atcIndividualGov: string | null;
  /** ATC used instead of atcCorporate when the withholding agent is a government entity. null = same as private. */
  atcCorporateGov: string | null;
  active: boolean;
  notes: string;
}

/** All 115 BIR Revenue District Offices (source: tinid.ph/bir-rdo-codes). Value is the RDO code. */
export const RDOS: { value: string; label: string }[] = [
  { value: '001', label: '001 – Laoag City, Ilocos Norte' },
  { value: '002', label: '002 – Vigan / Bantay, Ilocos Sur' },
  { value: '003', label: '003 – San Fernando, La Union' },
  { value: '004', label: '004 – Calasiao, Central Pangasinan' },
  { value: '005', label: '005 – Alaminos City, West Pangasinan' },
  { value: '006', label: '006 – Urdaneta City, East Pangasinan' },
  { value: '007', label: '007 – Bangued, Abra' },
  { value: '008', label: '008 – Baguio City' },
  { value: '009', label: '009 – La Trinidad, Benguet' },
  { value: '010', label: '010 – Bontoc, Mountain Province' },
  { value: '011', label: '011 – Tabuk City, Kalinga & Apayao' },
  { value: '012', label: '012 – Lagawe, Ifugao' },
  { value: '013', label: '013 – Tuguegarao City, Cagayan & Batanes' },
  { value: '014', label: '014 – Bayombong, Nueva Vizcaya' },
  { value: '015', label: '015 – Naguilian / Cauayan, Isabela' },
  { value: '016', label: '016 – Cabarroguis, Quirino' },
  { value: '017A', label: '017A – Tarlac City, North Tarlac' },
  { value: '017B', label: '017B – Paniqui, South Tarlac' },
  { value: '018', label: '018 – Olongapo City, Zambales' },
  { value: '019', label: '019 – Subic Bay Freeport Zone' },
  { value: '020', label: '020 – Balanga, Bataan' },
  { value: '021A', label: '021A – San Fernando (Sindalan), North Pampanga' },
  { value: '021B', label: '021B – San Fernando (Sindalan), South Pampanga' },
  { value: '021C', label: '021C – Clark Freeport Zone, Pampanga/Tarlac' },
  { value: '022', label: '022 – Baler, Aurora' },
  { value: '023A', label: '023A – Talavera, North Nueva Ecija' },
  { value: '023B', label: '023B – Cabanatuan City, South Nueva Ecija' },
  { value: '024', label: '024 – Valenzuela City' },
  { value: '025A', label: '025A – Guiguinto, West Bulacan' },
  { value: '025B', label: '025B – Guiguinto, East Bulacan' },
  { value: '026', label: '026 – Malabon & Navotas' },
  { value: '027', label: '027 – Caloocan City' },
  { value: '028', label: '028 – Novaliches, Quezon City' },
  { value: '029', label: '029 – Tondo-San Nicolas, Manila' },
  { value: '030', label: '030 – Binondo, Manila' },
  { value: '031', label: '031 – Sta. Cruz, Manila' },
  { value: '032', label: '032 – Quiapo-Sampaloc-Sta. Mesa-San Miguel, Manila' },
  { value: '033', label: '033 – Intramuros-Ermita-Malate, Manila' },
  { value: '034', label: '034 – Paco-Pandacan-Sta. Ana-San Andres, Manila' },
  { value: '035', label: '035 – Odiongan, Romblon' },
  { value: '036', label: '036 – Puerto Princesa, Palawan' },
  { value: '037', label: '037 – San Jose, Occidental Mindoro' },
  { value: '038', label: '038 – North Quezon City' },
  { value: '039', label: '039 – South Quezon City' },
  { value: '040', label: '040 – Cubao, Quezon City' },
  { value: '041', label: '041 – Mandaluyong City' },
  { value: '042', label: '042 – San Juan City' },
  { value: '043', label: '043 – Pasig City' },
  { value: '044', label: '044 – Taguig & Pateros' },
  { value: '045', label: '045 – Marikina City / Antipolo (partial), North Rizal' },
  { value: '046', label: '046 – Cainta-Taytay, South Rizal' },
  { value: '047', label: '047 – East Makati' },
  { value: '048', label: '048 – West Makati' },
  { value: '049', label: '049 – North Makati' },
  { value: '050', label: '050 – South Makati' },
  { value: '051', label: '051 – Pasay City' },
  { value: '052', label: '052 – Parañaque City' },
  { value: '053A', label: '053A – Las Piñas City' },
  { value: '053B', label: '053B – Muntinlupa City' },
  { value: '054A', label: '054A – Trece Martires City, East Cavite' },
  { value: '054B', label: '054B – Kawit, West Cavite' },
  { value: '055', label: '055 – San Pablo City, East Laguna' },
  { value: '056', label: '056 – Calamba City, Central Laguna' },
  { value: '057', label: '057 – Biñan City, West Laguna' },
  { value: '058', label: '058 – Batangas City, West Batangas' },
  { value: '059', label: '059 – Lipa City, East Batangas' },
  { value: '060', label: '060 – Lucena City, North Quezon' },
  { value: '061', label: '061 – Gumaca, South Quezon' },
  { value: '062', label: '062 – Boac, Marinduque' },
  { value: '063', label: '063 – Calapan City, Oriental Mindoro' },
  { value: '064', label: '064 – Talisay, Camarines Norte' },
  { value: '065', label: '065 – Naga City, West Camarines Sur' },
  { value: '066', label: '066 – Iriga City, East Camarines Sur' },
  { value: '067', label: '067 – Legazpi City, Albay' },
  { value: '068', label: '068 – Sorsogon City' },
  { value: '069', label: '069 – Virac, Catanduanes' },
  { value: '070', label: '070 – Masbate City' },
  { value: '071', label: '071 – Kalibo, Aklan' },
  { value: '072', label: '072 – Roxas City, Capiz' },
  { value: '073', label: '073 – San Jose, Antique' },
  { value: '074', label: '074 – Iloilo City, South Iloilo & Guimaras' },
  { value: '075', label: '075 – Zarraga, North Iloilo' },
  { value: '076', label: '076 – Victorias City, North Negros Occidental' },
  { value: '077', label: '077 – Bacolod City, Central Negros Occidental' },
  { value: '078', label: '078 – Binalbagan, South Negros Occidental' },
  { value: '079', label: '079 – Dumaguete City, Negros Oriental & Siquijor' },
  { value: '080', label: '080 – Mandaue City, North Cebu' },
  { value: '081', label: '081 – Cebu City North' },
  { value: '082', label: '082 – Cebu City South' },
  { value: '083', label: '083 – Talisay City, South Cebu' },
  { value: '084', label: '084 – Tagbilaran City, Bohol' },
  { value: '085', label: '085 – Catarman, Northern Samar' },
  { value: '086', label: '086 – Borongan City, Eastern Samar' },
  { value: '087', label: '087 – Calbayog City, Samar' },
  { value: '088', label: '088 – Tacloban City, Eastern Leyte & Biliran' },
  { value: '089', label: '089 – Ormoc City, Western Leyte' },
  { value: '090', label: '090 – Maasin City, Southern Leyte' },
  { value: '091', label: '091 – Dipolog City, Zamboanga del Norte' },
  { value: '092', label: '092 – Pagadian City, Zamboanga del Sur' },
  { value: '093A', label: '093A – Zamboanga City' },
  { value: '093B', label: '093B – Ipil, Zamboanga Sibugay' },
  { value: '094', label: '094 – Isabela City, Basilan' },
  { value: '095', label: '095 – Jolo, Sulu' },
  { value: '096', label: '096 – Bongao, Tawi-Tawi' },
  { value: '097', label: '097 – Gingoog City, East Misamis Oriental & Camiguin' },
  { value: '098', label: '098 – Cagayan de Oro City, West Misamis Oriental' },
  { value: '099', label: '099 – Malaybalay, Bukidnon' },
  { value: '100', label: '100 – Ozamiz City, Misamis Occidental' },
  { value: '101', label: '101 – Iligan City, Lanao del Norte' },
  { value: '102', label: '102 – Marawi City, Lanao del Sur' },
  { value: '103', label: '103 – Butuan City, Agusan del Norte' },
  { value: '104', label: '104 – Bayugan City, Agusan del Sur' },
  { value: '105', label: '105 – Surigao City, Surigao del Norte & Dinagat Islands' },
  { value: '106', label: '106 – Tandag City, Surigao del Sur' },
  { value: '107', label: '107 – Cotabato City, Maguindanao' },
  { value: '108', label: '108 – Kidapawan City, North Cotabato' },
  { value: '109', label: '109 – Tacurong City, Sultan Kudarat' },
  { value: '110', label: '110 – General Santos City, South Cotabato & Sarangani' },
  { value: '111', label: '111 – Koronadal City, South Cotabato' },
  { value: '112', label: '112 – Tagum City, Davao del Norte & Davao de Oro' },
  { value: '113A', label: '113A – West Davao City' },
  { value: '113B', label: '113B – East Davao City' },
  { value: '114', label: '114 – Mati City, Davao Oriental' },
  { value: '115', label: '115 – Digos City, Davao del Sur & Davao Occidental' },
];


/**
 * BIR corporation type — relevant for withholding rates on FDAP income (dividends,
 * interest, royalties). Non-resident foreign is covered by the nonResident flag.
 */
export const CORPORATION_TYPES = ['Domestic', 'Resident foreign', 'Non-resident foreign'] as const;
export type CorporationType = (typeof CORPORATION_TYPES)[number];

/** Legal grounds for a customer's VAT exemption under Philippine law. */
export const EXEMPTION_BASES = [
  'RA 9520 — Cooperative Code',
  'Sec. 109 NIRC — BIR tax exemption ruling',
  'DepEd / CHED / TESDA — Educational institution',
  'SEC registration — Non-stock non-profit / Religious / Charitable',
  'DFA certificate — Diplomatic mission',
  'RA 9994 / RA 10754 — Senior citizen / PWD',
] as const;
export type ExemptionBasis = (typeof EXEMPTION_BASES)[number];

/** Income types relevant for tax treaty withholding rate lookups. */
export const TREATY_INCOME_TYPES = ['Dividends', 'Interest', 'Royalties', 'Technical fees'] as const;
export type TreatyIncomeType = (typeof TREATY_INCOME_TYPES)[number];

/**
 * Standard treaty withholding rates (%) by country and income type.
 * Source: BIR-published treaty summaries. Verify against the actual treaty text
 * before filing — some rates have additional conditions (ownership %, industry, etc.).
 * A rate of 0 means the treaty does not specify a reduced rate for that income type
 * (domestic rate applies).
 */
export const TREATY_RATES: Record<string, Record<TreatyIncomeType, number>> = {
  'Australia':            { Dividends: 15, Interest: 15, Royalties: 25, 'Technical fees': 25 },
  'Austria':              { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 10 },
  'Bahrain':              { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 10 },
  'Bangladesh':           { Dividends: 10, Interest: 15, Royalties: 10, 'Technical fees': 10 },
  'Belgium':              { Dividends: 10, Interest: 10, Royalties: 15, 'Technical fees': 0  },
  'Brazil':               { Dividends: 15, Interest: 15, Royalties: 15, 'Technical fees': 15 },
  'Canada':               { Dividends: 15, Interest: 15, Royalties: 10, 'Technical fees': 0  },
  'China':                { Dividends: 10, Interest: 10, Royalties: 15, 'Technical fees': 0  },
  'Czech Republic':       { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'Denmark':              { Dividends: 15, Interest: 10, Royalties: 15, 'Technical fees': 0  },
  'Finland':              { Dividends: 15, Interest: 15, Royalties: 15, 'Technical fees': 0  },
  'France':               { Dividends: 15, Interest: 15, Royalties: 15, 'Technical fees': 0  },
  'Germany':              { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 10 },
  'Hungary':              { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'India':                { Dividends: 15, Interest: 15, Royalties: 15, 'Technical fees': 15 },
  'Indonesia':            { Dividends: 15, Interest: 15, Royalties: 15, 'Technical fees': 0  },
  'Israel':               { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'Italy':                { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'Japan':                { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'Kuwait':               { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'Malaysia':             { Dividends: 15, Interest: 15, Royalties: 25, 'Technical fees': 0  },
  'Netherlands':          { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'New Zealand':          { Dividends: 15, Interest: 10, Royalties: 15, 'Technical fees': 0  },
  'Nigeria':              { Dividends: 12.5, Interest: 12.5, Royalties: 12.5, 'Technical fees': 0 },
  'Norway':               { Dividends: 15, Interest: 15, Royalties: 25, 'Technical fees': 0  },
  'Pakistan':             { Dividends: 15, Interest: 15, Royalties: 15, 'Technical fees': 0  },
  'Poland':               { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'Qatar':                { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 10 },
  'Romania':              { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'Russia':               { Dividends: 10, Interest: 10, Royalties: 15, 'Technical fees': 0  },
  'Singapore':            { Dividends: 15, Interest: 15, Royalties: 15, 'Technical fees': 0  },
  'South Korea':          { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'Spain':                { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'Sri Lanka':            { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'Sweden':               { Dividends: 15, Interest: 15, Royalties: 15, 'Technical fees': 0  },
  'Switzerland':          { Dividends: 15, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'Thailand':             { Dividends: 15, Interest: 15, Royalties: 15, 'Technical fees': 0  },
  'Turkey':               { Dividends: 15, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'United Arab Emirates': { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
  'United Kingdom':       { Dividends: 15, Interest: 10, Royalties: 15, 'Technical fees': 0  },
  'United States':        { Dividends: 20, Interest: 15, Royalties: 15, 'Technical fees': 0  },
  'Vietnam':              { Dividends: 10, Interest: 15, Royalties: 10, 'Technical fees': 0  },
  'Zimbabwe':             { Dividends: 10, Interest: 10, Royalties: 10, 'Technical fees': 0  },
};

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
  /**
   * Registered export enterprise (PEZA, BOI or another investment promotion agency). Only then may
   * suppliers zero-rate sales to the company (NIRC Secs. 106(A)(2), 108(B); RA 12066).
   */
  exportEnterprise: boolean;
  /**
   * NGA, LGU, GOCC or other government entity. Government entities withhold 5% creditable VAT
   * (WV010/WV020) from all VAT-registered suppliers, 3% percentage tax (WB080) from non-VAT
   * suppliers, and use government-specific EWT ATCs (WI640/WI157 for goods/services instead of
   * WI158/WI160). They withhold on all purchases, not just as top withholding agents.
   */
  governmentEntity: boolean;
}

export const SEED_COMPANY_TAX: CompanyTaxProfile[] = [
  {
    id: 'company',
    registeredName: 'Sikat Tech Inc.',
    tin: '',
    rdoCode: '',
    vatRegistered: true,
    topWithholdingAgent: true,
    exportEnterprise: false,
    governmentEntity: false,
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
  glAccount: toAccountCode(glAccount), birReturn, legalBasis, active: true, notes,
});

/*
 * Codes are BIR's own. VAT has no ATCs: BIR Form 2550Q (April 2024) identifies each kind
 * of sale and purchase by its line number in Part IV, so the code is that line number and
 * the name is the line's label. Percentage tax uses its ATC from BIR Form 2551Q.
 * Notes quote BIR's Value-Added Tax page and the 2550Q guidelines.
 */
export const SEED_TAX_CODES: TaxCode[] = [
  // Sales — 2550Q Part IV, "Total Sales and Output Tax"
  tc('31', 'VATable Sales', 'Sales', 'Standard', 12, '2310 Output VAT Payable', '2550Q', 'NIRC Secs. 106, 108',
    '2550Q guidelines: "On Sale of Goods or Properties – twelve percent (12%) of the gross sales of the goods or properties sold, bartered or exchanged" and '
    + '"On Sale of Services and Use or Lease of Properties – twelve percent (12%) of gross sales derived from the sale or exchange of services, including the use or lease of properties". '
    + 'Sales to government are VATable too: the buyer withholds 5% creditable VAT, claimed on 2550Q item 16 (Creditable VAT Withheld).'),
  tc('32', 'Zero-Rated Sales', 'Sales', 'Zero-rated', 0, '2310 Output VAT Payable', '2550Q', 'NIRC Secs. 106(A)(2), 108(B)',
    'BIR: "It is a taxable transaction for VAT purposes, but shall not result in any output tax." The invoice must show "ZERO-RATED SALE".'),
  tc('33', 'Exempt Sales', 'Sales', 'Exempt', 0, '— None —', '2550Q', 'NIRC Sec. 109',
    'BIR: a sale "which is not subject to output tax and whereby the buyer is not allowed any tax credit or input tax related to such exempt sale". The invoice must show "VAT-EXEMPT SALE".'),
  tc('PT010', 'Persons exempt from VAT under Sec. 109(BB) (Sec. 116)', 'Sales', 'Percentage tax',
    [{ from: '2018-01-01', rate: 3 }, { from: '2020-07-01', rate: 1 }, { from: '2023-07-01', rate: 3 }],
    '2320 Percentage Tax Payable', '2551Q', 'NIRC Sec. 116 as amended by TRAIN and CREATE (RA 11534)',
    'ATC from BIR Form 2551Q. For sellers whose gross annual sales do not exceed Three Million Pesos (Php 3,000,000.00). CREATE cut the rate to 1% from 1 Jul 2020 to 30 Jun 2023.'),
  // Purchases — 2550Q Part IV, "Current Transactions"
  tc('44', 'Domestic Purchases', 'Purchase', 'Standard', 12, '1410 Input VAT', '2550Q', 'NIRC Sec. 110',
    'Goods, services, lease and capital goods bought locally from VAT-registered suppliers. 2550Q guidelines: input tax is "the value-added tax due from or paid by a VAT-registered person '
    + 'in the course of his trade or business on importation of goods, or local purchase of goods or services, including lease or use of property, from a VAT-registered person".'),
  tc('45', 'Services Rendered by Non-Residents', 'Purchase', 'Reverse charge', 12, '1410 Input VAT', '2550Q / 1600-VT', 'NIRC Sec. 114(C); RA 12023 (digital services)',
    'You withhold the 12% VAT and remit it on 1600-VT (ATC WV050 / WV070), then claim it as input tax. BIR: buyers "shall withhold twelve percent (12%) VAT" on '
    + '"Lease or use of properties or property rights owned by non-residents" and "Other services rendered in the Philippines by non-residents".'),
  tc('46', 'Importations', 'Purchase', 'Importation', 12, '1420 Input VAT – Importation', '2550Q', 'NIRC Sec. 107',
    '2550Q guidelines: "twelve percent (12%) based on the total value used by the Bureau of Customs in determining tariff and customs duties, plus customs duties, excise taxes, if any, and other charges". '
    + 'Entered on the import entry / landed cost, not the foreign supplier’s bill.'),
  tc('48', 'Domestic Purchases with No Input Tax', 'Purchase', 'Non-VAT', 0, '— None —', '2550Q', 'NIRC Sec. 110',
    'Purchases from non-VAT suppliers, and VAT-exempt or zero-rated purchases: no input tax to claim.'),
  tc('49', 'VAT-Exempt Importations', 'Purchase', 'Exempt', 0, '— None —', '2550Q', 'NIRC Sec. 109',
    'Importations exempt under Sec. 109 (e.g. agricultural and marine food products in their original state, books). Entered on the import entry.'),
];

const tg = (code: string, name: string, direction: TaxDirection, taxCode: string, zeroRated = false): TaxGroup => ({
  id: `tg-${code}`, code, name, direction, taxCode, zeroRated, active: true,
});

export const SEED_TAX_GROUPS: TaxGroup[] = [
  tg('S-VAT12', 'VAT 12% – output', 'Sales', '31'),
  tg('S-VATX', 'VAT-exempt goods or services', 'Sales', '33'),
  tg('S-VAT0', 'Zero-rated goods or services', 'Sales', '32', true),
  tg('P-VAT12', 'VAT 12% – input (goods)', 'Purchase', '44'),
  tg('P-VAT12S', 'VAT 12% – input (services)', 'Purchase', '44'),
  tg('P-VAT12C', 'VAT 12% – input (capital goods)', 'Purchase', '44'),
  tg('P-VATX', 'VAT-exempt purchase', 'Purchase', '48'),
  tg('P-VAT0', 'Zero-rated purchase', 'Purchase', '48', true),
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
    ['WI011', 'Individual', 10, 'if gross income is more than ₱ 3M or VAT registered regardless of amount'],
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
    tiers('WI150', 'WI151', 'WC150', 'WC151'),
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
    ['WI202', 'Individual', 10],
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

const wg = (
  code: string, name: string,
  atcIndividual: string | null, atcIndividualHigh: string | null,
  atcCorporate: string | null, atcCorporateHigh: string | null,
  opts: {
    requiresTopWA?: boolean; nrExempt?: boolean;
    atcNrIndividual?: string | null; atcNrCorporate?: string | null;
    atcIndividualGov?: string | null; atcCorporateGov?: string | null;
    notes?: string;
  } = {},
): WithholdingGroup => ({
  id: `wg-${code.toLowerCase()}`,
  code, name,
  atcIndividual, atcIndividualHigh,
  atcCorporate, atcCorporateHigh,
  requiresTopWA: opts.requiresTopWA ?? false,
  nrExempt: opts.nrExempt ?? false,
  atcNrIndividual: opts.atcNrIndividual ?? null,
  atcNrCorporate: opts.atcNrCorporate ?? null,
  atcIndividualGov: opts.atcIndividualGov ?? null,
  atcCorporateGov: opts.atcCorporateGov ?? null,
  active: true,
  notes: opts.notes ?? '',
});

/**
 * Tax code identifiers used directly in determination logic.
 * These are the BIR line numbers (2550Q) and ATCs (2551Q) that the rules
 * hard-wire; any change here must be matched in the seed data above.
 */
export const SYSTEM_TAX_CODES = {
  // Sales
  VATABLE:            '31',   // VATable Sales — 12%
  ZERO_RATED:         '32',   // Zero-Rated Sales
  EXEMPT:             '33',   // Exempt Sales
  PERCENTAGE_TAX:     'PT010',// Non-VAT seller: percentage tax
  // Purchases
  DOMESTIC:           '44',   // Domestic Purchases — 12% input
  NR_SERVICES:        '45',   // Services from non-residents — reverse charge
  IMPORTATION:        '46',   // Importations — 12% import VAT via BoC
  NO_INPUT_TAX:       '48',   // Non-VAT or exempt purchases
  EXEMPT_IMPORTATION: '49',   // VAT-exempt importations
} as const;

/**
 * Withholding tax ATCs used directly in determination logic (system-level rules,
 * not configurable through withholding groups). Changes here must be matched in
 * the seed data above.
 */
export const SYSTEM_ATCS = {
  // Non-resident digital services: 12% VAT withheld by the buyer
  NR_VAT_GOV:        'WV060', // Government withholding agent
  NR_VAT_PRIVATE:    'WV070', // Private withholding agent
  // Government money payment taxes (GMP) on resident supplier purchases
  GMP_VAT_GOODS:     'WV010', // 5% creditable VAT on goods (Form 1600-VT)
  GMP_VAT_SERVICES:  'WV020', // 5% creditable VAT on services (Form 1600-VT)
  GMP_PT:            'WB080', // 3% percentage tax on non-VAT suppliers (Form 1600-PT)
  // Non-resident final tax catch-alls (used when the group has no specific NR ATC)
  NR_INDIVIDUAL:     'WI330', // NRANETB: 25% final tax
  NR_CORPORATE:      'WC230', // NRFC: 25% final tax on other payments
  // GPP partner distributions
  GPP_LOW:           'WI152', // Gross income ≤ ₱720,000
  GPP_HIGH:          'WI153', // Gross income > ₱720,000
} as const;

export const SEED_WITHHOLDING_GROUPS: WithholdingGroup[] = [
  wg('WH-NONE', 'Not subject to withholding', null, null, null, null),
  // Government entities use WI640/WC640 (1%) and WI157/WC157 (2%) on all purchases; private top WAs use WI158/WC158 and WI160/WC160.
  wg('WH-GDS',  'Goods (general)',             'WI158', null, 'WC158', null, { requiresTopWA: true, nrExempt: true, atcIndividualGov: 'WI640', atcCorporateGov: 'WC640' }),
  wg('WH-SVC',  'Services (general)',           'WI160', null, 'WC160', null, { requiresTopWA: true, atcIndividualGov: 'WI157', atcCorporateGov: 'WC157' }),
  wg('WH-RENT', 'Rent / property lease',        'WI100', null, 'WC100', null),
  wg('WH-CONT', 'Contractor',                   'WI120', null, 'WC120', null),
  wg('WH-PROF', 'Professional fees',            'WI010', 'WI011', 'WC010', 'WC011'),
  wg('WH-ROY',  'Royalties',                    'WI250', null, 'WC250', null),
  wg('WH-INT',  'Interest on debt instruments', 'WI710', null, 'WC710', null, { atcNrCorporate: 'WC180' }),
  wg('WH-PRIZE','Prizes',                       'WI260', null, null,    null),
  wg('WH-AGRI', 'Agricultural products',        'WI610', null, 'WC610', null, { nrExempt: true, notes: 'Applies on cumulative payments exceeding ₱300,000 within the same taxable year.' }),
  wg('WH-MIN',  'Minerals / quarry resources',  'WI630', null, 'WC630', null, { nrExempt: true }),
  wg('WH-COMM', 'Commissions — brokers / real estate agents', 'WI139', 'WI140', 'WC139', 'WC140'),
  wg('WH-SCOMM','Sales commissions — independent agents',     'WI515', 'WI516', null,    null),
  wg('WH-FILM', 'Cinematographic film rentals', 'WI110', null, 'WC110', null),
  wg('WH-VESSEL','Vessel / ship lease',         'WI100', null, 'WC100', null, { atcNrCorporate: 'WC290' }),
  wg('WH-EQUIP','Aircraft / machinery / equipment lease', 'WI100', null, 'WC100', null, { atcNrCorporate: 'WC300' }),
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
