/**
 * Inventory transfers: stock moved from one warehouse to another in the same company.
 * Fields follow the SAP B1 Inventory Transfer (OWTR / WTR1) field map.
 *
 * Settled here, for the prototype:
 * - Quantities are in the item's inventory UoM (as SAP's transfer screen defaults to).
 * - Every line leaves from the header's From warehouse; a line may go to its own To warehouse.
 * - Bins: one from-bin and one to-bin per line. Bins don't carry their own quantities yet,
 *   so there's no per-bin allocation to balance.
 * - Serial and batch selection isn't built: serial-managed items transfer by quantity only.
 * - Posting is final: a posted transfer can't be edited or cancelled, only its remarks change.
 *   Reversing one is another transfer the other way.
 * - Copy from an Inventory Transfer Request isn't built yet (there are no requests).
 */
import type { DocumentSeries } from './common';
import { seedBinCode } from './binLocations';
import { employeeId } from './masters';
import { SEED_WAREHOUSES } from './itemMasters';
import { SEED_ITEMS } from './items';
import { LAUNCH_ALLOCATIONS, MONTH_NAMES, SALES_MONTHS, STORE_SALES, HAND_TRANSFER_LINES, handTransferItem } from './storeSales';

export type TransferStatus = 'Draft' | 'Posted';
export const TRANSFER_STATUSES: TransferStatus[] = ['Draft', 'Posted'];

export interface TransferLine {
  id: string;
  itemId: string;
  itemNo: string;
  /** Snapshot of the item's name and description when picked. */
  name: string;
  description: string;
  /** In the item's inventory UoM. */
  quantity: number;
  /** The item's inventory UoM, for display. */
  uom: string;
  /** Source bin, when the From warehouse uses bins. */
  fromBinId: string;
  /** Bin codes when posted, so history reads as it was after a bin rename. */
  fromBinCode: string;
  /** Destination; defaults to the header's To warehouse. */
  toWarehouse: string;
  /** Destination bin, when the To warehouse uses bins. */
  toBinId: string;
  toBinCode: string;
  /** Item cost per inventory unit, fixed when the transfer is posted (PHP). */
  unitCost: number;
}

export interface InventoryTransfer {
  id: string;
  seriesId: string;
  /** 0 until posted. */
  docNum: number;
  status: TransferStatus;
  postingDate: string;
  documentDate: string;
  fromWarehouse: string;
  toWarehouse: string;
  /** Default destination bin for new lines, when the To warehouse uses bins. */
  toBinId: string;
  salesEmployeeId: string;
  journalRemark: string;
  remarks: string;
  lines: TransferLine[];
}

export const TRANSFER_SERIES: DocumentSeries[] = [
  { id: 'its-primary', name: 'Primary', prefix: '', firstNo: 7, manual: false, isDefault: true, active: true, segments: [{ type: 'literal', value: 'IT' }, { type: 'year' }, { type: 'sequence', padding: 4 }] },
];

export const DEFAULT_JOURNAL_REMARK = 'Inventory Transfers –';

export const newTransferLine = (patch: Partial<TransferLine> = {}): TransferLine => ({
  id: `tl-${crypto.randomUUID().slice(0, 8)}`,
  itemId: '',
  itemNo: '',
  name: '',
  description: '',
  quantity: 1,
  uom: '',
  fromBinId: '',
  fromBinCode: '',
  toWarehouse: '',
  toBinId: '',
  toBinCode: '',
  unitCost: 0,
  ...patch,
});

