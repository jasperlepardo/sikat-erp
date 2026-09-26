const number = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatAmount = (value: number) => number.format(value);
