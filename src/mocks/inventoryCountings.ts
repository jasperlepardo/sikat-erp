/**
 * Stock reconciliation in two steps, as SAP B1 does it:
 *   1. Inventory Counting (OINC / INC1) records what was found against In-Whse Qty on the count
 *      date. No stock change, no journal entry.
 *   2. Inventory Posting (OIQR / IQR1), usually copied from an open count after review, adjusts
 *      stock by the variance and books it at the price source. Copying a count closes it.
 * The review between the two is the control point.
 *
 * Settled here, for the prototype:
 * - In-Whse Qty is snapshotted when a line is added. Posting applies the variance (counted −
 *   that snapshot) to stock as it is then, so movements after the count aren't undone.
 * - Freeze blocks inventory transfers of the item out of or into that warehouse while the count
 *   is open (transfers are the only stock movement built so far).
 * - Bins are informational: per-bin quantities aren't tracked, so a line counts the item's whole
 *   stock in that warehouse (which sits in its default bin).
 * - Serial and batch numbers aren't captured, only quantities.
 * - The end-of-fiscal-year date is recorded; the year-end close that would use it isn't built.
 */
import type { Attachment, DocumentSeries } from './common';
import { seedBinCode } from './binLocations';
import { employeeId } from './masters';
import { SEED_ITEMS } from './items';

export type CountingType = 'single' | 'multiple';
export const COUNTING_TYPES: { value: CountingType; label: string }[] = [
  { value: 'single', label: 'Single counter' },
  { value: 'multiple', label: 'Multiple counters' },
];

export type CounterType = 'User' | 'Employee';

/** One person counting — a child row of the count (counting_counters). */
export interface Counter {
  /** Row id; each line's per-counter figures point at it. */
  id: string;
  type: CounterType;
  /** Settings › Sales employees & buyers — the signed-in user is one too. */
  employeeId: string;
}

/** One counter's figure for a line, in the line's `uomCode` — a child row of the line (count_line_counts). */
export interface CounterCount {
  counterId: string;
  qty: number;
}

export type CountStatus = 'Open' | 'Closed';
export const COUNT_STATUSES: CountStatus[] = ['Open', 'Closed'];

/** Where count gains and losses post (Chart of Accounts). */
export const COUNT_VARIANCE_ACCOUNT = '5050';

export interface CountLine {
  id: string;
  itemId: string;
  itemNo: string;
  /** From the item; can be overridden on the line. */
  description: string;
  /** Blocks stock movements of the item in this warehouse while the count is open. */
  freeze: boolean;
  warehouse: string;
  /** The item's default bin there, for the count sheet. */
  binId: string;
  /** In-Whse Qty on Count Date, in the inventory UoM — the book quantity. */
  inWhseQty: number;
  /** Unit counted in, and inventory units per one of it. */
  uomCode: string;
  itemsPerUnit: number;
  /** Multiple counters: one figure per counter who has counted the line (no row = not counted yet). */
  counts: CounterCount[];
  /** Ticked once counted; only counted lines go to the posting. */
  counted: boolean;
  /** The count in `uomCode` (single counter, or the agreed figure). Counted Qty = this × items per unit. */
  uomCountedQty: number;
}

export interface InventoryCounting {
  id: string;
  seriesId: string;
  /** Assigned when the count is added. */
  docNum: number;
  status: CountStatus;
  countDate: string;
  /** HH:MM, local — for movements on the same day. */
  countTime: string;
  countingType: CountingType;
  /** One for a single counter; two or more for multiple counters. */
  counters: Counter[];
  /** Ref. 2: count sheet no. */
  reference: string;
  /** Set for a year-end count, ISO. */
  endOfFiscalYear: string;
  /** Free-text link to a related document. */
  referencedDocument: string;
  remarks: string;
  attachments: Attachment[];
  /** The Inventory Posting copied from this count ('' while open, or if closed without one). */
  postingId: string;
  lines: CountLine[];
}

export type PriceSource = 'item-cost' | 'price-list';

