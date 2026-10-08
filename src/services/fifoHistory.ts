/**
 * FIFO cost layers for the seeded history. The seeds post no layers of their own, so this replays
 * them in date order for every FIFO-valued item, the way the services post live documents:
 *
 * - opening stock (what's left of In stock once the documents are taken off) is one layer per
 *   warehouse at the item's cost, dated before the history starts;
 * - each goods receipt line adds a layer at its landed cost (`unitCostLc`);
 * - a transfer moves the oldest layers to the destination, keeping their date and cost;
 * - stock count postings add a layer for a gain and consume for a loss;
 * - a goods return takes from the batch it's returning (its receipt's layer) first;
 * - deliveries consume the oldest layers first. What a delivery line consumed is
 *   its FIFO cost (`unitCostLc`), so the seeded deliveries carry it like posted ones would.
 *
 * Built once at load and seeded into the cost-layer and delivery collections.
 */
import { SEED_DELIVERIES } from '../mocks/deliveries';
import { SEED_POSTINGS, countedQty } from '../mocks/inventoryCountings';
import { SEED_TRANSFERS } from '../mocks/inventoryTransfers';
import { SEED_ITEMS } from '../mocks/items';
import type { CostConsumption, CostLayer } from './costLayers';
import { PURCHASING_HISTORY } from './purchasingHistory';

/** Opening stock is dated the day before the first seeded document. */
const OPENING_DATE = '2026-06-30';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
const posted = (status: string) => status !== 'Draft' && status !== 'Cancelled';

type Event =
  | { date: string; order: number; kind: 'in'; itemId: string; warehouse: string; qty: number; unitCost: number; sourceId: string; receiptId: string }
  | { date: string; order: number; kind: 'move'; itemId: string; from: string; to: string; qty: number; sourceId: string }
  | { date: string; order: number; kind: 'out'; itemId: string; warehouse: string; qty: number; docId: string; lineId?: string; receiptId?: string };

