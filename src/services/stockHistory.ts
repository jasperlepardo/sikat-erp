/**
 * Stock and cost through the seeded history. The seeds hold documents, not the stock and cost
 * movements they made, so this replays every posted document in date order from the opening —
 * the way the services move stock and cost when a document is added:
 *
 * - opening stock (1 Jan 2026) is what's left of In stock once the documents are taken off, per
 *   warehouse, at the item's opening cost (its seeded cost). FIFO items get one layer for it;
 * - goods receipts bring stock in at their landed cost. Moving Average re-averages over
 *   company-wide stock (as applyStock does); FIFO adds a layer;
 * - goods returns send it back at the receipt's cost, re-averaging the other way;
 * - A/P credit memo price adjustments lower the cost of stock still on hand;
 * - deliveries, and A/R invoices that ship stock themselves (copied from an order, or POS sales),
 *   take it out at the current cost (FIFO: the oldest layers);
 * - sales returns and A/R credit memos that take goods back put them in at the cost they left at;
 * - transfers move stock (FIFO: the oldest layers, keeping their cost); count postings add or
 *   remove the variance.
 *
 * What comes out: each outgoing line's cost (deliveries and invoices carry it), the cost of goods
 * coming back, every item's cost today, the FIFO layers left and what each document consumed, and
 * the opening stock — the books' opening inventory. Problems (stock that would go negative, an
 * opening below zero) are listed in `problems`, which the seed checks require to be empty.
 */
import { SEED_AR_CREDIT_MEMOS } from '../mocks/arCreditMemos';
import { SEED_AR_INVOICES } from '../mocks/arInvoices';
import { SEED_DELIVERIES } from '../mocks/deliveries';
import { SEED_POSTINGS, countedQty } from '../mocks/inventoryCountings';
import { SEED_TRANSFERS } from '../mocks/inventoryTransfers';
import { SEED_ITEMS, mergedItems, newItemWarehouse, type Item } from '../mocks/items';
import { SEED_SALES_RETURNS } from '../mocks/salesReturns';
import type { CostConsumption, CostLayer } from './costLayers';
import { purchasingHistory } from './purchasingHistory';
import { lineNet } from './purchaseOrders';

/**
 * Pasig, the central warehouse, balances: everything else is bought for it or sent from it, so its
 * stock follows from the documents. It opens with the least stock that never runs out (none for
 * items released during the year), and its In stock today is what the documents leave.
 */
export const CENTRAL_WAREHOUSE = 'WH-MNL';

/** The books open on 1 Jan 2026; opening stock is dated the day before. */
export const BOOKS_OPEN = '2026-01-01';
export const OPENING_DATE = '2025-12-31';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const posted = (status: string) => status !== 'Draft' && status !== 'Cancelled';
const invQty = (l: { quantity: number; itemsPerUnit?: number }) => round4(l.quantity * (l.itemsPerUnit || 1));

type Event =
  // In at a known cost. `reAverage`: Moving Average items re-average (receipts, goods returns).
  | { date: string; order: number; kind: 'in'; itemId: string; warehouse: string; qty: number; unitCost: number; reAverage: boolean; sourceId: string; lineId?: string }
  // Out at the current cost; `costOf` names the line whose cost is recorded.
  | { date: string; order: number; kind: 'out'; itemId: string; warehouse: string; qty: number; docId: string; lineId?: string; receiptId?: string; atCost?: number; reAverage?: boolean }
  // Back in at the cost a base line went out at.
  | { date: string; order: number; kind: 'back'; itemId: string; warehouse: string; qty: number; docId: string; lineId: string; baseLineId: string }
  | { date: string; order: number; kind: 'move'; itemId: string; from: string; to: string; qty: number; sourceId: string }
  | { date: string; order: number; kind: 'cost'; itemId: string; value: number; docId: string };

export interface StockHistory {
  /** Cost per inventory unit of each line that moved stock out or back in, by line id. */
  costs: Map<string, number>;
  /** Each item's cost after the history (Moving Average, or FIFO's remaining layers). */
  itemCosts: Map<string, number>;
  /** Pasig's In stock after the history, per item (it replaces the seeded figure). */
  centralStock: Map<string, number>;
  /** Opening stock per item and warehouse, and the opening cost it carries. */
  opening: { itemId: string; warehouse: string; qty: number; unitCost: number }[];
  layers: CostLayer[];
  consumptions: CostConsumption[];
  problems: string[];
}

