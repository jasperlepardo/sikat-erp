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
import { SEED_ITEMS } from './items';

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

export interface TransferSeries {
  id: string;
  name: string;
  firstNo: number;
}

export const TRANSFER_SERIES: TransferSeries[] = [{ id: 'its-primary', name: 'Primary', firstNo: 270001 }];

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

export const SEED_TRANSFERS: InventoryTransfer[] = [
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
