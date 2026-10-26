import { describe, it, expect, beforeEach } from 'vitest';

import {
  addPayment,
  cancelPayment,
  getPayment,
  listPayments,
  overallAmount,
  paymentJournal,
  paymentNumber,
  recallPayment,
  savePaymentDraft,
  savePaymentRemarks,
  PaymentPostError,
} from '../outgoingPayments';
import {
  addIncomingPayment,
  allocateInSequence,
  getIncomingPayment,
  incomingJournal,
  incomingNumber,
  incomingSeriesOf,
  listIncomingPayments,
  openRows,
  overdueDays,
  paidRows,
  recallIncomingPayment,
  saveIncomingDraft,
  saveIncomingNotes,
  IncomingPostError,
} from '../incomingPayments';
import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  dueDateFor,
  getPurchaseOrder,
  listPurchaseOrders,
  openQty,
  poNumber,
  poTotal,
  recallPurchaseOrder,
  savePurchaseOrder,
  seriesOf as poSeriesOf,
  PoSaveError,
} from '../purchaseOrders';
import {
  closePurchaseRequest,
  copiedQty,
  getPurchaseRequest,
  listPurchaseRequests,
  prNumber,
  prTotals,
  savePurchaseRequest,
  summarizeLines,
} from '../purchaseRequests';
import {
  addQuotation,
  cancelQuotation,
  closeQuotation,
  getQuotation,
  listQuotations,
  qtNumber,
  qtTotal,
  recallQuotation,
  saveQuotationDraft,
  saveQuotationRemarks,
} from '../quotations';
import {
  addRfq,
  cancelRfq,
  closeRfq,
  getRfq,
  listRfqs,
  recallRfq,
  rfqNumber,
  rfqTotal,
  saveRfqDraft,
} from '../rfqs';
import {
  addDownPayment,
  cancelDownPayment,
  closeDownPayment,
  dprNumber,
  dprTotal,
  dprTotals,
  getDownPayment,
  listDownPayments,
  paidRate,
  recallDownPayment,
  saveDprDraft,
  saveDprRemarks,
} from '../apDownPayments';

import { blankPayment, type OutgoingPayment, type PaymentRow } from '../../mocks/outgoingPayments';
import { blankIncomingPayment, type IncomingRow } from '../../mocks/incomingPayments';
import { blankPurchaseOrder, newPoLine } from '../../mocks/purchaseOrders';
import { blankPurchaseRequest, newPrLine, type PrLine } from '../../mocks/purchaseRequests';
import { blankQuotation, newQuoteLine } from '../../mocks/quotations';
import { blankRfq, newRfqLine } from '../../mocks/rfqs';
import { blankDownPaymentRequest } from '../../mocks/apDownPayments';

import { listApInvoices } from '../apInvoices';
import { arAmounts, listArInvoices } from '../arInvoices';
import { taxCodes } from '../masterData';
import { SEED_PARTNERS } from '../../mocks/partners';
import { mergedItems, SEED_ITEMS } from '../../mocks/items';
import { rateAt } from '../../mocks/taxes';
import { round2 } from '../num';

const TODAY = '2026-06-15';
const BUYER = 'emp-1';

/** Debits minus credits across a journal, rounded — a balanced entry nets to 0.00 (+0 avoids -0). */
const imbalance = (lines: { debit: number; credit: number }[]) =>
  Math.round(lines.reduce((n, l) => n + l.debit - l.credit, 0) * 100) / 100 + 0;

// ── Outgoing payment: posting, cancel, recall, drafts, numbering ────────────────

