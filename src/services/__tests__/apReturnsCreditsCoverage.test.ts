/**
 * Coverage-focused unit tests for the A/P-side returns & credits services:
 *   - src/services/apCreditMemos.ts
 *   - src/services/apReserveInvoices.ts
 *
 * Pure helpers (totals, net-credit, sendsStock, baseInvoiceIds, memoJournal, numbering) are
 * exercised directly; the add / save / apply / cancel / recall paths run through the real services,
 * asserting the DOCUMENTED observable effects — status transitions, applied amounts/applications,
 * stock movement, reopening on cancel, and that the journal builder balances (debits == credits).
 *
 * Isolation: setup.ts clears localStorage before each test; mutating tests reverse their own change
 * or use distinct seed documents, and read live rows through the services' list/get.
 */
import { describe, expect, it, vi } from 'vitest';

// Integration-style tests driving several awaited service calls. The shared harness fakes the clock
// and runs files in parallel, so the default 5s timeout can be exceeded under CPU contention. Give
// generous headroom so contention never turns a correct test into a flaky timeout.
vi.setConfig({ testTimeout: 30000 });

import { SEED_ITEMS, mergedItems } from '../../mocks/items';
import { SEED_TAX_CODES, rateAt, vatNotPaidToVendor } from '../../mocks/taxes';
import { blankCreditMemo, newMemoLine, type ApCreditMemo, type MemoLine } from '../../mocks/apCreditMemos';
import {
  blankApReserveInvoice,
  newApRiLine,
  SEED_AP_RESERVE_INVOICES,
  type ApReserveInvoice,
} from '../../mocks/apReserveInvoices';

import {
  addCreditMemo,
  applyCredit,
  baseInvoiceIds,
  cancelCreditMemo,
  getCreditMemo,
  listCreditMemos,
  memoJournal,
  memoNumber,
  memoTotal,
  memoTotals,
  netCredit,
  recallCreditMemo,
  saveMemoDraft,
  saveMemoRemarks,
  sendsStock,
} from '../apCreditMemos';

import {
  addApReserveInvoice,
  apRiNumber,
  apRiTotals,
  cancelApReserveInvoice,
  getApReserveInvoice,
  listApReserveInvoices,
  recallApReserveInvoice,
  saveApRiDraft,
  saveApRiRemarks,
} from '../apReserveInvoices';

import { listApInvoices } from '../apInvoices';
import { listGoodsReturns, returnOpenQty } from '../goodsReturns';
import { listItems, stockTotals } from '../items';
import { itemGroups } from '../inventoryMasters';
import { taxCodes } from '../masterData';
import { returnFromInvoice, memoFromReturn } from '../../pages/purchasing/shared/returnsTypes';

const BUYER = 'emp-1';
const mItems = mergedItems(SEED_ITEMS);

const imbalance = (lines: { debit: number; credit: number }[]) =>
  Math.round(lines.reduce((n, l) => n + l.debit - l.credit, 0) * 100) / 100 + 0;

async function rateOfAt(postingDate: string) {
  const codes = await taxCodes.list();
  const rateOf = (code: string) => {
    const c = codes.find((x) => x.code === code);
    return c ? (rateAt(c, postingDate) ?? 0) : 0;
  };
  const isReverse = (code: string) => vatNotPaidToVendor(codes.find((x) => x.code === code));
  return { codes, rateOf, isReverse };
}

// ── apCreditMemos: pure helpers ─────────────────────────────────────────────────

