import { formatDate } from './dates';

const number = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatAmount = (value: number) => number.format(value);

/** The document FX for the "Exchange rate" field: "1 USD = 56.50 PHP (BSP, 9 Oct 2026)". PHP → "—". */
export function formatExchangeRate(currency: string, fx: number, opts: { date?: string; source?: string } = {}) {
  if (currency === 'PHP') return '—';
  if (!fx) return 'No rate on or before the posting date';
  const note = [opts.source, opts.date ? formatDate(opts.date) : null].filter(Boolean).join(', ');
  return `1 ${currency} = ${formatAmount(fx)} PHP${note ? ` (${note})` : ''}`;
}

/** "Bayanihan Savings Bank Corp." → "BS": the first letters of the first two words, for an avatar. */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w.match(/\p{L}|\p{N}/u)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
