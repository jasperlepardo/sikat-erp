/**
 * Withholding tax on compensation, de minimis benefits and withholding tax forms —
 * as published on the BIR Withholding Tax page (bir.gov.ph). Text is verbatim; the
 * numbers used for calculation are parsed from that text so the two can't drift.
 */

export type PayFrequency = 'Daily' | 'Weekly' | 'Semi-monthly' | 'Monthly' | 'Annual';
export const PAY_FREQUENCIES: PayFrequency[] = ['Daily', 'Weekly', 'Semi-monthly', 'Monthly', 'Annual'];

/** One bracket of the withholding tax table (or the annual tax table). */
export interface CompensationBracket {
  id: string;
  frequency: PayFrequency;
  effectiveFrom: string;
  /** '' = and onwards. */
  effectiveTo: string;
  /** Bracket number, 1–6. */
  bracket: number;
  /** BIR's "Compensation Range", verbatim. */
  rangeText: string;
  /** BIR's "Prescribed Withholding Tax", verbatim. */
  taxText: string;
  /** Parsed: the bracket starts at this compensation. */
  min: number;
  /** Parsed: fixed tax for the bracket. */
  base: number;
  /** Parsed: % on the excess over `over`. */
  rate: number;
  over: number;
  active: boolean;
}

const amount = (s: string) => Number(s.replace(/[₱,\s]/g, ''));

/** "₱685 - ₱1,095" / "₱21,918 and above" / "Over ₱ 250,000.00 but not over …" → where the bracket starts. */
export function parseRangeStart(text: string) {
  if (/and below|^Not over/i.test(text)) return 0;
  const m = /₱\s?([\d,.]+)/.exec(text);
  return m ? amount(m[1]) : 0;
}

/** "₱82.19 +25% over ₱1,096" / "₱ 30,000.00 + 25% of the excess over ₱ 400,000.00" / "0%" → base, rate, over. */
export function parseTax(text: string) {
  const rate = /([\d.]+)%/.exec(text);
  if (!rate || Number(rate[1]) === 0) return { base: 0, rate: 0, over: 0 };
  const over = /over ₱\s?([\d,.]+)/.exec(text);
  const base = /^(?:₱\s?)?([\d,.]+)\s?\+/.exec(text.trim());
  return { base: base ? amount(base[1]) : 0, rate: Number(rate[1]), over: over ? amount(over[1]) : 0 };
}

const table = (frequency: PayFrequency, effectiveFrom: string, effectiveTo: string, rows: [string, string][]) =>
  rows.map(([rangeText, taxText], i): CompensationBracket => ({
    id: `ct-${frequency.toLowerCase()}-${effectiveFrom.slice(0, 4)}-${i + 1}`,
    frequency,
    effectiveFrom,
    effectiveTo,
    bracket: i + 1,
    rangeText,
    taxText,
    min: parseRangeStart(rangeText),
    ...parseTax(taxText),
    active: true,
  }));

const TRAIN_1 = ['2018-01-01', '2022-12-31'] as const; // Effective January 1, 2018 to December 31, 2022
const TRAIN_2 = ['2023-01-01', ''] as const; // Effective January 1, 2023 and onwards

