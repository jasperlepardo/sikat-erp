/**
 * The stores' year: what each store sold each month at the till, and what Pasig sent to replace
 * it. The POS posts each store's month as one A/R invoice to the walk-in customer (mocks/arInvoices.ts),
 * paid in the month's POS collection (mocks/incomingPayments.ts), and Pasig restocks each store
 * with what it sold on the first working day of the next month (mocks/inventoryTransfers.ts).
 *
 * Settled here, for the seed:
 * - A store sells from the items it stocks now. Selling a month and getting exactly that back
 *   the next month leaves it where it started, so a store's stock on 1 Jan is its stock today.
 * - Items released during the year (validFrom after 1 Jan) start at zero: the store gets its
 *   stock today as a launch allocation the day before release, and sells from release.
 * - Monthly units are the store's stock × the item line's rate × the month's season, rounded by
 *   a seeded random draw, never more than the store holds. The same seed gives the same year.
 * - Documents run January–September; October's sales are still in the POS.
 */
import { SEED_ITEMS, type Item } from './items';
import { SEED_WAREHOUSES } from './itemMasters';

export const POS_CUSTOMER_ID = 'bp-045';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Sales months: the invoice is dated the last day, the restock the first working day after. */
export const SALES_MONTHS = [
  { month: '2026-01', end: '2026-01-31', restock: '2026-02-02', season: 0.9 },
  { month: '2026-02', end: '2026-02-28', restock: '2026-03-02', season: 0.85 },
  { month: '2026-03', end: '2026-03-31', restock: '2026-04-01', season: 0.9 },
  { month: '2026-04', end: '2026-04-30', restock: '2026-05-04', season: 0.85 },
  { month: '2026-05', end: '2026-05-31', restock: '2026-06-01', season: 1 },
  { month: '2026-06', end: '2026-06-30', restock: '2026-07-01', season: 1.1 },
  { month: '2026-07', end: '2026-07-31', restock: '2026-08-03', season: 1 },
  { month: '2026-08', end: '2026-08-31', restock: '2026-09-01', season: 1.05 },
  { month: '2026-09', end: '2026-09-30', restock: '2026-10-01', season: 1.2 },
] as const;

/** Share of a store's stock of a line sold in an average month. */
const RATE: Record<string, number> = { ACC: 0.45, APD: 0.4, AW: 0.3, IPH: 0.35, IPD: 0.25, MAC: 0.2, HOM: 0.2 };

/** Stores that sell to walk-in customers: every store but Mobile Care, which holds demo units. */
export const POS_STORES = SEED_WAREHOUSES.filter((w) => w.type === 'store' && w.code !== 'WH-PRD').map((w) => w.code);

export interface StoreSaleLine {
  itemId: string;
  qty: number;
}
export interface StoreMonthSale {
  store: string;
  month: string;
  date: string;
  lines: StoreSaleLine[];
}
export interface LaunchAllocation {
  date: string;
  /** Released that day. */
  itemIds: string[];
  lines: { store: string; itemId: string; qty: number }[];
}

