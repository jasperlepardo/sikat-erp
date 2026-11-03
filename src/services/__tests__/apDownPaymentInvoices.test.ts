/**
 * A/P down payment invoices: totals with reverse-charge VAT, what a paid invoice can still draw, the
 * journal's default accounts, and the lifecycle (add, payments, draws, close, cancel, recall).
 */
import { describe, expect, it } from 'vitest';
import { SEED_TAX_CODES, rateFrom, vatNotPaidToVendor } from '../../mocks/taxes';
import type { DownPaymentInvoice } from '../../mocks/apDownPaymentInvoices';
import { purchasingHistory } from '../purchasingHistory';
import type { WithholdingLine } from '../withholding';
import {
  addDownPaymentInvoice, applyDownPaymentInvoicePayments, cancelDownPaymentInvoice, closeDownPaymentInvoice, dpiDrawable, dpiJournal,
  dpiNumber, dpiTotal, dpiTotals, drawDownPaymentInvoices, drawableAmount, getDownPaymentInvoice, listDownPaymentInvoices, paidRate,
  recallDownPaymentInvoice, saveDpiDraft, saveDpiRemarks,
} from '../apDownPaymentInvoices';

const codes = SEED_TAX_CODES;
const seed = purchasingHistory().downPaymentInvoices[0];
const rateOf = rateFrom(codes, seed.postingDate);
const reverse = (code: string) => vatNotPaidToVendor(codes.find((c) => c.code === code));

/** 40% down on a 10,000 order: one 12% line and one reverse-charge import line, 5% discount. */
const invoice = (patch: Partial<DownPaymentInvoice> = {}): DownPaymentInvoice => ({
  ...seed,
  id: 'dpi-t',
  dpmPct: 40,
  discountPct: 5,
  lines: [
    { ...seed.lines[0], id: 'a', quantity: 1, unitPrice: 6000, discountPct: 0, taxCode: 'IVAT' },
    { ...seed.lines[0], id: 'b', quantity: 2, unitPrice: 2000, discountPct: 0, taxCode: 'IMVAT' },
  ],
  ...patch,
});

describe('A/P down payment invoice totals', () => {
  it('splits VAT paid to the vendor from reverse-charge VAT on the billed share', () => {
    const t = dpiTotals(invoice(), rateOf, reverse);
    expect(t.dpm).toBe(3800); // 10,000 × 95% × 40%
    expect(t.tax).toBe(273.6); // 6,000 × 95% × 40% × 12%
    expect(t.reverseCharge).toBe(182.4);
    expect(t.total).toBe(4073.6);
    // Without a reverse-charge test, every line's VAT is billed.
    expect(dpiTotals(invoice(), rateOf).tax).toBe(456);
  });

  it('totals with the codes in force, and is drawable only once paid', () => {
    expect(dpiTotal(invoice(), codes)).toBe(4073.6);
    expect(dpiDrawable(invoice({ appliedAmount: 0, drawnAmount: 0 }), codes)).toBe(0);
    expect(dpiDrawable(invoice({ appliedAmount: 4073.6, drawnAmount: 1000 }), codes)).toBe(3073.6);
    expect(dpiDrawable(invoice({ appliedAmount: 4073.6, drawnAmount: 9000 }), codes)).toBe(0);
    expect(drawableAmount(invoice({ appliedAmount: 500, drawnAmount: 200 }))).toBe(300);
    expect(drawableAmount(invoice({ appliedAmount: 100, drawnAmount: 200 }))).toBe(0);
  });

  it('paid rate is local per foreign unit paid, else the document rate', () => {
    expect(paidRate(invoice({ appliedAmount: 10, paidLc: 580 }))).toBe(58);
    expect(paidRate(invoice({ appliedAmount: 0, fxRate: 56 }))).toBe(56);
    expect(paidRate(invoice({ appliedAmount: 0, fxRate: 0 }))).toBe(1);
  });

  it('numbers from its series', () => {
    expect(dpiNumber(seed)).toMatch(/^ADPI-2026-\d{4}$/);
  });
});

