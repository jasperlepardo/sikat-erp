import {
  BANK_CHARGES_ACCOUNT,
  CASH_DISCOUNT_ACCOUNT,
  FX_GAIN_ACCOUNT,
  FX_LOSS_ACCOUNT,
  PAYMENT_SERIES,
  type OutgoingPayment,
  type PaymentMeans,
  type PaymentRow,
} from '../mocks/outgoingPayments';
import { outgoingPaymentSeries, seriesLookup, formatDocNum } from './allSeries';
import { houseBankFor } from './partnerMasters';
import { todayISO } from './dates';
import type { JournalLine } from './inventoryTransfers';
import { applyPayments } from './apInvoices';
import { applyDownPaymentPayments } from './apDownPayments';
import { createCollection } from './store';
import { purchasingHistory } from './purchasingHistory';

const payments = createCollection<OutgoingPayment>('sikat-erp:outgoing-payments:v5', () => purchasingHistory().payments, 'op');

export const listPayments = payments.list;
export async function getPayment(idOrNumber: string) {
  const direct = await payments.get(idOrNumber);
  if (direct) return direct;
  const all = await payments.list();
  return all.find((p) => paymentNumber(p) === idOrNumber) ?? null;
}
export const resetPayments = payments.reset;

export type PaymentInput = Omit<OutgoingPayment, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const paymentSeriesOf = (id: string) => seriesLookup(outgoingPaymentSeries, id, PAYMENT_SERIES);
/** "Primary 510004", or "Draft" before it's added. */
export const paymentNumber = (p: Pick<OutgoingPayment, 'seriesId' | 'docNum' | 'postingDate'>) => formatDocNum(paymentSeriesOf(p.seriesId), p.docNum, p.postingDate);

// ── Amounts ──────────────────────────────────────────────────────────────────

/** The cash discount on a row, from its discount % of what's paid toward it. */
export const rowDiscount = (r: PaymentRow) => round2((r.amount * r.cashDiscountPct) / 100);
/** What a row settles on the invoice: the payment plus the discount taken. */
export const rowSettled = (r: PaymentRow) => round2(r.amount + rowDiscount(r));
const paidRows = (p: Pick<OutgoingPayment, 'rows'>) => p.rows.filter((r) => r.selected && r.amount > 0);

/** Overall Amount: invoices paid (net of discounts), plus on account — or the G/L lines. */
export function overallAmount(p: Pick<OutgoingPayment, 'type' | 'rows' | 'onAccount' | 'accountRows'>) {
  if (p.type === 'Account') return round2(p.accountRows.reduce((n, r) => n + r.amount, 0));
  return round2(paidRows(p).reduce((n, r) => n + r.amount, 0) + p.onAccount);
}

/** Paid: the total entered across every payment means. */
export const meansTotal = (m: PaymentMeans) =>
  round2(m.transfer.amount + m.cash.amount + m.checks.reduce((n, c) => n + c.amount, 0) + m.cards.reduce((n, c) => n + c.amount, 0));

/** Left for the payment means to cover: the overall amount plus the bank charge, less what's entered. */
export const meansBalance = (p: Pick<OutgoingPayment, 'type' | 'rows' | 'onAccount' | 'accountRows' | 'means'>) =>
  round2(overallAmount(p) + p.means.bankCharge - meansTotal(p.means));

/** Realized exchange difference on a row in PHP: positive costs more than booked (a loss). */
export const rowFxDifference = (r: PaymentRow, fx: number) => (r.docType === 'DPR' ? 0 : round2(rowSettled(r) * (fx - r.invoiceFx)));

/** The due date of the BP row: the amount-weighted average of the payment means' dates. */
export function weightedDueDate(m: PaymentMeans, fallback: string) {
  const dated = [
    ...(m.transfer.amount ? [{ date: m.transfer.date, amount: m.transfer.amount }] : []),
    ...m.checks.filter((c) => c.amount && c.dueDate).map((c) => ({ date: c.dueDate, amount: c.amount })),
  ];
  const total = dated.reduce((n, d) => n + d.amount, 0);
  if (!total) return fallback;
  const ms = dated.reduce((n, d) => n + Date.parse(`${d.date}T00:00:00Z`) * d.amount, 0) / total;
  return new Date(Math.round(ms / 86400000) * 86400000).toISOString().slice(0, 10);
}

// ── Accounting ───────────────────────────────────────────────────────────────

/**
 * The entry adding the payment makes, in PHP:
 * - Vendor: Dr the vendor for each invoice at the rate it was booked at (what's settled, including
 *   the discount), Dr the control account for any amount on account.
 * - Account: Dr each G/L line.
 * - Cr each payment means' account; Dr Bank Charges, paid with the means.
 * - Cr Purchase Discounts for discounts taken.
 * - The rest is the realized exchange difference: Dr Foreign Exchange Loss when paying cost more
 *   pesos than the invoice was booked at, Cr Foreign Exchange Gain when it cost fewer.
 */
