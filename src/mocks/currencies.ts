/**
 * Currencies and exchange rates. The peso (PHP) is the local currency; rates are
 * PHP per 1 unit of foreign currency, as in the "Phil. peso equivalent" column of
 * the BSP Reference Exchange Rate Bulletin (RERB), published every banking day.
 */

import { RERB_CODES, RERB_HISTORY } from './rerbHistory';

export type RoundingRule = 'No rounding' | 'Round to 0.05' | 'Round to 1' | 'Round to 5' | 'Round to 10';
export const ROUNDING_RULES: RoundingRule[] = ['No rounding', 'Round to 0.05', 'Round to 1', 'Round to 5', 'Round to 10'];

export interface Currency {
  id: string;
  /** ISO 4217 code, also the code used on documents. */
  code: string;
  name: string;
  symbol: string;
  /** Unit and hundredth names, for amounts in words on checks and invoices. */
  unitName: string;
  hundredthName: string;
  decimals: number;
  rounding: RoundingRule;
  /** Where rates come from. PHP never has a rate. */
  rateSource: 'BSP RERB' | 'Manual';
  /** Local currency — the books are kept in it (PHP). */
  isLocal: boolean;
  /** System currency — the second reporting currency. */
  isSystem: boolean;
  active: boolean;
}

/** One day's rates — a BSP bulletin or a manual entry. One record per date. */
export interface ExchangeRate {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  /** PHP per 1 unit, by currency code. Currencies with no rate that day are left out. */
  rates: Record<string, number>;
  /** Quoted as N/A on that day's bulletin (e.g. the Kuwaiti dinar). */
  unavailable: string[];
  source: 'BSP RERB' | 'Manual';
}

export const BSP_RERB_URL = 'https://www.bsp.gov.ph/SitePages/Statistics/ExchangeRate.aspx';

const cur = (
  code: string, name: string, symbol: string, unitName: string, hundredthName: string,
  patch: Partial<Currency> = {},
): Currency => ({
  id: `cur-${code}`, code, name, symbol, unitName, hundredthName, decimals: 2, rounding: 'No rounding',
  rateSource: 'BSP RERB', isLocal: false, isSystem: false, active: false, ...patch,
});

/**
 * The 32 currencies quoted in the BSP Reference Exchange Rate Bulletin, in bulletin
 * order, plus the peso. The ones used on partners and documents today are active.
 */
export const SEED_CURRENCIES: Currency[] = [
  cur('PHP', 'Philippine peso', '₱', 'peso', 'centavo', { isLocal: true, active: true, rateSource: 'Manual' }),
  cur('USD', 'US dollar', '$', 'dollar', 'cent', { isSystem: true, active: true }),
  cur('JPY', 'Japanese yen', '¥', 'yen', 'sen', { decimals: 0, active: true }),
  cur('GBP', 'Pound sterling', '£', 'pound', 'penny'),
  cur('HKD', 'Hong Kong dollar', 'HK$', 'dollar', 'cent'),
  cur('CHF', 'Swiss franc', 'CHF', 'franc', 'centime'),
  cur('CAD', 'Canadian dollar', 'C$', 'dollar', 'cent'),
  cur('SGD', 'Singapore dollar', 'S$', 'dollar', 'cent', { active: true }),
  cur('AUD', 'Australian dollar', 'A$', 'dollar', 'cent'),
  cur('BHD', 'Bahraini dinar', 'BHD', 'dinar', 'fils', { decimals: 3 }),
  cur('KWD', 'Kuwaiti dinar', 'KWD', 'dinar', 'fils', { decimals: 3 }),
  cur('SAR', 'Saudi riyal', 'SAR', 'riyal', 'halala'),
  cur('BND', 'Brunei dollar', 'B$', 'dollar', 'cent'),
  cur('IDR', 'Indonesian rupiah', 'Rp', 'rupiah', 'sen', { decimals: 0 }),
  cur('THB', 'Thai baht', '฿', 'baht', 'satang'),
  cur('AED', 'UAE dirham', 'AED', 'dirham', 'fils'),
  cur('EUR', 'Euro', '€', 'euro', 'cent', { active: true }),
  cur('KRW', 'South Korean won', '₩', 'won', 'jeon', { decimals: 0 }),
  cur('CNY', 'Chinese yuan renminbi', '¥', 'yuan', 'fen', { active: true }),
  cur('ARS', 'Argentine peso', 'AR$', 'peso', 'centavo'),
  cur('BRL', 'Brazilian real', 'R$', 'real', 'centavo'),
  cur('DKK', 'Danish krone', 'kr', 'krone', 'øre'),
  cur('INR', 'Indian rupee', '₹', 'rupee', 'paisa'),
  cur('MYR', 'Malaysian ringgit', 'RM', 'ringgit', 'sen'),
  cur('MXN', 'Mexican peso', 'MX$', 'peso', 'centavo'),
  cur('NZD', 'New Zealand dollar', 'NZ$', 'dollar', 'cent'),
  cur('NOK', 'Norwegian krone', 'kr', 'krone', 'øre'),
  cur('PKR', 'Pakistani rupee', 'Rs', 'rupee', 'paisa'),
  cur('ZAR', 'South African rand', 'R', 'rand', 'cent'),
  cur('SEK', 'Swedish krona', 'kr', 'krona', 'öre'),
  cur('SYP', 'Syrian pound', 'SYP', 'pound', 'piastre'),
  cur('TWD', 'New Taiwan dollar', 'NT$', 'dollar', 'cent'),
  cur('VES', 'Venezuelan bolívar', 'Bs.', 'bolívar', 'céntimo'),
];

const rerb = (date: string, rates: Record<string, number>, unavailable: string[] = []): ExchangeRate => ({
  id: `fx-${date}`, date, rates, unavailable, source: 'BSP RERB',
});

/** One day of the bulletin history: quoted rates by code, N/A codes as unavailable. */
const rerbDay = ([date, row]: (typeof RERB_HISTORY)[number]): ExchangeRate =>
  rerb(
    date,
    Object.fromEntries(RERB_CODES.flatMap((code, i) => (row[i] == null ? [] : [[code, row[i]]]))),
    RERB_CODES.filter((_, i) => row[i] == null),
  );

/** Sample history: the RERB of 30 April 2026 (partial), then every banking day 1 Jul – 5 Oct 2026. */
export const SEED_RATES: ExchangeRate[] = [
  rerb('2026-04-30', { USD: 61.506, JPY: 0.3836, BHD: 163.0378, BND: 47.8311 }),
  ...RERB_HISTORY.map(rerbDay),
];
