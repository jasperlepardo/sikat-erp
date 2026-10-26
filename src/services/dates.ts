/**
 * Dates, the way they're stored and the way they're shown.
 *
 * Stored (ISO 8601, never formatted):
 * - Calendar dates — posting, due, document dates — are `YYYY-MM-DD`: a day in the company's
 *   books, with no time and no time zone. Every user sees the same day.
 * - Timestamps — created, edited, posted at — are UTC instants ending in `Z`.
 * - Time zones are IANA names (`Asia/Manila`).
 *
 * Shown: in the user's date format; timestamps in the user's time zone (Settings › Preferences).
 * "Today" is the company's — its books' time zone (Settings › Company) — not the user's.
 *
 * This module has no imports, so seeds can use it; the app applies the company's and user's
 * settings with `applyDateSettings` (app/DateSettings.tsx).
 */

export const DATE_FORMATS = ['d MMM yyyy', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** The seeded company's books' time zone, until the app applies the current company's. */
export const DEFAULT_TIME_ZONE = 'Asia/Manila';

const dayIn = (timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeIn = (timeZone: string) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });

let bookDay = dayIn(DEFAULT_TIME_ZONE);
let bookTime = timeIn(DEFAULT_TIME_ZONE);
let displayDay = bookDay;
let displayTime = timeIn(DEFAULT_TIME_ZONE);
let dateFormat: DateFormat = 'd MMM yyyy';

/** The company's books' time zone, and the user's date format and time zone ('' = the company's). */
export function applyDateSettings(s: { bookTimeZone: string; dateFormat: DateFormat; displayTimeZone: string }) {
  const book = s.bookTimeZone || DEFAULT_TIME_ZONE;
  const display = s.displayTimeZone || book;
  bookDay = dayIn(book);
  bookTime = timeIn(book);
  displayDay = dayIn(display);
  displayTime = timeIn(display);
  dateFormat = s.dateFormat;
}

/**
 * Today as YYYY-MM-DD in the company's books' time zone. `new Date().toISOString()` is UTC, so
 * between 00:00 and 08:00 in Manila it gives yesterday — the wrong posting date, exchange rate
 * and tax rate.
 */
/** The calendar date `days` after `iso` (before, if negative): `addDays('2026-01-31', 1)` is `'2026-02-01'`. */
export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const todayISO = (now = new Date()) => bookDay.format(now);

/** The time now as HH:mm in the company's time zone — for date + time fields such as a count's. */
export const nowHHMM = (now = new Date()) => bookTime.format(now);

/** A UTC timestamp as "YYYY-MM-DDTHH:mm" in the user's time zone — for sorting and grouping by day. */
export const localDateTime = (iso: string) => {
  const at = new Date(iso);
  return `${displayDay.format(at)}T${displayTime.format(at)}`;
};

// en-US short months ("Sep"); en-GB prints "Sept".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A calendar date in the user's format: "2026-09-25" → "25 Sep 2026" (or 09/25/2026…). */
export function formatDate(iso: string, format: DateFormat = dateFormat) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  switch (format) {
    case 'MM/dd/yyyy':
      return `${m}/${d}/${y}`;
    case 'dd/MM/yyyy':
      return `${d}/${m}/${y}`;
    case 'yyyy-MM-dd':
      return `${y}-${m}-${d}`;
    default:
      return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
  }
}

/** A UTC timestamp in the user's time zone and format: "25 Sep 2026 · 09:30". */
export const formatDateTime = (iso: string) => {
  if (!iso) return '';
  const local = localDateTime(iso);
  return `${formatDate(local.slice(0, 10))} · ${local.slice(11, 16)}`;
};
