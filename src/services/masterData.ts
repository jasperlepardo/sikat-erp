import { SEED_CURRENCIES, SEED_RATES, type Currency, type ExchangeRate } from '../mocks/currencies';
import {
  SEED_COMPANY_TAX,
  SEED_EXCISE,
  SEED_TAX_CODES,
  SEED_TAX_GROUPS,
  SEED_WITHHOLDING,
  SEED_WITHHOLDING_GROUPS,
  type CompanyTaxProfile,
  type ExciseCategory,
  type TaxCode,
  type TaxGroup,
  type WithholdingGroup,
  type WithholdingTax,
} from '../mocks/taxes';
import {
  SEED_COMPENSATION_TAX,
  SEED_DE_MINIMIS,
  SEED_EXCLUSIONS,
  SEED_WITHHOLDING_FORMS,
  type CompensationBracket,
  type CompensationExclusion,
  type DeMinimisBenefit,
  type WithholdingForm,
} from '../mocks/compensation';
import { SEED_ACCOUNTS, type Account } from '../mocks/chartOfAccounts';
import { createCollection } from './store';
import { todayISO } from './dates';

/** Settings › Accounting & Tax master data. */
// v2: tax codes gained rate history; tax groups map to a single code. v5/v4: codes are BIR's (2550Q line numbers, 2551Q ATC).
export const taxCodes = createCollection<TaxCode>('sikat-erp:tax-codes:v5', SEED_TAX_CODES, 'tc');
export const taxGroups = createCollection<TaxGroup>('sikat-erp:tax-groups:v5', SEED_TAX_GROUPS, 'tg');
export const companyTax = createCollection<CompanyTaxProfile>('sikat-erp:company-tax:v2', SEED_COMPANY_TAX, 'company');
/** Accounting › Chart of Accounts. */
export const accounts = createCollection<Account>('sikat-erp:accounts:v5', SEED_ACCOUNTS, 'acct');
export const compensationTax = createCollection<CompensationBracket>('sikat-erp:compensation-tax', SEED_COMPENSATION_TAX, 'ct');
export const compensationExclusions = createCollection<CompensationExclusion>('sikat-erp:compensation-exclusions', SEED_EXCLUSIONS, 'cx');
export const deMinimisBenefits = createCollection<DeMinimisBenefit>('sikat-erp:de-minimis', SEED_DE_MINIMIS, 'dm');
export const withholdingForms = createCollection<WithholdingForm>('sikat-erp:withholding-forms', SEED_WITHHOLDING_FORMS, 'wf');
export const withholdingTaxes = createCollection<WithholdingTax>('sikat-erp:withholding:v5', SEED_WITHHOLDING, 'wt');
export const withholdingGroups = createCollection<WithholdingGroup>('sikat-erp:withholding-groups:v2', SEED_WITHHOLDING_GROUPS, 'wg');
export const exciseCategories = createCollection<ExciseCategory>('sikat-erp:excise', SEED_EXCISE, 'ex');
export const currencies = createCollection<Currency>('sikat-erp:currencies', SEED_CURRENCIES, 'cur');
/** One record per day (v2 — v1 stored one record per currency per day). */
export const exchangeRates = createCollection<ExchangeRate>('sikat-erp:exchange-rates:v5', SEED_RATES, 'fx');

/**
 * The latest rate for `currency` on or before `date` (documents use the rate of
 * their posting date), with the day it comes from.
 */
export function rateOn(days: ExchangeRate[], currency: string, date = todayISO()) {
  const day = days
    .filter((d) => d.date <= date && d.rates[currency] > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return day ? { date: day.date, rate: day.rates[currency], source: day.source } : undefined;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * The bulletin date: the first of "05 October 2026", "October 5, 2026" or
 * "05-Oct-2026" in the text. The bulletin's own date comes first; later dates
 * (the PDS close, the LSEG source time, the run date) are ignored.
 */
function bulletinDate(text: string): string | undefined {
  const month = `(${MONTHS.map((m) => `${m.slice(0, 3)}(?:${m.slice(3)})?`).join('|')})`;
  const patterns: [RegExp, (m: RegExpExecArray) => [string, string, string]][] = [
    [new RegExp(`\\b(\\d{1,2})[\\s-]+${month}[\\s-]+(\\d{4})\\b`, 'i'), (m) => [m[3], m[2], m[1]]],
    [new RegExp(`\\b${month}\\.?\\s+(\\d{1,2}),?\\s*(\\d{4})\\b`, 'i'), (m) => [m[3], m[1], m[2]]],
  ];
  const found = patterns
    .map(([re, parts]) => {
      const m = re.exec(text);
      return m ? { at: m.index, parts: parts(m) } : undefined;
    })
    .filter((x) => x !== undefined)
    .sort((a, b) => a.at - b.at)[0];
  if (!found) return undefined;
  const [year, name, day] = found.parts;
  const mm = MONTHS.findIndex((m) => m.startsWith(name.toLowerCase().slice(0, 3))) + 1;
  return `${year}-${String(mm).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Parse a pasted BSP Reference Exchange Rate Bulletin. Each row reads
 * `No. COUNTRY UNIT SYMBOL EURO-EQ USD-EQ PESO-EQ`; the peso equivalent is the last
 * number after the ISO symbol. Rows quoted as "N/A" (e.g. Kuwaiti dinar) are listed
 * in `unavailable`. The bulletin date is picked up if present — see `bulletinDate`.
 */
export function parseBspBulletin(text: string, known: string[]) {
  const rates = new Map<string, number>();
  const unavailable: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/\b([A-Z]{3})\b/g)?.find((c) => known.includes(c));
    if (!match || match === 'PHP') continue;
    const at = new RegExp(`\\b${match}\\b`).exec(line)!.index;
    const after = line.slice(at + match.length).replace(/,/g, '');
    const numbers = after.match(/\d+(?:\.\d+)?/g);
    if (!numbers) {
      if (/N\/A/i.test(after) && !unavailable.includes(match)) unavailable.push(match);
      continue;
    }
    const peso = Number(numbers[numbers.length - 1]);
    if (peso > 0 && !rates.has(match)) rates.set(match, peso);
  }

  const date = bulletinDate(text);

  return { rates: [...rates].map(([currency, rate]) => ({ currency, rate })), unavailable, date };
}
