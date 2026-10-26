import { describe, it, expect, beforeEach } from 'vitest';

import {
  addGoodsReceipt,
  cancelGoodsReceipt,
  grInventoryQty,
  grJournal,
  grNumber,
  grOpenQty,
  listGoodsReceipts,
} from '../goodsReceipts';
import {
  addApInvoice,
  apJournal,
  cancelApInvoice,
  findDuplicateInvoice,
  listApInvoices,
} from '../apInvoices';
import {
  addCreditMemo,
  cancelCreditMemo,
  type InvoiceBalances,
} from '../apCreditMemos';
import {
  addGoodsReturn,
  cancelGoodsReturn,
  listGoodsReturns,
  returnJournal,
} from '../goodsReturns';
import {
  listPurchaseOrders,
  openQty,
  poTotals,
  savePurchaseOrder,
} from '../purchaseOrders';
import {
  addDownPayment,
  drawableAmount,
  getDownPayment,
  listDownPayments,
} from '../apDownPayments';
import {
  getPurchaseBlanketAgreement,
  recalculatePBACommitments,
  savePurchaseBlanketAgreement,
  listPurchaseBlanketAgreements,
} from '../purchaseBlanketAgreements';

import { listItems, stockTotals } from '../items';
import { listCostLayers } from '../costLayers';
import { taxCodes } from '../masterData';
import { itemGroups } from '../inventoryMasters';
import { getPartner } from '../partners';
import { rateAt, vatNotPaidToVendor } from '../../mocks/taxes';

import { blankGoodsReceipt, newGrLine, type GoodsReceipt, type GrLine } from '../../mocks/goodsReceipts';
import { blankApInvoice, newApLine, type ApInvoice, type ApLine } from '../../mocks/apInvoices';
import { blankCreditMemo, type ApCreditMemo } from '../../mocks/apCreditMemos';
import { blankGoodsReturn } from '../../mocks/goodsReturns';
import { blankPurchaseOrder, newPoLine } from '../../mocks/purchaseOrders';
import { blankDownPaymentRequest } from '../../mocks/apDownPayments';
import { blankPurchaseBlanketAgreement, newPbaLine } from '../../mocks/purchaseBlanketAgreements';

import { linesFromReceipt } from '../../pages/purchasing/vendor-invoices/detail/types';
import { returnFromReceipt, memoFromReturn } from '../../pages/purchasing/shared/returnsTypes';

// These flows mutate shared collections (items, cost layers, POs, receipts…). The store module
// holds each collection's rows in a module-level cache that survives between tests, so every
// mutating test below posts then fully reverses its own change (cancel / reset) and asserts the
// delta against the state it read, using distinct seed documents per test to avoid interference.
const BUYER = 'emp-1';

/** A `rateOf` over the real seeded tax codes, as of a posting date — what the forms pass the journals. */
async function rateOfAt(postingDate: string) {
  const codes = await taxCodes.list();
  const rateOf = (code: string) => {
    const c = codes.find((x) => x.code === code);
    return c ? (rateAt(c, postingDate) ?? 0) : 0;
  };
  const isReverse = (code: string) => vatNotPaidToVendor(codes.find((x) => x.code === code));
  return { codes, rateOf, isReverse };
}

/** Debits minus credits across a journal, rounded — a balanced entry nets to 0.00. (+0 to avoid -0.) */
const journalImbalance = (lines: { debit: number; credit: number }[]) =>
  Math.round((lines.reduce((n, l) => n + l.debit - l.credit, 0)) * 100) / 100 + 0;