export interface PostingLine {
  id: string;
  /** The count line this came from ('' when added directly). */
  baseLineId: string;
  itemId: string;
  itemNo: string;
  description: string;
  warehouse: string;
  binId: string;
  /** The bin's code when posted, so history reads as it was after a bin rename. */
  binCode: string;
  /** In-Whse Qty on Count Date, inventory UoM. */
  inWhseQty: number;
  uomCode: string;
  itemsPerUnit: number;
  uomCountedQty: number;
  /** PHP per inventory unit used to value the variance; from the price source, editable. */
  price: number;
}

export interface InventoryPosting {
  id: string;
  seriesId: string;
  /** 0 until added. */
  docNum: number;
  postingDate: string;
  countDate: string;
  countTime: string;
  priceSource: PriceSource;
  /** When the price source is a price list. */
  priceListId: string;
  reference: string;
  endOfFiscalYear: string;
  /** The Inventory Counting it was copied from ('' when items were added directly). */
  countingId: string;
  journalRemark: string;
  remarks: string;
  attachments: Attachment[];
  lines: PostingLine[];
}

export const COUNT_SERIES: DocumentSeries[] = [
  { id: 'ic-primary', name: 'Primary', prefix: '', firstNo: 4, manual: false, isDefault: true, active: true, segments: [{ type: 'literal', value: 'IC' }, { type: 'year' }, { type: 'sequence', padding: 4 }] },
];
export const POSTING_SERIES: DocumentSeries[] = [
  { id: 'ip-primary', name: 'Primary', prefix: '', firstNo: 6, manual: false, isDefault: true, active: true, segments: [{ type: 'literal', value: 'IP' }, { type: 'year' }, { type: 'sequence', padding: 4 }] },
];

export const DEFAULT_POSTING_JOURNAL_REMARK = 'Inventory Posting';

/** Counted Qty in the inventory UoM. */
export const countedQty = (l: Pick<CountLine | PostingLine, 'uomCountedQty' | 'itemsPerUnit'>) =>
  Math.round(l.uomCountedQty * (l.itemsPerUnit || 1) * 1000) / 1000;

export const newCountLine = (patch: Partial<CountLine> = {}): CountLine => ({
  itemId: '',
  itemNo: '',
  description: '',
  freeze: false,
  warehouse: '',
  binId: '',
  inWhseQty: 0,
  uomCode: '',
  itemsPerUnit: 1,
  counts: [],
  counted: false,
  uomCountedQty: 0,
  ...patch,
  // A copied line passes id: undefined; it still needs an id of its own.
  id: patch.id ?? `cl-${crypto.randomUUID().slice(0, 8)}`,
});

export const newPostingLine = (patch: Partial<PostingLine> = {}): PostingLine => ({
  baseLineId: '',
  itemId: '',
  itemNo: '',
  description: '',
  warehouse: '',
  binId: '',
  binCode: '',
  inWhseQty: 0,
  uomCode: '',
  itemsPerUnit: 1,
  uomCountedQty: 0,
  price: 0,
  ...patch,
  // A copied line passes id: undefined; it still needs an id of its own.
  id: patch.id ?? `pl-${crypto.randomUUID().slice(0, 8)}`,
});

export const newCounter = (patch: Partial<Counter> = {}): Counter => ({
  type: 'Employee',
  employeeId: '',
  ...patch,
  id: patch.id ?? `cnt-${crypto.randomUUID().slice(0, 8)}`,
});

export function blankCounting(today: string, now: string, employeeId: string): Omit<InventoryCounting, 'id'> {
  return {
    seriesId: COUNT_SERIES[0].id,
    docNum: 0,
    status: 'Open',
    countDate: today,
    countTime: now,
    countingType: 'single',
    counters: [newCounter({ type: 'User', employeeId })],
    reference: '',
    endOfFiscalYear: '',
    referencedDocument: '',
    remarks: '',
    attachments: [],
    postingId: '',
    lines: [],
  };
}

