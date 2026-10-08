import {
  FREIGHT_IN_ACCOUNT,
  GRNI_ACCOUNT,
  GR_SERIES,
  type GoodsReceipt,
  type GrLine,
} from '../mocks/goodsReceipts';
import { grSeries, seriesLookup, formatDocNum } from './allSeries';
import type { RoundingRule } from '../mocks/currencies';
import type { ItemGroup } from '../mocks/itemMasters';
import { newItemWarehouse, type Item } from '../mocks/items';
import type { PurchaseOrder } from '../mocks/purchaseOrders';
import { rateAt, vatNotPaidToVendor, type TaxCode } from '../mocks/taxes';
import { todayISO } from './dates';
import { inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { listItems, saveItem } from './items';
import { addLayer, removeLayersBySource, updateFifoCosts } from './costLayers';
import { lineNet, listPurchaseOrders, openQty, poTotals, priceAfterDiscount, saveReceivedQuantities } from './purchaseOrders';
import { createCollection } from './store';
import { PURCHASING_HISTORY } from './purchasingHistory';

const receipts = createCollection<GoodsReceipt>('sikat-erp:goods-receipts:v7', PURCHASING_HISTORY.receipts, 'gr');

export const listGoodsReceipts = receipts.list;
export const getGoodsReceipt = receipts.get;
export const resetGoodsReceipts = receipts.reset;

export type GrInput = Omit<GoodsReceipt, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const grSeriesOf = (id: string) => seriesLookup(grSeries, id, GR_SERIES);
/** "Primary 280004", or "Draft" before it's added. */
export const grNumber = (gr: Pick<GoodsReceipt, 'seriesId' | 'docNum'>) =>
  formatDocNum(grSeriesOf(gr.seriesId), gr.docNum);

// ── Line and document math ───────────────────────────────────────────────────

/** Quantity × Items per Unit. */
export const grInventoryQty = (l: Pick<GrLine, 'quantity' | 'itemsPerUnit'>) => l.quantity * (l.itemsPerUnit || 1);

/** Left to invoice: received less what A/P invoices have billed and goods returns sent back. Nothing once closed or cancelled. */
export const grOpenQty = (l: GrLine, gr: Pick<GoodsReceipt, 'status'>) =>
  gr.status === 'Open' ? Math.max(0, round4(l.quantity - (l.invoicedQty ?? 0) - (l.returnedQty ?? 0))) : 0;

/** Receipts an A/P invoice can copy from: the vendor's open receipts with quantity still to invoice. */
export const invoiceableReceipts = (receipts: GoodsReceipt[], vendorId: string) =>
  receipts.filter((gr) => gr.vendorId === vendorId && gr.status === 'Open' && gr.lines.some((l) => grOpenQty(l, gr) > 0));

/**
 * PHP per inventory unit a line brings stock in at: net price after the line and document
 * discounts, at the document's rate. Freight isn't part of it — it posts to Freight-in.
 */
export const unitCostLc = (l: Pick<GrLine, 'unitPrice' | 'discountPct' | 'itemsPerUnit'>, gr: Pick<GoodsReceipt, 'discountPct'>, fx: number) =>
  round4((priceAfterDiscount(l) * (1 - gr.discountPct / 100) * fx) / (l.itemsPerUnit || 1));

/** Footer totals in the document currency — the same arithmetic as a purchase order's. */
export const grTotals = (
  gr: Pick<GoodsReceipt, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode'>,
  rateOf: (taxCode: string) => number,
  rounding?: RoundingRule,
  isReverseCharge?: (taxCode: string) => boolean,
) => poTotals(gr, rateOf, rounding, isReverseCharge);

/** A receipt's document total, with tax rates as of its posting date. */
export const grTotal = (gr: GoodsReceipt, codes: TaxCode[]) =>
  grTotals(
    gr,
    (code) => {
      const c = codes.find((x) => x.code === code);
      return c ? (rateAt(c, gr.postingDate) ?? 0) : 0;
    },
    undefined,
    (code) => vatNotPaidToVendor(codes.find((x) => x.code === code)),
  ).total;

/** POs a receipt can copy from: the vendor's open (approved) POs with quantity still to receive. */
export const receivablePos = (pos: PurchaseOrder[], vendorId: string) =>
  pos.filter((po) => po.vendorId === vendorId && po.status === 'Open' && po.lines.some((l) => l.status === 'Open' && openQty(l) > 0));

/** Quantity each PO line is receiving on this document, summed over its lines. */
function qtyByBaseLine(lines: GrLine[]) {
  const out = new Map<string, number>();
  for (const l of lines) if (l.baseLineId) out.set(l.baseLineId, (out.get(l.baseLineId) ?? 0) + l.quantity);
  return out;
}

// ── Accounting ───────────────────────────────────────────────────────────────

/** Where a non-stock item's cost goes: its own cost account, or its group's. */
export const expenseAccountFor = (item: Item, groups: ItemGroup[]) =>
  item.glBy === 'Item Level' ? item.cogsAccount : groups.find((g) => g.name === item.itemGroup)?.cogsAccount || item.cogsAccount;

/**
 * The entry adding the receipt makes, in PHP: Dr Inventory for stocked lines (at their cost),
 * Dr the cost account for non-stock lines, Dr Freight-in for freight, Cr Goods Received Not
 * Invoiced for the lot. VAT isn't posted until the vendor's invoice.
 */
export function grJournal(gr: Pick<GoodsReceipt, 'lines' | 'discountPct' | 'freight'>, fx: number, items: Item[], groups: ItemGroup[]): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => account && totals.set(account, round2((totals.get(account) ?? 0) + amount));
  let credit = 0;
  for (const l of gr.lines) {
    const item = items.find((i) => i.id === l.itemId);
    if (!item) continue;
    // The line's net value, so the entry agrees with the document total to the centavo.
    const value = round2(lineNet(l) * (1 - gr.discountPct / 100) * fx);
    add(item.inventoryItem ? inventoryAccountFor(item, l.warehouse, groups) : expenseAccountFor(item, groups), value);
    credit += value;
  }
  const freight = round2(gr.freight * fx);
  if (freight) {
    add(FREIGHT_IN_ACCOUNT, freight);
    credit += freight;
  }
  if (credit) add(GRNI_ACCOUNT, -round2(credit));
  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit);
}