describe('addGoodsReceipt → receives stock, creates a FIFO cost layer, closes the PO line', () => {
  // po-040: open PO for vendor bp-016, one FIFO stocked line (apl-0361) at WH-001, 30 open.
  it('brings stock in, adds a cost layer, and closes the fully-received PO line and PO', async () => {
    const pos = await listPurchaseOrders();
    const po = pos.find((p) => p.id === 'po-040')!;
    expect(po.status).toBe('Open');
    const poLine = po.lines.find((l) => l.status === 'Open' && openQty(l) > 0)!;
    const qty = openQty(poLine); // receive the whole line so the PO closes

    const itemsBefore = await listItems();
    const itemBefore = itemsBefore.find((i) => i.id === poLine.itemId)!;
    expect(itemBefore.valuationMethod).toBe('FIFO');
    const stockBefore = stockTotals(itemBefore).inStock;
    const layersBefore = (await listCostLayers()).filter((l) => l.itemId === poLine.itemId && l.qty > 0).length;

    const line: GrLine = newGrLine({
      itemId: poLine.itemId,
      itemNo: poLine.itemNo,
      name: poLine.name,
      description: poLine.description,
      quantity: qty,
      uomCode: poLine.uomCode,
      uomName: poLine.uomName,
      itemsPerUnit: poLine.itemsPerUnit,
      warehouse: poLine.warehouse,
      unitPrice: poLine.unitPrice,
      discountPct: poLine.discountPct,
      taxCode: poLine.taxCode,
      baseId: po.id,
      baseLineId: poLine.id,
      baseDocNo: `PO ${po.docNum}`,
    });
    const gr: Omit<GoodsReceipt, 'id'> = {
      ...blankGoodsReceipt('2026-06-15', BUYER),
      vendorId: po.vendorId,
      vendorCode: po.vendorCode,
      vendorName: po.vendorName,
      currency: po.currency,
      lines: [line],
      approved: true,
    };

    const saved = await addGoodsReceipt(gr, 1);
    expect(saved.status).toBe('Open');
    expect(saved.docNum).toBeGreaterThan(0);
    expect(grNumber(saved)).toMatch(/^GR-\d{4}-\d+$/);

    // Stock came in by the inventory quantity.
    const itemAfter = (await listItems()).find((i) => i.id === poLine.itemId)!;
    expect(stockTotals(itemAfter).inStock).toBe(stockBefore + grInventoryQty(line));

    // A FIFO cost layer was created for the receipt.
    const layersAfter = await listCostLayers();
    const newLayer = layersAfter.find((l) => l.sourceId === saved.id);
    expect(newLayer).toBeTruthy();
    expect(newLayer!.qty).toBe(grInventoryQty(line));
    expect((await listCostLayers()).filter((l) => l.itemId === poLine.itemId && l.qty > 0).length).toBe(layersBefore + 1);

    // The PO line and PO closed on a full receipt.
    const poAfter = (await listPurchaseOrders()).find((p) => p.id === 'po-040')!;
    const poLineAfter = poAfter.lines.find((l) => l.id === poLine.id)!;
    expect(poLineAfter.receivedQty).toBe(poLine.receivedQty + qty);
    expect(poLineAfter.status).toBe('Closed');
    expect(poAfter.status).toBe('Closed');

    // Cancelling the receipt reverses the stock and reopens the PO line and PO.
    const cancelled = await cancelGoodsReceipt(saved);
    expect(cancelled.status).toBe('Cancelled');
    const itemReverted = (await listItems()).find((i) => i.id === poLine.itemId)!;
    expect(stockTotals(itemReverted).inStock).toBe(stockBefore);
    const poReopened = (await listPurchaseOrders()).find((p) => p.id === 'po-040')!;
    expect(poReopened.lines.find((l) => l.id === poLine.id)!.status).toBe('Open');
    expect(poReopened.status).toBe('Open');
    // The receipt's cost layer was zeroed out.
    expect((await listCostLayers()).find((l) => l.sourceId === saved.id)?.qty ?? 0).toBe(0);
  });

  it('is left Not Confirmed (no stock, no layer) when the receipt is not approved', async () => {
    const pos = await listPurchaseOrders();
    const po = pos.find((p) => p.id === 'po-059')!; // another open stocked PO
    const poLine = po.lines.find((l) => l.status === 'Open' && openQty(l) > 0)!;
    const stockBefore = stockTotals((await listItems()).find((i) => i.id === poLine.itemId)!).inStock;

    const gr: Omit<GoodsReceipt, 'id'> = {
      ...blankGoodsReceipt('2026-06-15', BUYER),
      vendorId: po.vendorId,
      currency: po.currency,
      approved: false,
      lines: [
        newGrLine({
          itemId: poLine.itemId,
          itemNo: poLine.itemNo,
          quantity: 1,
          uomCode: poLine.uomCode,
          itemsPerUnit: poLine.itemsPerUnit,
          warehouse: poLine.warehouse,
          unitPrice: poLine.unitPrice,
          taxCode: poLine.taxCode,
          baseId: po.id,
          baseLineId: poLine.id,
        }),
      ],
    };
    const saved = await addGoodsReceipt(gr, 1);
    expect(saved.status).toBe('Not Confirmed');
    // No stock moved.
    expect(stockTotals((await listItems()).find((i) => i.id === poLine.itemId)!).inStock).toBe(stockBefore);
    expect((await listCostLayers()).find((l) => l.sourceId === saved.id)).toBeUndefined();
  });
});