export const SEED_COMPENSATION_TAX: CompensationBracket[] = [
  // REVISED WITHHOLDING TAX TABLE — Effective January 1, 2018 to December 31, 2022
  ...table('Daily', ...TRAIN_1, [
    ['₱685 and below', '0.00'],
    ['₱685 - ₱1,095', '0.00 +20% over ₱685'],
    ['₱1,096 - ₱2,191', '₱82.19 +25% over ₱1,096'],
    ['₱2,192 - ₱5,478', '₱356.16 +30% over ₱2,192'],
    ['₱5,479 - ₱21,917', '₱1,342.47 +32% over ₱5,479'],
    ['₱21,918 and above', '₱6,602.74 +35% over ₱21,918'],
  ]),
  ...table('Weekly', ...TRAIN_1, [
    ['₱4,808 and below', '0.00'],
    ['₱4,808 - ₱7,691', '0.00 +20% over ₱4,808'],
    ['₱7,692 - ₱15,384', '₱576.92 +25% over ₱7,692'],
    ['₱15,385 - ₱38,461', '₱2,500.00 +30% over ₱15,385'],
    ['₱38,462 - ₱153,845', '₱9,423.08 +32% over ₱38,462'],
    ['₱153,846 and above', '₱46,346.15 +35% over ₱153,846'],
  ]),
  ...table('Semi-monthly', ...TRAIN_1, [
    ['₱10,417 and below', '0.00'],
    ['₱10,417 - ₱16,666', '0.00 +20% over ₱10,417'],
    ['₱16,667 - ₱33,332', '₱1,250.00 +25% over ₱16,667'],
    ['₱33,333 - ₱83,332', '₱5,416.67 +30% over ₱33,333'],
    ['₱83,333 - ₱333,332', '₱20,416.67 +32% over ₱83,333'],
    ['₱333,333 and above', '₱100,416.67 +35% over ₱333,333'],
  ]),
  ...table('Monthly', ...TRAIN_1, [
    ['₱20,833 and below', '0.00'],
    ['₱20,833 - ₱33,332', '0.00 +20% over ₱20,833'],
    ['₱33,333 - ₱66,666', '₱2,500.00 +25% over ₱33,333'],
    ['₱66,667 - ₱166,666', '₱10,833.33 +30% over ₱66,667'],
    ['₱166,667 - ₱666,666', '₱40,833.33 +32% over ₱166,667'],
    ['₱666,667 and above', '₱200,833.33 +35% over ₱666,667'],
  ]),

  // REVISED WITHHOLDING TAX TABLE — Effective January 1, 2023 and onwards
  ...table('Daily', ...TRAIN_2, [
    ['₱685 and below', '0.00'],
    ['₱685 -₱1,095', '0.00 +15% over ₱685'],
    ['₱1,096 - ₱2,191', '₱61.65 +20% over ₱1,096'],
    ['₱2,192 - ₱5,478', '₱280.85 +25% over ₱2,192'],
    ['₱5,479 - ₱21,917', '₱1,102.60 +30% over ₱5,479'],
    ['₱21,918 and above', '₱6,034.30 +35% over ₱21,918'],
  ]),
  ...table('Weekly', ...TRAIN_2, [
    ['₱4,808 and below', '0.00'],
    ['₱4,808 - ₱7,691', '0.00 +15% over ₱4,808'],
    ['₱7,692 - ₱15,384', '₱432.60 +20% over ₱7,692'],
    ['₱15,385 - ₱38,461', '₱1,971.20 +25% over ₱15,385'],
    ['₱38,462 - ₱153,845', '₱7,740.45 +30% over ₱38,462'],
    ['₱153,846 and above', '₱42,355.65 +35% over ₱153,846'],
  ]),
  ...table('Semi-monthly', ...TRAIN_2, [
    ['₱10,417 and below', '0.00'],
    ['₱10,417 - ₱16,666', '0.00 +15% over ₱10,417'],
    ['₱16,667 - ₱33,332', '₱937.50 +20% over ₱16,667'],
    ['₱33,333 - ₱83,332', '₱4,270.70 +25% over ₱33,333'],
    ['₱83,333 - ₱333,332', '₱16,770.70 +30% over ₱83,333'],
    ['₱333,333 and above', '₱91,770.70 +35% over ₱333,333'],
  ]),
  ...table('Monthly', ...TRAIN_2, [
    ['₱20,833 and below', '0.00'],
    ['₱20,833 - ₱33,332', '0.00 +15% over ₱20,833'],
    ['₱33,333 - ₱66,666', '₱1,875.00 +20% over ₱33,333'],
    ['₱66,667 - ₱166,666', '₱8,541.80 +25% over ₱66,667'],
    ['₱166,667 - ₱666,666', '₱33,541.80 +30% over ₱166,667'],
    ['₱666,667 and above', '₱183,541.80 +35% over ₱666,667'],
  ]),

  // ANNUAL TAX TABLE — EFFECTIVE DATE JANUARY 1, 2018 to DECEMBER 31, 2022
  ...table('Annual', ...TRAIN_1, [
    ['Not over ₱ 250,000.00', '0%'],
    ['Over ₱ 250,000.00 but not over ₱ 400,000.00', '20% of the excess over ₱ 250,000.00'],
    ['Over ₱ 400,000.00 but not over ₱ 800,000.00', '₱ 30,000.00 + 25% of the excess over ₱ 400,000.00'],
    ['Over ₱ 800,000.00 but not over ₱ 2,000,000.00', '₱ 130,000.00 + 30% of the excess over ₱ 800,000.00'],
    ['Over ₱ 2,000,000.00 but not over ₱ 8,000,000.00', '₱ 490,000.00 + 32% of the excess over ₱ 2,000,000.00'],
    ['Over ₱ 8,000,000.00', '₱ 2,410,000.00 + 35% of the excess over ₱ 8,000,000.00'],
  ]),
  // ANNUAL TAX TABLE — EFFECTIVE DATE JANUARY 1, 2023
  ...table('Annual', ...TRAIN_2, [
    ['Not over ₱ 250,000.00', '0%'],
    ['Over ₱ 250,000.00 but not over ₱ 400,000.00', '15% of the excess over ₱ 250,000.00'],
    ['Over ₱ 400,000.00 but not over ₱ 800,000.00', '₱ 22,500.00 + 20% of the excess over ₱ 400,000.00'],
    ['Over ₱ 800,000.00 but not over ₱ 2,000,000.00', '₱ 102,500.00 + 25% of the excess over ₱ 800,000.00'],
    ['Over ₱ 2,000,000.00 but not over ₱ 8,000,000.00', '₱ 402,500.00 + 30% of the excess over ₱ 2,000,000.00'],
    ['Over ₱ 8,000,000.00', '₱ 2,202,500.00 + 35% of the excess over ₱ 8,000,000.00'],
  ]),
];

