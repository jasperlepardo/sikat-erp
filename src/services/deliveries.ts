import { DN_SERIES, SEED_DELIVERIES, SHIPPED_GOODS_ACCOUNT, type Delivery, type DnLine } from '../mocks/deliveries';
import type { ItemGroup } from '../mocks/itemMasters';
import type { Item } from '../mocks/items';
import type { SoLine } from '../mocks/salesOrders';
import { rateAt, type TaxCode } from '../mocks/taxes';
import { todayISO } from './dates';
import { frozenStock } from './inventoryCountings';
import { itemGroups } from './inventoryMasters';
import { inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { listItems, saveItem } from './items';
import { postDocumentEntry, reverseDocumentEntry } from './journalEntries';
import { applyDelivered, listSalesOrders, openQty as soOpenQty, soNumber, soTotals } from './salesOrders';
import { createCollection } from './store';

const deliveries = createCollection<Delivery>('sikat-erp:deliveries:v3', SEED_DELIVERIES, 'dn');

export const listDeliveries = deliveries.list;
export const getDelivery = deliveries.get;

export type DnInput = Omit<Delivery, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const dnSeriesOf = (id: string) => DN_SERIES.find((s) => s.id === id) ?? DN_SERIES[0];
export const dnNumber = (d: Pick<Delivery, 'seriesId' | 'docNum'>) => (d.docNum ? `${dnSeriesOf(d.seriesId).name} ${d.docNum}` : 'Draft');

/** Quantity × Items per Unit. */
export const dnInventoryQty = (l: Pick<DnLine, 'quantity' | 'itemsPerUnit'>) => round4(l.quantity * (l.itemsPerUnit || 1));
/** Left to invoice. */
export const dnOpenQty = (l: DnLine, d: Pick<Delivery, 'status'>) => (d.status === 'Open' ? Math.max(0, l.quantity - l.invoicedQty) : 0);

/** Footer totals — same math as the sales order (lines are the same shape for it). */
export const dnTotals = (d: Pick<Delivery, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'rounding'>, rateOf: (code: string) => number, rule?: Parameters<typeof soTotals>[2]) =>
  soTotals(d as unknown as Parameters<typeof soTotals>[0], rateOf, rule);

export const dnTotal = (d: Delivery, codes: TaxCode[]) =>
  dnTotals(d, (code) => {
    const c = codes.find((x) => x.code === code);
    return c ? (rateAt(c, d.postingDate) ?? 0) : 0;
  }).total;

/** The COGS account an item posts to, per its "Set G/L accounts by". */
const cogsAccountFor = (item: Item, groups: readonly ItemGroup[]) =>
  item.glBy === 'Item Level' ? item.cogsAccount : groups.find((g) => g.name === item.itemGroup)?.cogsAccount || item.cogsAccount;

/**
 * The entry adding the delivery makes, at item cost (PHP): Dr COGS — or Dr Shipped Goods with
 * Use Shipped Goods Account — / Cr Inventory, netted per account. Non-stock lines post nothing.
 */
export function dnJournal(d: Pick<Delivery, 'lines' | 'useShippedGoodsAccount'>, items: readonly Item[], groups: readonly ItemGroup[], fixed = false): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => account && totals.set(account, round2((totals.get(account) ?? 0) + amount));
  for (const l of d.lines) {
    const item = items.find((i) => i.id === l.itemId);
    if (!item?.inventoryItem) continue;
    const value = round2(dnInventoryQty(l) * (fixed ? l.unitCostLc : item.itemCost));
    if (!value) continue;
    add(d.useShippedGoodsAccount ? SHIPPED_GOODS_ACCOUNT : cogsAccountFor(item, groups), value);
    add(inventoryAccountFor(item, l.warehouse, [...groups]), -value);
  }
  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]) => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit);
}

/** Order lines' open quantity, by line id — what's left to deliver. */
export async function orderOpenQty() {
  const out = new Map<string, { line: SoLine; open: number; orderStatus: string; partial: boolean; docNo: string }>();
  for (const so of await listSalesOrders()) for (const l of so.lines) out.set(l.id, { line: l, open: soOpenQty(l), orderStatus: so.status, partial: so.allowPartialDelivery, docNo: soNumber(so) });
  return out;
}