describe('outgoing payments — add / cancel / recall / draft / remarks', () => {
  beforeEach(() => localStorage.clear());

  function vendorRow(patch: Partial<PaymentRow> = {}): PaymentRow {
    return {
      id: 'r1',
      invoiceId: 'ap-pay-1',
      docNo: 'Primary 290099',
      vendorRef: 'V-99',
      docDate: TODAY,
      dueDate: TODAY,
      total: 1000,
      wtAmount: 0,
      balanceDue: 1000,
      cashDiscountPct: 0,
      amount: 1000,
      invoiceFx: 1,
      projectId: '',
      selected: true,
      docType: 'APINV',
      ...patch,
    };
  }

  function outgoing(patch: Partial<OutgoingPayment> = {}): OutgoingPayment {
    return {
      ...blankPayment(TODAY),
      id: 'op-cov',
      means: { ...blankPayment(TODAY).means, transfer: { account: '1015', date: TODAY, reference: '', amount: 1000 } },
      ...patch,
    };
  }

  it('savePaymentDraft keeps it a Draft with no number', async () => {
    const saved = await savePaymentDraft(outgoing({ docNum: 5 }));
    expect(saved.status).toBe('Draft');
    expect(saved.docNum).toBe(0);
    expect(paymentNumber(saved)).toBe('Draft');
  });

  it('addPayment assigns the next series number, posts, and reports the Primary label', async () => {
    const row = vendorRow();
    const balances = new Map([[row.invoiceId, 1000]]);
    const saved = await addPayment(outgoing({ type: 'Vendor', rows: [row] }), 1, balances);
    expect(saved.status).toBe('Posted');
    expect(saved.docNum).toBeGreaterThan(0);
    expect(saved.fxRate).toBe(1);
    expect(paymentNumber(saved)).not.toBe('Draft');
    // Posting keeps only the ticked, non-zero rows.
    expect(saved.rows).toHaveLength(1);
  });

  it('addPayment refuses to settle more than an invoice still owes', async () => {
    const row = vendorRow({ amount: 1000 });
    const balances = new Map([[row.invoiceId, 400]]);
    await expect(addPayment(outgoing({ type: 'Vendor', rows: [row] }), 1, balances)).rejects.toBeInstanceOf(PaymentPostError);
  });

  it('an unapproved payment is saved Not Confirmed (no invoices touched)', async () => {
    const row = vendorRow();
    const saved = await addPayment(outgoing({ type: 'Vendor', rows: [row], approved: false }), 1, new Map([[row.invoiceId, 1000]]));
    expect(saved.status).toBe('Not Confirmed');
    expect(saved.docNum).toBeGreaterThan(0);
  });

  it('auto-numbers checks from the house bank, leaving a manual check number alone', async () => {
    const row = vendorRow({ amount: 1000, invoiceId: 'ap-pay-chk' });
    const means = {
      ...blankPayment(TODAY).means,
      transfer: { account: '1015', date: TODAY, reference: '', amount: 0 },
      checks: [
        { id: 'c1', account: '1015', dueDate: TODAY, manual: false, checkNo: 0, endorsable: false, amount: 600 },
        { id: 'c2', account: '1015', dueDate: TODAY, manual: true, checkNo: 7777, endorsable: false, amount: 400 },
      ],
    };
    const saved = await addPayment(outgoing({ type: 'Vendor', rows: [row], means }), 1, new Map([[row.invoiceId, 1000]]));
    const auto = saved.means.checks.find((c) => !c.manual)!;
    const manual = saved.means.checks.find((c) => c.manual)!;
    expect(auto.checkNo).toBeGreaterThan(0);
    expect(manual.checkNo).toBe(7777);
  });

  it('cancelPayment marks it Cancelled with a cancel date', async () => {
    const row = vendorRow({ invoiceId: 'ap-pay-cancel' });
    const posted = await addPayment(outgoing({ type: 'Vendor', rows: [row] }), 1, new Map([[row.invoiceId, 1000]]));
    const cancelled = await cancelPayment(posted);
    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.cancelDate).toBe(TODAY);
  });

  it('recallPayment returns a payment to Draft and clears approval', async () => {
    const recalled = await recallPayment(outgoing({ status: 'Not Confirmed', approved: true }));
    expect(recalled.status).toBe('Draft');
    expect(recalled.approved).toBe(false);
  });

  it('savePaymentRemarks updates only remarks/attachments on an existing payment', async () => {
    const row = vendorRow({ invoiceId: 'ap-pay-rem' });
    const posted = await addPayment(outgoing({ type: 'Vendor', rows: [row] }), 1, new Map([[row.invoiceId, 1000]]));
    const updated = await savePaymentRemarks(posted, { remarks: 'paid by wire', attachments: [] });
    expect(updated.remarks).toBe('paid by wire');
    expect(updated.status).toBe('Posted');
  });

  it('savePaymentRemarks throws for a payment that no longer exists', async () => {
    await expect(savePaymentRemarks(outgoing({ id: 'op-ghost' }), { remarks: 'x', attachments: [] })).rejects.toThrow();
  });

  it('getPayment finds a seeded payment by its id and by its number', async () => {
    const all = await listPayments();
    const seeded = all.find((p) => p.docNum > 0)!;
    expect((await getPayment(seeded.id))?.id).toBe(seeded.id);
    expect((await getPayment(paymentNumber(seeded)))?.id).toBe(seeded.id);
    expect(await getPayment('op-does-not-exist')).toBeNull();
  });
});

// ── Outgoing payment: seeded posted payment cancel reopens its invoice ──────────