describe('apCreditMemos pure helpers', () => {
  it('memoNumber formats positionally from the seeded series (firstNo 5)', () => {
    expect(memoNumber({ seriesId: 'cms-primary', docNum: 5, postingDate: '2026-03-01' })).toBe('CM-2026-0005');
    expect(memoNumber({ seriesId: 'cms-primary', docNum: 0, postingDate: '2026-03-01' })).toBe('Draft');
  });

  it('memoTotals / memoTotal sum net + input VAT like a PO', async () => {
    const { rateOf } = await rateOfAt('2026-06-15');
    const line = newMemoLine({ itemId: 'apl-0017', quantity: 2, unitPrice: 1000, taxCode: 'IVAT', itemsPerUnit: 1, discountPct: 0 });
    const m = { lines: [line], discountPct: 0, freight: 0, freightTaxCode: '' } as ApCreditMemo;
    const t = memoTotals(m, rateOf);
    expect(t.beforeDiscount).toBeCloseTo(2000, 2);
    expect(t.total).toBeCloseTo(2240, 2); // 2000 + 12% input VAT
    expect(memoTotal({ ...m, postingDate: '2026-06-15' } as ApCreditMemo, SEED_TAX_CODES)).toBeGreaterThan(0);
  });

  it('netCredit subtracts deducted withholding and down payments', () => {
    const wh = [
      { deducted: true, amount: 200 } as never,
      { deducted: false, amount: 999 } as never,
      { deducted: true, amount: 50 } as never,
    ];
    expect(netCredit(2240, wh, 100)).toBeCloseTo(2240 - 250 - 100, 2);
    expect(netCredit(2240, [], 0)).toBeCloseTo(2240, 2);
  });

  it('sendsStock: true only for returnGoods on a stocked, non-GRET line', () => {
    expect(sendsStock(newMemoLine({ itemId: 'apl-0017', returnGoods: true, baseType: 'APINV' }), mItems)).toBe(true);
    expect(sendsStock(newMemoLine({ itemId: 'apl-0017', returnGoods: false, baseType: 'APINV' }), mItems)).toBe(false);
    // A line from a goods return never sends stock (the return already did).
    expect(sendsStock(newMemoLine({ itemId: 'apl-0017', returnGoods: true, baseType: 'GRET' }), mItems)).toBe(false);
    // Non-inventory service item.
    expect(sendsStock(newMemoLine({ itemId: 'itm-044', returnGoods: true, baseType: 'APINV' }), mItems)).toBe(false);
  });

  it('baseInvoiceIds: APINV lines use baseId, others use invoiceId; distinct and non-empty', () => {
    const m = {
      lines: [
        newMemoLine({ baseType: 'APINV', baseId: 'ap-1', invoiceId: '' }),
        newMemoLine({ baseType: 'APINV', baseId: 'ap-1', invoiceId: '' }),
        newMemoLine({ baseType: 'GRET', baseId: 'ret-1', invoiceId: 'ap-2' }),
        newMemoLine({ baseType: 'GRET', baseId: 'ret-2', invoiceId: '' }),
      ],
    } as ApCreditMemo;
    expect(baseInvoiceIds(m).sort()).toEqual(['ap-1', 'ap-2']);
  });

  it('memoJournal balances and credits the vendor control account', async () => {
    const { codes, rateOf } = await rateOfAt('2026-06-15');
    const groups = await itemGroups.list();
    const items = await listItems();
    const line = newMemoLine({ itemId: 'apl-0017', quantity: 2, unitPrice: 1000, taxCode: 'IVAT', itemsPerUnit: 1, discountPct: 0, warehouse: 'WH-001', returnGoods: true, baseType: 'APINV' });
    const je = memoJournal(
      { lines: [line], discountPct: 0, freight: 0, freightTaxCode: '', controlAccount: '2010' },
      1,
      { items, groups, codes, rateOf, withholding: [] },
    );
    expect(imbalance(je)).toBe(0);
    expect(je.some((l) => l.account === '2010' && l.debit > 0)).toBe(true); // vendor owes back → debit control
  });
});

// ── apCreditMemos: saving + posting ─────────────────────────────────────────────

