/**
 * A/R down payment invoices: totals on the billed share, the contract-liability journal, and the
 * document lifecycle (add, payments applied, drawn by final invoices, close, cancel, recall).
 */
import { describe, expect, it } from 'vitest';
import { SEED_AR_DOWN_PAYMENT_INVOICES, newDiLine, type ArDownPaymentInvoice } from '../../mocks/arDownPaymentInvoices';
import { SEED_TAX_CODES, rateFrom } from '../../mocks/taxes';
import {
  addArDownPaymentInvoice, applyDiPayments, cancelArDownPaymentInvoice, closeArDownPaymentInvoice, diDrawable, diJournal,
  diNumber, diTotal, diTotals, drawArDownPaymentInvoices, getArDownPaymentInvoice, listArDownPaymentInvoices, paidRate,
  recallArDownPaymentInvoice, saveDiDraft, saveDiRemarks,
} from '../arDownPaymentInvoices';

const codes = SEED_TAX_CODES;
const rateOf = rateFrom(codes, '2026-09-10');
const seed = SEED_AR_DOWN_PAYMENT_INVOICES[0]; // ardi-001: 60% of a 500,000 zero-rated service

/** A 12% VAT invoice for a 100,000 order, 50% down, 10% discount. */
const vatInvoice = (patch: Partial<ArDownPaymentInvoice> = {}): ArDownPaymentInvoice => ({
  ...seed,
  id: 'ardi-t',
  dpmPct: 50,
  discountPct: 10,
  lines: [newDiLine({ quantity: 2, unitPrice: 50000, taxCode: 'OVAT', glAccount: '4030', baseType: '' })],
  ...patch,
});

const sum = (lines: { debit: number; credit: number }[], k: 'debit' | 'credit') => lines.reduce((n, l) => n + l[k], 0);

describe('A/R down payment invoice totals', () => {
  it('bills the down payment share after the document discount, with VAT on that share', () => {
    const t = diTotals(vatInvoice(), rateOf);
    expect(t.beforeDiscount).toBe(100000);
    expect(t.dpm).toBe(45000); // 100,000 × 90% × 50%
    expect(t.tax).toBe(5400);
    expect(t.total).toBe(50400);
  });

  it('totals with the tax codes in force on the posting date', () => {
    expect(diTotal(vatInvoice(), codes)).toBe(50400);
    // An unknown code carries no VAT.
    expect(diTotal(vatInvoice({ lines: [newDiLine({ quantity: 1, unitPrice: 1000, taxCode: 'NOPE' })] }), codes)).toBe(450);
  });

  it('numbers from its series', () => {
    expect(diNumber(seed)).toBe('ARDI-2026-0001');
  });
});

describe('what a down payment invoice can still be drawn for', () => {
  it('is nothing until a payment is applied', () => {
    expect(diDrawable(vatInvoice({ appliedAmount: 0, drawnAmount: 0 }), codes)).toBe(0);
  });

  it('is the total less what final invoices have drawn, never below zero', () => {
    expect(diDrawable(vatInvoice({ appliedAmount: 50400, drawnAmount: 20000 }), codes)).toBe(30400);
    expect(diDrawable(vatInvoice({ appliedAmount: 50400, drawnAmount: 60000 }), codes)).toBe(0);
  });

  it('paid rate is the local amount per foreign unit paid, else the document rate', () => {
    expect(paidRate(vatInvoice({ appliedAmount: 100, paidLc: 5800 }))).toBe(58);
    expect(paidRate(vatInvoice({ appliedAmount: 0, fxRate: 57 }))).toBe(57);
    expect(paidRate(vatInvoice({ appliedAmount: 0, fxRate: 0 }))).toBe(1);
  });
});

describe('A/R down payment invoice journal', () => {
  it('credits the advance and output VAT, debits A/R, and balances', () => {
    const j = diJournal(vatInvoice(), 1, { codes, rateOf, withholding: [] });
    expect(sum(j, 'debit')).toBeCloseTo(sum(j, 'credit'), 2);
    expect(j.find((l) => l.account === '1120')?.debit).toBe(50400);
    expect(j.find((l) => l.account === '2150')?.credit).toBe(45000);
    expect(j.find((l) => l.account === '2310')?.credit).toBe(5400);
  });

  it('debits creditable withholding, converts at the rate, and falls back on default accounts', () => {
    const inv = vatInvoice({ controlAccount: '', downPaymentAccount: '', lines: [newDiLine({ quantity: 1, unitPrice: 1000, taxCode: 'XVAT' })] });
    const j = diJournal(inv, 2, { codes, rateOf, withholding: [{ account: '1440', amount: 9 }] });
    expect(j.find((l) => l.account === '2150')?.credit).toBe(900); // 1,000 × 90% × 50% × 2
    expect(j.find((l) => l.account === '1440')?.debit).toBe(18);
    expect(j.find((l) => l.account === '1120')?.debit).toBe(882);
    expect(j.some((l) => l.account === '2310')).toBe(false); // exempt: no VAT line
  });
});

