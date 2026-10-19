/**
 * Inventory transfer requests: a warehouse asking another for stock, before anything moves.
 * Fields follow the SAP B1 Inventory Transfer Request (OWTQ / WTQ1). The request is the plan;
 * an Inventory Transfer copied from it is the execution.
 *
 * - No stock effect and no journal entry: adding, changing or closing a request moves nothing.
 * - Open until every line's open quantity reaches 0 (each posted transfer copied from it lowers
 *   them), or until it's closed by hand. A closed request can't be reopened.
 * - Quantities are in the item's inventory UoM, as on the transfer.
 * - Settled here: every line leaves from the header's From warehouse (the transfer it's copied
 *   to has one source); a line may go to its own To warehouse.
 */
import type { DocumentSeries } from './common';
import { employeeId } from './masters';
import { SEED_ITEMS, mergedItems } from './items';
import { HAND_TRANSFER_LINES, handTransferItem } from './storeSales';

export type TransferRequestStatus = 'Open' | 'Closed';
export const TRANSFER_REQUEST_STATUSES: TransferRequestStatus[] = ['Open', 'Closed'];

export interface TransferRequestLine {
  id: string;
  itemId: string;
  itemNo: string;
  /** Snapshot of the item's name and description when picked. */
  name: string;
  description: string;
  /** Requested, in the item's inventory UoM. */
  quantity: number;
  /** Not yet transferred. Starts at `quantity`; posted transfers copied from the request lower it. */
  openQty: number;
  /** The item's inventory UoM, for display. */
  uom: string;
  /** Destination; defaults to the header's To warehouse. */
  toWarehouse: string;
}

export interface InventoryTransferRequest {
  id: string;
  seriesId: string;
  /** 0 until added. */
  docNum: number;
  status: TransferRequestStatus;
  postingDate: string;
  /** When the destination needs the stock. Shown and sorted on, not enforced. */
  dueDate: string;
  documentDate: string;
  /** Set when the request closes, by hand or when the last open quantity is transferred. */
  closeDate: string;
  fromWarehouse: string;
  toWarehouse: string;
  /** External reference or planning document number. */
  ref2: string;
  salesEmployeeId: string;
  pickPackRemarks: string;
  /** Carried to the transfer copied from the request. */
  journalRemark: string;
  remarks: string;
  lines: TransferRequestLine[];
}

export const TRANSFER_REQUEST_SERIES: DocumentSeries[] = [
  { id: 'itq-primary', name: 'Primary', prefix: '', firstNo: 1, manual: false, isDefault: true, active: true, segments: [{ type: 'literal', value: 'ITR' }, { type: 'year' }, { type: 'sequence', padding: 4 }] },
];

export const newTransferRequestLine = (patch: Partial<TransferRequestLine> = {}): TransferRequestLine => ({
  id: `tql-${crypto.randomUUID().slice(0, 8)}`,
  itemId: '',
  itemNo: '',
  name: '',
  description: '',
  quantity: 1,
  openQty: 1,
  uom: '',
  toWarehouse: '',
  ...patch,
});

export function blankTransferRequest(today: string, ownerId: string): Omit<InventoryTransferRequest, 'id'> {
  return {
    seriesId: TRANSFER_REQUEST_SERIES[0].id,
    docNum: 0,
    status: 'Open',
    postingDate: today,
    dueDate: '',
    documentDate: today,
    closeDate: '',
    fromWarehouse: 'WH-001',
    toWarehouse: '',
    ref2: '',
    salesEmployeeId: ownerId,
    pickPackRemarks: '',
    journalRemark: '',
    remarks: '',
    lines: [],
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const ITEMS = mergedItems(SEED_ITEMS);
const lineFor = (id: string, item: (typeof ITEMS)[number], quantity: number, toWarehouse: string, openQty = quantity) =>
  newTransferRequestLine({ id, itemId: item.id, itemNo: item.itemNo, name: item.name, description: item.description, quantity, openQty, uom: item.inventoryUom, toWarehouse });
const byNo = (itemNo: string) => ITEMS.find((i) => i.itemNo === itemNo)!;

const request = (id: string, docNum: number, patch: Partial<InventoryTransferRequest>): InventoryTransferRequest => ({
  ...blankTransferRequest('2026-09-01', employeeId('Ben Salazar')),
  id,
  docNum,
  ...patch,
});

export const SEED_TRANSFER_REQUESTS: InventoryTransferRequest[] = [
  // Fulfilled by transfer it-001 (mocks/inventoryTransfers.ts), which names it as its base.
  request('itr-001', 1, {
    status: 'Closed',
    postingDate: '2026-09-02',
    documentDate: '2026-09-02',
    dueDate: '2026-09-05',
    closeDate: '2026-09-03',
    toWarehouse: 'WH-002',
    journalRemark: 'Inventory Transfers – WH-001 to WH-002',
    remarks: 'Cebu stock below reorder point as at 2 Sep 2026.',
    lines: HAND_TRANSFER_LINES['it-001'].map(([n, q, to], k) => lineFor(`itr-001-${k + 1}`, handTransferItem(n, q, to), q, to, 0)),
  }),
  request('itr-002', 2, {
    postingDate: '2026-10-03',
    documentDate: '2026-10-03',
    dueDate: '2026-11-01',
    toWarehouse: 'WH-002',
    journalRemark: 'Inventory Transfers – WH-001 to WH-002',
    remarks: 'Back-to-school MacBook Air for the Cebu store.',
    lines: [
      lineFor('itr-002-1', byNo('MAC-MBA13-M5-8G-16-512-MDN'), 4, 'WH-002'),
      lineFor('itr-002-2', byNo('MAC-MBA13-M5-8G-16-512-SKB'), 2, 'WH-002'),
    ],
  }),
];