describe('apCreditMemos save / add / apply / cancel / recall', () => {
  it('saveMemoDraft stores a Draft; getCreditMemo resolves seeds by number', async () => {
    const draft = await saveMemoDraft({ ...blankCreditMemo('2026-06-15', BUYER), vendorId: 'bp-016' });
    expect(draft.status).toBe('Draft');
    expect(draft.docNum).toBe(0);
    const all = await listCreditMemos();
    expect(all.length).toBeGreaterThan(0);
    const seeded = all.find((m) => m.docNum > 0)!;
    expect((await getCreditMemo(memoNumber(seeded)))!.id).toBe(seeded.id);
    expect(await getCreditMemo('no-such-memo')).toBeNull();
  });

  it('saveMemoRemarks patches an existing memo and throws for a missing one', async () => {
    const draft = await saveMemoDraft({ ...blankCreditMemo('2026-06-15', BUYER), vendorId: 'bp-016' });
    const patched = await saveMemoRemarks(draft, { remarks: 'noted', paymentBlock: true, paymentOrderRun: false });
    expect(patched.remarks).toBe('noted');
    expect(patched.paymentBlock).toBe(true);
    await expect(saveMemoRemarks({ ...draft, id: 'cm-nope' }, { remarks: 'x', paymentBlock: false, paymentOrderRun: false })).rejects.toThrow(/no longer exists/);
  });

  it('an unapproved memo is left Not Confirmed and moves no stock', async () => {
    const inv = (await listApInvoices()).find((i) => i.id === 'ap-099')!;
    const items = await listItems();
    const invLine = inv.lines.find((l) => (l.returnedQty ?? 0) === 0 && items.find((it) => it.id === l.itemId)?.inventoryItem)!;
    const stockBefore = stockTotals(items.find((i) => i.id === invLine.itemId)!).inStock;
    const memoLines = returnFromInvoice(inv, [{ lineId: invLine.id, qty: 1 }]).map((l) => ({ ...l, returnReason: '', returnGoods: true, invoiceId: '' }) as unknown as MemoLine);
    const saved = await addCreditMemo(
      { ...blankCreditMemo('2026-06-15', BUYER), vendorId: inv.vendorId, vendorCode: inv.vendorCode, vendorName: inv.vendorName, currency: inv.currency, controlAccount: '2010', approved: false, lines: memoLines },
      1,
      0,
      new Map(),
    );
    expect(saved.status).toBe('Not Confirmed');
    expect(saved.docNum).toBeGreaterThan(0);
    expect(stockTotals((await listItems()).find((i) => i.id === invLine.itemId)!).inStock).toBe(stockBefore);
  });

  it('addCreditMemo rejects returning more than an invoice line has left to return', async () => {
    const inv = (await listApInvoices()).find((i) => i.id === 'ap-099')!;
    const items = await listItems();
    const invLine = inv.lines.find((l) => (l.returnedQty ?? 0) === 0 && items.find((it) => it.id === l.itemId)?.inventoryItem)!;
    const memoLines = returnFromInvoice(inv, [{ lineId: invLine.id, qty: 1 }]).map((l) => ({ ...l, quantity: invLine.quantity + 50, returnReason: '', returnGoods: true, invoiceId: '' }) as unknown as MemoLine);
    await expect(
      addCreditMemo(
        { ...blankCreditMemo('2026-06-15', BUYER), vendorId: inv.vendorId, currency: inv.currency, controlAccount: '2010', approved: true, lines: memoLines },
        1,
        0,
        new Map(),
      ),
    ).rejects.toThrow(/left to return/);
  });

  it('a memo from a goods return credits the base invoice, closes within tolerance, reopens on cancel, and its journal balances', async () => {
    // ap-099: open bill for bp-016 with a stocked line that has stock at WH-001.
    const inv = (await listApInvoices()).find((i) => i.id === 'ap-099')!;
    const items = await listItems();
    const invLine = inv.lines.find((l) => (l.returnedQty ?? 0) === 0 && items.find((it) => it.id === l.itemId)?.inventoryItem)!;
    const stockBefore = stockTotals(items.find((i) => i.id === invLine.itemId)!).inStock;

    // APINV-based goods return → needs a credit memo.
    const { addGoodsReturn, cancelGoodsReturn } = await import('../goodsReturns');
    const { blankGoodsReturn } = await import('../../mocks/goodsReturns');
    const retLines = returnFromInvoice(inv, [{ lineId: invLine.id, qty: 1 }]);
    const ret = await addGoodsReturn({ ...blankGoodsReturn('2026-06-15', BUYER), vendorId: inv.vendorId, vendorCode: inv.vendorCode, vendorName: inv.vendorName, currency: inv.currency, approved: true, lines: retLines });
    expect(ret.status).toBe('Open');
    expect(returnOpenQty(ret.lines[0], ret)).toBe(1);

    // Debit memo from the return.
    const memoLines = memoFromReturn(ret, [{ lineId: ret.lines[0].id, qty: 1 }], items);
    expect(memoLines[0].baseType).toBe('GRET');
    const { codes, rateOf } = await rateOfAt('2026-06-15');
    const total = memoTotals({ discountPct: 0, freight: 0, freightTaxCode: '', lines: memoLines }, rateOf).total;

    const memo = await addCreditMemo(
      { ...blankCreditMemo('2026-06-15', BUYER), vendorId: inv.vendorId, vendorCode: inv.vendorCode, vendorName: inv.vendorName, currency: inv.currency, controlAccount: '2010', approved: true, lines: memoLines },
      1,
      total,
      new Map(), // empty balances: nothing applied to invoices, but the return still closes
    );
    expect(memo.docNum).toBeGreaterThan(0);

    const retAfter = (await listGoodsReturns()).find((r) => r.id === ret.id)!;
    expect(retAfter.status).toBe('Closed');
    expect(retAfter.lines[0].creditedQty).toBeCloseTo(1, 3);

    // Journal balances.
    const groups = await itemGroups.list();
    const je = memoJournal(memo, memo.fxRate, { items: await listItems(), groups, codes, rateOf, withholding: memo.withholdingSummary ?? [] });
    expect(imbalance(je)).toBe(0);

    // Cancel the memo → the return reopens.
    await cancelCreditMemo(memo, new Map());
    const retReopened = (await listGoodsReturns()).find((r) => r.id === ret.id)!;
    expect(retReopened.status).toBe('Open');
    expect(retReopened.lines[0].creditedQty).toBe(0);

    // Clean up the goods return so it doesn't leak stock.
    await cancelGoodsReturn(retReopened);
    expect(stockTotals((await listItems()).find((i) => i.id === invLine.itemId)!).inStock).toBe(stockBefore);
  });

  it('applyCredit spreads leftover credit to vendor invoices and rejects over-applying', async () => {
    // A standalone Open memo with open credit (price-adjustment line, no base invoice).
    const line = newMemoLine({ itemId: 'apl-0017', quantity: 1, unitPrice: 1000, taxCode: 'IVAT', itemsPerUnit: 1, returnGoods: false, baseType: '' });
    const memo = await addCreditMemo(
      { ...blankCreditMemo('2026-06-15', BUYER), vendorId: 'bp-016', controlAccount: '2010', approved: true, lines: [line] },
      1,
      1120,
      new Map(),
    );
    expect(memo.appliedAmount).toBe(0);
    expect(memo.status).toBe('Open');

    // Over-applying throws.
    await expect(applyCredit(memo, 1120, [{ invoiceId: 'any', docNo: 'X', amount: 2000, total: 999999 }])).rejects.toThrow(/left/);

    // Apply the whole credit against an open vendor invoice → memo closes.
    const invoices = await listApInvoices();
    const target = invoices.find((i) => i.vendorId === 'bp-016' && i.status === 'Open')!;
    const applied = await applyCredit(memo, 1120, [{ invoiceId: target.id, docNo: 'SI', amount: 1120, total: 99999 }]);
    expect(applied.appliedAmount).toBeCloseTo(1120, 2);
    expect(applied.status).toBe('Closed');
    expect(applied.applications).toHaveLength(1);
  });

  it('recallCreditMemo returns a Draft with approved cleared', async () => {
    const draft = await saveMemoDraft({ ...blankCreditMemo('2026-06-15', BUYER), vendorId: 'bp-016' });
    const recalled = await recallCreditMemo(draft);
    expect(recalled.status).toBe('Draft');
    expect(recalled.approved).toBe(false);
  });
});

