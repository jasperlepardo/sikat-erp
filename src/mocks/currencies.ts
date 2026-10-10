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

/** Philippine regular holidays and special non-working days in H1 2026 that close the banks. */
const H1_HOLIDAYS = new Set(['2026-01-01', '2026-01-02', '2026-02-17', '2026-02-25', '2026-04-02', '2026-04-03', '2026-04-09', '2026-05-01', '2026-06-12']);

/**
 * January–June 2026 USD rates — ILLUSTRATIVE, NOT FROM BSP BULLETINS. The bulletin history here
 * starts on 1 July, and the seeded history needs a rate for every January–June USD document. These
 * follow a smooth path from 58.95 in early January to the real 30 April bulletin (61.506) and on to
 * where July opens, with a small daily wobble. They're entered as Manual rates; replace them with
 * the RERB once the bulletins are on hand.
 */
function illustrativeUsd(): ExchangeRate[] {
  const out: ExchangeRate[] = [];
  const start = Date.UTC(2026, 0, 1);
  // Anchors: (day of year, rate). 30 Apr is day 119; 30 Jun is day 180.
  const anchors: [number, number][] = [[0, 58.95], [59, 59.8], [119, 61.506], [180, 61.25]];
  const along = (d: number) => {
    const i = anchors.findIndex((_, k) => k < anchors.length - 1 && d <= anchors[k + 1][0]);
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    return y0 + ((y1 - y0) * (d - x0)) / (x1 - x0);
  };
  // The last banking day of 2025, so documents dated on the New Year holiday have a rate.
  out.push({ id: 'fx-2025-12-29', date: '2025-12-29', rates: { USD: 58.95 }, unavailable: [], source: 'Manual' });
  for (let d = 0; d <= 180; d++) {
    const date = new Date(start + d * 86400000).toISOString().slice(0, 10);
    const weekday = new Date(start + d * 86400000).getUTCDay();
    if (weekday === 0 || weekday === 6 || H1_HOLIDAYS.has(date) || date === '2026-04-30') continue;
    const usd = Math.round((along(d) + 0.12 * Math.sin(d / 3.1) + 0.07 * Math.sin(d / 1.7)) * 1000) / 1000;
    out.push({ id: `fx-${date}`, date, rates: { USD: usd }, unavailable: [], source: 'Manual' });
  }
  return out;
}

/**
 * Sample history: illustrative USD rates for January–June 2026 (see above), the RERB of 30 April
 * 2026 (partial), then every banking day 1 Jul – 5 Oct 2026 from the bulletins.
 */
export const SEED_RATES: ExchangeRate[] = [
  ...illustrativeUsd(),
  rerb('2026-04-30', { USD: 61.506, JPY: 0.3836, BHD: 163.0378, BND: 47.8311 }),
  ...RERB_HISTORY.map(rerbDay),
].sort((a, b) => a.date.localeCompare(b.date));