// ── Stock ────────────────────────────────────────────────────────────────────

/**
 * Stock in (`sign` 1) or back out (−1) for each stocked line. In Stock moves in the line's
 * warehouse; a line from a PO also moves Ordered the other way. The item cost re-averages over
 * company-wide stock for Moving Average items. FIFO items skip re-averaging here — their cost
 * is maintained by the cost layer service (updateFifoCosts) after each receipt or delivery.
 */
/** What moving stock reads from a line; A/P invoice lines that bring stock in have the same fields. */
export type StockLine = Pick<GrLine, 'itemId' | 'quantity' | 'itemsPerUnit' | 'warehouse' | 'bin' | 'baseLineId' | 'unitCostLc'>;

export function applyStock(lines: StockLine[], items: Item[], sign: 1 | -1) {
  const touched = new Map<string, Item>();
  for (const l of lines) {
    const base = touched.get(l.itemId) ?? items.find((i) => i.id === l.itemId);
    if (!base?.inventoryItem) continue;
    const item = touched.has(l.itemId) ? base : structuredClone(base);
    const qty = grInventoryQty(l) * sign;
    const onHand = item.warehouses.reduce((n, w) => n + w.inStock, 0);
    const reAverage = item.valuationMethod !== 'Standard Price' && item.valuationMethod !== 'FIFO';
    if (reAverage && onHand + qty > 0) {
      item.itemCost = round2((onHand * item.itemCost + qty * l.unitCostLc) / (onHand + qty));
    }
    let row = item.warehouses.find((w) => w.code === l.warehouse);
    if (!row) item.warehouses.push((row = newItemWarehouse(l.warehouse, { defaultBin: l.bin })));
    if (!row.defaultBin && l.bin) row.defaultBin = l.bin;
    row.inStock = round4(row.inStock + qty);
    if (l.baseLineId) row.ordered = Math.max(0, round4(row.ordered - qty));
    touched.set(l.itemId, { ...item, hasTransactions: true });
  }
  return [...touched.values()];
}

/** Received quantities on the POs the lines came from, moved by `sign`; POs close when fully received. */
export function applyToOrders(lines: Pick<GrLine, 'baseId' | 'baseLineId' | 'quantity'>[], pos: PurchaseOrder[], sign: 1 | -1) {
  const byPo = new Map<string, PurchaseOrder>();
  for (const l of lines) {
    if (!l.baseId) continue;
    const po = byPo.get(l.baseId) ?? structuredClone(pos.find((p) => p.id === l.baseId));
    if (!po) continue;
    const pl = po.lines.find((x) => x.id === l.baseLineId);
    if (!pl) continue;
    pl.receivedQty = Math.max(0, round4(pl.receivedQty + l.quantity * sign));
    pl.status = pl.receivedQty >= pl.quantity ? 'Closed' : 'Open';
    byPo.set(po.id, po);
  }
  for (const po of byPo.values()) {
    const done = po.lines.every((x) => x.status === 'Closed');
    if (done && po.status === 'Open') Object.assign(po, { status: 'Closed', closeDate: todayISO() });
    // Cancelling a receipt reopens the PO it closed.
    if (!done && po.status === 'Closed') Object.assign(po, { status: 'Open', closeDate: '' });
  }
  return [...byPo.values()];
}