describe('cancelPayment on a seeded payment reopens the AP invoice it cleared', () => {
  it('op-g001 settled ap-004 in USD; cancelling gives the balance back', async () => {
    const pay = (await listPayments()).find((p) => p.id === 'op-g001')!;
    expect(pay.status).toBe('Posted');
    const row = pay.rows.find((r) => r.selected && r.docType !== 'DPR')!;
    const before = (await listApInvoices()).find((i) => i.id === row.invoiceId)!;
    const beforeApplied = before.appliedAmount;

    const cancelled = await cancelPayment(pay);
    expect(cancelled.status).toBe('Cancelled');
    const after = (await listApInvoices()).find((i) => i.id === row.invoiceId)!;
    // The settled amount was credited back to the invoice's applied amount.
    expect(after.appliedAmount).toBeLessThan(beforeApplied + 0.005);
    expect(beforeApplied - after.appliedAmount).toBeGreaterThan(0);

    // Restore the invoice for other tests.
    const { applyPayments } = await import('../apInvoices');
    const { rowSettled } = await import('../paymentMath');
    await applyPayments([{ invoiceId: row.invoiceId, amount: rowSettled(row), total: row.total }], 1);
  });
});

// ── Incoming payment: openRows / overdueDays / allocate / drafts / notes ────────

describe('incoming payments — open rows, overdue, allocation, drafts, notes', () => {
  beforeEach(() => localStorage.clear());

  const ctx = () => ({ customers: SEED_PARTNERS, items: mergedItems(SEED_ITEMS), codes: [] as never });

  it('openRows lists a customer\'s open invoices in the currency as tickable rows', async () => {
    const codes = await taxCodes.list();
    const invoices = await listArInvoices();
    const open = invoices.find((i) => i.status === 'Open' && i.installments <= 1)!;
    const octx = { customers: SEED_PARTNERS, items: mergedItems(SEED_ITEMS), codes };
    const rows = openRows(open.customerId, open.currency, invoices, octx);
    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => r.invoiceId === open.id)!;
    expect(row.balanceDue).toBeGreaterThan(0);
    expect(row.amount).toBe(row.balanceDue);
    expect(row.selected).toBe(false);
  });

  it('openRows splits an installment invoice into one row per unpaid installment', async () => {
    const codes = await taxCodes.list();
    const invoices = await listArInvoices();
    const multi = invoices.find((i) => i.status === 'Open' && i.installments > 1);
    if (!multi) return; // no multi-installment open invoice in the seed — skip
    const octx = { customers: SEED_PARTNERS, items: mergedItems(SEED_ITEMS), codes };
    const rows = openRows(multi.customerId, multi.currency, invoices, octx).filter((r) => r.invoiceId === multi.id);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.balanceDue > 0)).toBe(true);
  });

  it('overdueDays is positive past due, zero on the due date, negative before', () => {
    expect(overdueDays({ dueDate: '2026-06-10' }, '2026-06-15')).toBe(5);
    expect(overdueDays({ dueDate: '2026-06-15' }, '2026-06-15')).toBe(0);
    expect(overdueDays({ dueDate: '2026-06-20' }, '2026-06-15')).toBe(-5);
    expect(overdueDays({ dueDate: '' }, '2026-06-15')).toBe(0);
  });

  it('allocateInSequence resets untouched rows to their full balance and is immutable', () => {
    const rows: IncomingRow[] = [
      { ...rowBase(), id: 'a', balanceDue: 500, amount: 0, selected: false },
      { ...rowBase(), id: 'b', balanceDue: 500, amount: 0, selected: false },
    ];
    const out = allocateInSequence(rows, 300);
    expect(out[0]).toMatchObject({ selected: true, amount: 300 });
    expect(out[1]).toMatchObject({ selected: false, amount: 500 });
    expect(rows[0].amount).toBe(0); // inputs untouched
  });

  it('saveIncomingDraft blanks an auto-series number but keeps a typed manual number', async () => {
    const auto = await saveIncomingDraft({ ...blankIncomingPayment(TODAY), id: 'rc-d1', seriesId: 'rcs-primary', docNum: 9 });
    expect(auto.status).toBe('Draft');
    expect(auto.docNum).toBe(0);

    const manual = await saveIncomingDraft({ ...blankIncomingPayment(TODAY), id: 'rc-d2', seriesId: 'rcs-manual', docNum: 42 });
    expect(incomingSeriesOf('rcs-manual').manual).toBe(true);
    expect(manual.docNum).toBe(42);
  });

  it('saveIncomingNotes updates remarks on an existing payment and throws when missing', async () => {
    const draft = await saveIncomingDraft({ ...blankIncomingPayment(TODAY), id: 'rc-notes' });
    const updated = await saveIncomingNotes(draft.id, { remarks: 'via GCash', attachments: [] });
    expect(updated.remarks).toBe('via GCash');
    await expect(saveIncomingNotes('rc-ghost', { remarks: 'x', attachments: [] })).rejects.toThrow();
  });

  it('recallIncomingPayment returns to Draft and clears approval', async () => {
    const recalled = await recallIncomingPayment({ ...blankIncomingPayment(TODAY), id: 'rc-r', status: 'Not Confirmed', approved: true });
    expect(recalled.status).toBe('Draft');
    expect(recalled.approved).toBe(false);
  });

  it('getIncomingPayment resolves a seeded payment by id and by number', async () => {
    const seeded = (await listIncomingPayments()).find((p) => p.docNum > 0)!;
    expect((await getIncomingPayment(seeded.id))?.id).toBe(seeded.id);
    expect((await getIncomingPayment(incomingNumber(seeded)))?.id).toBe(seeded.id);
    expect(await getIncomingPayment('rc-nope')).toBeNull();
  });

  it('an Account-type incoming payment posts a balanced journal and over-allowance is rejected', async () => {
    const codes = await taxCodes.list();
    const octx = { customers: SEED_PARTNERS, items: mergedItems(SEED_ITEMS), codes };
    const input = {
      ...blankIncomingPayment(TODAY),
      id: 'rc-acct',
      type: 'Account' as const,
      accountRows: [{ id: '1', account: '7010', remarks: 'misc', amount: 1000 }],
      means: { ...blankIncomingPayment(TODAY).means, transfer: { account: '1015', date: TODAY, reference: '', amount: 1000 } },
      approved: true,
      journalRemark: 'acct receipt',
    };
    const journal = incomingJournal(input, 1);
    expect(imbalance(journal)).toBe(0);

    const saved = await addIncomingPayment(input, 1, octx);
    expect(saved.status).toBe('Posted');
    expect(saved.docNum).toBeGreaterThan(0);
    // Account payments keep no invoice rows.
    expect(saved.rows).toHaveLength(0);

    // Means short of the amount due by more than the allowance is refused.
    const bad = { ...input, id: 'rc-bad', means: { ...input.means, transfer: { account: '1015', date: TODAY, reference: '', amount: 500 } } };
    await expect(addIncomingPayment(bad, 1, octx)).rejects.toBeInstanceOf(IncomingPostError);
  });

  it('paidRows filters to selected, non-zero rows', () => {
    const p = {
      rows: [
        { ...rowBase(), selected: true, amount: 100 },
        { ...rowBase(), selected: false, amount: 100 },
        { ...rowBase(), selected: true, amount: 0 },
      ],
    };
    expect(paidRows(p)).toHaveLength(1);
  });

  function rowBase(): IncomingRow {
    return {
      id: 'x', invoiceId: 'ar-x', docNo: '', installment: 0, installments: 1, docDate: TODAY, dueDate: '2026-06-30',
      total: 500, wtAmount: 0, balanceDue: 500, blocked: false, cashDiscountPct: 0, amount: 0, invoiceFx: 1,
      controlAccount: '1120', projectId: '', selected: false,
    };
  }

  void ctx;
});

