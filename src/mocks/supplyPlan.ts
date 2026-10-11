/**
 * What Pasig buys to keep the stores stocked (mocks/storeSales.ts): the seeded purchase orders
 * the hand-written ones don't cover. mocks/purchaseOrders.ts turns the plan into orders.
 *
 * - Replenishment, January–June: each month Pasig orders from each supplier what the stores sold
 *   that month, received before the first-of-month restock that sends it out. From July the
 *   hand-written orders take over, with Pasig's own stock covering the rest.
 * - Releases: an item released during the year is bought just before it goes out — the least
 *   that keeps Pasig from running out from then on, counting every order already seeded, the
 *   release-day stock for the stores, the restocks after it and what's delivered to customers.
 *
 * Suppliers: Apple South Asia (USD import) for iPads, Techzone for accessories, Luzon
 * iDistribution for the rest — or the item's own default vendor.
 */
import { SEED_AR_INVOICES } from './arInvoices';
import { SEED_DELIVERIES } from './deliveries';
import { SEED_TRANSFERS } from './inventoryTransfers';
import { SEED_ITEMS, itemsPerUom, type Item } from './items';
import type { PurchaseOrder } from './purchaseOrders';
import { VENDOR_RETURNS } from './retailHistory';
import { SALES_MONTHS, STORE_SALES, isLaunchItem } from './storeSales';

export const CENTRAL = 'WH-MNL';
/** The day the seeded history runs to. Receipts not yet complete are dated no later than this. */
export const SEED_AS_OF = '2026-10-09';

export const LUZON = 'bp-016';
export const TECHZONE = 'bp-013';
export const APPLE = 'bp-017';

export interface PlannedOrder {
  id: string;
  vendorId: string;
  kind: 'replenishment' | 'release';
  postingDate: string;
  /** Received complete on this day. */
  receivedOn: string;
  /** What it replaces or releases, for the remarks. */
  month?: string;
  /** Inventory units per item. */
  lines: { itemId: string; units: number }[];
}

const items = new Map(SEED_ITEMS.map((i) => [i.id, i]));

export const supplierOf = (item: Item) => {
  if (item.defaultVendorId) return item.defaultVendorId;
  const line = item.itemNo.split('-')[0];
  return line === 'IPD' ? APPLE : line === 'ACC' ? TECHZONE : LUZON;
};

const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The day a hand-written order's goods came in: as mocks/goodsReceipts.ts dates its receipt. */
export function receiptDate(po: Pick<PurchaseOrder, 'lines' | 'deliveryDate' | 'postingDate'>) {
  const planned = po.lines.map((l) => l.deliveryDate).filter(Boolean).sort().at(-1) || po.deliveryDate || po.postingDate;
  const capped = planned > SEED_AS_OF ? SEED_AS_OF : planned;
  return capped < po.postingDate ? po.postingDate : capped;
}

/** Monthly replenishment orders, January–June: one per supplier per month. */
function replenishments(): PlannedOrder[] {
  const out: PlannedOrder[] = [];
  for (const m of SALES_MONTHS.filter((x) => x.month <= '2026-06')) {
    const units = new Map<string, Map<string, number>>();
    for (const sale of STORE_SALES.filter((s) => s.month === m.month))
      for (const l of sale.lines) {
        const item = items.get(l.itemId)!;
        if (isLaunchItem(item)) continue;
        const v = supplierOf(item);
        const byItem = units.get(v) ?? new Map<string, number>();
        byItem.set(l.itemId, (byItem.get(l.itemId) ?? 0) + l.qty);
        units.set(v, byItem);
      }
    for (const [vendorId, byItem] of units) {
      const imported = vendorId === APPLE;
      out.push({
        id: `po-r${m.month.slice(2).replace('-', '')}-${vendorId.slice(3)}`,
        vendorId,
        kind: 'replenishment',
        month: m.month,
        postingDate: `${m.month}-${imported ? '06' : '20'}`,
        receivedOn: `${m.month}-${imported ? '24' : '27'}`,
        lines: [...byItem].sort(([a], [b]) => items.get(a)!.itemNo.localeCompare(items.get(b)!.itemNo)).map(([itemId, u]) => ({ itemId, units: u })),
      });
    }
  }
  return out;
}