/** Lines whose item is frozen by an open inventory count in the line's warehouse. */
export async function frozenLines(lines: Pick<GrLine, 'id' | 'itemId' | 'itemNo' | 'warehouse'>[]) {
  const { frozenStock } = await import('./inventoryCountings');
  const frozen = await frozenStock();
  return lines.flatMap((l) => {
    const count = frozen.get(`${l.itemId}@${l.warehouse}`);
    return count ? [{ lineId: l.id, message: `${l.itemNo} is frozen in ${l.warehouse} by inventory count ${count}. Post or close the count first.` }] : [];
  });
}

// ── Saving and posting ───────────────────────────────────────────────────────

/** A post rejected against current stock or PO quantities; the form shows it on the lines. */
export class GrPostError extends Error {
  constructor(
    readonly lineIds: string[],
    message: string,
  ) {
    super(message);
  }
}

export const saveGrDraft = (input: GrInput) => receipts.save({ ...input, status: 'Draft', docNum: 0 });

/** Added receipts keep everything but their remarks. */
export async function saveGrRemarks(gr: GoodsReceipt, patch: Pick<GoodsReceipt, 'remarks' | 'journalRemark'>) {
  const current = await receipts.get(gr.id);
  if (!current) throw new Error('This goods receipt no longer exists.');
  return receipts.save({ ...current, ...patch });
}

/**
 * Add the receipt. All lines go together or none do: PO open quantities and count freezes are
 * re-checked as they are now, then stock comes in, item costs re-average and the PO lines count
 * the quantities as received. `fx` is the document rate on the posting date.
 */
export async function addGoodsReceipt(input: GrInput, fx: number): Promise<GoodsReceipt> {
  const [items, pos] = await Promise.all([listItems(), listPurchaseOrders()]);

  const blocked = await frozenLines(input.lines);
  if (blocked.length) throw new GrPostError(blocked.map((b) => b.lineId), blocked.map((b) => b.message).join(' '));

  const over: { lineId: string; message: string }[] = [];
  for (const [baseLineId, qty] of qtyByBaseLine(input.lines)) {
    const l = input.lines.find((x) => x.baseLineId === baseLineId)!;
    const po = pos.find((p) => p.id === l.baseId);
    const pl = po?.lines.find((x) => x.id === baseLineId);
    if (!po || !pl) over.push({ lineId: l.id, message: `${l.itemNo}: PO ${l.baseDocNo} or its line no longer exists.` });
    else if (po.status !== 'Open' || pl.status !== 'Open') over.push({ lineId: l.id, message: `${l.itemNo}: PO ${l.baseDocNo} is ${po.status.toLowerCase()} — it can't be received.` });
    else if (qty > openQty(pl)) over.push({ lineId: l.id, message: `${l.itemNo}: receiving ${qty} ${pl.uomCode} but PO ${l.baseDocNo} has ${openQty(pl)} open.` });
  }
  if (over.length) throw new GrPostError(over.map((o) => o.lineId), over.map((o) => o.message).join(' '));

  const lines = input.lines.map((l) => ({ ...l, unitCostLc: unitCostLc(l, input, fx) }));
  for (const item of applyStock(lines, items, 1)) await saveItem(item);
  for (const po of applyToOrders(lines, pos, 1)) await saveReceivedQuantities(po);

  const series = grSeriesOf(input.seriesId);
  const all = await receipts.list();
  const docNum = Math.max(series.firstNo - 1, ...all.filter((r) => r.seriesId === series.id).map((r) => r.docNum)) + 1;
  const saved = await receipts.save({ ...input, lines, docNum, status: 'Open', fxRate: fx });

  // FIFO: create a cost layer per stocked line, then refresh itemCost from remaining layers.
  const fifoItemIds = new Set<string>();
  for (const l of lines) {
    const item = items.find((i) => i.id === l.itemId);
    if (item?.valuationMethod === 'FIFO' && item.inventoryItem && grInventoryQty(l) > 0) {
      await addLayer({ itemId: l.itemId, warehouse: l.warehouse, receivedOn: saved.postingDate, qty: grInventoryQty(l), receivedQty: grInventoryQty(l), unitCost: l.unitCostLc, sourceId: saved.id, receiptId: saved.id });
      fifoItemIds.add(l.itemId);
    }
  }
  await updateFifoCosts([...fifoItemIds]);

  return saved;
}

/**
 * Move billed quantities on receipt lines by `sign`, from A/P invoice lines copied from them.
 * A receipt closes when every line is fully billed, and reopens when an invoice is cancelled.
 */