describe('addGoodsReceipt → grJournal balances', () => {
  it('Dr Inventory, Cr Goods-Received-Not-Invoiced nets to zero', async () => {
    const po = (await listPurchaseOrders()).find((p) => p.id === 'po-009')!; // Serial/Batch stocked
    const poLine = po.lines.find((l) => l.status === 'Open' && openQty(l) > 0)!;
    const line = newGrLine({
      itemId: poLine.itemId,
      quantity: 2,
      uomCode: poLine.uomCode,
      itemsPerUnit: poLine.itemsPerUnit,
      warehouse: poLine.warehouse,
      unitPrice: poLine.unitPrice,
      discountPct: poLine.discountPct,
      taxCode: poLine.taxCode,
      baseId: po.id,
      baseLineId: poLine.id,
    });
    const saved = await addGoodsReceipt(
      { ...blankGoodsReceipt('2026-06-15', BUYER), vendorId: po.vendorId, currency: po.currency, approved: true, lines: [line] },
      1,
    );
    const items = await listItems();
    const groups = await itemGroups.list();
    const journal = grJournal(saved, saved.fxRate, items, groups);
    expect(journal.length).toBeGreaterThanOrEqual(2);
    expect(journalImbalance(journal)).toBe(0);
    // GRNI (2025) is the credit side.
    expect(journal.some((l) => l.account === '2025' && l.credit > 0)).toBe(true);
    await cancelGoodsReceipt(saved);
  });
});

