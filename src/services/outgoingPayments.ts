import {
  BANK_CHARGES_ACCOUNT,
  CASH_DISCOUNT_ACCOUNT,
  FX_GAIN_ACCOUNT,
  FX_LOSS_ACCOUNT,
  PAYMENT_SERIES,
  type OutgoingPayment,
  type PaymentRow,
} from '../mocks/outgoingPayments';
import { outgoingPaymentSeries, seriesLookup, formatDocNum } from './allSeries';
import { houseBankFor } from './partnerMasters';
import { todayISO } from './dates';
import type { JournalLine } from './inventoryTransfers';
import { applyPayments } from './apInvoices';
import { applyDownPaymentPayments } from './apDownPayments';
import { applyDownPaymentInvoicePayments } from './apDownPaymentInvoices';
import { createCollection } from './store';
import { purchasingHistory } from './purchasingHistory';
import { round2 } from './num';
import { meansTotal, rowDiscount, rowSettled, weightedDueDate } from './paymentMath';

const payments = createCollection<OutgoingPayment>('sikat-erp:outgoing-payments:v5', () => purchasingHistory().payments, 'op', { audit: 'PAY' });

export const listPayments = payments.list;
export async function getPayment(idOrNumber: string) {
  const direct = await payments.get(idOrNumber);
  if (direct) return direct;
  const all = await payments.list();
  return all.find((p) => paymentNumber(p) === idOrNumber) ?? null;
}

export type PaymentInput = Omit<OutgoingPayment, 'id'> & { id?: string };

const paymentSeriesOf = (id: string) => seriesLookup(outgoingPaymentSeries, id, PAYMENT_SERIES);
/** "Primary 510004", or "Draft" before it's added. */
export const paymentNumber = (p: Pick<OutgoingPayment, 'seriesId' | 'docNum' | 'postingDate'>) => formatDocNum(paymentSeriesOf(p.seriesId), p.docNum, p.postingDate);

// ── Amounts ──────────────────────────────────────────────────────────────────

export { meansTotal, rowDiscount, rowSettled, weightedDueDate };
const paidRows = (p: Pick<OutgoingPayment, 'rows'>) => p.rows.filter((r) => r.selected && r.amount > 0);

/** Overall Amount: invoices paid (net of discounts), plus on account — or the G/L lines. */
export function overallAmount(p: Pick<OutgoingPayment, 'type' | 'rows' | 'onAccount' | 'accountRows'>) {
  if (p.type === 'Account') return round2(p.accountRows.reduce((n, r) => n + r.amount, 0));
  return round2(paidRows(p).reduce((n, r) => n + r.amount, 0) + p.onAccount);
}

/** Left for the payment means to cover: the overall amount plus the bank charge, less what's entered. */
export const meansBalance = (p: Pick<OutgoingPayment, 'type' | 'rows' | 'onAccount' | 'accountRows' | 'means'>) =>
  round2(overallAmount(p) + p.means.bankCharge - meansTotal(p.means));

/** A row that doesn't settle a booked A/P balance: a down payment *request*, which establishes the advance now. */
const isAdvanceRow = (r: PaymentRow) => r.docType === 'DPR' || r.docType === 'APDPI';
/**
 * Realized exchange difference on a row in PHP. A down payment request is paid at today's rate (no booked
 * balance yet), so it has none; an invoice and a down payment *invoice* were booked at a rate, so they do.
 */
export const rowFxDifference = (r: PaymentRow, fx: number) => (r.docType === 'DPR' ? 0 : round2(rowSettled(r) * (fx - r.invoiceFx)));


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
      // A down payment *request* establishes the advance now: Dr the down payment account at today's rate.
      // A down payment *invoice* already posted Dr advance / Cr A/P when it was added, so paying it settles
      // the A/P it created — Dr the control account at the rate it was booked at, like an ordinary invoice.
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
  const series = paymentSeriesOf(input.seriesId);
  const docNum = input.docNum || Math.max(series.firstNo - 1, ...all.filter((r) => r.seriesId === series.id).map((r) => r.docNum)) + 1;

  if (!input.approved) {
    return payments.save({ ...input, docNum, status: 'Not Confirmed', fxRate: fx });
  }
  const taken: Record<string, number[]> = {};
  const checks = input.means.checks.map((c) => {
    if (c.manual && c.checkNo) return c;
    const checkNo = nextCheckNo(all, c.account, taken[c.account] ?? []);
    taken[c.account] = [...(taken[c.account] ?? []), checkNo];
    return { ...c, checkNo };
  });
  await applyPayments(paidRows(input).filter((r) => !isAdvanceRow(r)).map((r) => ({ invoiceId: r.invoiceId, amount: rowSettled(r), total: r.total })), 1);
  await applyDownPaymentPayments(paidRows(input).filter((r) => r.docType === 'DPR').map((r) => ({ requestId: r.invoiceId, amount: rowSettled(r), amountLc: round2(rowSettled(r) * fx) })), 1);
  await applyDownPaymentInvoicePayments(paidRows(input).filter((r) => r.docType === 'APDPI').map((r) => ({ requestId: r.invoiceId, amount: rowSettled(r), amountLc: round2(rowSettled(r) * fx) })), 1);

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
  await applyPayments(paidRows(p).filter((r) => !isAdvanceRow(r)).map((r) => ({ invoiceId: r.invoiceId, amount: rowSettled(r), total: r.total })), -1);
  await applyDownPaymentPayments(paidRows(p).filter((r) => r.docType === 'DPR').map((r) => ({ requestId: r.invoiceId, amount: rowSettled(r), amountLc: round2(rowSettled(r) * p.fxRate) })), -1);
  await applyDownPaymentInvoicePayments(paidRows(p).filter((r) => r.docType === 'APDPI').map((r) => ({ requestId: r.invoiceId, amount: rowSettled(r), amountLc: round2(rowSettled(r) * p.fxRate) })), -1);
  return payments.save({ ...p, status: 'Cancelled', cancelDate: todayISO() });
}

export async function recallPayment(p: OutgoingPayment): Promise<OutgoingPayment> {
  return payments.save({ ...p, status: 'Draft', approved: false });
}