function events(items: Map<string, Item>): Event[] {
  const out: Event[] = [];
  const stocked = (itemId: string) => items.get(itemId)?.inventoryItem === true;
  const H = purchasingHistory();

  // Same-day order: what comes in, transfers, counts, goods returns, what goes out, what comes back, cost changes.
  for (const gr of H.receipts.filter((g) => posted(g.status)))
    for (const l of gr.lines)
      if (stocked(l.itemId) && l.warehouse)
        out.push({ date: gr.postingDate, order: 0, kind: 'in', itemId: l.itemId, warehouse: l.warehouse, qty: invQty(l), unitCost: l.unitCostLc, reAverage: true, sourceId: gr.id });
  for (const t of SEED_TRANSFERS.filter((x) => x.status === 'Posted'))
    for (const l of t.lines)
      if (stocked(l.itemId)) out.push({ date: t.postingDate, order: 1, kind: 'move', itemId: l.itemId, from: t.fromWarehouse, to: l.toWarehouse || t.toWarehouse, qty: l.quantity, sourceId: `tr-${t.id}` });
  for (const p of SEED_POSTINGS.filter((x) => x.docNum))
    for (const l of p.lines) {
      if (!stocked(l.itemId)) continue;
      const v = round4(countedQty(l) - l.inWhseQty);
      if (v > 0) out.push({ date: p.postingDate, order: 2, kind: 'in', itemId: l.itemId, warehouse: l.warehouse, qty: v, unitCost: items.get(l.itemId)!.itemCost, reAverage: false, sourceId: p.id });
      if (v < 0) out.push({ date: p.postingDate, order: 2, kind: 'out', itemId: l.itemId, warehouse: l.warehouse, qty: -v, docId: p.id });
    }
  for (const r of H.returns.filter((x) => posted(x.status)))
    for (const l of r.lines)
      if (stocked(l.itemId) && l.warehouse) {
        // The receipt the returned units came in on: the base receipt, or the receipt behind the base bill.
        const bill = l.baseType === 'APINV' ? H.invoices.find((b) => b.id === l.baseId) : undefined;
        const receiptId = l.baseType === 'GRPO' ? l.baseId : bill?.lines.find((b) => b.id === l.baseLineId)?.baseId;
        out.push({ date: r.postingDate, order: 3, kind: 'out', itemId: l.itemId, warehouse: l.warehouse, qty: invQty(l), docId: r.id, lineId: l.id, receiptId, atCost: l.unitCostLc, reAverage: true });
      }
  for (const d of SEED_DELIVERIES.filter((x) => posted(x.status)))
    for (const l of d.lines)
      if (stocked(l.itemId) && l.warehouse) out.push({ date: d.postingDate, order: 4, kind: 'out', itemId: l.itemId, warehouse: l.warehouse, qty: invQty(l), docId: d.id, lineId: l.id });
  // Invoices that ship stock themselves: lines not copied from a delivery, on item-type invoices.
  for (const a of SEED_AR_INVOICES.filter((x) => posted(x.status) && x.docType !== 'Service'))
    for (const l of a.lines)
      if (l.baseType !== 'DN' && stocked(l.itemId) && l.warehouse) out.push({ date: a.postingDate, order: 4, kind: 'out', itemId: l.itemId, warehouse: l.warehouse, qty: invQty(l), docId: a.id, lineId: l.id });
  for (const r of SEED_SALES_RETURNS.filter((x) => posted(x.status)))
    for (const l of r.lines)
      if (stocked(l.itemId) && l.warehouse) out.push({ date: r.postingDate, order: 5, kind: 'back', itemId: l.itemId, warehouse: l.warehouse, qty: invQty(l), docId: r.id, lineId: l.id, baseLineId: l.baseLineId });
  for (const m of SEED_AR_CREDIT_MEMOS.filter((x) => posted(x.status)))
    for (const l of m.lines)
      if (l.returnGoods && stocked(l.itemId) && l.warehouse) {
        // The cost it went out at: the invoice line's, or the delivery line behind it.
        const inv = SEED_AR_INVOICES.find((a) => a.id === l.baseId);
        const il = inv?.lines.find((x) => x.id === l.baseLineId);
        out.push({ date: m.postingDate, order: 5, kind: 'back', itemId: l.itemId, warehouse: l.warehouse, qty: invQty(l), docId: m.id, lineId: l.id, baseLineId: il?.baseType === 'DN' ? il.baseLineId : l.baseLineId });
      }
  // A/P credit memo price adjustments (not from a return, not sending goods back) lower the cost of stock on hand.
  for (const m of H.memos.filter((x) => posted(x.status)))
    for (const l of m.lines)
      if (l.baseType !== 'GRET' && !l.returnGoods && stocked(l.itemId))
        out.push({ date: m.postingDate, order: 6, kind: 'cost', itemId: l.itemId, value: round2(lineNet(l) * (1 - m.discountPct / 100) * (m.fxRate || 1)), docId: m.id });

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
}