describe('addApInvoice → stamps vendor withholding, numbers+opens, journal balances', () => {
  it('bills an open PO for a withholding vendor: stamps EWT and posts a balanced entry', async () => {
    // po-011: open PO, vendor bp-002 (rent, 5% EWT), one IVAT-S service line.
    const po = (await listPurchaseOrders()).find((p) => p.id === 'po-011')!;
    const poLine = po.lines.find((l) => l.status === 'Open' && openQty(l) > 0)!;
    const vendor = await getPartner(po.vendorId);
    expect(vendor).toBeTruthy();

    const line: ApLine = newApLine({
      itemId: poLine.itemId,
      itemNo: poLine.itemNo,
      description: poLine.description,
      quantity: openQty(poLine),
      uomCode: poLine.uomCode,
      itemsPerUnit: poLine.itemsPerUnit,
      warehouse: poLine.warehouse,
      unitPrice: poLine.unitPrice,
      discountPct: poLine.discountPct,
      taxCode: poLine.taxCode,
      baseType: 'PO',
      baseId: po.id,
      baseLineId: poLine.id,
      baseDocNo: `PO ${po.docNum}`,
    });
    const input: Omit<ApInvoice, 'id'> = {
      ...blankApInvoice('2026-06-15', BUYER),
      vendorId: po.vendorId,
      vendorCode: po.vendorCode,
      vendorName: po.vendorName,
      currency: po.currency,
      vendorRef: 'WT-FLOW-001',
      controlAccount: '2010',
      approved: true,
      lines: [line],
    };

    const saved = await addApInvoice(input, 1);
    expect(saved.status).toBe('Open');
    expect(saved.docNum).toBeGreaterThan(0);

    // Vendor withholding was stamped (bp-002 is a 5% EWT rental vendor).
    expect(saved.withholdingSummary?.length ?? 0).toBeGreaterThan(0);
    expect(saved.withholdingSummary!.some((w) => w.deducted && w.kind === 'Expanded (EWT)')).toBe(true);

    // The posting entry balances.
    const { codes, rateOf } = await rateOfAt(saved.postingDate);
    const items = await listItems();
    const groups = await itemGroups.list();
    const withholding = saved.withholdingSummary ?? [];
    const journal = apJournal(saved, saved.fxRate, { itemsById: new Map(items.map((i) => [i.id, i])), groups, codes, rateOf, withholding });
    expect(journalImbalance(journal)).toBe(0);
    // The withholding payable (2340 for EWT) is credited.
    expect(journal.some((l) => l.account === '2340' && l.credit > 0)).toBe(true);

    // Cancelling reopens the PO line it billed.
    await cancelApInvoice(saved);
    const poAfter = (await listPurchaseOrders()).find((p) => p.id === 'po-011')!;
    expect(poAfter.lines.find((l) => l.id === poLine.id)!.status).toBe('Open');
  });

  it('bills a goods receipt: closes the receipt billed in full and clears GRNI in a balanced entry', async () => {
    // gr-110: open FIFO receipt for bp-016, one open line (apl-0361, 10 to invoice).
    const gr = (await listGoodsReceipts()).find((r) => r.id === 'gr-110')!;
    expect(gr.status).toBe('Open');
    const items = await listItems();
    const lines = linesFromReceipt(gr, gr.lines.map((l) => ({ lineId: l.id, qty: l.quantity })), items);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.baseType === 'GRPO')).toBe(true);

    const input: Omit<ApInvoice, 'id'> = {
      ...blankApInvoice('2026-06-15', BUYER),
      vendorId: gr.vendorId,
      vendorCode: gr.vendorCode,
      vendorName: gr.vendorName,
      currency: gr.currency,
      vendorRef: 'GR-BILL-001',
      controlAccount: '2010',
      approved: true,
      lines,
    };
    const saved = await addApInvoice(input, 1);
    expect(saved.status).toBe('Open');

    // The receipt it billed in full closed.
    const grAfter = (await listGoodsReceipts()).find((r) => r.id === 'gr-110')!;
    expect(grAfter.status).toBe('Closed');
    expect(grAfter.lines.every((l) => (l.invoicedQty ?? 0) >= l.quantity)).toBe(true);

    // The entry balances and clears GRNI (2025) on the debit side.
    const { codes, rateOf } = await rateOfAt(saved.postingDate);
    const groups = await itemGroups.list();
    const journal = apJournal(saved, saved.fxRate, { itemsById: new Map(items.map((i) => [i.id, i])), groups, codes, rateOf, withholding: saved.withholdingSummary ?? [] });
    expect(journalImbalance(journal)).toBe(0);
    expect(journal.some((l) => l.account === '2025' && l.debit > 0)).toBe(true);

    // Cancelling reopens the receipt.
    await cancelApInvoice(saved);
    expect((await listGoodsReceipts()).find((r) => r.id === 'gr-110')!.status).toBe('Open');
  });
});

describe('findDuplicateInvoice — duplicate vendor-reference detection', () => {
  it('finds a posted invoice with the same vendor and ref (case/space-insensitive) and ignores drafts', async () => {
    const posted = (await listApInvoices()).find((i) => i.status !== 'Cancelled' && i.status !== 'Draft' && i.vendorRef)!;
    const dup = await findDuplicateInvoice({
      ...blankApInvoice('2026-06-15', BUYER),
      vendorId: posted.vendorId,
      vendorRef: `  ${posted.vendorRef.toUpperCase()}  `,
    });
    expect(dup?.id).toBe(posted.id);

    // Different vendor, same ref → no match.
    expect(await findDuplicateInvoice({ ...blankApInvoice('2026-06-15', BUYER), vendorId: 'no-such-vendor', vendorRef: posted.vendorRef })).toBeUndefined();
    // Blank ref → no match.
    expect(await findDuplicateInvoice({ ...blankApInvoice('2026-06-15', BUYER), vendorId: posted.vendorId, vendorRef: '   ' })).toBeUndefined();
  });
});

