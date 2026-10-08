import type { ArInvoice } from '../mocks/arInvoices';
import {
  FX_GAIN_ACCOUNT,
  FX_LOSS_ACCOUNT,
  INCOMING_DIFF_ALLOWED,
  INCOMING_SERIES,
  OVERPAYMENT_ACCOUNT,
  SALES_DISCOUNT_ACCOUNT,
  SEED_INCOMING_PAYMENTS,
  UNDERPAYMENT_ACCOUNT,
  type IncomingMeans,
  type IncomingPayment,
  type IncomingRow,
} from '../mocks/incomingPayments';
import { incomingPaymentSeries, seriesLookup, formatDocNum } from './allSeries';
import type { Item } from '../mocks/items';
import type { Partner } from '../mocks/partners';
import type { TaxCode } from '../mocks/taxes';
import { applyArPayments, arAmounts, arNumber, installmentSchedule, listArInvoices } from './arInvoices';
import { todayISO } from './dates';
import type { JournalLine } from './inventoryTransfers';
import { postDocumentEntry, reverseDocumentEntry } from './journalEntries';
import { termDays } from './purchaseOrders';
import { createCollection } from './store';

const payments = createCollection<IncomingPayment>('sikat-erp:incoming-payments:v7', SEED_INCOMING_PAYMENTS, 'rc');

export const listIncomingPayments = payments.list;
export const getIncomingPayment = payments.get;

export type IncomingInput = Omit<IncomingPayment, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const incomingSeriesOf = (id: string) => seriesLookup(incomingPaymentSeries, id, INCOMING_SERIES);
export const incomingNumber = (p: Pick<IncomingPayment, 'seriesId' | 'docNum'>) => formatDocNum(incomingSeriesOf(p.seriesId), p.docNum);

// ── Open documents ───────────────────────────────────────────────────────────

export interface OpenDocContext {
  customers: readonly Partner[];
  items: readonly Item[];
  codes: readonly TaxCode[];
}

/**
 * The customer's open invoices in the payment currency, as rows to tick: one per invoice, or one
 * per unpaid installment (applied amounts fill the earliest installments first).
 */
export function openRows(customerId: string, currency: string, invoices: readonly ArInvoice[], ctx: OpenDocContext): IncomingRow[] {
  const customer = ctx.customers.find((c) => c.id === customerId);
  const out: IncomingRow[] = [];
  for (const inv of invoices.filter((i) => i.customerId === customerId && i.status === 'Open' && i.currency === currency).sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const amt = arAmounts(inv, customer, ctx.items, ctx.codes);
    if (amt.balanceDue <= 0) continue;
    const base = {
      invoiceId: inv.id,
      docNo: arNumber(inv),
      installments: inv.installments,
      docDate: inv.postingDate,
      wtAmount: amt.wtAmount,
      blocked: inv.paymentBlock,
      cashDiscountPct: 0,
      invoiceFx: inv.fxRate || 1,
      controlAccount: inv.controlAccount || '1120',
      project: inv.project && inv.project !== '— None —' ? inv.project : '',
      selected: false,
    };
    if (inv.installments <= 1) {
      out.push({ ...base, id: `${inv.id}-1`, installment: 0, dueDate: inv.dueDate, total: amt.due, balanceDue: amt.balanceDue, amount: amt.balanceDue });
      continue;
    }
    let applied = inv.appliedAmount;
    for (const part of installmentSchedule(inv.dueDate, inv.installments, amt.due, termDays(inv.paymentTermId))) {
      const paid = Math.min(applied, part.amount);
      applied = round2(applied - paid);
      const balance = round2(part.amount - paid);
      if (balance > 0) out.push({ ...base, id: `${inv.id}-${part.no}`, installment: part.no, dueDate: part.dueDate, total: part.amount, balanceDue: balance, amount: balance });
    }
  }
  return out;
}