function build(): StockHistory {
  // As the app reads them: a variant's valuation method and accounts are its parent's.
  const items = new Map(mergedItems(SEED_ITEMS).map((i) => [i.id, i]));
  const evs = events(items);
  const problems: string[] = [];
  const key = (itemId: string, warehouse: string) => `${itemId}@${warehouse}`;

  // Opening stock: In stock less what the documents moved, per warehouse.
  const net = new Map<string, number>();
  const bump = (k: string, q: number) => net.set(k, round4((net.get(k) ?? 0) + q));
  for (const e of evs) {
    if (e.kind === 'in' || e.kind === 'back') bump(key(e.itemId, e.warehouse), e.qty);
    if (e.kind === 'out') bump(key(e.itemId, e.warehouse), -e.qty);
    if (e.kind === 'move') (bump(key(e.itemId, e.from), -e.qty), bump(key(e.itemId, e.to), e.qty));
  }
  // Pasig's opening: the least stock that keeps it from running out, walking the documents from zero.
  const centralLow = new Map<string, number>();
  {
    const run = new Map<string, number>();
    const step = (itemId: string, warehouse: string, q: number) => {
      if (warehouse !== CENTRAL_WAREHOUSE) return;
      const next = round4((run.get(itemId) ?? 0) + q);
      run.set(itemId, next);
      centralLow.set(itemId, Math.min(centralLow.get(itemId) ?? 0, next));
    };
    for (const e of evs) {
      if (e.kind === 'in' || e.kind === 'back') step(e.itemId, e.warehouse, e.qty);
      if (e.kind === 'out') step(e.itemId, e.warehouse, -e.qty);
      if (e.kind === 'move') (step(e.itemId, e.from, -e.qty), step(e.itemId, e.to, e.qty));
    }
  }
  const centralOpening = (itemId: string) => -(centralLow.get(itemId) ?? 0);

  const stock = new Map<string, number>();
  const opening: StockHistory['opening'] = [];
  const movedIn = new Map<string, string[]>();
  for (const k of net.keys()) {
    const at = k.indexOf('@');
    movedIn.set(k.slice(0, at), [...(movedIn.get(k.slice(0, at)) ?? []), k.slice(at + 1)]);
  }
  for (const item of items.values()) {
    if (!item.inventoryItem) continue;
    const codes = new Set([...item.warehouses.map((w) => w.code), ...(movedIn.get(item.id) ?? [])]);
    for (const code of codes) {
      const inStock = item.warehouses.find((w) => w.code === code)?.inStock ?? 0;
      const qty = code === CENTRAL_WAREHOUSE ? centralOpening(item.id) : round4(inStock - (net.get(key(item.id, code)) ?? 0));
      if (code === CENTRAL_WAREHOUSE && qty > 0 && item.validFrom > BOOKS_OPEN) problems.push(`${item.itemNo} @${code}: released ${item.validFrom} but needs ${qty} on hand on 1 Jan — buy it before it goes out`);
      if (qty < 0) problems.push(`${item.itemNo} @${code}: opening stock ${qty} (in stock ${inStock}, documents net ${net.get(key(item.id, code)) ?? 0})`);
      if (code !== CENTRAL_WAREHOUSE && !item.warehouses.some((w) => w.code === code)) problems.push(`${item.itemNo}: documents move stock in ${code}, which the item has no row for`);
      stock.set(key(item.id, code), qty);
      if (qty > 0) opening.push({ itemId: item.id, warehouse: code, qty, unitCost: item.itemCost });
    }
  }

  // Moving Average cost per item (company-wide); FIFO layers per warehouse.
  const cost = new Map([...items.values()].map((i) => [i.id, i.itemCost]));
  const total = new Map<string, number>();
  for (const [k, q] of stock) total.set(k.slice(0, k.indexOf('@')), round4((total.get(k.slice(0, k.indexOf('@'))) ?? 0) + q));
  const onHand = (itemId: string) => total.get(itemId) ?? 0;
  const isFifo = (itemId: string) => items.get(itemId)?.valuationMethod === 'FIFO';
  const isAverage = (itemId: string) => {
    const m = items.get(itemId)?.valuationMethod;
    return m !== 'FIFO' && m !== 'Standard Price';
  };

  const layers: CostLayer[] = [];
  /** Layers per item@warehouse, in the order added (oldest receipt date first after sorting). */
  const byStock = new Map<string, CostLayer[]>();
  const byItem = new Map<string, CostLayer[]>();
  const addLayer = (l: Omit<CostLayer, 'id'>) => {
    const layer = { ...l, id: `cl-seed-${layers.length + 1}` };
    layers.push(layer);
    const k = key(l.itemId, l.warehouse);
    byStock.set(k, [...(byStock.get(k) ?? []), layer]);
    byItem.set(l.itemId, [...(byItem.get(l.itemId) ?? []), layer]);
  };
  for (const o of opening) if (isFifo(o.itemId)) addLayer({ itemId: o.itemId, warehouse: o.warehouse, receivedOn: OPENING_DATE, qty: o.qty, receivedQty: o.qty, unitCost: o.unitCost, sourceId: 'opening', receiptId: 'opening' });
  const oldestFirst = (itemId: string, warehouse: string) =>
    (byStock.get(key(itemId, warehouse)) ?? []).filter((l) => l.qty > 0).sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  /** Take `qty` oldest-first (from one receipt's batch first, if given); returns what each layer gave. */
  const take = (itemId: string, warehouse: string, qty: number, receiptId?: string) => {
    const taken: { layer: CostLayer; qty: number }[] = [];
    let left = qty;
    const order = oldestFirst(itemId, warehouse);
    const batchFirst = receiptId ? [...order.filter((l) => l.receiptId === receiptId), ...order.filter((l) => l.receiptId !== receiptId)] : order;
    for (const layer of batchFirst) {
      if (left <= 0) break;
      const q = Math.min(left, layer.qty);
      layer.qty = round4(layer.qty - q);
      left = round4(left - q);
      taken.push({ layer, qty: q });
    }
    return { taken, short: left };
  };
  const fifoCost = (itemId: string) => {
    const left = (byItem.get(itemId) ?? []).filter((l) => l.qty > 0);
    const qty = left.reduce((n, l) => n + l.qty, 0);
    return qty > 0 ? round2(left.reduce((n, l) => n + l.qty * l.unitCost, 0) / qty) : cost.get(itemId)!;
  };

  const costs = new Map<string, number>();
  const consumptions: CostConsumption[] = [];
  const move = (itemId: string, warehouse: string, qty: number, what: string) => {
    const k = key(itemId, warehouse);
    const next = round4((stock.get(k) ?? 0) + qty);
    if (next < -0.0001) problems.push(`${items.get(itemId)!.itemNo} @${warehouse}: stock goes to ${next} on ${what}`);
    stock.set(k, next);
    total.set(itemId, round4(onHand(itemId) + qty));
  };

  for (const e of evs) {
    if (e.kind === 'in') {
      if (isAverage(e.itemId) && e.reAverage) {
        const before = onHand(e.itemId);
        if (before + e.qty > 0) cost.set(e.itemId, round2((before * cost.get(e.itemId)! + e.qty * e.unitCost) / (before + e.qty)));
      }
      if (isFifo(e.itemId)) addLayer({ itemId: e.itemId, warehouse: e.warehouse, receivedOn: e.date, qty: e.qty, receivedQty: e.qty, unitCost: e.unitCost, sourceId: e.sourceId, receiptId: e.sourceId });
      move(e.itemId, e.warehouse, e.qty, `${e.sourceId} (${e.date})`);
    } else if (e.kind === 'move') {
      if (isFifo(e.itemId)) {
        const { taken, short } = take(e.itemId, e.from, e.qty);
        for (const t of taken) addLayer({ itemId: e.itemId, warehouse: e.to, receivedOn: t.layer.receivedOn, qty: t.qty, receivedQty: t.qty, unitCost: t.layer.unitCost, sourceId: e.sourceId, receiptId: t.layer.receiptId });
        if (short) problems.push(`${items.get(e.itemId)!.itemNo} ${e.from}→${e.to} ${e.date}: ${short} without cost layers`);
      }
      move(e.itemId, e.from, -e.qty, `${e.sourceId} (${e.date})`);
      move(e.itemId, e.to, e.qty, `${e.sourceId} (${e.date})`);
    } else if (e.kind === 'out') {
      let unit: number;
      if (isFifo(e.itemId)) {
        const { taken, short } = take(e.itemId, e.warehouse, e.qty, e.receiptId);
        if (short) problems.push(`${items.get(e.itemId)!.itemNo} @${e.warehouse} ${e.date}: ${short} without cost layers`);
        // As the live service does: units beyond the layers go out at the last layer's cost.
        const last = taken.at(-1)?.layer.unitCost ?? cost.get(e.itemId)!;
        const value = taken.reduce((n, t) => n + t.qty * t.layer.unitCost, 0) + short * last;
        unit = round2(value / e.qty);
        const log = (qty: number, unitCost: number, receiptId: string, receivedOn: string) =>
          consumptions.push({ id: `cc-seed-${consumptions.length + 1}`, docId: e.docId, itemId: e.itemId, warehouse: e.warehouse, date: e.date, qty, unitCost, receiptId, receivedOn });
        for (const t of taken) log(t.qty, t.layer.unitCost, t.layer.receiptId ?? t.layer.sourceId, t.layer.receivedOn);
        if (short) log(short, last, '', '');
      } else if (e.atCost !== undefined) {
        unit = e.atCost;
        if (isAverage(e.itemId) && e.reAverage) {
          const before = onHand(e.itemId);
          if (before - e.qty > 0) cost.set(e.itemId, round2((before * cost.get(e.itemId)! - e.qty * e.atCost) / (before - e.qty)));
        }
      } else unit = cost.get(e.itemId)!;
      if (e.lineId) costs.set(e.lineId, unit);
      move(e.itemId, e.warehouse, -e.qty, `${e.docId} (${e.date})`);
    } else if (e.kind === 'back') {
      const unit = costs.get(e.baseLineId) ?? cost.get(e.itemId)!;
      costs.set(e.lineId, unit);
      if (isFifo(e.itemId)) addLayer({ itemId: e.itemId, warehouse: e.warehouse, receivedOn: e.date, qty: e.qty, receivedQty: e.qty, unitCost: unit, sourceId: e.docId, receiptId: e.docId });
      move(e.itemId, e.warehouse, e.qty, `${e.docId} (${e.date})`);
    } else if (isAverage(e.itemId)) {
      const qty = onHand(e.itemId);
      if (qty > 0) cost.set(e.itemId, round2(cost.get(e.itemId)! - e.value / qty));
    }
  }

  const itemCosts = new Map([...items.values()].map((i) => [i.id, isFifo(i.id) ? fifoCost(i.id) : cost.get(i.id)!]));
  const centralStock = new Map([...items.values()].filter((i) => i.inventoryItem).map((i) => [i.id, stock.get(key(i.id, CENTRAL_WAREHOUSE)) ?? 0]));
  return { costs, itemCosts, centralStock, opening, layers, consumptions, problems };
}