describe('addGoodsReturn → sends stock back; cancelling restores it', () => {
  it('a receipt-based return takes stock out at cost and is Closed (no credit needed); cancel reverses it', async () => {
    // gr-104: open FIFO receipt for bp-013 with an open line (ACC-MAGSF1) that has stock on hand at WH-001.
    const gr = (await listGoodsReceipts()).find((r) => r.id === 'gr-104')!;
    const items = await listItems();
    const grLine = gr.lines.find((l) => grOpenQty(l, gr) > 0 && items.find((i) => i.id === l.itemId)?.inventoryItem)!;
    const lines = returnFromReceipt(gr, [{ lineId: grLine.id, qty: 1 }], items);
    expect(lines[0].baseType).toBe('GRPO');
    expect(lines[0].quantity).toBe(1);

    const stockBefore = stockTotals(items.find((i) => i.id === grLine.itemId)!).inStock;

    const input = {
      ...blankGoodsReturn('2026-06-15', BUYER),
      vendorId: gr.vendorId,
      vendorCode: gr.vendorCode,
      vendorName: gr.vendorName,
      currency: gr.currency,
      approved: true,
      lines,
    };
    const saved = await addGoodsReturn(input);
    // A receipt-based return needs no credit memo → Closed immediately.
    expect(saved.status).toBe('Closed');

    const stockAfter = stockTotals((await listItems()).find((i) => i.id === grLine.itemId)!).inStock;
    expect(stockAfter).toBe(stockBefore - grInventoryQty(saved.lines[0]));

    // The receipt's returned quantity went up.
    const grAfter = (await listGoodsReceipts()).find((r) => r.id === 'gr-104')!;
    expect(grAfter.lines.find((l) => l.id === grLine.id)!.returnedQty).toBe(1);

    // The return journal balances (Dr GRNI, Cr Inventory).
    const groups = await itemGroups.list();
    const rjournal = returnJournal(saved, await listItems(), groups);
    expect(journalImbalance(rjournal)).toBe(0);
    expect(rjournal.some((l) => l.account === '2025' && l.debit > 0)).toBe(true);

    // Cancel brings the stock back and lowers the receipt's returned quantity.
    await cancelGoodsReturn(saved);
    expect(stockTotals((await listItems()).find((i) => i.id === grLine.itemId)!).inStock).toBe(stockBefore);
    expect((await listGoodsReceipts()).find((r) => r.id === 'gr-104')!.lines.find((l) => l.id === grLine.id)!.returnedQty).toBe(0);
  });
});

