/**
 * Purchase requests. The earliest document in the purchasing workflow — an internal
 * request for goods or services before a vendor is chosen. Workflow: Open → Closed.
 */
import type { DocumentSeries } from './common';
import { employeeId, plId } from './masters';
import { SEED_ITEMS } from './items';

export type PrStatus = 'Open' | 'Closed';
export const PR_STATUSES: PrStatus[] = ['Open', 'Closed'];

export type PrItemType = 'Item' | 'Service';
export const PR_ITEM_TYPES: PrItemType[] = ['Item', 'Service'];

/** Company branches/locations. */
export const BRANCHES = [
  'Main – Quezon City',
  'Makati',
  'Cebu',
  'Davao',
] as const;
export type Branch = (typeof BRANCHES)[number];

export interface PrLine {
  id: string;
  /** Preferred or suggested vendor — informational only, carries forward to PO/RFQ. */
  vendorName: string;
  itemId: string;
  itemNo: string;
  itemDescription: string;
  requiredDate: string;
  requiredQty: number;
  /** Open qty tracks what hasn't yet been converted to a PO or quotation. */
  openQty: number;
  uomCode: string;
  uomName: string;
  /** Inventory units in one purchasing unit. */
  itemsPerUnit: number;
  /** Reference / last known price — informational estimate, not binding. */
  infoPrice: number;
  discountPct: number;
  warehouse: string;
  taxCode: string;
  /** Cost center / department for budget tracking. */
  department: string;
  freeText: string;
  priceListId: string;
  status: 'Open' | 'Closed';
}

export interface PurchaseRequest {
  id: string;

  // Header
  requesterId: string;
  /** Snapshot of the requester's name; survives employee renames. */
  requesterName: string;
  branch: string;
  department: string;
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
  lines: PrLine[];

  // Footer
  ownerId: string;
  freight: number;
  remarks: string;
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
  vendorName: '',
  itemId: '',
  itemNo: '',
  itemDescription: '',
  requiredDate: '',
  requiredQty: 1,
  openQty: 1,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  infoPrice: 0,
  discountPct: 0,
  warehouse: '',
  taxCode: '',
  department: '',
  freeText: '',
  priceListId: plId('Last purchase price'),
  status: 'Open',
  ...patch,
});

export function blankPurchaseRequest(requesterId: string, requesterName: string): Omit<PurchaseRequest, 'id'> {
  const today = new Date().toISOString().slice(0, 10);
  return {
    requesterId,
    requesterName,
    branch: BRANCHES[0],
    department: '',
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
    lines: [],
    ownerId: requesterId,
    freight: 0,
    remarks: '',
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const byNo = (itemNo: string) => SEED_ITEMS.find((i) => i.itemNo === itemNo)!;

const prLine = (id: string, itemNo: string, qty: number, patch: Partial<PrLine> = {}): PrLine => {
  const item = byNo(itemNo);
  const base = item.purchasingUom ?? item.inventoryUom ?? 'pc';
  return newPrLine({
    id,
    itemId: item.id,
    itemNo,
    itemDescription: item.description || item.name,
    uomCode: base,
    uomName: base,
    requiredQty: qty,
    openQty: qty,
    warehouse: item.inventoryItem ? 'WH-MNL' : '',
    ...patch,
  });
};

const pr = (
  id: string,
  docNum: number,
  patch: Partial<Omit<PurchaseRequest, 'id'>>,
): PurchaseRequest => ({
  ...blankPurchaseRequest(employeeId('Jasper L.'), 'Jasper L.'),
  id,
  docNum,
  ...patch,
} as PurchaseRequest);

export const SEED_PURCHASE_REQUESTS: PurchaseRequest[] = [
  pr('prq-001', 1, {
    requesterId: employeeId('Andrea Ramos'),
    requesterName: 'Andrea Ramos',
    ownerId: employeeId('Andrea Ramos'),
    branch: 'Main – Quezon City',
    department: 'Store operations',
    notifyOnPo: true,
    notifyEmail: 'andrea.ramos@sikat.ph',
    postingDate: '2026-10-01',
    documentDate: '2026-10-01',
    requiredDate: '2026-10-10',
    validUntil: '2026-10-31',
    status: 'Open',
    itemType: 'Item',
    lines: [
      prLine('prq-001-1', 'IPH-18P-256-BLK', 5, { requiredDate: '2026-10-10', infoPrice: 75_900, taxCode: 'P1' }),
      prLine('prq-001-2', 'IPH-18P-256-SLV', 5, { requiredDate: '2026-10-10', infoPrice: 75_900, taxCode: 'P1' }),
      prLine('prq-001-3', 'ACC-CASE-18P', 20, { requiredDate: '2026-10-10', infoPrice: 2_800, taxCode: 'P1' }),
    ],
    remarks: 'Restock for the long weekend sale.',
  }),
  pr('prq-002', 2, {
    requesterId: employeeId('Ben Salazar'),
    requesterName: 'Ben Salazar',
    ownerId: employeeId('Ben Salazar'),
    branch: 'Makati',
    department: 'IT',
    notifyOnPo: false,
    notifyEmail: '',
    postingDate: '2026-10-03',
    documentDate: '2026-10-03',
    requiredDate: '2026-11-01',
    validUntil: '2026-10-31',
    status: 'Open',
    itemType: 'Item',
    lines: [
      prLine('prq-002-1', 'MAC-MBA13-M5-8G-16-512-MDN', 4, { infoPrice: 72_900, taxCode: 'P1', warehouse: 'WH-MKT' }),
      prLine('prq-002-2', 'MAC-MBA13-M5-8G-16-512-SKB', 2, { infoPrice: 72_900, taxCode: 'P1', warehouse: 'WH-MKT' }),
    ],
    remarks: 'Back-to-school season restock for Makati branch.',
  }),
  pr('prq-003', 3, {
    requesterId: employeeId('Jasper L.'),
    requesterName: 'Jasper L.',
    ownerId: employeeId('Jasper L.'),
    branch: 'Main – Quezon City',
    department: 'Service center',
    notifyOnPo: true,
    notifyEmail: 'jasper@sikat.ph',
    postingDate: '2026-10-05',
    documentDate: '2026-10-05',
    requiredDate: '2026-10-15',
    validUntil: '2026-10-25',
    closeDate: '2026-10-06',
    status: 'Closed',
    itemType: 'Item',
    lines: [
      prLine('prq-003-1', 'ACC-PWR20', 30, { infoPrice: 1_600, taxCode: 'P1', openQty: 0, status: 'Closed' }),
      prLine('prq-003-2', 'ACC-CBL1M', 20, { infoPrice: 1_450, taxCode: 'P1', openQty: 0, status: 'Closed' }),
    ],
    remarks: 'Charger and cable restock — fulfilled via PO2026-0052.',
  }),
];
