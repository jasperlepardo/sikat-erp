/** Money: rounded to the centavo. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Quantities, rates and unit costs: rounded to four decimals. */
export const round4 = (n: number) => Math.round(n * 10000) / 10000;