// ── apReserveInvoices ───────────────────────────────────────────────────────────

/** A reserve-invoice input for the seeded import vendor (bp-017). */
function apriInput(patch: Partial<ApReserveInvoice> = {}): Parameters<typeof addApReserveInvoice>[0] {
  const line = newApRiLine({
    id: 'aprl-t1',
    itemId: 'apl-0017',
    itemNo: 'IPH-18P-256-BLK',
    description: 'iPhone 18 Pro, 256GB, Black',
    quantity: 5,
    unitPrice: 1200,
    uomCode: 'pc',
    uomName: 'Piece',
    itemsPerUnit: 1,
    warehouse: '',
    taxCode: 'IMVAT',
    baseType: 'PO',
  });
  return {
    ...blankApReserveInvoice('2026-06-15', BUYER),
    vendorId: 'bp-017',
    vendorCode: 'BP-0017',
    vendorName: 'Apple South Asia Pte. Ltd.',
    currency: 'USD',
    controlAccount: '2010',
    fxRate: 60,
    dueDate: '2026-07-15',
    lines: [line],
    ...patch,
  } as Parameters<typeof addApReserveInvoice>[0];
}

describe('apReserveInvoices pure helpers + numbering', () => {
  it('apRiNumber formats the seeded invoices positionally', () => {
    expect(apRiNumber({ seriesId: 'apri-primary', docNum: 1, postingDate: '2026-08-19' })).toBe('APRI-2026-0001');
    expect(apRiNumber({ seriesId: 'apri-primary', docNum: 0, postingDate: '2026-08-19' })).toBe('Draft');
  });

  it('apRiTotals sums net + input VAT like a PO', async () => {
    const { rateOf } = await rateOfAt('2026-06-15');
    const inv = SEED_AP_RESERVE_INVOICES[0];
    const t = apRiTotals(inv, rateOf, 'No rounding');
    expect(t.beforeDiscount).toBeGreaterThan(0);
    expect(t.total).toBeGreaterThan(0);
  });

  it('the seeded reserve invoices load and resolve by number', async () => {
    const all = await listApReserveInvoices();
    expect(all.some((r) => r.id === 'apri-001')).toBe(true);
    expect((await getApReserveInvoice('APRI-2026-0001'))!.id).toBe('apri-001');
    expect((await getApReserveInvoice('apri-002'))!.status).toBe('Open');
    expect(await getApReserveInvoice('nope')).toBeNull();
  });
});