/** Inventory quantity each item leaves each warehouse with, summed over the lines. */
function qtyByStock(lines: DnLine[]) {
  const out = new Map<string, { line: DnLine; qty: number }>();
  for (const l of lines) {
    if (!l.itemId || !l.warehouse) continue;
    const key = `${l.itemId}@${l.warehouse}`;
    const cur = out.get(key);
    out.set(key, { line: cur?.line ?? l, qty: (cur?.qty ?? 0) + dnInventoryQty(l) });
  }
  return out;
}

export class DnPostError extends Error {
  constructor(
    readonly lineIds: string[],
    message: string,
  ) {
    super(message);
  }
}

/** Why each line can't ship as things are now: frozen stock, too little stock, or more than the order has open. */
export async function deliveryProblems(input: DnInput, items: readonly Item[]) {
  const out: { lineId: string; message: string }[] = [];
  const frozen = await frozenStock();
  for (const l of input.lines) {
    const count = frozen.get(`${l.itemId}@${l.warehouse}`);
    if (count) out.push({ lineId: l.id, message: `${l.itemNo} is frozen in ${l.warehouse} by inventory count ${count}. Post or close the count first.` });
  }
  for (const { line, qty } of qtyByStock(input.lines).values()) {
    const item = items.find((i) => i.id === line.itemId);
    if (!item?.inventoryItem) continue;
    const have = item.warehouses.find((w) => w.code === line.warehouse)?.inStock ?? 0;
    if (qty > have) out.push({ lineId: line.id, message: `${line.itemNo}: shipping ${qty} ${item.inventoryUom} but ${line.warehouse} has ${have} in stock.` });
  }
  const open = await orderOpenQty();
  const byBase = new Map<string, { line: DnLine; qty: number }>();
  for (const l of input.lines) if (l.baseLineId) byBase.set(l.baseLineId, { line: l, qty: (byBase.get(l.baseLineId)?.qty ?? 0) + l.quantity });
  for (const [baseLineId, { line, qty }] of byBase) {
    const o = open.get(baseLineId);
    if (!o) out.push({ lineId: line.id, message: `${line.itemNo}: order ${line.baseDocNo} or its line no longer exists.` });
    else if (o.orderStatus !== 'Open') out.push({ lineId: line.id, message: `${line.itemNo}: order ${o.docNo} is ${o.orderStatus.toLowerCase()} — it can't be delivered.` });
    else if (qty > o.open) out.push({ lineId: line.id, message: `${line.itemNo}: shipping ${qty} ${line.uomCode} but order ${o.docNo} has ${o.open} open.` });
    else if (!o.partial && qty < o.open) out.push({ lineId: line.id, message: `${line.itemNo}: order ${o.docNo} doesn't allow partial delivery — ship all ${o.open} ${line.uomCode}.` });
  }
  return out;
}

export const saveDeliveryDraft = (input: DnInput) => deliveries.save({ ...input, status: 'Draft', docNum: 0 });

/** Added deliveries keep everything but their remarks and attachments. */
export async function saveDeliveryNotes(id: string, patch: Pick<Delivery, 'remarks' | 'attachments'>) {
  const cur = await deliveries.get(id);
  if (!cur) throw new Error('This delivery no longer exists.');
  return deliveries.save({ ...cur, ...patch });
}

/**
 * Add the delivery. All lines go together or none do: freezes, stock and order open quantities
 * are re-checked as they are now. Then stock goes out at item cost, the order lines count it as
 * delivered, and the journal entry posts. `fx` is the document rate on the posting date.
 */