/**
 * Tax on compensation for one pay period (or a year, with 'Annual'), from the table in
 * force on `date`: fixed tax + rate × (compensation − "over"). The last bracket whose
 * range starts at or below the compensation applies.
 */
export function compensationTax(rows: CompensationBracket[], compensation: number, frequency: PayFrequency, date: string) {
  const bracket = rows
    .filter((r) => r.active && r.frequency === frequency && r.effectiveFrom <= date && (!r.effectiveTo || date <= r.effectiveTo))
    .sort((a, b) => a.min - b.min)
    .filter((r) => r.min <= compensation)
    .at(-1);
  if (!bracket) return undefined;
  const tax = bracket.base + (bracket.rate / 100) * Math.max(0, compensation - bracket.over);
  return { bracket, tax: Math.round(tax * 100) / 100 };
}

/**
 * The three "Less: Non-Taxable/Exempt Compensation Income" lines of BIR's annualized
 * withholding tax formula. Every exclusion is deducted on one of them.
 */
export type ExclusionLine = '13th month pay and other benefits' | 'SSS, GSIS, PHIC, HDMF and union dues' | 'Other non-taxable';
export const EXCLUSION_LINES: ExclusionLine[] = ['13th month pay and other benefits', 'SSS, GSIS, PHIC, HDMF and union dues', 'Other non-taxable'];

export type ExclusionKind = 'Exemption / exclusion' | 'Minimum wage earner';
export const EXCLUSION_KINDS: ExclusionKind[] = ['Exemption / exclusion', 'Minimum wage earner'];

/** EXEMPTIONS AND EXCLUSIONS FROM GROSS INCOME and the MINIMUM WAGE EARNERS rule, verbatim. */
export interface CompensationExclusion {
  id: string;
  description: string;
  kind: ExclusionKind;
  line: ExclusionLine;
  /** Most that is excluded per year; 0 = no limit. */
  annualCap: number;
  active: boolean;
}

const exclusion = (n: number, description: string, line: ExclusionLine = 'Other non-taxable', annualCap = 0, kind: ExclusionKind = 'Exemption / exclusion'): CompensationExclusion => ({
  id: `cx-${String(n).padStart(2, '0')}`,
  description,
  kind,
  line,
  annualCap,
  active: true,
});
const mwe = (n: number, description: string) => exclusion(n, description, 'Other non-taxable', 0, 'Minimum wage earner');

