/**
 * Purchase requests. The earliest document in the purchasing workflow — an internal
 * request for goods or services before a vendor is chosen. Workflow: Open → Closed.
 */
import type { Attachment, DocumentSeries } from './common';
import type { PurchLine } from './purchLine';
import { employeeId, plId } from './masters';
import { SEED_ITEMS, mergedItems } from './items';
import { SEED_TAX_GROUPS } from './taxes';
import { hemId, type Employee } from './employees';
import { branchId, departmentId } from './peopleMasters';

export type PrStatus = 'Open' | 'Closed';
export const PR_STATUSES: PrStatus[] = ['Open', 'Closed'];

export type PrItemType = 'Item' | 'Service';
export const PR_ITEM_TYPES: PrItemType[] = ['Item', 'Service'];

/** How the Contents grid is shown: line by line, or collapsed to one row per item. */
export type PrSummaryType = 'No Summary' | 'By Item';
export const PR_SUMMARY_TYPES: PrSummaryType[] = ['No Summary', 'By Item'];

export interface PrLine extends PurchLine {
  id: string;
  /** Preferred or suggested vendor (Business Partner id, vendor role) — informational, carries forward to PO/RFQ. '' = none. */
  lineVendorId: string;
  itemId: string;
  itemNo: string;
  description: string;
  requiredDate: string;
  quantity: number;
  /** Open qty tracks what hasn't yet been converted to a PO or quotation. */
  openQty: number;
  uomCode: string;
  uomName: string;
  /** Inventory units in one purchasing unit. */
  itemsPerUnit: number;
  /** Reference / last known price — informational estimate, not binding. Seeded lines get it from the last-purchase list (services). */
  unitPrice: number;
  discountPct: number;
  warehouse: string;
  taxCode: string;
  /** Department the line's cost is charged to (People › Departments); '' = none. */
  departmentId: string;
  freeText: string;
  priceListId: string;
  /** Linked requisition reference — traceability only. */
  requisitionSlipNo: string;
  status: 'Open' | 'Closed';
}

export interface PurchaseRequest {
  id: string;

  // Header
  /** Employee (People › Employees) who needs the items. */
  requesterId: string;
  /** Snapshot of the requester's name; survives employee renames. */
  requesterName: string;
  /** The requester's branch, stamped when the requester is picked. */
  branchId: string;
  /** The requester's department, stamped when the requester is picked. */
  departmentId: string;
  notifyOnPo: boolean;
  notifyEmail: string;

  seriesId: string;
  docNum: number;
  status: PrStatus;

  postingDate: string;
  validUntil: string;
  documentDate: string;
  requiredDate: string;
  closeDate: string;

  // Contents
  itemType: PrItemType;
  /** Display mode for the Contents grid: line by line, or grouped by item. */
  summaryType: PrSummaryType;
  lines: PrLine[];

  // Footer
  ownerId: string;
  freight: number;
  remarks: string;
  attachments: Attachment[];
}

export const PR_SERIES: DocumentSeries[] = [
  {
    id: 'ser-pr-primary',
    name: 'Primary',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [
      { type: 'literal', value: 'PRQ' },
      { type: 'year' },
      { type: 'sequence', padding: 4 },
    ],
  },
];

export const newPrLine = (patch: Partial<PrLine> = {}): PrLine => ({
  id: `ln-${crypto.randomUUID().slice(0, 8)}`,
  lineVendorId: '',
  itemId: '',
  itemNo: '',
  description: '',
  requiredDate: '',
  quantity: 1,
  openQty: 1,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  unitPrice: 0,
  discountPct: 0,
  warehouse: '',
  taxCode: '',
  departmentId: '',
  freeText: '',
  priceListId: plId('Last purchase price'),
  requisitionSlipNo: '',
  status: 'Open',
  ...patch,
});