describe('addCreditMemo → debit memo from a goods return credits the base invoice', () => {
  it('a credit memo from a goods return: closes within tolerance and reopens the return on cancel', async () => {
    // Create an APINV-based goods return (needs a credit), then a debit memo from it.
    // ap-099: open, un-applied bill for bp-016 with a stocked line (ACC-PWR35D) with stock at WH-001.
    const invoices = await listApInvoices();
    const items = await listItems();
    const inv = invoices.find((i) => i.id === 'ap-099')!;
    expect(inv.status).toBe('Open');
    const invLine = inv.lines.find((l) => (l.returnedQty ?? 0) === 0 && items.find((it) => it.id === l.itemId)?.inventoryItem)!;
    const stockBefore = stockTotals(items.find((i) => i.id === invLine.itemId)!).inStock;
    const retQty = Math.min(1, invLine.quantity);

    // Return the billed goods (APINV base) — this return needs a credit memo.
    const { returnFromInvoice } = await import('../../pages/purchasing/shared/returnsTypes');
    const retLines = returnFromInvoice(inv, [{ lineId: invLine.id, qty: retQty }]);
    const ret = await addGoodsReturn({
      ...blankGoodsReturn('2026-06-15', BUYER),
      vendorId: inv.vendorId,
      vendorCode: inv.vendorCode,
      vendorName: inv.vendorName,
      currency: inv.currency,
      approved: true,
      lines: retLines,
    });
    expect(ret.status).toBe('Open'); // APINV-based return needs a credit memo

    // Debit memo copied from the return.
    const memoLines = memoFromReturn(ret, [{ lineId: ret.lines[0].id, qty: retQty }], items);
    expect(memoLines[0].baseType).toBe('GRET');
    const { codes } = await rateOfAt('2026-06-15');
    const { memoTotals } = await import('../apCreditMemos');
    const total = memoTotals(
      { discountPct: 0, freight: 0, freightTaxCode: '', lines: memoLines },
      (code) => {
        const c = codes.find((x) => x.code === code);
        return c ? (rateAt(c, '2026-06-15') ?? 0) : 0;
      },
    ).total;

    const input: Omit<ApCreditMemo, 'id'> = {
      ...blankCreditMemo('2026-06-15', BUYER),
      vendorId: inv.vendorId,
      vendorCode: inv.vendorCode,
      vendorName: inv.vendorName,
      currency: inv.currency,
      controlAccount: '2010',
      approved: true,
      lines: memoLines,
    };
    // Empty balances map: the credit applies nothing to invoices, but the memo still posts and the
    // return it credits closes (creditedQty catches up).
    const balances: InvoiceBalances = new Map();
    const memo = await addCreditMemo(input, 1, total, balances);
    expect(memo.docNum).toBeGreaterThan(0);

    // The return it credited closed (fully credited within tolerance).
    const retAfter = (await listGoodsReturns()).find((r) => r.id === ret.id)!;
    expect(retAfter.status).toBe('Closed');
    expect(retAfter.lines[0].creditedQty).toBeCloseTo(retQty, 3);

    // The memo journal balances.
    const groups = await itemGroups.list();
    const { memoJournal } = await import('../apCreditMemos');
    const mjournal = memoJournal(
      memo,
      memo.fxRate,
      { items: await listItems(), groups, codes, rateOf: (code) => { const c = codes.find((x) => x.code === code); return c ? (rateAt(c, memo.postingDate) ?? 0) : 0; }, withholding: memo.withholdingSummary ?? [] },
    );
    expect(journalImbalance(mjournal)).toBe(0);

    // Cancel the memo → the return reopens (creditedQty goes back to 0).
    const totalsMap = new Map<string, number>();
    await cancelCreditMemo(memo, totalsMap);
    const retReopened = (await listGoodsReturns()).find((r) => r.id === ret.id)!;
    expect(retReopened.status).toBe('Open');
    expect(retReopened.lines[0].creditedQty).toBe(0);

    // Clean up the goods return so it doesn't leak into other tests' stock.
    await cancelGoodsReturn(retReopened);
    expect(stockTotals((await listItems()).find((i) => i.id === invLine.itemId)!).inStock).toBe(stockBefore);
  });
});

describe('down-payment drawdown → invoice draws it and closes it within 0.005; cancel reopens', () => {
  it('a paid, undrawn request is fully drawn by an A/P invoice, then given back on cancel', async () => {
    // dp-002: seeded request, paid (drawable ≈ 453157.6), Open.
    const dpr = (await listDownPayments()).find((d) => d.id === 'dp-002')!;
    expect(dpr.status).toBe('Open');
    const drawable = drawableAmount(dpr);
    expect(drawable).toBeGreaterThan(0);

    // A simple one-line service invoice for the same vendor that draws the whole advance.
    // Use a non-stock service item so no stock moves; a large unit price so net due covers the draw.
    const invInput: Omit<ApInvoice, 'id'> = {
      ...blankApInvoice('2026-06-15', BUYER),
      vendorId: dpr.vendorId,
      vendorCode: dpr.vendorCode,
      vendorName: dpr.vendorName,
      currency: dpr.currency,
      vendorRef: 'DRAW-FLOW-001',
      controlAccount: '2010',
      approved: true,
      downPayment: drawable,
      drawnDownPayments: [
        { requestId: dpr.id, docNo: 'DPR', amount: drawable, amountLc: dpr.paidLc, account: dpr.downPaymentAccount },
      ],
      lines: [
        newApLine({
          itemId: dpr.lines[0].itemId,
          itemNo: dpr.lines[0].itemNo,
          quantity: dpr.lines[0].quantity,
          uomCode: dpr.lines[0].uomCode,
          itemsPerUnit: dpr.lines[0].itemsPerUnit,
          warehouse: '',
          unitPrice: dpr.lines[0].unitPrice,
          taxCode: dpr.lines[0].taxCode,
          baseType: '',
        }),
      ],
    };
    const saved = await addApInvoice(invInput, 1, 500); // due 500 > 0.005 → stays Open
    expect(saved.docNum).toBeGreaterThan(0);

    // The request was drawn in full within tolerance → Closed.
    const drawn = await getDownPayment(dpr.id);
    expect(drawn?.status).toBe('Closed');
    expect(drawn!.drawnAmount).toBeCloseTo(drawable, 2);

    // Cancel the invoice → the draw is given back and the request reopens.
    await cancelApInvoice(saved);
    const reopened = await getDownPayment(dpr.id);
    expect(reopened?.status).toBe('Open');
    expect(reopened!.drawnAmount).toBeCloseTo(0, 2);
  });

  it('addDownPayment numbers and opens an approved request', async () => {
    const before = (await listDownPayments()).length;
    const d = await addDownPayment({ ...blankDownPaymentRequest('2026-06-15', BUYER), vendorId: 'bp-016', approved: true, dpmPct: 30 }, 1);
    expect(d.status).toBe('Open');
    expect(d.docNum).toBeGreaterThan(0);
    expect((await listDownPayments()).length).toBe(before + 1);
  });
});