function build() {
  const fifo = new Map(SEED_ITEMS.filter((i) => i.inventoryItem && i.valuationMethod === 'FIFO').map((i) => [i.id, i]));
  const events: Event[] = [];
  // Same-day order: receipts, then transfers, then count postings, then what goes out.
  for (const gr of PURCHASING_HISTORY.receipts.filter((g) => posted(g.status)))
    for (const l of gr.lines)
      if (fifo.has(l.itemId) && l.warehouse)
        events.push({ date: gr.postingDate, order: 0, kind: 'in', itemId: l.itemId, warehouse: l.warehouse, qty: l.quantity * (l.itemsPerUnit || 1), unitCost: l.unitCostLc, sourceId: gr.id, receiptId: gr.id });
  for (const t of SEED_TRANSFERS.filter((x) => x.status === 'Posted'))
    for (const l of t.lines)
      if (fifo.has(l.itemId))
        events.push({ date: t.postingDate, order: 1, kind: 'move', itemId: l.itemId, from: t.fromWarehouse, to: l.toWarehouse || t.toWarehouse, qty: l.quantity, sourceId: `tr-${t.id}` });
  for (const p of SEED_POSTINGS.filter((x) => x.docNum))
    for (const l of p.lines) {
      if (!fifo.has(l.itemId)) continue;
      const v = round4(countedQty(l) - l.inWhseQty);
      if (v > 0) events.push({ date: p.postingDate, order: 2, kind: 'in', itemId: l.itemId, warehouse: l.warehouse, qty: v, unitCost: fifo.get(l.itemId)!.itemCost, sourceId: p.id, receiptId: p.id });
      if (v < 0) events.push({ date: p.postingDate, order: 2, kind: 'out', itemId: l.itemId, warehouse: l.warehouse, qty: -v, docId: p.id });
    }
  for (const r of PURCHASING_HISTORY.returns.filter((x) => posted(x.status)))
    for (const l of r.lines)
      if (fifo.has(l.itemId) && l.warehouse) {
        // The receipt the returned units came in on: the base receipt, or the receipt behind the base bill.
        const bill = l.baseType === 'APINV' ? PURCHASING_HISTORY.invoices.find((b) => b.id === l.baseId) : undefined;
        const receiptId = l.baseType === 'GRPO' ? l.baseId : bill?.lines.find((b) => b.id === l.baseLineId)?.baseId;
        events.push({ date: r.postingDate, order: 3, kind: 'out', itemId: l.itemId, warehouse: l.warehouse, qty: l.quantity * (l.itemsPerUnit || 1), docId: r.id, receiptId });
      }
  for (const d of SEED_DELIVERIES.filter((x) => posted(x.status)))
    for (const l of d.lines)
      if (fifo.has(l.itemId) && l.warehouse)
        events.push({ date: d.postingDate, order: 4, kind: 'out', itemId: l.itemId, warehouse: l.warehouse, qty: l.quantity * (l.itemsPerUnit || 1), docId: d.id, lineId: l.id });
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  // Opening stock: In stock less what the documents moved, per warehouse.
  const net = new Map<string, number>();
  const bump = (key: string, q: number) => net.set(key, (net.get(key) ?? 0) + q);
  for (const e of events) {
    if (e.kind === 'in') bump(`${e.itemId}@${e.warehouse}`, e.qty);
    if (e.kind === 'out') bump(`${e.itemId}@${e.warehouse}`, -e.qty);
    if (e.kind === 'move') (bump(`${e.itemId}@${e.from}`, -e.qty), bump(`${e.itemId}@${e.to}`, e.qty));
  }

  const layers: CostLayer[] = [];
  const add = (l: Omit<CostLayer, 'id'>) => layers.push({ ...l, id: `cl-seed-${layers.length + 1}` });
  for (const item of fifo.values())
    for (const w of item.warehouses) {
      const opening = round4(w.inStock - (net.get(`${item.id}@${w.code}`) ?? 0));
      if (opening > 0)
        add({ itemId: item.id, warehouse: w.code, receivedOn: OPENING_DATE, qty: opening, receivedQty: opening, unitCost: item.itemCost, sourceId: 'opening', receiptId: 'opening' });
    }

  const oldestFirst = (itemId: string, warehouse: string) =>
    layers.filter((l) => l.itemId === itemId && l.warehouse === warehouse && l.qty > 0).sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.id.localeCompare(b.id, undefined, { numeric: true }));
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

  /** Delivery line id → FIFO cost per inventory unit. */
  const costs = new Map<string, number>();
  const consumptions: CostConsumption[] = [];
  const shortfalls: string[] = [];
  for (const e of events) {
    if (e.kind === 'in') add({ itemId: e.itemId, warehouse: e.warehouse, receivedOn: e.date, qty: e.qty, receivedQty: e.qty, unitCost: e.unitCost, sourceId: e.sourceId, receiptId: e.receiptId });
    else if (e.kind === 'move') {
      const { taken, short } = take(e.itemId, e.from, e.qty);
      for (const t of taken)
        add({ itemId: e.itemId, warehouse: e.to, receivedOn: t.layer.receivedOn, qty: t.qty, receivedQty: t.qty, unitCost: t.layer.unitCost, sourceId: e.sourceId, receiptId: t.layer.receiptId });
      if (short) shortfalls.push(`${e.itemId} ${e.from}→${e.to} ${e.date}: ${short} without layers`);
    } else {
      const { taken, short } = take(e.itemId, e.warehouse, e.qty, e.receiptId);
      if (short) shortfalls.push(`${e.itemId}@${e.warehouse} ${e.date}: ${short} without layers`);
      // As the live service does: units beyond the layers go out at the last layer's cost.
      const last = taken.at(-1)?.layer.unitCost ?? SEED_ITEMS.find((i) => i.id === e.itemId)?.itemCost ?? 0;
      const value = taken.reduce((n, t) => n + t.qty * t.layer.unitCost, 0) + short * last;
      if (e.lineId) costs.set(e.lineId, round2(value / e.qty));
      const log = (qty: number, unitCost: number, receiptId: string, receivedOn: string) =>
        consumptions.push({ id: `cc-seed-${consumptions.length + 1}`, docId: e.docId, itemId: e.itemId, warehouse: e.warehouse, date: e.date, qty, unitCost, receiptId, receivedOn });
      for (const t of taken) log(t.qty, t.layer.unitCost, t.layer.receiptId ?? t.layer.sourceId, t.layer.receivedOn);
      if (short) log(short, last, '', '');
    }
  }
  return { layers, costs, consumptions, shortfalls };
}

export const FIFO_HISTORY = build();