describe('A/P down payment invoice journal', () => {
  const ewt = (patch: Partial<WithholdingLine>): WithholdingLine => ({ kind: 'Expanded (EWT)', account: '', amount: 10, deducted: true, ...patch } as WithholdingLine);

  it('uses default accounts, skips reverse-charge VAT, withholds only deducted lines, and balances', () => {
    const j = dpiJournal(invoice({ controlAccount: '', downPaymentAccount: '' }), 1, {
      codes,
      rateOf,
      withholding: [ewt({}), ewt({ kind: 'Withholding VAT', account: '', amount: 5 }), ewt({ amount: 99, deducted: false })],
    });
    expect(j.find((l) => l.account === '1150')?.debit).toBe(3800);
    expect(j.find((l) => l.account === '1410')?.debit).toBe(273.6);
    expect(j.some((l) => l.account === '1420')).toBe(false);
    expect(j.find((l) => l.account === '2340')?.credit).toBe(10);
    expect(j.find((l) => l.account === '2330')?.credit).toBe(5);
    expect(j.find((l) => l.account === '2010')?.credit).toBe(4058.6);
  });

  it('falls back to EWT payable for an unknown withholding kind, and posts nothing for an empty invoice', () => {
    const j = dpiJournal(invoice(), 2, { codes, rateOf, withholding: [ewt({ kind: 'Other' as WithholdingLine['kind'] })] });
    expect(j.find((l) => l.account === '2340')?.credit).toBe(20);
    expect(dpiJournal(invoice({ lines: [] }), 1, { codes, rateOf, withholding: [] })).toEqual([]);
  });
});

describe('A/P down payment invoice lifecycle', () => {
  it('lists the seed and finds by id or number', async () => {
    expect((await listDownPaymentInvoices()).length).toBeGreaterThan(0);
    expect((await getDownPaymentInvoice(seed.id))?.id).toBe(seed.id);
    expect((await getDownPaymentInvoice(dpiNumber(seed)))?.id).toBe(seed.id);
    expect(await getDownPaymentInvoice('nope')).toBeNull();
  });

  it('saves a draft, adds it numbered (Open when approved, else Not Confirmed), and recalls', async () => {
    const { id: _id, ...input } = invoice();
    expect((await saveDpiDraft(input)).status).toBe('Draft');
    const added = await addDownPaymentInvoice({ ...input, approved: true }, 1);
    expect(added.status).toBe('Open');
    const pending = await addDownPaymentInvoice({ ...input, approved: false }, 57);
    expect(pending.status).toBe('Not Confirmed');
    expect(pending.fxRate).toBe(57);
    expect(pending.docNum).toBe(added.docNum + 1);
    const recalled = await recallDownPaymentInvoice(pending);
    expect([recalled.status, recalled.approved]).toEqual(['Draft', false]);
  });

  it('applies payments and takes them back, never below zero; skips unknown invoices', async () => {
    const id = seed.id;
    const before = (await getDownPaymentInvoice(id))!;
    await applyDownPaymentInvoicePayments([{ requestId: id, amount: 100, amountLc: 100 }, { requestId: 'gone', amount: 1, amountLc: 1 }], 1);
    expect((await getDownPaymentInvoice(id))?.appliedAmount).toBe(before.appliedAmount + 100);
    await applyDownPaymentInvoicePayments([{ requestId: id, amount: 1e9, amountLc: 1e9 }], -1);
    const after = (await getDownPaymentInvoice(id))!;
    expect([after.appliedAmount, after.paidLc]).toEqual([0, 0]);
  });

  it('closes once fully drawn, reopens when a draw is given back, and stays open on a partial draw', async () => {
    const { id: _id, ...input } = invoice({ drawnAmount: 0 });
    const d = await addDownPaymentInvoice({ ...input, approved: true }, 1);
    const total = () => 500;
    await drawDownPaymentInvoices([{ requestId: d.id, amount: 500 }, { requestId: 'gone', amount: 1 }], total, 1);
    const closed = (await getDownPaymentInvoice(d.id))!;
    expect([closed.status, closed.closeDate]).toEqual(['Closed', '2026-06-15']);

    await drawDownPaymentInvoices([{ requestId: d.id, amount: 100 }], total, -1);
    const back = (await getDownPaymentInvoice(d.id))!;
    expect([back.status, back.closeDate, back.drawnAmount]).toEqual(['Open', '', 400]);

    await drawDownPaymentInvoices([{ requestId: d.id, amount: 50 }], total, 1);
    expect((await getDownPaymentInvoice(d.id))?.status).toBe('Open');
  });

  it('closes, cancels and saves remarks on the stored invoice', async () => {
    expect((await closeDownPaymentInvoice(invoice())).status).toBe('Closed');
    expect((await cancelDownPaymentInvoice(invoice({ appliedAmount: 0 }))).status).toBe('Cancelled');
    const saved = await saveDpiRemarks(seed, { remarks: 'Chased the vendor', paymentBlock: true, paymentOrderRun: false });
    expect([saved.remarks, saved.paymentBlock]).toEqual(['Chased the vendor', true]);
  });

  it('cancels only without applied payments, and refuses remarks on a missing invoice', async () => {
    await expect(cancelDownPaymentInvoice(invoice({ appliedAmount: 1 }))).rejects.toThrow('cancel them first');
    await expect(saveDpiRemarks(invoice({ id: 'gone' }), { remarks: '', paymentBlock: false, paymentOrderRun: false })).rejects.toThrow('no longer exists');
  });
});