export const SEED_EXCLUSIONS: CompensationExclusion[] = [
  exclusion(1, 'Remuneration received as an incident of employment (RA 7641; those with approved reasonable private retirement plan; Social Security Act of 1954, as amended; GSIS Act of 1937, as amended; and etc.'),
  exclusion(2, 'Remuneration paid for agricultural labor;'),
  exclusion(3, 'Remuneration for domestic services;'),
  exclusion(4, "Remuneration for casual labor not in the course of an employer's trade or business;"),
  exclusion(5, 'Compensation for services by a citizen or a resident of the Philippines for a foreign government or international organization;'),
  exclusion(6, 'Damages (Actual, moral, exemplary and nominal);'),
  exclusion(7, 'Life insurance;'),
  exclusion(8, 'Amounts received by the insured as a return of premium;'),
  exclusion(9, 'Compensation for injuries or sickness;'),
  exclusion(10, 'Income exempt under treaty'),
  // The annualized formula caps this line: "1. 13th month pay and other benefits ₱ 90,000.00".
  exclusion(11, '13th Month pay and other benefits', '13th month pay and other benefits', 90000),
  exclusion(12, "GSIS, SSS, Medicare and other contributions (employee's share only)", 'SSS, GSIS, PHIC, HDMF and union dues'),
  exclusion(13, 'Compensation income of minimum wage earners (MWEs) who work in the private sector and being paid the Statutory Minimum Wage (SMW), as fixed by the Regional Tripartite Wage and Productivity Board (RTWPB)/National Wages Productivity Commission (NWPC), applicable to the place where he/she is assigned;'),
  exclusion(14, 'Compensation income of employees in the public sector with compensation income of not more the the SMW in the non-agricultural sector as fixed by the RTWPB?NWPC applicable to the place where he/she is assigned.'),
  exclusion(15, 'De Minimis benefits'),
  exclusion(16, 'Fringe benefits given to employees other than rank and file and subjected to Fringe Benefit Tax (FBT);'),
  exclusion(17, 'Personnel Economic Relief Allowance (PERA) given to government employees; and Representation and transportation allowance (RATA granted to public officers and employees under the General Appropriations Act.'),
  // MINIMUM WAGE EARNERS: "No withholding tax shall be required on the Statutory Minimum Wage (SMW) … including:"
  mwe(18, 'Statutory Minimum Wage (SMW)'),
  mwe(19, 'Holiday pay'),
  mwe(20, 'Overtime pay'),
  mwe(21, 'Night shift differential'),
  mwe(22, 'Hazard pay'),
];

/** A pay period's compensation, split the way the minimum wage earner rule needs it. */
export interface PeriodPay {
  /** Basic pay — the statutory minimum wage for a minimum wage earner. */
  basic: number;
  holiday: number;
  overtime: number;
  nightShift: number;
  hazard: number;
  /** Everything else taxable (commissions, taxable allowances…), after exclusions. */
  other: number;
}

/**
 * Taxable compensation for a pay period. A minimum wage earner's SMW, holiday pay,
 * overtime pay, night shift differential and hazard pay are exempt (RR 2-98 as amended
 * by RR 11-2018); anything else they earn is taxed like anyone else's.
 */
export function taxablePay(pay: PeriodPay, minimumWageEarner: boolean) {
  if (minimumWageEarner) return pay.other;
  return pay.basic + pay.holiday + pay.overtime + pay.nightShift + pay.hazard + pay.other;
}

/** Amounts for the ANNUALIZED WITHHOLDING TAX FORMULA. */
export interface YearEndInput {
  /** Gross Compensation Income (present + previous employer). */
  gross: number;
  /** 13th month pay and other benefits received. */
  benefits: number;
  /** SSS, GSIS, PHIC, HDMF and union dues (employee share). */
  contributions: number;
  /** Other non-taxable compensation: de minimis, a minimum wage earner's exempt pay, other exclusions. */
  otherNonTaxable: number;
  /** Tax withheld, January to November / termination date (present + previous employer). */
  withheld: number;
}

export type YearEndOutcome = 'Collect' | 'Refund' | 'Break even';

/**
 * Year-end adjustment: taxable compensation for the year, tax due on it from the
 * annual tax table in force on `date`, and what to collect or refund on the last payroll.
 * Exclusions on a capped line (13th month pay and other benefits: ₱90,000) count only
 * up to the cap; the excess stays taxable.
 */
export function yearEndAdjustment(brackets: CompensationBracket[], exclusions: CompensationExclusion[], input: YearEndInput, date: string) {
  const caps = exclusions.filter((x) => x.active && x.line === '13th month pay and other benefits' && x.annualCap > 0).map((x) => x.annualCap);
  const benefitsCap = caps.length ? Math.max(...caps) : Infinity;
  const benefitsExcluded = Math.min(input.benefits, benefitsCap);
  const nonTaxable = benefitsExcluded + input.contributions + input.otherNonTaxable;
  const taxable = Math.max(0, input.gross - nonTaxable);
  const due = compensationTax(brackets, taxable, 'Annual', date);
  if (!due) return undefined;
  const balance = Math.round((due.tax - input.withheld) * 100) / 100;
  const outcome: YearEndOutcome = balance > 0 ? 'Collect' : balance < 0 ? 'Refund' : 'Break even';
  return { benefitsCap, benefitsExcluded, nonTaxable, taxable, due, balance, outcome };
}

