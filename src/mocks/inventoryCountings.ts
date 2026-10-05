/**
 * Inventory counting: a physical count of items in a warehouse, compared with the system's
 * In Stock, then posted to bring the books in line. Follows SAP B1's Inventory Counting
 * (OINC / INC1) with its Inventory Posting step folded in.
 *
 * Settled here, for the prototype:
 * - One counter per count (SAP's single-counter mode). Multiple/team counters aren't built.
 * - Quantities are in the item's inventory UoM; counting in another UoM isn't built.
 * - Bins are informational: per-bin quantities aren't tracked, so a line counts the item's
 *   whole stock in that warehouse (which sits in its default bin).
 * - "Post variances" adjusts In Stock to the counted quantity for counted lines and posts the
 *   difference at item cost to Inventory Adjustments and Shrinkage. Uncounted lines are left
 *   alone. A count can also be closed without posting.
 * - Freezing items during the count isn't built: stock can still move while a count is open,
 *   so the variance is always worked out against In Stock at posting time.
 */
import { SEED_ITEMS } from './items';

export type CountStatus = 'Open' | 'Posted' | 'Closed';
export const COUNT_STATUSES: CountStatus[] = ['Open', 'Posted', 'Closed'];

/** Where count gains and losses post (Chart of Accounts). */
export const COUNT_VARIANCE_ACCOUNT = '5050';

export interface CountLine {
  id: string;
  itemId: string;
  itemNo: string;
  /** Snapshot of the item's name when added. */
  name: string;
  warehouse: string;
  /** The item's default bin there, for the count sheet. */
  bin: string;
  /** Inventory UoM, for display. */
  uom: string;
  /** Ticked once the line has been counted; only counted lines post. */
  counted: boolean;
  countedQty: number;
  /** In Stock and item cost when the count was posted (0 while open — the live figure is used). */
  inWhseQty: number;
  unitCost: number;
  remarks: string;
}

export interface InventoryCounting {
  id: string;
  seriesId: string;
  /** Assigned when the count is added (SAP numbers counts on Add, not on posting). */
  docNum: number;
  status: CountStatus;
  countDate: string;
  /** HH:MM, local. */
  countTime: string;
  /** Who counted. */
  counter: string;
  /** Count sheet / reference no. */
  reference: string;
  /** Set when posted. */
  postingDate: string;
  journalRemark: string;
  remarks: string;
  lines: CountLine[];
}

export interface CountSeries {
  id: string;
  name: string;
  firstNo: number;
}

export const COUNT_SERIES: CountSeries[] = [{ id: 'ic-primary', name: 'Primary', firstNo: 310001 }];

export const DEFAULT_COUNT_JOURNAL_REMARK = 'Inventory Posting –';

export const newCountLine = (patch: Partial<CountLine> = {}): CountLine => ({
  id: `cl-${crypto.randomUUID().slice(0, 8)}`,
  itemId: '',
  itemNo: '',
  name: '',
  warehouse: '',
  bin: '',
  uom: '',
  counted: false,
  countedQty: 0,
  inWhseQty: 0,
  unitCost: 0,
  remarks: '',
  ...patch,
});

export function blankCounting(today: string, counter: string): Omit<InventoryCounting, 'id'> {
  return {
    seriesId: COUNT_SERIES[0].id,
    docNum: 0,
    status: 'Open',
    countDate: today,
    countTime: '09:00',
    counter,
    reference: '',
    postingDate: '',
    journalRemark: DEFAULT_COUNT_JOURNAL_REMARK,
    remarks: '',
    lines: [],
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const inWh = (code: string) => SEED_ITEMS.filter((i) => i.inventoryItem && (i.warehouses.find((w) => w.code === code)?.inStock ?? 0) > 0);

/** A line for the n-th stocked item in `wh`; `delta` is counted minus In Stock (undefined = not counted yet). */
const line = (wh: string, n: number, delta: number | undefined, posted = false): CountLine => {
  const items = inWh(wh);
  const item = items[n % items.length];
  const row = item.warehouses.find((w) => w.code === wh)!;
  return newCountLine({
    id: `cl-seed-${wh}-${n}`,
    itemId: item.id,
    itemNo: item.itemNo,
    name: item.name,
    warehouse: wh,
    bin: row.defaultBin,
    uom: item.inventoryUom,
    counted: delta !== undefined,
    // Posted counts are history: seeded stock is already the counted quantity, and In Stock then was that − delta.
    countedQty: delta === undefined ? 0 : posted ? row.inStock : row.inStock + delta,
    inWhseQty: posted && delta !== undefined ? row.inStock - delta : 0,
    unitCost: posted ? item.itemCost : 0,
  });
};

export const SEED_COUNTINGS: InventoryCounting[] = [
  {
    ...blankCounting('2026-09-30', 'Carla Uy'),
    id: 'ic-001',
    docNum: 310001,
    status: 'Posted',
    postingDate: '2026-09-30',
    reference: 'CS-MNL-2026-09',
    journalRemark: 'Inventory Posting – WH-MNL month-end count',
    remarks: 'September month-end cycle count, Pasig warehouse, aisle A.',
    lines: [line('WH-MNL', 0, 0, true), line('WH-MNL', 1, -1, true), line('WH-MNL', 2, 0, true), line('WH-MNL', 3, 0, true)],
  },
  {
    ...blankCounting('2026-10-05', 'Dino Pascual'),
    id: 'ic-002',
    docNum: 310002,
    countTime: '07:30',
    reference: 'CS-CEB-2026-10',
    remarks: 'Cebu store opening count before trading hours. Two lines still to count.',
    lines: [line('WH-CEB', 0, 0), line('WH-CEB', 1, -1), line('WH-CEB', 2, 1), line('WH-CEB', 3, undefined), line('WH-CEB', 4, undefined)],
  },
];