export async function addDelivery(input: DnInput, fx: number): Promise<Delivery> {
  const items = await listItems();
  const problems = await deliveryProblems(input, items);
  if (problems.length) throw new DnPostError(problems.map((p) => p.lineId), problems.map((p) => p.message).join(' '));

  const lines = input.lines.map((l) => ({ ...l, unitCostLc: items.find((i) => i.id === l.itemId)?.itemCost ?? 0 }));
  const touched = new Map<string, Item>();
  for (const l of lines) {
    const item = touched.get(l.itemId) ?? structuredClone(items.find((i) => i.id === l.itemId));
    if (!item?.inventoryItem) continue;
    const row = item.warehouses.find((w) => w.code === l.warehouse);
    if (!row) continue;
    row.inStock = round4(row.inStock - dnInventoryQty(l));
    touched.set(item.id, { ...item, hasTransactions: true });
  }
  for (const item of touched.values()) await saveItem(item);
  await applyDelivered(lines.filter((l) => l.baseType === 'SO'), 1);

  const series = dnSeriesOf(input.seriesId);
  const all = await deliveries.list();
  const docNum = Math.max(series.firstNo - 1, ...all.filter((d) => d.seriesId === series.id).map((d) => d.docNum)) + 1;
  const saved = await deliveries.save({ ...input, lines, docNum, status: 'Open', fxRate: fx });
  await postDocumentEntry({
    origin: 'DN',
    originNo: docNum,
    originId: saved.id,
    postingDate: saved.postingDate,
    dueDate: saved.dueDate,
    remarks: saved.journalRemark,
    lines: dnJournal(saved, items, await itemGroups.list(), true),
  });
  return saved;
}

/**
 * A/R invoice lines copied from delivery lines: move each line's Invoiced Qty by `sign` (back on
 * a cancelled invoice). A delivery closes when every line is billed in full, and reopens below it.
 */
export async function applyInvoiced(lines: { baseId: string; baseLineId: string; quantity: number }[], sign: 1 | -1) {
  const ids = [...new Set(lines.map((l) => l.baseId))];
  for (const id of ids) {
    const d = await deliveries.get(id);
    if (!d) continue;
    const next = d.lines.map((dl) => {
      const qty = lines.filter((l) => l.baseId === id && l.baseLineId === dl.id).reduce((n, l) => n + l.quantity, 0);
      return qty ? { ...dl, invoicedQty: Math.max(0, round4(dl.invoicedQty + qty * sign)) } : dl;
    });
    const billed = next.every((l) => l.invoicedQty >= l.quantity);
    const status = d.status === 'Cancelled' ? d.status : billed ? 'Closed' : 'Open';
    await deliveries.save({ ...d, lines: next, status, closeDate: status === 'Closed' ? d.closeDate || todayISO() : '' });
  }
}

/** Close: nothing more will be invoiced against it. */
export async function closeDelivery(d: Delivery) {
  return deliveries.save({ ...d, status: 'Closed', closeDate: todayISO() });
}

/** Cancel an uninvoiced delivery: the stock comes back at the cost it left at, the order lines reopen, the entry is reversed. */
export async function cancelDelivery(d: Delivery) {
  if (d.lines.some((l) => l.invoicedQty > 0)) throw new DnPostError([], 'Already billed on an A/R invoice — cancel the invoice first.');
  const frozen = await frozenStock();
  const blocked = d.lines.filter((l) => frozen.has(`${l.itemId}@${l.warehouse}`));
  if (blocked.length) throw new DnPostError(blocked.map((l) => l.id), blocked.map((l) => `${l.itemNo} is frozen in ${l.warehouse} by inventory count ${frozen.get(`${l.itemId}@${l.warehouse}`)}.`).join(' '));
  const items = await listItems();
  const touched = new Map<string, Item>();
  for (const l of d.lines) {
    const item = touched.get(l.itemId) ?? structuredClone(items.find((i) => i.id === l.itemId));
    if (!item?.inventoryItem) continue;
    const row = item.warehouses.find((w) => w.code === l.warehouse);
    if (!row) continue;
    row.inStock = round4(row.inStock + dnInventoryQty(l));
    touched.set(item.id, item);
  }
  for (const item of touched.values()) await saveItem(item);
  await applyDelivered(d.lines.filter((l) => l.baseType === 'SO'), -1);
  const saved = await deliveries.save({ ...d, status: 'Cancelled', closeDate: todayISO() });
  await reverseDocumentEntry(d.id);
  return saved;
}