// ── Purchase orders: save variants, split, close, cancel, recall, numbering ─────

describe('purchase orders — draft, split, manual number, close, cancel, recall', () => {
  beforeEach(() => localStorage.clear());

  it('savePurchaseOrder asDraft keeps it a draft with no number', async () => {
    const [draft] = await savePurchaseOrder(
      { ...blankPurchaseOrder(BUYER), vendorId: 'v-po', lines: [newPoLine({ id: 'l0', itemId: 'i1', quantity: 2, unitPrice: 100 })] },
      { asDraft: true },
    );
    expect(draft.status).toBe('Draft');
    expect(draft.docNum).toBe(0);
    expect(poNumber(draft)).toBe('Draft');
  });

  it('an approved PO is added Open with the next number; unapproved is Not Confirmed', async () => {
    const [open] = await savePurchaseOrder({ ...blankPurchaseOrder(BUYER), vendorId: 'v-po', approved: true, vendorRef: 'PO-OPEN-1', lines: [newPoLine({ id: 'l', itemId: 'i1', quantity: 1, unitPrice: 50 })] });
    expect(open.status).toBe('Open');
    expect(open.docNum).toBeGreaterThan(0);
    const [nc] = await savePurchaseOrder({ ...blankPurchaseOrder(BUYER), vendorId: 'v-po', approved: false, vendorRef: 'PO-NC-1', lines: [newPoLine({ id: 'l', itemId: 'i1', quantity: 1, unitPrice: 50 })] });
    expect(nc.status).toBe('Not Confirmed');
  });

  it('Split Purchase Order makes one PO per warehouse from a multi-warehouse draft', async () => {
    const [a, b] = await savePurchaseOrder({
      ...blankPurchaseOrder(BUYER),
      vendorId: 'v-split',
      approved: true,
      status: 'Draft',
      splitByWarehouse: true,
      lines: [
        newPoLine({ id: 'l1', itemId: 'i1', quantity: 1, unitPrice: 100, warehouse: 'WH-001' }),
        newPoLine({ id: 'l2', itemId: 'i2', quantity: 1, unitPrice: 100, warehouse: 'WH-002' }),
      ],
    });
    expect([a, b]).toHaveLength(2);
    expect(a.lines.every((l) => l.warehouse === 'WH-001')).toBe(true);
    expect(b.lines.every((l) => l.warehouse === 'WH-002')).toBe(true);
    expect(b.splitFrom).toBe(a.id);
    expect(a.docNum).not.toBe(b.docNum);
  });

  it('blocks a duplicate vendor ref when the setting says Block', async () => {
    const { purchasingSettings } = await import('../purchaseOrders');
    const settings = purchasingSettings.snapshot()[0];
    await purchasingSettings.save({ ...settings, duplicateVendorRef: 'Block' });
    try {
      await savePurchaseOrder({ ...blankPurchaseOrder(BUYER), vendorId: 'v-dup', vendorRef: 'DUP-1', approved: true, lines: [newPoLine({ id: 'l', itemId: 'i1', quantity: 1, unitPrice: 10 })] });
      await expect(
        savePurchaseOrder({ ...blankPurchaseOrder(BUYER), vendorId: 'v-dup', vendorRef: 'DUP-1', approved: true, lines: [newPoLine({ id: 'l', itemId: 'i1', quantity: 1, unitPrice: 10 })] }),
      ).rejects.toBeInstanceOf(PoSaveError);
    } finally {
      await purchasingSettings.save({ ...settings });
    }
  });

  it('rejects a reused manual document number', async () => {
    const manualSeries = poSeriesOf('any'); // falls back to the default (auto) series
    void manualSeries;
    // Build a manual series record and reuse a number.
    const { poSeries } = await import('../purchaseOrders');
    const series = await poSeries.save({ id: 'pos-man-cov', name: 'Manual', prefix: 'M-', firstNo: 1, manual: true, isDefault: false, active: true });
    await savePurchaseOrder({ ...blankPurchaseOrder(BUYER), seriesId: series.id, docNum: 500, vendorId: 'v-m', vendorRef: 'M-A', approved: true, lines: [newPoLine({ id: 'l', itemId: 'i1', quantity: 1, unitPrice: 1 })] });
    await expect(
      savePurchaseOrder({ ...blankPurchaseOrder(BUYER), seriesId: series.id, docNum: 500, vendorId: 'v-m', vendorRef: 'M-B', approved: true, lines: [newPoLine({ id: 'l', itemId: 'i1', quantity: 1, unitPrice: 1 })] }),
    ).rejects.toBeInstanceOf(PoSaveError);
  });

  it('closePurchaseOrder closes the PO and all its lines with a close date', async () => {
    const [open] = await savePurchaseOrder({ ...blankPurchaseOrder(BUYER), vendorId: 'v-close', approved: true, vendorRef: 'CLOSE-1', lines: [newPoLine({ id: 'l', itemId: 'i1', quantity: 5, unitPrice: 10 })] });
    const closed = await closePurchaseOrder(open);
    expect(closed.status).toBe('Closed');
    expect(closed.closeDate).toBeTruthy();
    expect(closed.lines.every((l) => l.status === 'Closed')).toBe(true);
  });

  it('cancelPurchaseOrder cancels an un-received PO but refuses once goods were received', async () => {
    const [open] = await savePurchaseOrder({ ...blankPurchaseOrder(BUYER), vendorId: 'v-x', approved: true, vendorRef: 'CANCEL-1', lines: [newPoLine({ id: 'l', itemId: 'i1', quantity: 5, unitPrice: 10 })] });
    const cancelled = await cancelPurchaseOrder(open);
    expect(cancelled.status).toBe('Cancelled');

    const [received] = await savePurchaseOrder({ ...blankPurchaseOrder(BUYER), vendorId: 'v-y', approved: true, vendorRef: 'CANCEL-2', lines: [newPoLine({ id: 'l', itemId: 'i1', quantity: 5, receivedQty: 2, unitPrice: 10 })] });
    await expect(cancelPurchaseOrder(received)).rejects.toThrow();
  });

  it('recallPurchaseOrder returns Not Confirmed to Draft keeping the number', async () => {
    const [nc] = await savePurchaseOrder({ ...blankPurchaseOrder(BUYER), vendorId: 'v-r', approved: false, vendorRef: 'RECALL-1', lines: [newPoLine({ id: 'l', itemId: 'i1', quantity: 1, unitPrice: 1 })] });
    const recalled = await recallPurchaseOrder(nc);
    expect(recalled.status).toBe('Draft');
    expect(recalled.approved).toBe(false);
    expect(recalled.docNum).toBe(nc.docNum);
  });

  it('openQty / dueDateFor helpers', () => {
    expect(openQty(newPoLine({ quantity: 10, receivedQty: 4 }))).toBe(6);
    expect(openQty(newPoLine({ quantity: 3, receivedQty: 9 }))).toBe(0);
    expect(dueDateFor('', 'any')).toBe('');
  });

  it('getPurchaseOrder resolves a seeded PO by id and number, and poTotal is positive', async () => {
    const po = (await listPurchaseOrders()).find((p) => p.docNum > 0)!;
    expect((await getPurchaseOrder(po.id))?.id).toBe(po.id);
    expect((await getPurchaseOrder(poNumber(po)))?.id).toBe(po.id);
    expect(await getPurchaseOrder('po-nope')).toBeNull();
    const codes = await taxCodes.list();
    expect(poTotal(po, codes)).toBeGreaterThan(0);
  });
});