export function blankTransfer(today: string, ownerId: string): Omit<InventoryTransfer, 'id'> {
  return {
    seriesId: TRANSFER_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: today,
    documentDate: today,
    fromWarehouse: 'WH-MNL',
    toWarehouse: '',
    toBinId: '',
    salesEmployeeId: ownerId,
    journalRemark: DEFAULT_JOURNAL_REMARK,
    remarks: '',
    lines: [],
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// History: the seeded item stock already reflects it (services/stockHistory.ts replays it).

/** A hand-written transfer line: the item mocks/storeSales.ts picks for it. */
const line = (n: number, quantity: number, toWarehouse: string, patch: Partial<TransferLine> = {}): TransferLine => {
  const item = handTransferItem(n, quantity, toWarehouse);
  return newTransferLine({
    id: `tl-seed-${n}-${toWarehouse}`,
    itemId: item.id,
    itemNo: item.itemNo,
    name: item.name,
    description: item.description,
    quantity,
    uom: item.inventoryUom,
    fromBinId: item.warehouses.find((w) => w.code === 'WH-MNL')?.defaultBinId || 'bin-WH-MNL-A-01-01',
    toWarehouse,
    unitCost: item.itemCost,
    ...patch,
  });
};

const transfer = (id: string, docNum: number, patch: Partial<InventoryTransfer>): InventoryTransfer => ({
  ...blankTransfer('2026-09-01', employeeId('Andrea Ramos')),
  id,
  docNum,
  status: 'Posted',
  ...patch,
});

const REPLENISHMENTS: InventoryTransfer[] = [
  transfer('it-001', 1, {
    postingDate: '2026-09-03',
    documentDate: '2026-09-03',
    toWarehouse: 'WH-CEB',
    journalRemark: 'Inventory Transfers – WH-MNL to WH-CEB',
    remarks: 'Monthly replenishment of the Cebu store — stock below reorder point as at 2 Sep 2026.',
    lines: HAND_TRANSFER_LINES['it-001'].map(([n, q, to]) => line(n, q, to)),
  }),
  transfer('it-002', 2, {
    postingDate: '2026-09-10',
    documentDate: '2026-09-10',
    toWarehouse: 'WH-DVO',
    journalRemark: 'Inventory Transfers – WH-MNL to WH-DVO',
    remarks: 'Monthly replenishment of the Davao store.',
    lines: HAND_TRANSFER_LINES['it-002'].map(([n, q, to]) => line(n, q, to)),
  }),
  transfer('it-003', 3, {
    postingDate: '2026-09-18',
    documentDate: '2026-09-18',
    toWarehouse: 'ST-001',
    journalRemark: 'Inventory Transfers – WH-MNL to ST-001',
    remarks: 'Launch-week stock for Greenbelt 3.',
    lines: HAND_TRANSFER_LINES['it-003'].map(([n, q, to]) => line(n, q, to)),
  }),
  transfer('it-004', 0, {
    status: 'Draft',
    postingDate: '2026-10-05',
    documentDate: '2026-10-05',
    toWarehouse: 'WH-PRD',
    remarks: 'Demo units for Mobile Care — waiting on the store manager to confirm.',
    lines: HAND_TRANSFER_LINES['it-004'].map(([n, q, to]) => line(n, q, to)),
  }),
];

// ── Store restocks ───────────────────────────────────────────────────────────
// Pasig restocks each store with what it sold the month before, and sends release-day stock of
// new items (mocks/storeSales.ts): one transfer per store each time.

const itemById = new Map(SEED_ITEMS.map((i) => [i.id, i]));
const MNL_BIN = (itemId: string) => itemById.get(itemId)!.warehouses.find((w) => w.code === 'WH-MNL')?.defaultBinId || 'bin-WH-MNL-A-01-01';
const storeName = (code: string) => SEED_WAREHOUSES.find((w) => w.code === code)?.name ?? code;
const MONTH_NAME = (month: string) => MONTH_NAMES[Number(month.slice(5)) - 1];

const toStore = (id: string, date: string, store: string, remarks: string, lines: { itemId: string; qty: number }[]) =>
  transfer(id, 0, {
    postingDate: date,
    documentDate: date,
    toWarehouse: store,
    journalRemark: `Inventory Transfers – WH-MNL to ${store}`,
    remarks,
    lines: lines.map((l, k) => {
      const item = itemById.get(l.itemId)!;
      return newTransferLine({
        id: `${id}-${k + 1}`, itemId: item.id, itemNo: item.itemNo, name: item.name, description: item.description, quantity: l.qty,
        uom: item.inventoryUom, fromBinId: MNL_BIN(item.id), toWarehouse: store, unitCost: item.itemCost,
      });
    }),
  });

const RESTOCKS: InventoryTransfer[] = STORE_SALES.map((sale) => {
  const m = SALES_MONTHS.find((x) => x.month === sale.month)!;
  return toStore(`it-rs-${sale.month.replace('-', '')}-${sale.store}`, m.restock, sale.store, `Restock of ${storeName(sale.store)}: what it sold in ${MONTH_NAME(sale.month)}.`, sale.lines);
});

// A store's release-day stock is what it holds now, less what the transfers above already sent it.
const sentByHand = (store: string, itemId: string) =>
  REPLENISHMENTS.filter((t) => t.status === 'Posted').reduce((n, t) => n + t.lines.filter((l) => l.itemId === itemId && (l.toWarehouse || t.toWarehouse) === store).reduce((k, l) => k + l.quantity, 0), 0);

const RELEASES: InventoryTransfer[] = LAUNCH_ALLOCATIONS.flatMap((a) => {
  const lines = a.lines.map((l) => ({ ...l, qty: l.qty - sentByHand(l.store, l.itemId) })).filter((l) => l.qty > 0);
  const stores = [...new Set(lines.map((l) => l.store))];
  return stores.map((store) =>
    toStore(`it-la-${a.date.replace(/-/g, '')}-${store}`, a.date, store, `Release-day stock for ${storeName(store)}.`, lines.filter((l) => l.store === store).map((l) => ({ itemId: l.itemId, qty: l.qty }))),
  );
});

let postedNo = 0;
/** Numbered in date order; drafts have no number. */
export const SEED_TRANSFERS: InventoryTransfer[] = [
  ...REPLENISHMENTS,
  ...RESTOCKS,
  ...RELEASES,
]
  .sort((a, b) => a.postingDate.localeCompare(b.postingDate) || a.id.localeCompare(b.id))
  .map((t) =>
    // Posted transfers carry the bin codes they were posted with.
    t.status === 'Posted'
      ? { ...t, docNum: ++postedNo, lines: t.lines.map((l) => ({ ...l, fromBinCode: seedBinCode(l.fromBinId), toBinCode: seedBinCode(l.toBinId) })) }
      : t,
  );