/** A new request for `requester`: branch, department and owner come from the employee. */
export function blankPurchaseRequest(today: string, requester: Employee | undefined, requesterName: string): Omit<PurchaseRequest, 'id'> {
  return {
    requesterId: requester?.id ?? '',
    requesterName,
    branchId: requester?.branchId ?? '',
    departmentId: requester?.departmentId ?? '',
    notifyOnPo: false,
    notifyEmail: '',
    seriesId: 'ser-pr-primary',
    docNum: 0,
    status: 'Open',
    postingDate: today,
    validUntil: '',
    documentDate: today,
    requiredDate: '',
    closeDate: '',
    itemType: 'Item',
    summaryType: 'No Summary',
    lines: [],
    ownerId: requester?.salesEmployeeId ?? '',
    freight: 0,
    remarks: '',
    attachments: [],
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

// Merged, so variants carry their parent's purchase tax group.
const byNo = (itemNo: string) => mergedItems(SEED_ITEMS).find((i) => i.itemNo === itemNo)!;
/** The tax code a new line proposes: the item's fixed code, else its purchase tax group's. */
const taxCodeOf = (item: ReturnType<typeof byNo>) =>
  item.purchaseTaxCode || (SEED_TAX_GROUPS.find((g) => g.code === item.purchaseTaxGroup)?.taxCode ?? '');

const prLine = (id: string, itemNo: string, qty: number, patch: Partial<PrLine> = {}): PrLine => {
  const item = byNo(itemNo);
  const base = item.purchasingUom ?? item.inventoryUom ?? 'pc';
  return newPrLine({
    id,
    itemId: item.id,
    itemNo,
    description: item.description || item.name,
    uomCode: base,
    uomName: base,
    quantity: qty,
    openQty: qty,
    warehouse: item.inventoryItem ? 'WH-001' : '',
    taxCode: taxCodeOf(item),
    ...patch,
  });
};

const pr = (
  id: string,
  docNum: number,
  patch: Partial<Omit<PurchaseRequest, 'id'>>,
): PurchaseRequest => {
  const doc = {
    ...blankPurchaseRequest('2026-09-01', undefined, ''),
    id,
    docNum,
    ...patch,
  } as PurchaseRequest;
  // Seeded lines inherit the header's required date (as UI-added lines do) unless they set their own.
  return { ...doc, lines: doc.lines.map((l) => (l.requiredDate ? l : { ...l, requiredDate: doc.requiredDate })) };
};

export const SEED_PURCHASE_REQUESTS: PurchaseRequest[] = [
  pr('prq-001', 1, {
    requesterId: hemId('Andrea Ramos'),
    requesterName: 'Andrea Ramos',
    ownerId: employeeId('Andrea Ramos'),
    branchId: branchId('Head office (Pasig)'),
    departmentId: departmentId('Sales'),
    notifyOnPo: true,
    notifyEmail: 'andrea.ramos@sikat.ph',
    postingDate: '2026-09-16',
    documentDate: '2026-09-16',
    requiredDate: '2026-10-15',
    validUntil: '2026-10-31',
    status: 'Open',
    itemType: 'Item',
    lines: [
      prLine('prq-001-1', 'IPH-18P-256-BLK', 20, { requiredDate: '2026-10-15', openQty: 0 }),
      prLine('prq-001-2', 'IPH-18P-256-SLV', 20, { requiredDate: '2026-10-15', openQty: 0 }),
      prLine('prq-001-3', 'IPH-18PM-512-GLC', 10, { requiredDate: '2026-10-15', openQty: 0 }),
    ],
    remarks: 'Holiday season iPhone 18 Pro stock for the stores. Sent to Luzon for a quotation on 18 Sep.',
  }),
  // Head-office buying: Purchasing restocks the central warehouse. Stores ask WH-001 for stock
  // with a transfer request instead (Cebu's MacBooks: mocks/inventoryTransferRequests.ts).
  pr('prq-002', 2, {
    requesterId: hemId('Carla Uy'),
    requesterName: 'Carla Uy',
    ownerId: employeeId('Carla Uy'),
    branchId: branchId('Head office (Pasig)'),
    departmentId: departmentId('Purchasing'),
    notifyOnPo: true,
    notifyEmail: 'carla.uy@sikat.ph',
    postingDate: '2026-10-03',
    documentDate: '2026-10-03',
    requiredDate: '2026-10-24',
    validUntil: '2026-10-31',
    status: 'Open',
    itemType: 'Item',
    lines: [
      prLine('prq-002-1', 'MAC-MBA13-M5-8G-16-512-MDN', 24),
      prLine('prq-002-2', 'MAC-MBA13-M5-8G-16-512-SKB', 12),
    ],
    remarks: 'Back-to-school MacBook Air for the central warehouse; stores draw on it by transfer request.',
  }),
  pr('prq-003', 3, {
    requesterId: hemId('Jasper L.'),
    requesterName: 'Jasper L.',
    ownerId: employeeId('Jasper L.'),
    branchId: branchId('Head office (Pasig)'),
    departmentId: departmentId('Sales'),
    notifyOnPo: true,
    notifyEmail: 'jasper@sikat.ph',
    postingDate: '2026-09-22',
    documentDate: '2026-09-22',
    requiredDate: '2026-10-03',
    validUntil: '2026-10-15',
    closeDate: '2026-10-01',
    status: 'Closed',
    itemType: 'Item',
    lines: [
      prLine('prq-003-1', 'ACC-PWR20', 100, { requiredDate: '2026-10-03', openQty: 0, status: 'Closed' }),
      prLine('prq-003-2', 'ACC-MAGSF1', 2, { requiredDate: '2026-10-03', openQty: 0, status: 'Closed' }),
    ],
    remarks: 'October charger and MagSafe restock. Techzone quoted on 26 Sep; ordered on 1 Oct.',
  }),
];