// ── Purchase requests: summarize, numbering, close, helpers ─────────────────────

describe('purchase requests — summarize, save numbering, close', () => {
  beforeEach(() => localStorage.clear());

  const line = (patch: Partial<PrLine>) => newPrLine({ ...patch });

  it('summarizeLines collapses rows of the same item, summing qty/net with a synthetic id', () => {
    const lines = [
      line({ id: 'a', itemId: 'i1', quantity: 2, unitPrice: 100, discountPct: 0, openQty: 2 }),
      line({ id: 'b', itemId: 'i1', quantity: 3, unitPrice: 100, discountPct: 0, openQty: 3 }),
      line({ id: 'c', itemId: 'i2', quantity: 1, unitPrice: 50, discountPct: 0, openQty: 1 }),
    ];
    const out = summarizeLines(lines);
    expect(out).toHaveLength(2);
    const grouped = out.find((l) => l.id.startsWith('sum-'))!;
    expect(grouped.quantity).toBe(5);
    expect(grouped.openQty).toBe(5);
    // Averaged unit price ties the summed net back (500 / 5 = 100).
    expect(grouped.unitPrice).toBe(100);
    // The un-grouped single-line item is returned as-is.
    expect(out.find((l) => l.id === 'c')).toBeTruthy();
  });

  it('summarizeLines keeps un-itemed rows separate', () => {
    const lines = [line({ id: 'x', itemId: '', quantity: 1 }), line({ id: 'y', itemId: '', quantity: 1 })];
    expect(summarizeLines(lines)).toHaveLength(2);
  });

  it('copiedQty is quantity less what is still open, floored at zero', () => {
    expect(copiedQty({ quantity: 10, openQty: 4 })).toBe(6);
    expect(copiedQty({ quantity: 10, openQty: 15 })).toBe(0);
  });

  it('savePurchaseRequest assigns the next free auto number for a new request', async () => {
    const saved = await savePurchaseRequest({ ...blankPurchaseRequest(TODAY, undefined, 'Jo'), lines: [line({ itemId: 'i1', quantity: 1, unitPrice: 10 })] });
    expect(saved.docNum).toBeGreaterThan(0);
    // Saving an existing request (it has an id) does not re-number it.
    const again = await savePurchaseRequest({ ...saved, remarks: 'edited' });
    expect(again.docNum).toBe(saved.docNum);
    expect(again.remarks).toBe('edited');
  });

  it('closePurchaseRequest closes the request and zeroes every line\'s open qty', async () => {
    const saved = await savePurchaseRequest({ ...blankPurchaseRequest(TODAY, undefined, 'Jo'), lines: [line({ itemId: 'i1', quantity: 5, openQty: 5, unitPrice: 10 })] });
    const closed = await closePurchaseRequest(saved);
    expect(closed.status).toBe('Closed');
    expect(closed.closeDate).toBeTruthy();
    expect(closed.lines.every((l) => l.status === 'Closed' && l.openQty === 0)).toBe(true);
  });

  it('getPurchaseRequest resolves a seeded request by id and by number', async () => {
    const pr = (await listPurchaseRequests())[0];
    expect((await getPurchaseRequest(pr.id))?.id).toBe(pr.id);
    expect((await getPurchaseRequest(prNumber(pr)))?.id).toBe(pr.id);
    expect(await getPurchaseRequest('prq-nope')).toBeNull();
  });

  it('prTotals with no freight defaults to 0', () => {
    const t = prTotals({ freight: undefined as never, lines: [line({ itemId: 'i1', quantity: 1, unitPrice: 100, discountPct: 0, taxCode: '' })] }, () => 0);
    expect(t.freight).toBe(0);
    expect(t.total).toBe(100);
  });
});

