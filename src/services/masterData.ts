import { SEED_CURRENCIES, SEED_RATES, type Currency, type ExchangeRate } from '../mocks/currencies';
import {
  SEED_COMPANY_TAX,
  SEED_EXCISE,
  SEED_TAX_CODES,
  SEED_TAX_GROUPS,
  SEED_WITHHOLDING,
  type CompanyTaxProfile,
  type ExciseCategory,
  type TaxCode,
  type TaxGroup,
  type WithholdingTax,
} from '../mocks/taxes';
import {
  SEED_COMPENSATION_TAX,
  SEED_DE_MINIMIS,
  SEED_WITHHOLDING_FORMS,
  type CompensationBracket,
  type DeMinimisBenefit,
  type WithholdingForm,
} from '../mocks/compensation';
import { SEED_ACCOUNTS, type Account } from '../mocks/chartOfAccounts';
import { createCollection } from './store';

/** Settings › Accounting & Tax master data. */
// v2: tax codes gained rate history; tax groups map to a single code.
export const taxCodes = createCollection<TaxCode>('sikat-erp:tax-codes:v3', SEED_TAX_CODES, 'tc');
export const taxGroups = createCollection<TaxGroup>('sikat-erp:tax-groups:v2', SEED_TAX_GROUPS, 'tg');
export const companyTax = createCollection<CompanyTaxProfile>('sikat-erp:company-tax', SEED_COMPANY_TAX, 'company');
/** Accounting › Chart of Accounts. */
export const accounts = createCollection<Account>('sikat-erp:accounts', SEED_ACCOUNTS, 'acct');
export const compensationTax = createCollection<CompensationBracket>('sikat-erp:compensation-tax', SEED_COMPENSATION_TAX, 'ct');
export const deMinimisBenefits = createCollection<DeMinimisBenefit>('sikat-erp:de-minimis', SEED_DE_MINIMIS, 'dm');
export const withholdingForms = createCollection<WithholdingForm>('sikat-erp:withholding-forms', SEED_WITHHOLDING_FORMS, 'wf');
export const withholdingTaxes = createCollection<WithholdingTax>('sikat-erp:withholding:v5', SEED_WITHHOLDING, 'wt');
export const exciseCategories = createCollection<ExciseCategory>('sikat-erp:excise', SEED_EXCISE, 'ex');
export const currencies = createCollection<Currency>('sikat-erp:currencies', SEED_CURRENCIES, 'cur');
export const exchangeRates = createCollection<ExchangeRate>('sikat-erp:exchange-rates', SEED_RATES, 'fx');

/** The latest rate on or before `date` (documents use the rate of their posting date). */
export function rateOn(rates: ExchangeRate[], currency: string, date = new Date().toISOString().slice(0, 10)) {
  return rates
    .filter((r) => r.currency === currency && r.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Parse a pasted BSP Reference Exchange Rate Bulletin. Each row reads
 * `No. COUNTRY UNIT SYMBOL EURO-EQ USD-EQ PESO-EQ`; the peso equivalent is the last
 * number after the ISO symbol. Rows quoted as "N/A" (e.g. Kuwaiti dinar) are listed
 * in `unavailable`. The bulletin date ("September 25, 2026") is picked up if present.
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

  const d = text.match(new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2}),\\s*(\\d{4})`, 'i'));
  const date = d
    ? `${d[3]}-${String(MONTHS.indexOf(d[1].toLowerCase()) + 1).padStart(2, '0')}-${d[2].padStart(2, '0')}`
    : undefined;

  return { rates: [...rates].map(([currency, rate]) => ({ currency, rate })), unavailable, date };
}