describe('A/R down payment invoice lifecycle', () => {
  it('lists the seed and finds an invoice by id or number', async () => {
    expect((await listArDownPaymentInvoices()).length).toBeGreaterThanOrEqual(SEED_AR_DOWN_PAYMENT_INVOICES.length);
    expect((await getArDownPaymentInvoice('ardi-001'))?.id).toBe('ardi-001');
    expect((await getArDownPaymentInvoice('ARDI-2026-0002'))?.id).toBe('ardi-002');
    expect(await getArDownPaymentInvoice('nope')).toBeNull();
  });

  it('saves a draft unnumbered, then adds it with the next number', async () => {
    const { id: _id, ...input } = vatInvoice();
    const draft = await saveDiDraft(input);
    expect(draft.status).toBe('Draft');
    expect(draft.docNum).toBe(0);

    const added = await addArDownPaymentInvoice({ ...draft, approved: true }, 1);
    expect(added.status).toBe('Open');
    expect(added.docNum).toBeGreaterThan(2);
    const pending = await addArDownPaymentInvoice({ ...input, approved: false }, 56);
    expect(pending.status).toBe('Not Confirmed');
    expect(pending.fxRate).toBe(56);
    expect(pending.docNum).toBe(added.docNum + 1);
  });

  it('saves remarks on the stored invoice, and refuses one that no longer exists', async () => {
    const saved = await saveDiRemarks(seed, { remarks: 'Called the customer.' });
    expect(saved.remarks).toBe('Called the customer.');
    await expect(saveDiRemarks({ ...seed, id: 'ardi-gone' }, { remarks: 'x' })).rejects.toThrow('no longer exists');
  });

  it('applies payments and takes them back, never below zero; skips unknown invoices', async () => {
    await applyDiPayments([{ requestId: 'ardi-002', amount: 1000, amountLc: 1000 }, { requestId: 'ardi-gone', amount: 1, amountLc: 1 }], 1);
    expect((await getArDownPaymentInvoice('ardi-002'))?.appliedAmount).toBe(1000);
    await applyDiPayments([{ requestId: 'ardi-002', amount: 5000, amountLc: 5000 }], -1);
    const d = await getArDownPaymentInvoice('ardi-002');
    expect(d?.appliedAmount).toBe(0);
    expect(d?.paidLc).toBe(0);
  });

  it('closes once fully drawn and reopens when a draw is given back', async () => {
    const total = () => 1000;
    await drawArDownPaymentInvoices([{ requestId: 'ardi-002', amount: 1000 }, { requestId: 'ardi-gone', amount: 1 }], total, 1);
    let d = await getArDownPaymentInvoice('ardi-002');
    expect(d?.status).toBe('Closed');
    expect(d?.closeDate).toBe('2026-06-15');

    await drawArDownPaymentInvoices([{ requestId: 'ardi-002', amount: 400 }], total, -1);
    d = await getArDownPaymentInvoice('ardi-002');
    expect(d?.status).toBe('Open');
    expect(d?.closeDate).toBe('');
    expect(d?.drawnAmount).toBe(600);

    // A partial draw on an open invoice leaves it open.
    await drawArDownPaymentInvoices([{ requestId: 'ardi-002', amount: 100 }], total, 1);
    expect((await getArDownPaymentInvoice('ardi-002'))?.status).toBe('Open');
  });

  it('cancels only without applied payments; closes and recalls', async () => {
    await expect(cancelArDownPaymentInvoice(vatInvoice({ appliedAmount: 10 }))).rejects.toThrow('cancel them first');
    expect((await cancelArDownPaymentInvoice(vatInvoice({ appliedAmount: 0 }))).status).toBe('Cancelled');
    expect((await closeArDownPaymentInvoice(seed)).status).toBe('Closed');
    const recalled = await recallArDownPaymentInvoice(seed);
    expect(recalled.status).toBe('Draft');
    expect(recalled.approved).toBe(false);
  });
});