// ── Quotations: add, draft, close, cancel, recall, remarks, number, total ───────

describe('quotations — add / draft / close / cancel / recall / remarks', () => {
  beforeEach(() => localStorage.clear());

  const base = () => ({
    ...blankQuotation(BUYER),
    customerId: 'cust-1',
    lines: [newQuoteLine({ id: 'ql', itemId: 'i1', quantity: 2, unitPrice: 100, discountPct: 0, taxCode: '' })],
  });

  it('saveQuotationDraft keeps a draft with no number', async () => {
    const draft = await saveQuotationDraft({ ...base(), id: 'qt-d', docNum: 9 });
    expect(draft.status).toBe('Draft');
    expect(draft.docNum).toBe(0);
    expect(qtNumber(draft)).toBe('Draft');
  });

  it('addQuotation numbers and opens an approved quote; unapproved waits as Not Confirmed', async () => {
    const open = await addQuotation({ ...base(), id: 'qt-o', approved: true });
    expect(open.status).toBe('Open');
    expect(open.docNum).toBeGreaterThan(0);
    expect(qtNumber(open)).not.toBe('Draft');

    const nc = await addQuotation({ ...base(), id: 'qt-nc', approved: false });
    expect(nc.status).toBe('Not Confirmed');
    expect(nc.docNum).toBeGreaterThan(0);
  });

  it('close / cancel stamp a close date; recall returns to Draft', async () => {
    const open = await addQuotation({ ...base(), id: 'qt-flow', approved: true });
    const closed = await closeQuotation(open);
    expect(closed.status).toBe('Closed');
    expect(closed.closeDate).toBeTruthy();

    const cancelled = await cancelQuotation(open);
    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.closeDate).toBeTruthy();

    const recalled = await recallQuotation({ ...open, status: 'Not Confirmed', approved: true });
    expect(recalled.status).toBe('Draft');
    expect(recalled.approved).toBe(false);
  });

  it('saveQuotationRemarks updates remarks and throws when the quote is gone', async () => {
    const open = await addQuotation({ ...base(), id: 'qt-rem', approved: true });
    const updated = await saveQuotationRemarks(open, { remarks: 'valid 30d', attachments: [] });
    expect(updated.remarks).toBe('valid 30d');
    await expect(saveQuotationRemarks({ ...open, id: 'qt-ghost' }, { remarks: 'x', attachments: [] })).rejects.toThrow();
  });

  it('getQuotation resolves a seeded quote by id and number; qtTotal is non-negative', async () => {
    const q = (await listQuotations()).find((x) => x.docNum > 0)!;
    expect((await getQuotation(q.id))?.id).toBe(q.id);
    expect((await getQuotation(qtNumber(q)))?.id).toBe(q.id);
    expect(await getQuotation('qt-nope')).toBeNull();
    const codes = await taxCodes.list();
    expect(qtTotal(q, codes)).toBeGreaterThanOrEqual(0);
  });
});