/** Release orders: per release date and supplier, the least each new item needs from then on. */
function releases(hand: PurchaseOrder[]): PlannedOrder[] {
  const launch = SEED_ITEMS.filter((i) => i.inventoryItem && isLaunchItem(i));
  const ids = new Set(launch.map((i) => i.id));
  // Pasig's movements of the new items, from everything seeded but this plan.
  const moves: { date: string; itemId: string; units: number }[] = [];
  for (const po of hand.filter((p) => p.status !== 'Cancelled'))
    for (const l of po.lines)
      if (ids.has(l.itemId) && l.warehouse === CENTRAL && l.receivedQty > 0) moves.push({ date: receiptDate(po), itemId: l.itemId, units: l.receivedQty * (l.itemsPerUnit || 1) });
  for (const t of SEED_TRANSFERS.filter((x) => x.status === 'Posted'))
    for (const l of t.lines) {
      if (!ids.has(l.itemId)) continue;
      if (t.fromWarehouse === CENTRAL) moves.push({ date: t.postingDate, itemId: l.itemId, units: -l.quantity });
      if ((l.toWarehouse || t.toWarehouse) === CENTRAL) moves.push({ date: t.postingDate, itemId: l.itemId, units: l.quantity });
    }
  for (const d of SEED_DELIVERIES.filter((x) => x.status !== 'Draft' && x.status !== 'Cancelled'))
    for (const l of d.lines) if (ids.has(l.itemId) && l.warehouse === CENTRAL) moves.push({ date: d.postingDate, itemId: l.itemId, units: -l.quantity * (l.itemsPerUnit || 1) });
  for (const r of VENDOR_RETURNS) {
    const item = SEED_ITEMS.find((i) => i.itemNo === r.itemNo)!;
    if (ids.has(item.id)) moves.push({ date: r.date, itemId: item.id, units: -r.quantity * (itemsPerUom(item, item.purchasingUom) ?? 1) });
  }
  for (const a of SEED_AR_INVOICES.filter((x) => x.status !== 'Draft' && x.status !== 'Cancelled' && x.docType !== 'Service'))
    for (const l of a.lines) if (l.baseType !== 'DN' && ids.has(l.itemId) && l.warehouse === CENTRAL) moves.push({ date: a.postingDate, itemId: l.itemId, units: -l.quantity * (l.itemsPerUnit || 1) });

  const byRelease = new Map<string, PlannedOrder>();
  for (const item of launch) {
    // Received two days before release: the stores' stock goes out the day before.
    const receivedOn = plusDays(item.validFrom, -2);
    let run = 0;
    let low = 0;
    for (const m of moves.filter((x) => x.itemId === item.id).sort((a, b) => a.date.localeCompare(b.date))) {
      run += m.units;
      if (m.date >= receivedOn) low = Math.min(low, run);
    }
    if (low >= 0) continue;
    const vendorId = supplierOf(item);
    const key = `${receivedOn}|${vendorId}`;
    const order = byRelease.get(key) ?? {
      id: `po-l${item.validFrom.slice(2).replace(/-/g, '')}-${vendorId.slice(3)}`,
      vendorId,
      kind: 'release' as const,
      postingDate: plusDays(item.validFrom, -10),
      receivedOn,
      lines: [],
    };
    order.lines.push({ itemId: item.id, units: -low });
    byRelease.set(key, order);
  }
  return [...byRelease.values()];
}

export function planSupply(hand: PurchaseOrder[]): PlannedOrder[] {
  return [...replenishments(), ...releases(hand)].sort((a, b) => a.postingDate.localeCompare(b.postingDate) || a.id.localeCompare(b.id));
}