/** What BIR says to do with each outcome, verbatim. */
export const YEAR_END_OUTCOMES: Record<YearEndOutcome, string> = {
  Collect: 'Tax Due> tax withheld  - collect before payment of last salary',
  Refund: 'Tax Due< tax withheld -  refund on or before January 25th of the year/ last payment of salary',
  'Break even': 'Tax due = tax withheld    - no more withholding for December salary',
};

/** DE MINIMIS BENEFITS NOT SUBJECT TO WITHHOLDING TAX, verbatim. */
export interface DeMinimisBenefit {
  id: string;
  description: string;
  active: boolean;
}

export const SEED_DE_MINIMIS: DeMinimisBenefit[] = [
  'Monetized unused vacation leave credits to employees not exceeding twelve (12) days during the year;',
  'Monetized value of vacation and sick leave credits paid to government officials and employees;',
  'Medical cash allowance to dependents of employees, not exceeding ₱ 2,000.00 per employee per semester or ₱ 333.00 per month;',
  'Rice subsidy of ₱ 2,500.00 or one sack of 50kg rice per month amounting to not more than ₱ 2,500.00;',
  'Uniform and clothing allowance not exceeding ₱ 8,000.00 per annum;',
  'Actual medical assistance, e.g. medical allowance to cover medical and healthcare needs, annual medical/executive check-up, maternity assistance, and routine consultations, not exceeding ₱ 12,000.00 per annum;',
  'Laundry allowance not exceeding ₱ 400.00 per month;',
  'Employees achievement awards, e.g. for length of service or safety achievement, which in any form, whether in cash, gift certificate, or any tangible personal property, with an annual monetary value not exceeding ₱12,000.00 received by the employee under an established written plan which does not discriminate in favor of highly paid employees;',
  'Gifts given during Christmas and major anniversary celebrations not exceeding ₱6,000.00 per employee per annum;',
  'Daily meal allowance for overtime work, and night/graveyard shift not exceeding thirty percent (30%) of the basic minimum wage on a per region basis; and',
  'Benefits received by an employee by virtue of a collective bargaining agreement (CBA) and productivity incentive scheme provided that the total annual monetary value received from both CBA and productivity incentive schemes combined do not exceed twelve thousand pesos (Php 12,000.00) per employee per taxable year;',
].map((description, i) => ({ id: `dm-${String(i + 1).padStart(2, '0')}`, description, active: true }));

/** WITHHOLDING TAX FORMS with MODE OF FILING AND PAYMENT, verbatim. */
export type FormSection = 'REGISTRATION FORM' | 'PAYMENT FORM' | 'REMITTANCE FORM' | 'CERTIFICATES';
export const FORM_SECTIONS: FormSection[] = ['REGISTRATION FORM', 'PAYMENT FORM', 'REMITTANCE FORM', 'CERTIFICATES'];

export interface WithholdingForm {
  id: string;
  /** e.g. "BIR FORM NO. 1601-EQ". */
  form: string;
  description: string;
  section: FormSection;
  /** Due date when filed through eFPS. */
  dueEfps: string;
  /** Due date when filed manually / through eBIRForms. */
  dueManual: string;
  active: boolean;
}

const EFPS_SCHEDULE = 'Filing - see Schedule in RR 26-2002\nPayment - on or before the fiftenth (15th) day of the following month';
const TENTH = 'on or before the tenth (10th) day following the close of the month';
const QUARTER = 'last day of the month following the close of the quarter';

const form = (section: FormSection, form: string, description: string, dueEfps = '', dueManual = ''): WithholdingForm => ({
  id: `wf-${form.replace(/^BIR FORM NO\.?\s*/i, '').toLowerCase()}`,
  form,
  description,
  section,
  dueEfps,
  dueManual,
  active: true,
});