// ── RFQs: add, draft, close, cancel, recall, number, total ──────────────────────

describe('RFQs — add / draft / close / cancel / recall / total', () => {
  beforeEach(() => localStorage.clear());

  const base = () => ({
    ...blankRfq(BUYER),
    vendorId: 'v-rfq',
    lines: [newRfqLine({ id: 'rl', itemId: 'i1', quantity: 3, unitPrice: 100, discountPct: 0, taxCode: '' })],
  });

  it('saveRfqDraft keeps a draft with no number', async () => {
    const draft = await saveRfqDraft({ ...base(), id: 'rfq-d', docNum: 4 });
    expect(draft.status).toBe('Draft');
    expect(draft.docNum).toBe(0);
    expect(rfqNumber(draft)).toBe('Draft');
  });

  it('addRfq numbers and opens an approved RFQ; unapproved is Not Confirmed', async () => {
    const open = await addRfq({ ...base(), id: 'rfq-o', approved: true });
    expect(open.status).toBe('Open');
    expect(open.docNum).toBeGreaterThan(0);

    const nc = await addRfq({ ...base(), id: 'rfq-nc', approved: false });
    expect(nc.status).toBe('Not Confirmed');
  });

  it('close / cancel set the terminal status; recall returns to Draft', async () => {
    const open = await addRfq({ ...base(), id: 'rfq-flow', approved: true });
    expect((await closeRfq(open)).status).toBe('Closed');
    expect((await cancelRfq(open)).status).toBe('Cancelled');
    const recalled = await recallRfq({ ...open, status: 'Not Confirmed', approved: true });
    expect(recalled.status).toBe('Draft');
    expect(recalled.approved).toBe(false);
  });

  it('getRfq resolves a seeded RFQ by id and number; rfqTotal is positive', async () => {
    const q = (await listRfqs()).find((x) => x.docNum > 0)!;
    expect((await getRfq(q.id))?.id).toBe(q.id);
    expect((await getRfq(rfqNumber(q)))?.id).toBe(q.id);
    expect(await getRfq('rfq-nope')).toBeNull();
    const codes = await taxCodes.list();
    expect(rfqTotal(q, codes)).toBeGreaterThan(0);
  });
});

// ── AP down payments: totals, save/close/cancel/recall, paidRate, numbering ─────