export function paymentJournal(p: PaymentInput, fx: number, vendorAccountOf: (invoiceId: string) => string): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => {
    if (account && amount) totals.set(account, round2((totals.get(account) ?? 0) + amount));
  };
  if (p.type === 'Account') {
    for (const r of p.accountRows) add(r.account, round2(r.amount * fx));
  } else {
    for (const r of paidRows(p)) {
      // An advance goes on the down payment account at today's rate: there's nothing booked to clear yet.
      if (r.docType === 'DPR') add(r.account || p.controlAccount, round2(rowSettled(r) * fx));
      else add(vendorAccountOf(r.invoiceId) || p.controlAccount, round2(rowSettled(r) * r.invoiceFx));
      add(CASH_DISCOUNT_ACCOUNT, -round2(rowDiscount(r) * fx));
    }
    add(p.controlAccount, round2(p.onAccount * fx));
  }
  add(BANK_CHARGES_ACCOUNT, round2(p.means.bankCharge * fx));
  add(p.means.transfer.account, -round2(p.means.transfer.amount * fx));
  add(p.means.cash.account, -round2(p.means.cash.amount * fx));
  for (const c of p.means.checks) add(c.account, -round2(c.amount * fx));
  for (const c of p.means.cards) add(c.account, -round2(c.amount * fx));

  // Whatever doesn't balance is the exchange difference (and centavo rounding between rates).
  const diff = round2([...totals.values()].reduce((n, v) => n + v, 0));
  if (diff < 0) add(FX_LOSS_ACCOUNT, -diff);
  if (diff > 0) add(FX_GAIN_ACCOUNT, -diff);

  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit || a.credit - b.credit);
}

// ── Saving and posting ───────────────────────────────────────────────────────

export class PaymentPostError extends Error {}

export const savePaymentDraft = (input: PaymentInput) => payments.save({ ...input, status: 'Draft', docNum: 0 });

/** Posted payments keep everything but their remarks and attachments. */
export async function savePaymentRemarks(p: OutgoingPayment, patch: Pick<OutgoingPayment, 'remarks' | 'attachments'>) {
  const current = await payments.get(p.id);
  if (!current) throw new Error('This payment no longer exists.');
  return payments.save({ ...current, ...patch });
}

/** The next check number on a bank account: one past the highest used, or the account's first. */
function nextCheckNo(all: OutgoingPayment[], account: string, taken: number[]) {
  const used = [...all.flatMap((p) => p.means.checks.filter((c) => c.account === account).map((c) => c.checkNo)), ...taken];
  return Math.max((houseBankFor(account)?.firstCheckNo ?? 1) - 1, ...used) + 1;
}

/**
 * Add the payment: the invoices it pays take the settled amounts (closing those paid in full),
 * automatic checks are numbered, and the rate is fixed. Invoice balances are re-checked as they
 * are now, so two payments can't both settle the same balance.
 */
export async function addPayment(input: PaymentInput, fx: number, balances: Map<string, number>): Promise<OutgoingPayment> {
  const over = paidRows(input).filter((r) => rowSettled(r) > (balances.get(r.invoiceId) ?? 0) + 0.005);
  if (over.length) {
    throw new PaymentPostError(over.map((r) => `${r.docNo}: settling ${rowSettled(r)} but only ${balances.get(r.invoiceId) ?? 0} is still due.`).join(' '));
  }
  const all = await payments.list();
  const taken: Record<string, number[]> = {};
  const checks = input.means.checks.map((c) => {
    if (c.manual && c.checkNo) return c;
    const checkNo = nextCheckNo(all, c.account, taken[c.account] ?? []);
    taken[c.account] = [...(taken[c.account] ?? []), checkNo];
    return { ...c, checkNo };
  });
  await applyPayments(paidRows(input).filter((r) => r.docType !== 'DPR').map((r) => ({ invoiceId: r.invoiceId, amount: rowSettled(r), total: r.total })), 1);
  await applyDownPaymentPayments(paidRows(input).filter((r) => r.docType === 'DPR').map((r) => ({ requestId: r.invoiceId, amount: rowSettled(r), amountLc: round2(rowSettled(r) * fx) })), 1);

  const series = paymentSeriesOf(input.seriesId);
  const docNum = Math.max(series.firstNo - 1, ...all.filter((r) => r.seriesId === series.id).map((r) => r.docNum)) + 1;
  return payments.save({
    ...input,
    rows: input.rows.filter((r) => r.selected && r.amount > 0),
    means: { ...input.means, checks },
    docNum,
    status: 'Posted',
    fxRate: fx,
  });
}

/** Cancel: the invoices it paid are open again for what it settled. Its checks are void. */
export async function cancelPayment(p: OutgoingPayment) {
  await applyPayments(paidRows(p).filter((r) => r.docType !== 'DPR').map((r) => ({ invoiceId: r.invoiceId, amount: rowSettled(r), total: r.total })), -1);
  await applyDownPaymentPayments(paidRows(p).filter((r) => r.docType === 'DPR').map((r) => ({ requestId: r.invoiceId, amount: rowSettled(r), amountLc: round2(rowSettled(r) * p.fxRate) })), -1);
  return payments.save({ ...p, status: 'Cancelled', cancelDate: todayISO() });
}