export function blankPosting(today: string, now: string): Omit<InventoryPosting, 'id'> {
  return {
    seriesId: POSTING_SERIES[0].id,
    docNum: 0,
    postingDate: today,
    countDate: today,
    countTime: now,
    priceSource: 'item-cost',
    priceListId: '',
    reference: '',
    endOfFiscalYear: '',
    countingId: '',
    journalRemark: DEFAULT_POSTING_JOURNAL_REMARK,
    remarks: '',
    attachments: [],
    lines: [],
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// A posted September count (its stock change is already in the seeded item stock) and two open
// October counts: one single-counter, one with two counters who disagree on a line.

const inWh = (code: string) => SEED_ITEMS.filter((i) => i.inventoryItem && (i.warehouses.find((w) => w.code === code)?.inStock ?? 0) > 0);

/** A line for the n-th stocked item in `wh`; `delta` is counted − In-Whse (undefined = not counted). */
function line(wh: string, n: number, delta: number | undefined, history = false, patch: Partial<CountLine> = {}): CountLine {
  const items = inWh(wh);
  const item = items[n % items.length];
  const row = item.warehouses.find((w) => w.code === wh)!;
  // A posted count is history: stock is already the counted figure, and was that − delta at the count.
  const inWhseQty = history && delta !== undefined ? row.inStock - delta : row.inStock;
  return newCountLine({
    id: `cl-seed-${wh}-${n}`,
    itemId: item.id,
    itemNo: item.itemNo,
    description: item.name,
    warehouse: wh,
    binId: row.defaultBinId,
    inWhseQty,
    uomCode: item.inventoryUom,
    itemsPerUnit: 1,
    counted: delta !== undefined,
    uomCountedQty: delta === undefined ? 0 : inWhseQty + delta,
    ...patch,
  });
}

const sept = [0, -1, 0, 0].map((d, n) => line('WH-MNL', n, d, true));

/** Two counters on the Davao count: they agree on the first two lines and not on the third. */
const dvo = (n: number, a: number, b: number) => {
  const base = line('WH-DVO', n, undefined, false, { freeze: true });
  const agree = a === b;
  return {
    ...base,
    counts: [
      { counterId: 'cnt-dvo-1', qty: base.inWhseQty + a },
      { counterId: 'cnt-dvo-2', qty: base.inWhseQty + b },
    ],
    ...(agree ? { counted: true, uomCountedQty: base.inWhseQty + a } : {}),
  };
};



export const SEED_COUNTINGS: InventoryCounting[] = [
  {
    ...blankCounting('2026-09-30', '18:00', employeeId('Carla Uy')),
    id: 'ic-001',
    counters: [newCounter({ id: 'cnt-mnl-1', type: 'User', employeeId: employeeId('Carla Uy') })],
    docNum: 1,
    status: 'Closed',
    reference: 'CS-MNL-2026-09',
    remarks: 'September month-end cycle count, Pasig warehouse, aisle A. Reviewed and approved by Andrea Ramos, 30 Sep 2026.',
    postingId: 'ip-001',
    lines: sept,
  },
  {
    ...blankCounting('2026-10-05', '07:30', employeeId('Dino Pascual')),
    id: 'ic-002',
    docNum: 2,
    counters: [newCounter({ id: 'cnt-ceb-1', employeeId: employeeId('Dino Pascual') })],
    reference: 'CS-CEB-2026-10',
    remarks: 'Cebu store opening count before trading hours. Two lines still to count.',
    lines: [line('WH-CEB', 0, 0), line('WH-CEB', 1, -1), line('WH-CEB', 2, 1), line('WH-CEB', 3, undefined), line('WH-CEB', 4, undefined)],
  },
  {
    ...blankCounting('2026-10-04', '20:00', employeeId('Ben Salazar')),
    id: 'ic-003',
    docNum: 3,
    countingType: 'multiple',
    counters: [
      newCounter({ id: 'cnt-dvo-1', type: 'User', employeeId: employeeId('Ben Salazar') }),
      newCounter({ id: 'cnt-dvo-2', employeeId: employeeId('Carla Uy') }),
    ],
    reference: 'CS-DVO-2026-10',
    remarks: 'High-value blind count after closing, items frozen. Counters disagree on one line — recount before copying to a posting.',
    lines: [dvo(0, 0, 0), dvo(1, -1, -1), dvo(2, 0, -1)],
  },
];


/** A count posted without a count sheet: [itemNo, warehouse, variance in inventory units]. */
function directPosting(id: string, docNum: number, date: string, reference: string, remarks: string, rows: [string, string, number][]): InventoryPosting {
  return {
    ...blankPosting(date, '18:00'),
    id,
    docNum,
    countDate: date,
    countTime: '17:30',
    reference,
    journalRemark: `Inventory Posting – ${reference}`,
    remarks,
    lines: rows.map(([itemNo, warehouse, variance], i) => {
      const item = SEED_ITEMS.find((x) => x.itemNo === itemNo)!;
      const row = item.warehouses.find((w) => w.code === warehouse)!;
      return newPostingLine({
        id: `pl-${id}-${i + 1}`,
        itemId: item.id,
        itemNo,
        description: item.name,
        warehouse,
        binId: row.defaultBinId,
        binCode: seedBinCode(row.defaultBinId),
        inWhseQty: row.inStock - variance,
        uomCode: item.inventoryUom,
        itemsPerUnit: 1,
        uomCountedQty: row.inStock,
        price: item.itemCost,
      });
    }),
  };
}

export const SEED_POSTINGS: InventoryPosting[] = [
  {
    ...blankPosting('2026-09-30', '18:30'),
    id: 'ip-001',
    docNum: 1,
    countDate: '2026-09-30',
    countTime: '18:00',
    reference: 'CS-MNL-2026-09',
    countingId: 'ic-001',
    journalRemark: 'Inventory Posting – WH-MNL month-end count',
    remarks: 'Approved by Andrea Ramos (store operations), 30 Sep 2026.',
    lines: sept.map((l) =>
      newPostingLine({
        id: `pl-${l.id}`,
        baseLineId: l.id,
        itemId: l.itemId,
        itemNo: l.itemNo,
        description: l.description,
        warehouse: l.warehouse,
        binId: l.binId,
        binCode: seedBinCode(l.binId),
        inWhseQty: l.inWhseQty,
        uomCode: l.uomCode,
        itemsPerUnit: l.itemsPerUnit,
        uomCountedQty: l.uomCountedQty,
        price: SEED_ITEMS.find((i) => i.id === l.itemId)!.itemCost,
      }),
    ),
  },
  // Counts posted straight to stock (no count sheet), where the item had no other movement after
  // the count: what the system held then is today's In stock less the variance (counted = In stock).
  directPosting('ip-002', 2, '2026-08-31', 'CS-STORES-2026-08', 'August spot checks at two stores. Approved by the area manager.', [
    ['ACC-PWR20', 'ST-050', -1],
    ['ACC-CBL1M', 'ST-012', 1],
  ]),
  directPosting('ip-003', 3, '2026-10-07', 'CS-MNL-2026-10-07', 'MagSafe chargers crushed on the shelf in Pasig, written off; one Lightning adapter missing at ST-008.', [
    ['ACC-MAGSF1', 'WH-MNL', -2],
    ['ACC-USBCL', 'ST-008', -1],
  ]),
  directPosting('ip-004', 4, '2026-09-20', 'CS-CEB-2026-09', 'September cycle count, Cebu store. Stock confirmed by Dino Pascual.', [
    ['ACC-MAGSF1', 'WH-CEB', 0],
    ['ACC-PWR20', 'WH-CEB', 0],
    ['ACC-CBL1M', 'WH-CEB', 0],
  ]),
  directPosting('ip-005', 5, '2026-09-20', 'CS-DVO-2026-09', 'September cycle count, Davao store. Stock confirmed.', [
    ['ACC-CBL1M', 'WH-DVO', 0],
  ]),
];
