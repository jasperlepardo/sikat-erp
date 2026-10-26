import { round2 } from './num';

/** What incoming and outgoing payments share: a row paid toward an invoice, and the means that pay. */
type Row = { amount: number; cashDiscountPct: number };
type Means = {
  transfer: { amount: number; date: string };
  cash: { amount: number };
  checks: { amount: number; dueDate: string }[];
  cards: { amount: number }[];
};

/** The cash discount on a row, from its discount % of what's paid toward it. */
export const rowDiscount = (r: Row) => round2((r.amount * r.cashDiscountPct) / 100);

/**
 * What a row settles on the invoice: the payment plus the discount.
 * @public
 */
export const rowSettled = (r: Row) => round2(r.amount + rowDiscount(r));

/** Paid: the total entered across every payment means. */
export const meansTotal = (m: Means) =>
  round2(m.transfer.amount + m.cash.amount + m.checks.reduce((n, c) => n + c.amount, 0) + m.cards.reduce((n, c) => n + c.amount, 0));

/** The BP row's due date: the amount-weighted average of the transfer date and the checks' due dates. */
export function weightedDueDate(m: Pick<Means, 'transfer' | 'checks'>, fallback: string) {
  const dated = [
    ...(m.transfer.amount ? [{ date: m.transfer.date, amount: m.transfer.amount }] : []),
    ...m.checks.filter((c) => c.amount && c.dueDate).map((c) => ({ date: c.dueDate, amount: c.amount })),
  ];
  const total = dated.reduce((n, d) => n + d.amount, 0);
  if (!total) return fallback;
  const ms = dated.reduce((n, d) => n + Date.parse(`${d.date}T00:00:00Z`) * d.amount, 0) / total;
  return new Date(Math.round(ms / 86400000) * 86400000).toISOString().slice(0, 10);
}