describe('apReserveInvoices save / add / cancel / recall / remarks', () => {
  it('saveApRiDraft stores a Draft with docNum 0', async () => {
    const draft = await saveApRiDraft(apriInput());
    expect(draft.status).toBe('Draft');
    expect(draft.docNum).toBe(0);
  });

  it('an approved reserve invoice opens, numbers, and stamps withholding/filing (no stock move)', async () => {
    const saved = await addApReserveInvoice(apriInput());
    expect(saved.status).toBe('Open');
    expect(saved.docNum).toBeGreaterThan(0);
    expect(apRiNumber(saved)).toMatch(/^APRI-\d{4}-\d+$/);
    // Lines carry tax-filing fields after stamping.
    expect(saved.withholdingSummary).toBeDefined();
  });

  it('an unapproved reserve invoice is left Not Confirmed (no withholding stamping)', async () => {
    const saved = await addApReserveInvoice(apriInput({ approved: false }));
    expect(saved.status).toBe('Not Confirmed');
    expect(saved.docNum).toBeGreaterThan(0);
  });

  it('cancelApReserveInvoice cancels an Open invoice and refuses a non-Open one', async () => {
    const saved = await addApReserveInvoice(apriInput());
    const cancelled = await cancelApReserveInvoice(saved);
    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.closeDate).toBeTruthy();
    await expect(cancelApReserveInvoice(cancelled)).rejects.toThrow(/Only open/);
  });

  it('recallApReserveInvoice sends a Not Confirmed invoice back to Draft and refuses others', async () => {
    const nc = await addApReserveInvoice(apriInput({ approved: false }));
    const recalled = await recallApReserveInvoice(nc);
    expect(recalled.status).toBe('Draft');
    expect(recalled.docNum).toBe(0);
    // An Open invoice cannot be recalled.
    const open = await addApReserveInvoice(apriInput());
    await expect(recallApReserveInvoice(open)).rejects.toThrow(/Not Confirmed/);
  });

  it('saveApRiRemarks patches an existing invoice and throws for a missing one', async () => {
    const saved = await addApReserveInvoice(apriInput());
    const patched = await saveApRiRemarks(saved, { remarks: 'customs cleared', paymentBlock: true, paymentOrderRun: false });
    expect(patched.remarks).toBe('customs cleared');
    expect(patched.paymentBlock).toBe(true);
    await expect(saveApRiRemarks({ ...saved, id: 'apri-nope' }, { remarks: 'x', paymentBlock: false, paymentOrderRun: false })).rejects.toThrow(/no longer exists/);
  });
});