export const SEED_WITHHOLDING_FORMS: WithholdingForm[] = [
  form('REGISTRATION FORM', 'BIR FORM NO. 1901', 'Application for Registration for Self-Employed and Mixed Income Individuals, Estates and Trusts'),
  form('REGISTRATION FORM', 'BIR FORM NO. 1902', 'Application for Registration for Individuals Earning Purely Compensation Income and Non-Residnet Citizens/Resident Alien Employee'),
  form('REGISTRATION FORM', 'BIR FORM NO. 1903', 'Application for Registration for Corporations/Partnerships (Taxable/Non-Taxable), including GAIs and LGUs'),
  form('REGISTRATION FORM', 'BIR FORM NO. 1904', 'Application for Registration for One-time Taxpayer and Persons Registering under E.O. 98 (Securing a TIN to be able to transact with any government office)'),
  form('REGISTRATION FORM', 'BIR FORM NO. 1905', 'Application for Information Update'),
  form('PAYMENT FORM', 'BIR FORM NO. 0605', 'Payment form'),
  form('PAYMENT FORM', 'BIR FORM NO. 0619-E', 'Monthly Remittance Form of Creditable Income Taxes Withheld (Expanded)', EFPS_SCHEDULE, TENTH),
  form('PAYMENT FORM', 'BIR FORM NO. 0619-F', 'Monthly Remittance Form of Final Income Taxes Withheld', EFPS_SCHEDULE, TENTH),
  form('REMITTANCE FORM', 'BIR FORM NO. 1600-VT', 'Monthly Remittance Return of Value-Added Tax', TENTH, TENTH),
  form('REMITTANCE FORM', 'BIR FORM No. 1600-PT', 'Monthly Remittance Return of Percentage Tax', TENTH, TENTH),
  form('REMITTANCE FORM', 'BIR FORM NO. 1600WP', 'Remittance Return of Percentage Tax on Winnings and Prizes Withheld by Race Track Operators', TENTH, TENTH),
  form('REMITTANCE FORM', 'BIR FORM NO. 1601-C', 'Monthly Remittance Return of Income Taxes Withheld on Comnpensation', EFPS_SCHEDULE),
  form('REMITTANCE FORM', 'BIR FORM NO. 1601-EQ', 'Quarterly Remittance Return of Creditable Income Taxes withheld (Expanded)', QUARTER, QUARTER),
  form('REMITTANCE FORM', 'BIR FORM NO. 1601-FQ', 'Quarterly Remittance Return of Final Income Taxes Withheld', QUARTER, QUARTER),
  form('REMITTANCE FORM', 'BIR FORM NO. 1602-Q', 'Quarterly Remittance Return of Final Taxes Withheld on Interest Paid on Deposits and Deposits Substitutes/Trusts/Etc.', QUARTER, QUARTER),
  form('REMITTANCE FORM', 'BIR FORM NO. 1603-Q', 'Quarterly Remittance Return of Final Income Taxes Withheld on Fringe benefits Paid to Employees Other Than Rank and File', QUARTER, QUARTER),
  form('CERTIFICATES', 'BIR FORM NO. 2304', 'Certificate of Income Payment Not Subject to Withholding Tax (Excluding Compensation Income)'),
  form('CERTIFICATES', 'BIR FORM NO. 2306', 'Certificate of Final Tax Withheld at Source'),
  form('CERTIFICATES', 'BIR FORM NO. 2307', 'Certificate of Creditable Tax Withheld at Source'),
  form('CERTIFICATES', 'BIR FORM NO. 2316', 'Certificate of Compensation Payment/Tax Withheld'),
];

/** SCHEDULE OF STAGGERED FILING — Filing via eFPS, verbatim. */
export const EFPS_FILING_GROUPS = [
  'Group A - Fifteen (15) days following the end of the month',
  'Group B - Fourteen (14) days following the end of the month',
  'Group C - Thirteen (13) days following the end of the month',
  'Group D - Twelve (12) days following the end of the month',
  'Group E -  Eleven (11) days following the end of the month',
];
export const EFPS_FILING_NOTE =
  'Note: The staggered manner of filing is only allowed to taxpayers using the Electronic Filing and Payment System (EFPS) based on the industry classification groupings per RR No. 26-2002. However, the staggered filing of returns allowed for withholding agents/taxpayers enrolled in the EFPS facility of the Bureau shall not apply in the case of the NGAs per RR 1-2013.';