/** Days past due on `date`: positive overdue, 0 due today, negative not yet due. */
export const overdueDays = (r: Pick<IncomingRow, 'dueDate'>, date: string) =>
  r.dueDate && date ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${r.dueDate}T00:00:00Z`)) / 86400000) : 0;

// ── Amounts ──────────────────────────────────────────────────────────────────

export const rowDiscount = (r: IncomingRow) => round2((r.amount * r.cashDiscountPct) / 100);
/** What a row settles on the invoice: the payment plus the discount allowed. */
export const rowSettled = (r: IncomingRow) => round2(r.amount + rowDiscount(r));
export const paidRows = (p: Pick<IncomingPayment, 'rows'>) => p.rows.filter((r) => r.selected && r.amount > 0);

/** Total Amount Due: invoices being paid plus on account — or the G/L lines. */
export function amountDue(p: Pick<IncomingPayment, 'type' | 'rows' | 'onAccount' | 'accountRows'>) {
  if (p.type === 'Account') return round2(p.accountRows.reduce((n, r) => n + r.amount, 0));
  return round2(paidRows(p).reduce((n, r) => n + r.amount, 0) + p.onAccount);
}

export const meansTotal = (m: IncomingMeans) => round2(m.transfer.amount + m.cash.amount + m.checks.reduce((n, c) => n + c.amount, 0) + m.cards.reduce((n, c) => n + c.amount, 0));

/**
 * Received − due. Within the allowed difference it's posted as over/underpayment; beyond it,
 * it's the Open Balance and the payment can't be added.
 */
export function paymentDifference(p: Pick<IncomingPayment, 'type' | 'rows' | 'onAccount' | 'accountRows' | 'means'>, fx: number) {
  const diff = round2(meansTotal(p.means) - amountDue(p));
  return { diff, withinAllowance: Math.abs(diff * fx) <= INCOMING_DIFF_ALLOWED + 0.0001 };
}

/** Add in Sequence: tick the documents in table order until `amount` is used up (the last one partly). */
export function allocateInSequence(rows: IncomingRow[], amount: number): IncomingRow[] {
  let left = round2(amount);
  return rows.map((r) => {
    if (r.blocked || left <= 0) return { ...r, selected: false, amount: r.balanceDue };
    const take = Math.min(left, r.balanceDue);
    left = round2(left - take);
    return { ...r, selected: true, amount: round2(take) };
  });
}

/** The BP row's due date: the amount-weighted average of the transfer date and check due dates. */
export function weightedDueDate(m: IncomingMeans, fallback: string) {
  const dated = [...(m.transfer.amount ? [{ date: m.transfer.date, amount: m.transfer.amount }] : []), ...m.checks.filter((c) => c.amount && c.dueDate).map((c) => ({ date: c.dueDate, amount: c.amount }))];
  const total = dated.reduce((n, d) => n + d.amount, 0);
  if (!total) return fallback;
  const ms = dated.reduce((n, d) => n + Date.parse(`${d.date}T00:00:00Z`) * d.amount, 0) / total;
  return new Date(Math.round(ms / 86400000) * 86400000).toISOString().slice(0, 10);
}

// ── Accounting ───────────────────────────────────────────────────────────────

/**
 * The entry adding the payment makes, in PHP:
 * - Dr each payment means' account (bank, or the cash / check / card clearing account).
 * - Customer: Cr each invoice's A/R account for what's settled, at the rate it was booked at;
 *   Dr Sales Discounts for cash discounts allowed; Cr the control account for any amount on account.
 * - Account: Cr each G/L line.
 * - A difference within the allowance: Cr Other Income (overpaid) or Dr Miscellaneous Expense.
 * - The rest is the realized exchange difference: Cr Foreign Exchange Gain when the pesos received
 *   are more than the invoices were booked at, Dr Foreign Exchange Loss when fewer.
 */
export function incomingJournal(p: IncomingInput, fx: number): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => {
    if (account && amount) totals.set(account, round2((totals.get(account) ?? 0) + amount));
  };
  const m = p.means;
  add(m.transfer.account, round2(m.transfer.amount * fx));
  add(m.cash.account, round2(m.cash.amount * fx));
  add(m.checkAccount, round2(m.checks.reduce((n, c) => n + c.amount, 0) * fx));
  add(m.cardAccount, round2(m.cards.reduce((n, c) => n + c.amount, 0) * fx));
  if (p.type === 'Account') {
    for (const r of p.accountRows) add(r.account, -round2(r.amount * fx));
  } else {
    for (const r of paidRows(p)) {
      add(r.controlAccount || p.controlAccount, -round2(rowSettled(r) * r.invoiceFx));
      add(SALES_DISCOUNT_ACCOUNT, round2(rowDiscount(r) * fx));
    }
    add(p.controlAccount, -round2(p.onAccount * fx));
  }
  const { diff, withinAllowance } = paymentDifference(p, fx);
  if (diff && withinAllowance) add(diff > 0 ? OVERPAYMENT_ACCOUNT : UNDERPAYMENT_ACCOUNT, -round2(diff * fx));

  const rest = round2([...totals.values()].reduce((n, v) => n + v, 0));
  if (rest > 0) add(FX_GAIN_ACCOUNT, -rest);
  if (rest < 0) add(FX_LOSS_ACCOUNT, -rest);

  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit || a.credit - b.credit);
}

// ── Saving and posting ───────────────────────────────────────────────────────

export class IncomingPostError extends Error {}

export const saveIncomingDraft = (input: IncomingInput) => payments.save({ ...input, status: 'Draft', docNum: incomingSeriesOf(input.seriesId).manual ? input.docNum : 0 });

export async function saveIncomingNotes(id: string, patch: Pick<IncomingPayment, 'remarks' | 'attachments'>) {
  const cur = await payments.get(id);
  if (!cur) throw new Error('This payment no longer exists.');
  return payments.save({ ...cur, ...patch });
}

/** What each invoice settles in this payment, with its net due — for applying to the invoices. */
const settlements = (p: Pick<IncomingPayment, 'rows'>, dueOf: (invoiceId: string) => number) =>
  paidRows(p).map((r) => ({ invoiceId: r.invoiceId, amount: rowSettled(r), due: dueOf(r.invoiceId) }));

/**
 * Add the payment. Invoice balances are re-checked as they are now (so two payments can't settle
 * the same balance), the number is assigned, the invoices take what's settled, and the journal
 * entry posts; its number becomes the Transaction No.
 */
export async function addIncomingPayment(input: IncomingInput, fx: number, ctx: OpenDocContext): Promise<IncomingPayment> {
  const invoices = await listArInvoices();
  const customer = ctx.customers.find((c) => c.id === input.customerId);
  const amounts = new Map(invoices.map((i) => [i.id, arAmounts(i, customer, ctx.items, ctx.codes)]));
  const byInvoice = new Map<string, number>();
  for (const r of paidRows(input)) byInvoice.set(r.invoiceId, round2((byInvoice.get(r.invoiceId) ?? 0) + rowSettled(r)));
  const over = [...byInvoice].filter(([id, amt]) => amt > (amounts.get(id)?.balanceDue ?? 0) + 0.005);
  if (over.length) {
    throw new IncomingPostError(over.map(([id, amt]) => `${arNumber(invoices.find((i) => i.id === id) ?? { seriesId: '', docNum: 0 })}: settling ${amt} but only ${amounts.get(id)?.balanceDue ?? 0} is still due.`).join(' '));
  }
  const { diff, withinAllowance } = paymentDifference(input, fx);
  if (diff && !withinAllowance) throw new IncomingPostError(`Open balance of ${input.currency} ${Math.abs(diff).toLocaleString('en-PH', { minimumFractionDigits: 2 })}: the payment means ${diff > 0 ? 'exceed' : "don't cover"} the amount due by more than the allowed difference.`);

  const series = incomingSeriesOf(input.seriesId);
  const all = await payments.list();
  if (series.manual && all.some((p) => p.seriesId === series.id && p.docNum === input.docNum && p.id !== input.id)) throw new IncomingPostError(`Manual no. ${input.docNum} is already used.`);
  const docNum = series.manual ? input.docNum : Math.max(series.firstNo - 1, ...all.filter((p) => p.seriesId === series.id).map((p) => p.docNum)) + 1;

  await applyArPayments(settlements(input, (id) => amounts.get(id)?.due ?? 0), 1);
  const saved = await payments.save({ ...input, rows: input.type === 'Customer' ? paidRows(input) : [], docNum, status: 'Posted', fxRate: fx });
  const entry = await postDocumentEntry({
    origin: 'RC',
    originNo: docNum,
    originId: saved.id,
    postingDate: saved.postingDate,
    dueDate: saved.dueDate,
    remarks: saved.journalRemark,
    ref2: saved.reference,
    partnerId: saved.type === 'Customer' ? saved.customerId : undefined,
    controlAccount: saved.controlAccount,
    lines: incomingJournal(saved, fx),
  });
  return payments.save({ ...saved, transNo: entry?.number ?? 0 });
}

/**
 * Cancel: a reversing entry dated today or the payment's own date, the invoices it settled reopen
 * for what it paid, and the journal remark shows Cancelled. Endorsed checks block it.
 */
export async function cancelIncomingPayment(p: IncomingPayment, on: 'current' | 'original', ctx: OpenDocContext) {
  if (p.means.checks.some((c) => c.endorsed)) throw new IncomingPostError('This payment has endorsed checks — it can’t be cancelled.');
  const invoices = await listArInvoices();
  const customer = ctx.customers.find((c) => c.id === p.customerId);
  const dueOf = (id: string) => {
    const inv = invoices.find((i) => i.id === id);
    return inv ? arAmounts(inv, customer, ctx.items, ctx.codes).due : 0;
  };
  await applyArPayments(settlements(p, dueOf), -1);
  const date = on === 'original' ? p.postingDate : todayISO();
  await reverseDocumentEntry(p.id, date);
  return payments.save({ ...p, status: 'Cancelled', cancelDate: date, journalRemark: `${p.journalRemark} (Cancelled)` });
}
