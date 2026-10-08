/**
 * Store retail history: what the store replenishment POs bought went out to the stores the day
 * after it was received, and the stores sold it to walk-in customers over the following days.
 *
 * One plan drives every document, so the quantities can't drift: the restock transfers
 * (mocks/inventoryTransfers.ts) and the walk-in sales orders, deliveries, invoices and payments
 * (salesOrders, deliveries, arInvoices, incomingPayments). Each chain nets to zero in every
 * warehouse — Pasig receives and ships out the same quantity, each store receives and sells it —
 * so the seeded In stock figures still reconcile with the documents.
 */
import { SEED_WAREHOUSES } from './itemMasters';
import { SEED_ITEMS } from './items';
import { SEED_PURCHASE_ORDERS } from './purchaseOrders';

/** The POs whose receipts are restocked to the stores and sold there. */
const REPLENISHMENT_POS = ['po-046', 'po-047', 'po-048', 'po-049', 'po-050', 'po-051', 'po-052', 'po-041', 'po-042', 'po-043', 'po-053', 'po-044', 'po-045', 'po-054'];

/**
 * Units sent back to the vendor after the bill (built in services/purchasingHistory.ts with their
 * credit memos). They stay in Pasig until they go back, so the stores get the rest.
 */
export const RETAIL_RETURNS = [
  { id: 'rt-003', docNum: 610003, poId: 'po-048', itemNo: 'ACC-PWR35D', quantity: 2, date: '2026-08-01', reason: 'Defective', vendorRef: 'RMA-TZ-2608-007', memoNo: 620003, memoRef: 'CN-TZ-2608-011', remarks: 'Two units dead out of the box; Techzone authorized the return.' },
  { id: 'rt-004', docNum: 610004, poId: 'po-051', itemNo: 'ACC-PWR20', quantity: 3, date: '2026-08-21', reason: 'Damaged in transit', vendorRef: 'RMA-TZ-2608-019', memoNo: 620004, memoRef: 'CN-TZ-2608-024', remarks: 'Carton crushed in transit; three units with cracked casings.' },
] as const;
/** Each received line goes to this many stores. */
const STORES_PER_LINE = 4;
/** History stops the day before the demo's "today". */
const LAST_DAY = '2026-10-07';

export type RetailMeans = 'gcash' | 'cash' | 'card';

export interface RetailRestock {
  id: string;
  docNum: number;
  date: string;
  /** The PO it restocks from, e.g. "Primary 260036", for the remarks. */
  poNo: string;
  lines: { itemId: string; quantity: number; toWarehouse: string }[];
}

export interface RetailSale {
  /** The walk-in sales order's id; the delivery, invoice and payment derive theirs from it. */
  id: string;
  /** Row number in the plan, for each document's number. */
  n: number;
  date: string;
  store: string;
  means: RetailMeans;
  /** In inventory units (pc). */
  lines: { itemId: string; quantity: number }[];
}

/** A stable small hash, so the plan comes out the same on every load. */
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const capped = (iso: string) => (iso > LAST_DAY ? LAST_DAY : iso);

const STORES = new Set(SEED_WAREHOUSES.filter((w) => w.type === 'store' && w.code.startsWith('ST-')).map((w) => w.code));

function plan() {
  const restocks: RetailRestock[] = [];
  /** store|date → item → quantity */
  const sold = new Map<string, Map<string, number>>();

  REPLENISHMENT_POS.forEach((poId, r) => {
    const po = SEED_PURCHASE_ORDERS.find((p) => p.id === poId)!;
    const received = po.lines.filter((l) => l.receivedQty > 0);
    // As the seeded receipt dates it: the last delivery date.
    const receipt = received.map((l) => l.deliveryDate || po.deliveryDate).sort().at(-1)!;
    const shipped = addDays(receipt, 1);
    const lines: RetailRestock['lines'] = [];
    for (const l of received) {
      const item = SEED_ITEMS.find((i) => i.id === l.itemId)!;
      const returned = RETAIL_RETURNS.filter((r) => r.poId === poId && r.itemNo === l.itemNo).reduce((n, r) => n + r.quantity, 0);
      const qty = l.receivedQty * (l.itemsPerUnit || 1) - returned;
      const stores = item.warehouses
        .filter((w) => STORES.has(w.code))
        .sort((a, b) => hash(item.id + a.code + poId) - hash(item.id + b.code + poId))
        .slice(0, STORES_PER_LINE);
      stores.forEach((w, i) => {
        const share = Math.floor(qty / stores.length) + (i < qty % stores.length ? 1 : 0);
        if (!share) return;
        lines.push({ itemId: item.id, quantity: share, toWarehouse: w.code });
        // Sold over the next days: most the day after it arrives, the rest two days later.
        const first = Math.ceil(share / 2);
        for (const [days, q] of [[1, first], [3, share - first]] as const) {
          if (!q) continue;
          const key = `${w.code}|${capped(addDays(shipped, days))}`;
          const byItem = sold.get(key) ?? sold.set(key, new Map()).get(key)!;
          byItem.set(item.id, (byItem.get(item.id) ?? 0) + q);
        }
      });
    }
    restocks.push({ id: `it-r${String(r + 1).padStart(2, '0')}`, docNum: 0, date: shipped, poNo: `${po.seriesId === 'ser-import' ? 'Import' : 'Primary'} ${po.docNum}`, lines });
  });

  // Number the restocks and sales in date order, like documents added one after another.
  restocks.sort((a, b) => a.date.localeCompare(b.date)).forEach((t, i) => (t.docNum = 270007 + i));
  const MEANS: RetailMeans[] = ['gcash', 'cash', 'card'];
  const sales: RetailSale[] = [...sold.entries()]
    .map(([key, byItem]) => {
      const [store, date] = key.split('|');
      return { store, date, lines: [...byItem].map(([itemId, quantity]) => ({ itemId, quantity })) };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.store.localeCompare(b.store))
    .map((s, n) => ({ ...s, n, id: `so-r${String(n + 1).padStart(3, '0')}`, means: MEANS[hash(s.store + s.date) % MEANS.length] }));
  return { restocks, sales };
}

export const { restocks: RETAIL_RESTOCKS, sales: RETAIL_SALES } = plan();
