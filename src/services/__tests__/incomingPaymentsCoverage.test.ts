/**
 * Incoming payments beyond salesFlows.test.ts: the rows a customer's open documents offer (down
 * payment invoices, installments), the journal's small-difference and FX lines, why a payment
 * can't be added, and cancelling or recalling one.
 */
import { describe, expect, it } from 'vitest';
import { SEED_ITEMS, mergedItems } from '../../mocks/items';
import { SEED_PARTNERS } from '../../mocks/partners';
import { SEED_TAX_CODES } from '../../mocks/taxes';
import { SEED_AR_DOWN_PAYMENT_INVOICES } from '../../mocks/arDownPaymentInvoices';
import {
  FX_GAIN_ACCOUNT, FX_LOSS_ACCOUNT, OVERPAYMENT_ACCOUNT, UNDERPAYMENT_ACCOUNT, blankIncomingPayment, newIncomingAccountRow, newReceivedCheck,
  type IncomingPayment, type IncomingRow,
} from '../../mocks/incomingPayments';
import type { ArInvoice } from '../../mocks/arInvoices';
import { listArInvoices } from '../arInvoices';
import { getArDownPaymentInvoice } from '../arDownPaymentInvoices';
import {
  IncomingPostError, addIncomingPayment, cancelIncomingPayment, getIncomingPayment, incomingJournal, incomingNumber, openRows,
  recallIncomingPayment, saveIncomingNotes,
} from '../incomingPayments';

const ctx = { customers: SEED_PARTNERS, items: mergedItems(SEED_ITEMS), codes: SEED_TAX_CODES };
const DATE = '2026-06-15';

const row = (patch: Partial<IncomingRow> = {}): IncomingRow => ({
  id: 'r', invoiceId: 'ar-x', docNo: 'SI-1', installment: 0, installments: 1, docDate: DATE, dueDate: DATE, total: 1000, wtAmount: 0,
  balanceDue: 1000, blocked: false, cashDiscountPct: 0, amount: 1000, invoiceFx: 1, controlAccount: '1120', projectId: '', selected: true, ...patch,
});

/** A customer payment of `received` by bank transfer for the given rows. */
const payment = (rows: IncomingRow[], received: number, patch: Partial<IncomingPayment> = {}): Omit<IncomingPayment, 'id'> => {
  const base = blankIncomingPayment(DATE);
  return { ...base, customerId: 'bp-005', controlAccount: '1120', rows, means: { ...base.means, transfer: { ...base.means.transfer, amount: received } }, ...patch };
};

const lineFor = (lines: { account: string; debit: number; credit: number }[], account: string) => lines.find((l) => l.account === account);