/** A small seeded random generator (mulberry32), so the year is the same on every load. */
function random(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lineOf = (item: Item) => item.itemNo.split('-')[0];
const dayBefore = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
/** Share of the month after release (1 for items on sale all month). */
const onSaleShare = (item: Item, m: (typeof SALES_MONTHS)[number]) => {
  if (!item.validFrom || item.validFrom <= `${m.month}-01`) return 1;
  if (item.validFrom > m.end) return 0;
  const days = Number(m.end.slice(8));
  return (days - Number(item.validFrom.slice(8)) + 1) / days;
};

/** Released during the year: not on hand on 1 Jan. */
export const isLaunchItem = (item: Pick<Item, 'validFrom'>) => Boolean(item.validFrom && item.validFrom > '2026-01-01');

/**
 * The hand-written transfers' lines (mocks/inventoryTransfers.ts, it-001…it-004): the nth item
 * stocked in Pasig that the destination holds at least that many of now (its stock came from
 * Pasig). Listed here so a store's sales leave room for what they brought in.
 */
const handStocked = SEED_ITEMS.filter((i) => i.inventoryItem && !i.validFrom && (i.warehouses.find((w) => w.code === 'WH-MNL')?.inStock ?? 0) >= 2);
export function handTransferItem(n: number, quantity: number, toWarehouse: string) {
  const held = handStocked.filter((i) => (i.warehouses.find((w) => w.code === toWarehouse)?.inStock ?? 0) >= quantity);
  return held.length ? held[n % held.length] : handStocked[n % handStocked.length];
}
/** [n, quantity, to] per hand-written transfer, posted ones first. */
export const HAND_TRANSFER_LINES = {
  'it-001': [[0, 2, 'WH-CEB'], [3, 1, 'WH-CEB'], [7, 4, 'WH-CEB']],
  'it-002': [[1, 2, 'WH-DVO'], [5, 1, 'WH-DVO']],
  'it-003': [[2, 2, 'ST-001'], [4, 2, 'ST-001'], [6, 1, 'ST-005']],
  'it-004': [[8, 1, 'WH-PRD']],
} as const satisfies Record<string, readonly (readonly [number, number, string])[]>;
/** Units the posted hand-written transfers bring a store, by item@store. */
const handIns = new Map<string, number>();
for (const id of ['it-001', 'it-002', 'it-003'] as const)
  for (const [n, qty, to] of HAND_TRANSFER_LINES[id]) {
    const k = `${handTransferItem(n, qty, to).id}@${to}`;
    handIns.set(k, (handIns.get(k) ?? 0) + qty);
  }

function build() {
  const stores = new Set(POS_STORES);
  const sales: StoreMonthSale[] = [];
  const allocations = new Map<string, LaunchAllocation>();
  for (const item of SEED_ITEMS) {
    if (!item.inventoryItem || !item.salesItem) continue;
    for (const w of item.warehouses) {
      if (!stores.has(w.code) || w.inStock <= 0) continue;
      if (isLaunchItem(item)) {
        const date = dayBefore(item.validFrom);
        const a = allocations.get(date) ?? { date, itemIds: [], lines: [] };
        if (!a.itemIds.includes(item.id)) a.itemIds.push(item.id);
        a.lines.push({ store: w.code, itemId: item.id, qty: w.inStock });
        allocations.set(date, a);
      }
    }
  }
  // What each store holds now, item by item, in item order.
  const held = new Map<string, { item: Item; held: number }[]>(POS_STORES.map((c) => [c, []]));
  for (const item of SEED_ITEMS) {
    if (!item.inventoryItem || !item.salesItem) continue;
    // What a store can sell from all year: its stock today, less what the hand-written transfers bring.
    for (const w of item.warehouses) {
      const room = w.inStock - (handIns.get(`${item.id}@${w.code}`) ?? 0);
      if (room > 0) held.get(w.code)?.push({ item, held: room });
    }
  }
  for (const m of SALES_MONTHS)
    for (const store of POS_STORES) {
      const lines: StoreSaleLine[] = [];
      for (const { item, held: onHand } of held.get(store)!) {
        const held = onHand;
        const share = onSaleShare(item, m);
        if (!share) continue;
        const draw = random(`${store}|${item.id}|${m.month}`)();
        const qty = Math.min(held, Math.floor(held * (RATE[lineOf(item)] ?? 0.25) * m.season * share + draw));
        if (qty > 0) lines.push({ itemId: item.id, qty });
      }
      if (lines.length) sales.push({ store, month: m.month, date: m.end, lines });
    }
  return { sales, allocations: [...allocations.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

const PLAN = build();
/** Each store's sales per month, in month then store order. */
export const STORE_SALES: StoreMonthSale[] = PLAN.sales;
/** Release-day stock for the stores, from Pasig. */
export const LAUNCH_ALLOCATIONS: LaunchAllocation[] = PLAN.allocations;
