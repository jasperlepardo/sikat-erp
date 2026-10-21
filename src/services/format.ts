const number = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatAmount = (value: number) => number.format(value);

/** "Bayanihan Savings Bank Corp." → "BS": the first letters of the first two words, for an avatar. */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w.match(/\p{L}|\p{N}/u)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