describe('open documents to pay', () => {
  it('offers the customer\'s open down payment invoices, skipping paid ones', () => {
    const [paid, open] = SEED_AR_DOWN_PAYMENT_INVOICES;
    const rows = openRows('bp-005', 'PHP', [], { ...ctx, downPaymentInvoices: [{ ...open, fxRate: 0, controlAccount: '' }, { ...paid, customerId: 'bp-005', appliedAmount: 1e9 }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ docType: 'ARDI', invoiceId: open.id, balanceDue: 150000, invoiceFx: 1, controlAccount: '1120' });
  });

  it('splits an instalment invoice into its unpaid parts, and skips a settled invoice', async () => {
    const inv = (await listArInvoices()).find((i) => i.status === 'Open' && i.currency === 'PHP' && i.appliedAmount === 0)!;
    const split: ArInvoice = { ...inv, installments: 3, appliedAmount: 1, fxRate: 0, controlAccount: '' };
    const rows = openRows(inv.customerId, 'PHP', [split, { ...inv, id: 'settled', appliedAmount: 1e12 }], ctx);
    expect(rows.map((r) => r.installment)).toEqual([1, 2, 3]);
    expect(rows[0].balanceDue).toBe(rows[1].balanceDue - 1);
    expect(rows.every((r) => r.invoiceFx === 1 && r.controlAccount === '1120')).toBe(true);
  });
});

describe('incoming payment journal', () => {
  it('posts a small overpayment and underpayment to their accounts', () => {
    const over = incomingJournal({ ...payment([row()], 1000.5) }, 1);
    expect(lineFor(over, OVERPAYMENT_ACCOUNT)?.credit).toBe(0.5);
    const under = incomingJournal({ ...payment([row()], 999.5) }, 1);
    expect(lineFor(under, UNDERPAYMENT_ACCOUNT)?.debit).toBe(0.5);
  });

  it('books an FX gain when the peso is worth more at payment, and a loss when less', () => {
    const usd = (invoiceFx: number) => incomingJournal({ ...payment([row({ invoiceFx, controlAccount: '' })], 1000), currency: 'USD' }, 58);
    expect(lineFor(usd(56), FX_GAIN_ACCOUNT)?.credit).toBe(2000);
    expect(lineFor(usd(60), FX_LOSS_ACCOUNT)?.debit).toBe(2000);
    // A row with no control account settles against the payment's.
    expect(lineFor(usd(58), '1120')?.credit).toBe(58000);
  });

  it('credits G/L accounts on an account payment', () => {
    const j = incomingJournal({ ...payment([], 500), type: 'Account', accountRows: [newIncomingAccountRow({ account: '7090', amount: 500 })] }, 1);
    expect(lineFor(j, '7090')?.credit).toBe(500);
  });
});

describe('adding an incoming payment', () => {
  it('refuses to settle more than an invoice or down payment invoice still owes', async () => {
    const di = (await getArDownPaymentInvoice('ardi-002'))!;
    await expect(addIncomingPayment(payment([row({ invoiceId: di.id, docType: 'ARDI', amount: 1e7 })], 1e7), 1, ctx)).rejects.toThrow(/ARDI-2026-0002: settling 10000000 but only/);
    await expect(addIncomingPayment(payment([row({ invoiceId: 'gone', amount: 5 })], 5), 1, ctx)).rejects.toThrow(/settling 5 but only 0/);
  });

  it('refuses a difference beyond the allowance, either way', async () => {
    const di = 'ardi-002';
    await expect(addIncomingPayment(payment([row({ invoiceId: di, docType: 'ARDI', amount: 100 })], 500), 1, ctx)).rejects.toThrow('exceed');
    await expect(addIncomingPayment(payment([row({ invoiceId: di, docType: 'ARDI', amount: 100 })], 10), 1, ctx)).rejects.toThrow("don't cover");
  });

  it('refuses a manual number already used', async () => {
    const manual = { seriesId: 'rcs-manual', docNum: 77 };
    await addIncomingPayment(payment([], 0, { ...manual, approved: false }), 1, ctx);
    const err = await addIncomingPayment(payment([], 0, manual), 1, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(IncomingPostError);
    expect(err.message).toContain('Manual no. 77 is already used');
  });

  it('an unapproved payment waits Not Confirmed; recall returns it to draft', async () => {
    const p = await addIncomingPayment(payment([], 0, { approved: false, docNum: 300 }), 57, ctx);
    expect([p.status, p.docNum, p.fxRate]).toEqual(['Not Confirmed', 300, 57]);
    expect((await getIncomingPayment(incomingNumber(p)))?.id).toBe(p.id);
    const recalled = await recallIncomingPayment(p);
    expect([recalled.status, recalled.approved]).toEqual(['Draft', false]);
  });

  it('paying a down payment invoice applies it; cancelling on the original date takes it back', async () => {
    const p = await addIncomingPayment(payment([row({ invoiceId: 'ardi-002', docType: 'ARDI', amount: 2000 })], 2000), 1, ctx);
    expect(p.status).toBe('Posted');
    expect((await getArDownPaymentInvoice('ardi-002'))?.appliedAmount).toBe(2000);

    const cancelled = await cancelIncomingPayment(p, 'original', ctx);
    expect([cancelled.status, cancelled.cancelDate]).toEqual(['Cancelled', DATE]);
    expect(cancelled.journalRemark).toContain('(Cancelled)');
    expect((await getArDownPaymentInvoice('ardi-002'))?.appliedAmount).toBe(0);
  });

  it('endorsed checks block cancelling; notes save only on an existing payment', async () => {
    const p = { ...payment([], 0), id: 'rc-x' } as IncomingPayment;
    const endorsed = { ...p, means: { ...p.means, checks: [newReceivedCheck({ endorsed: true })] } };
    await expect(cancelIncomingPayment(endorsed, 'current', ctx)).rejects.toThrow('endorsed checks');
    await expect(saveIncomingNotes('gone', { remarks: '', attachments: [] })).rejects.toThrow('no longer exists');
  });
});