describe('recalculatePBACommitments — commitments recompute from linked POs', () => {
  beforeEach(() => localStorage.clear());

  it('rolls open PO lines into committed and closed lines into cumulative', async () => {
    const unitPrice = 1250;
    const pba = await savePurchaseBlanketAgreement({
      ...blankPurchaseBlanketAgreement(BUYER),
      vendorId: 'v-pba-flow',
      status: 'Approved',
      lines: [newPbaLine({ id: 'pbl-flow-0', itemId: 'apl-0017', plannedQty: 100, unitPrice })],
    });

    await savePurchaseOrder({
      ...blankPurchaseOrder(BUYER),
      vendorId: 'v-pba-flow',
      vendorRef: 'PBA-FLOW-OPEN',
      approved: true,
      lines: [newPoLine({ id: 'plo-flow', status: 'Open', quantity: 7, unitPrice, agreementId: pba.id, agreementLineId: 'pbl-flow-0' })],
    });
    await savePurchaseOrder({
      ...blankPurchaseOrder(BUYER),
      vendorId: 'v-pba-flow',
      vendorRef: 'PBA-FLOW-CLOSED',
      status: 'Closed',
      approved: true,
      lines: [newPoLine({ id: 'plc-flow', status: 'Closed', quantity: 3, unitPrice, agreementId: pba.id, agreementLineId: 'pbl-flow-0' })],
    });

    await recalculatePBACommitments([pba.id]);

    const updated = await getPurchaseBlanketAgreement(pba.id);
    const line = updated!.lines.find((l) => l.id === 'pbl-flow-0')!;
    expect(line.cumulativeCommittedQty).toBe(7);
    expect(line.cumulativeCommittedAmountLC).toBe(Math.round(7 * unitPrice * 100) / 100);
    expect(line.cumulativeQty).toBe(3);
    expect(line.cumulativeAmountLC).toBe(Math.round(3 * unitPrice * 100) / 100);
  });

  it('seed PBAs load and total up', async () => {
    const pbas = await listPurchaseBlanketAgreements();
    expect(pbas.length).toBeGreaterThan(0);
  });
});

describe('poTotals sanity against a seed PO (used by every purchasing journal)', () => {
  it('a seeded open PO totals to a positive amount with its real tax codes', async () => {
    const po = (await listPurchaseOrders()).find((p) => p.id === 'po-009')!;
    const { codes, rateOf, isReverse } = await rateOfAt(po.postingDate);
    void codes;
    const t = poTotals(po, rateOf, 'No rounding', isReverse);
    expect(t.total).toBeGreaterThan(0);
    expect(t.beforeDiscount).toBeGreaterThan(0);
  });
});