let built: StockHistory | undefined;
/** The history, built on first use (collections seed from it lazily; see createCollection). */
export const stockHistory = (): StockHistory => (built ??= build());

/**
 * Seeded documents with each line's cost from the history: what it went out (or came back) at.
 * A line copied from a delivery carries the delivery line's cost.
 */
export const withLineCosts = <T extends { lines: { id: string; unitCostLc: number; baseType?: string; baseLineId?: string }[] }>(docs: T[]) => (): T[] => {
  const { costs } = stockHistory();
  return docs.map((d) => ({
    ...d,
    lines: d.lines.map((l) => {
      const cost = costs.get(l.id) ?? (l.baseType === 'DN' && l.baseLineId ? costs.get(l.baseLineId) : undefined);
      return cost === undefined ? l : { ...l, unitCostLc: cost };
    }),
  }));
};

/** The seeded items as the history leaves them: today's cost, and Pasig's In stock. */
export function withStockHistory(items: Item[]): Item[] {
  const { itemCosts, centralStock } = stockHistory();
  return items.map((item) => {
    if (!item.inventoryItem) return item;
    const qty = centralStock.get(item.id) ?? 0;
    const has = item.warehouses.some((w) => w.code === CENTRAL_WAREHOUSE);
    const warehouses = has
      ? item.warehouses.map((w) => (w.code === CENTRAL_WAREHOUSE ? { ...w, inStock: qty } : w))
      : qty
        ? [...item.warehouses, newItemWarehouse(CENTRAL_WAREHOUSE, { inStock: qty, defaultBinId: 'bin-WH-MNL-A-01-01' })]
        : item.warehouses;
    return { ...item, itemCost: itemCosts.get(item.id) ?? item.itemCost, warehouses };
  });
}