export async function applyInvoicedQty(lines: { baseId: string; baseLineId: string; quantity: number }[], sign: 1 | -1) {
  const all = await receipts.list();
  const touched = new Map<string, GoodsReceipt>();
  for (const l of lines) {
    const gr = touched.get(l.baseId) ?? all.find((r) => r.id === l.baseId);
    const gl = gr?.lines.find((x) => x.id === l.baseLineId);
    if (!gr || !gl) continue;
    gl.invoicedQty = Math.max(0, round4((gl.invoicedQty ?? 0) + l.quantity * sign));
    touched.set(gr.id, gr);
  }
  for (const gr of touched.values()) {
    const billed = gr.lines.every((x) => (x.invoicedQty ?? 0) + (x.returnedQty ?? 0) >= x.quantity);
    if (billed && gr.status === 'Open') Object.assign(gr, { status: 'Closed', closeDate: todayISO() });
    if (!billed && gr.status === 'Closed') Object.assign(gr, { status: 'Open', closeDate: '' });
    await receipts.save(gr);
  }
}

/**
 * Move returned quantities on receipt lines by `sign`, from goods returns copied from them. A
 * receipt closes when every line is billed or returned in full, and reopens when a return is cancelled.
 */
export async function applyReturnedQty(lines: { baseId: string; baseLineId: string; quantity: number }[], sign: 1 | -1) {
  const all = await receipts.list();
  const touched = new Map<string, GoodsReceipt>();
  for (const l of lines) {
    const gr = touched.get(l.baseId) ?? all.find((r) => r.id === l.baseId);
    const gl = gr?.lines.find((x) => x.id === l.baseLineId);
    if (!gr || !gl) continue;
    gl.returnedQty = Math.max(0, round4((gl.returnedQty ?? 0) + l.quantity * sign));
    touched.set(gr.id, gr);
  }
  for (const gr of touched.values()) {
    const done = gr.lines.every((x) => (x.invoicedQty ?? 0) + (x.returnedQty ?? 0) >= x.quantity);
    if (done && gr.status === 'Open') Object.assign(gr, { status: 'Closed', closeDate: todayISO() });
    if (!done && gr.status === 'Closed') Object.assign(gr, { status: 'Open', closeDate: '' });
    await receipts.save(gr);
  }
}

/** Close: nothing more will be invoiced against it. */
export async function closeGoodsReceipt(gr: GoodsReceipt) {
  return receipts.save({ ...gr, status: 'Closed', closeDate: todayISO() });
}

/**
 * Cancel an open receipt: the stock goes back out at the cost it came in at, and the PO lines
 * are open again. Blocked when the stock has already left the warehouse.
 */
export async function cancelGoodsReceipt(gr: GoodsReceipt) {
  const billed = gr.lines.filter((l) => l.invoicedQty > 0);
  if (billed.length) {
    throw new GrPostError(billed.map((l) => l.id), 'Already billed on an A/P invoice — cancel the invoice first, then the receipt.');
  }
  const returned = gr.lines.filter((l) => (l.returnedQty ?? 0) > 0);
  if (returned.length) {
    throw new GrPostError(returned.map((l) => l.id), 'Goods from this receipt were returned — cancel the goods return first, then the receipt.');
  }
  const [items, pos] = await Promise.all([listItems(), listPurchaseOrders()]);
  const blocked = await frozenLines(gr.lines);
  if (blocked.length) throw new GrPostError(blocked.map((b) => b.lineId), blocked.map((b) => b.message).join(' '));

  const need = new Map<string, { line: GrLine; qty: number }>();
  for (const l of gr.lines) {
    const key = `${l.itemId}@${l.warehouse}`;
    need.set(key, { line: l, qty: (need.get(key)?.qty ?? 0) + grInventoryQty(l) });
  }
  const short = [...need.values()].flatMap(({ line, qty }) => {
    const item = items.find((i) => i.id === line.itemId);
    const have = item?.warehouses.find((w) => w.code === line.warehouse)?.inStock ?? 0;
    return item?.inventoryItem && have < qty
      ? [{ lineId: line.id, message: `${line.itemNo}: ${line.warehouse} has ${have} ${item.inventoryUom} left of the ${qty} received — it's already been moved or sold.` }]
      : [];
  });
  if (short.length) throw new GrPostError(short.map((s) => s.lineId), short.map((s) => s.message).join(' '));

  for (const item of applyStock(gr.lines, items, -1)) await saveItem(item);
  for (const po of applyToOrders(gr.lines, pos, -1)) await saveReceivedQuantities(po);

  // FIFO: zero out the layers this receipt created, then refresh itemCost.
  await removeLayersBySource(gr.id);
  const fifoItemIds = [...new Set(gr.lines.filter((l) => items.find((i) => i.id === l.itemId)?.valuationMethod === 'FIFO').map((l) => l.itemId))];
  await updateFifoCosts(fifoItemIds);

  return receipts.save({ ...gr, status: 'Cancelled', closeDate: todayISO() });
}
