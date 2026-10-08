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
import { SEED_WAREHOUSES } from './itemMasters';
import { SEED_ITEMS } from './items';
import { RETAIL_RESTOCKS } from './retailHistory';

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
  fromBin: string;
  /** Destination; defaults to the header's To warehouse. */
  toWarehouse: string;
  /** Destination bin, when the To warehouse uses bins. */
  toBin: string;
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
  toBin: string;
  salesEmployee: string;
  journalRemark: string;
  remarks: string;
  lines: TransferLine[];
}

export const TRANSFER_SERIES: DocumentSeries[] = [
  { id: 'its-primary', name: 'Primary', prefix: 'IT-', firstNo: 270001, manual: false, isDefault: true, active: true },
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
  fromBin: '',
  toWarehouse: '',
  toBin: '',
  unitCost: 0,
  ...patch,
});

export function blankTransfer(today: string, owner: string): Omit<InventoryTransfer, 'id'> {
  return {
    seriesId: TRANSFER_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: today,
    documentDate: today,
    fromWarehouse: 'WH-MNL',
    toWarehouse: '',
    toBin: '',
    salesEmployee: owner,
    journalRemark: DEFAULT_JOURNAL_REMARK,
    remarks: '',
    lines: [],
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// Past replenishments from the Pasig warehouse to the stores. They're history: the seeded
// item stock already reflects them.

const stocked = SEED_ITEMS.filter((i) => i.inventoryItem && (i.warehouses.find((w) => w.code === 'WH-MNL')?.inStock ?? 0) >= 2);

const line = (n: number, quantity: number, toWarehouse: string, patch: Partial<TransferLine> = {}): TransferLine => {
  const item = stocked[n % stocked.length];
  return newTransferLine({
    id: `tl-seed-${n}-${toWarehouse}`,
    itemId: item.id,
    itemNo: item.itemNo,
    name: item.name,
    description: item.description,
    quantity,
    uom: item.inventoryUom,
    fromBin: item.warehouses.find((w) => w.code === 'WH-MNL')?.defaultBin || 'WH-MNL-A-01-01',
    toWarehouse,
    unitCost: item.itemCost,
    ...patch,
  });
};

const transfer = (id: string, docNum: number, patch: Partial<InventoryTransfer>): InventoryTransfer => ({
  ...blankTransfer('2026-09-01', 'Andrea Ramos'),
  id,
  docNum,
  status: 'Posted',
  ...patch,
});

const REPLENISHMENTS: InventoryTransfer[] = [
  transfer('it-001', 270001, {
    postingDate: '2026-09-03',
    documentDate: '2026-09-03',
    toWarehouse: 'WH-CEB',
    journalRemark: 'Inventory Transfers – WH-MNL to WH-CEB',
    remarks: 'Monthly replenishment of the Cebu store — stock below reorder point as at 2 Sep 2026.',
    lines: [line(0, 2, 'WH-CEB'), line(3, 1, 'WH-CEB'), line(7, 4, 'WH-CEB')],
  }),
  transfer('it-002', 270002, {
    postingDate: '2026-09-10',
    documentDate: '2026-09-10',
    toWarehouse: 'WH-DVO',
    journalRemark: 'Inventory Transfers – WH-MNL to WH-DVO',
    remarks: 'Monthly replenishment of the Davao store.',
    lines: [line(1, 2, 'WH-DVO'), line(5, 1, 'WH-DVO')],
  }),
  transfer('it-003', 270003, {
    postingDate: '2026-09-18',
    documentDate: '2026-09-18',
    toWarehouse: 'ST-001',
    journalRemark: 'Inventory Transfers – WH-MNL to ST-001',
    remarks: 'Launch-week stock for Greenbelt 3.',
    lines: [line(2, 2, 'ST-001'), line(4, 2, 'ST-001'), line(6, 1, 'ST-005')],
  }),
  transfer('it-004', 0, {
    status: 'Draft',
    postingDate: '2026-10-05',
    documentDate: '2026-10-05',
    toWarehouse: 'WH-PRD',
    remarks: 'Demo units for Mobile Care — waiting on the store manager to confirm.',
    lines: [line(8, 1, 'WH-PRD')],
  }),
];

// Store restocks of stock received into Pasig that's no longer there, so each warehouse's
// receipts, transfers and deliveries add up to its In stock. A restock goes to the stores
// holding the item, largest first, never more than a store holds now (its stock came from here).
const STORES = new Set(SEED_WAREHOUSES.filter((w) => w.type === 'store').map((w) => w.code));
/** Restocked so far per item@store, so a second restock of an item draws on what's left. */
const restocked = new Map<string, number>();

function restock(itemNo: string, quantity: number): TransferLine[] {
  const item = SEED_ITEMS.find((i) => i.itemNo === itemNo)!;
  // Stores that already have a seeded transfer of the item keep their own history.
  const moved = new Set(REPLENISHMENTS.flatMap((t) => t.lines.filter((l) => l.itemId === item.id).map((l) => l.toWarehouse)));
  const room = (code: string, inStock: number) => inStock - (restocked.get(`${item.id}@${code}`) ?? 0);
  const stores = item.warehouses
    .filter((w) => STORES.has(w.code) && !moved.has(w.code) && room(w.code, w.inStock) > 0)
    .sort((a, b) => room(b.code, b.inStock) - room(a.code, a.inStock) || a.code.localeCompare(b.code));
  const lines: TransferLine[] = [];
  let left = quantity;
  for (const w of stores) {
    if (!left) break;
    const key = `${item.id}@${w.code}`;
    const before = restocked.get(key) ?? 0;
    const qty = Math.min(room(w.code, w.inStock), left);
    left -= qty;
    restocked.set(key, before + qty);
    lines.push(
      newTransferLine({
        // Unique per restock: a store restocked twice has had `before` units already.
        id: `tl-rs-${item.id}-${w.code}-${before}`,
        itemId: item.id,
        itemNo: item.itemNo,
        name: item.name,
        description: item.description,
        quantity: qty,
        uom: item.inventoryUom,
        fromBin: item.warehouses.find((x) => x.code === 'WH-MNL')?.defaultBin || 'WH-MNL-A-01-01',
        toWarehouse: w.code,
        unitCost: item.itemCost,
      }),
    );
  }
  if (left) throw new Error(`Seed restock of ${itemNo}: ${left} more than the stores hold.`);
  return lines;
}

const storeRestock = (id: string, docNum: number, date: string, remarks: string, lines: TransferLine[]) =>
  transfer(id, docNum, {
    postingDate: date,
    documentDate: date,
    toWarehouse: lines[0].toWarehouse,
    journalRemark: 'Inventory Transfers – WH-MNL to stores',
    remarks,
    lines,
  });

export const SEED_TRANSFERS: InventoryTransfer[] = [
  ...REPLENISHMENTS,
  storeRestock('it-005', 270004, '2026-09-08', 'Accessory restock of the stores from the 5 Sep Techzone receipt.', [
    ...restock('ACC-CBL1M', 22),
    ...restock('ACC-MAGSF1', 692),
    ...restock('ACC-PWR20', 50),
  ]),
  storeRestock('it-006', 270005, '2026-09-19', 'iPhone 17 and charger restock of the stores from the 17 Sep Luzon iDistribution receipt.', [
    ...restock('ACC-PWR20', 32),
    ...restock('IPH-17-256-BLK', 3),
    ...restock('IPH-17-256-WHT', 7),
  ]),
  storeRestock('it-007', 270006, '2026-10-01', 'iPhone 18 Pro restock of the stores from the 30 Sep receipt.', [...restock('IPH-18P-256-BLK', 2)]),
  // Replenishment POs out to the stores the day after they're received (mocks/retailHistory.ts).
  ...RETAIL_RESTOCKS.map((r) =>
    storeRestock(
      r.id,
      r.docNum,
      r.date,
      `Store restock from PO ${r.poNo}, received yesterday.`,
      r.lines.map((l) => {
        const item = SEED_ITEMS.find((i) => i.id === l.itemId)!;
        return newTransferLine({
          id: `tl-${r.id}-${item.id}-${l.toWarehouse}`,
          itemId: item.id,
          itemNo: item.itemNo,
          name: item.name,
          description: item.description,
          quantity: l.quantity,
          uom: item.inventoryUom,
          fromBin: item.warehouses.find((x) => x.code === 'WH-MNL')?.defaultBin || 'WH-MNL-A-01-01',
          toWarehouse: l.toWarehouse,
          unitCost: item.itemCost,
        });
      }),
    ),
  ),
];
