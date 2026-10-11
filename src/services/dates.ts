/**
 * Today's date as YYYY-MM-DD in Philippine time, the company's books' time zone.
 * `new Date().toISOString()` is UTC, so between 00:00 and 08:00 in Manila it gives
 * yesterday — the wrong posting date, exchange rate and tax rate.
 */
const MANILA = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });

export const todayISO = (now = new Date()) => MANILA.format(now);

const MANILA_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false });

/** An ISO timestamp as "YYYY-MM-DDTHH:mm" in Philippine time. */
export const manilaDateTime = (iso: string) => {
  const at = new Date(iso);
  return `${MANILA.format(at)}T${MANILA_TIME.format(at)}`;
};

// en-US short months ("Sep"); en-GB now prints "Sept".
const DISPLAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });

/** "2026-09-25" → "25 Sep 2026". */
export function formatDate(iso: string) {
  if (!iso) return '';
  const part = (type: string) => DISPLAY.formatToParts(new Date(`${iso}T00:00:00Z`)).find((p) => p.type === type)?.value;
  return `${part('day')} ${part('month')} ${part('year')}`;
}
