/**
 * Currencies and exchange rates. The peso (PHP) is the local currency; rates are
 * PHP per 1 unit of foreign currency, as in the "Phil. peso equivalent" column of
 * the BSP Reference Exchange Rate Bulletin (RERB), published every banking day.
 */

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

export interface ExchangeRate {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  currency: string;
  /** PHP per 1 unit of `currency`. */
  rate: number;
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

/** Phil. peso equivalents from the BSP RERB of 25 September 2026 (Kuwaiti dinar was N/A). */
const RERB_2026_09_25: Record<string, number> = {
  USD: 62.756, JPY: 0.3952, GBP: 82.9446, HKD: 8.0025, CHF: 75.8381, CAD: 44.3756, SGD: 49.0626, AUD: 43.9857,
  BHD: 166.5322, SAR: 16.7144, BND: 48.8716, IDR: 0.0035, THB: 1.8779, AED: 17.0871, EUR: 71.4101, KRW: 0.0459,
  CNY: 9.3515, ARS: 0.0413, BRL: 12.0877, DKK: 9.5525, INR: 0.654, MYR: 15.3663, MXN: 3.5371, NZD: 35.5136,
  NOK: 6.5997, PKR: 0.2267, ZAR: 3.8176, SEK: 6.3401, SYP: 0.5165, TWD: 1.9732, VES: 0.0736,
};

/** Sample history: the RERBs of 30 April 2026 (partial) and 25 September 2026. */
export const SEED_RATES: ExchangeRate[] = [
  { id: 'fx-2026-04-30-USD', date: '2026-04-30', currency: 'USD', rate: 61.506, source: 'BSP RERB' },
  { id: 'fx-2026-04-30-JPY', date: '2026-04-30', currency: 'JPY', rate: 0.3836, source: 'BSP RERB' },
  { id: 'fx-2026-04-30-BHD', date: '2026-04-30', currency: 'BHD', rate: 163.0378, source: 'BSP RERB' },
  { id: 'fx-2026-04-30-BND', date: '2026-04-30', currency: 'BND', rate: 47.8311, source: 'BSP RERB' },
  ...Object.entries(RERB_2026_09_25).map(([currency, rate]) => ({
    id: `fx-2026-09-25-${currency}`,
    date: '2026-09-25',
    currency,
    rate,
    source: 'BSP RERB' as const,
  })),
];