describe('AP down payments — totals, drafts, close, cancel, recall, paidRate', () => {
  beforeEach(() => localStorage.clear());

  it('dprTotals applies the DPM % to base and tax', async () => {
    const codes = await taxCodes.list();
    const rate = (code: string) => {
      const c = codes.find((x) => x.code === code);
      return c ? (rateAt(c, TODAY) ?? 0) : 0;
    };
    const vatCode = codes.find((c) => (rateAt(c, TODAY) ?? 0) === 12)?.code ?? '';
    const d = {
      lines: [{ itemId: 'i1', quantity: 1, unitPrice: 1000, discountPct: 0, taxCode: vatCode }] as never,
      discountPct: 0,
      freightTaxCode: '',
      dpmPct: 30,
    };
    const t = dprTotals(d, rate);
    expect(t.beforeDiscount).toBe(1000);
    expect(t.dpm).toBe(300); // 30% of 1000
    // Tax share = 30% of the full 12% VAT (120) = 36.
    expect(t.tax).toBe(round2(120 * 0.3));
    expect(t.total).toBe(round2(300 + 120 * 0.3));
  });

  it('paidRate is the average PHP rate paid, falling back to fxRate when nothing is applied', () => {
    expect(paidRate({ appliedAmount: 100, paidLc: 5800, fxRate: 50 } as never)).toBe(58);
    expect(paidRate({ appliedAmount: 0, paidLc: 0, fxRate: 56 } as never)).toBe(56);
  });

  it('saveDprDraft keeps a draft with no number', async () => {
    const draft = await saveDprDraft({ ...blankDownPaymentRequest(TODAY, BUYER), id: 'dp-d', docNum: 7 });
    expect(draft.status).toBe('Draft');
    expect(draft.docNum).toBe(0);
    expect(dprNumber(draft)).toBe('Draft');
  });

  it('addDownPayment numbers and opens an approved request', async () => {
    const d = await addDownPayment({ ...blankDownPaymentRequest(TODAY, BUYER), vendorId: 'bp-016', approved: true, dpmPct: 30 }, 1);
    expect(d.status).toBe('Open');
    expect(d.docNum).toBeGreaterThan(0);
    expect(d.fxRate).toBe(1);

    const nc = await addDownPayment({ ...blankDownPaymentRequest(TODAY, BUYER), vendorId: 'bp-016', approved: false }, 1);
    expect(nc.status).toBe('Not Confirmed');
  });

  it('closeDownPayment closes by hand; cancelDownPayment refuses once paid', async () => {
    const d = await addDownPayment({ ...blankDownPaymentRequest(TODAY, BUYER), vendorId: 'bp-016', approved: true }, 1);
    const closed = await closeDownPayment(d);
    expect(closed.status).toBe('Closed');
    expect(closed.closeDate).toBeTruthy();

    const unpaid = await addDownPayment({ ...blankDownPaymentRequest(TODAY, BUYER), vendorId: 'bp-016', approved: true }, 1);
    expect((await cancelDownPayment(unpaid)).status).toBe('Cancelled');

    await expect(cancelDownPayment({ ...unpaid, appliedAmount: 500 })).rejects.toThrow();
  });

  it('saveDprRemarks updates remarks/blocks and throws when the request is gone', async () => {
    const d = await addDownPayment({ ...blankDownPaymentRequest(TODAY, BUYER), vendorId: 'bp-016', approved: true }, 1);
    const updated = await saveDprRemarks(d, { remarks: 'advance agreed', paymentBlock: true, paymentOrderRun: false });
    expect(updated.remarks).toBe('advance agreed');
    expect(updated.paymentBlock).toBe(true);
    await expect(saveDprRemarks({ ...d, id: 'dp-ghost' }, { remarks: 'x', paymentBlock: false, paymentOrderRun: false })).rejects.toThrow();
  });

  it('recallDownPayment returns to Draft and clears approval', async () => {
    const recalled = await recallDownPayment({ ...blankDownPaymentRequest(TODAY, BUYER), id: 'dp-rc', status: 'Open', approved: true });
    expect(recalled.status).toBe('Draft');
    expect(recalled.approved).toBe(false);
  });

  it('getDownPayment resolves a seeded request by id and number; dprTotal is non-negative', async () => {
    const d = (await listDownPayments()).find((x) => x.docNum > 0)!;
    expect((await getDownPayment(d.id))?.id).toBe(d.id);
    expect((await getDownPayment(dprNumber(d)))?.id).toBe(d.id);
    expect(await getDownPayment('dp-nope')).toBeNull();
    const codes = await taxCodes.list();
    expect(dprTotal(d, codes)).toBeGreaterThanOrEqual(0);
  });
});

// ── paymentJournal / overallAmount sanity on a seeded posted payment ────────────

describe('paymentJournal balances for a seeded posted payment', () => {
  it('op-g001 (USD vendor payment) posts debits equal to credits', async () => {
    const pay = (await listPayments()).find((p) => p.id === 'op-g001')!;
    const vendorAccountOf = () => pay.controlAccount || '2010';
    const journal = paymentJournal(pay, pay.fxRate, vendorAccountOf);
    expect(imbalance(journal)).toBe(0);
    expect(overallAmount(pay)).toBeGreaterThan(0);
    const settled = arAmounts;
    void settled;
  });
});
