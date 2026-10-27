import type { Attachment, DocumentSeries } from './common';
import { CURRENT_USER_ID } from './common';
import { termId } from './masters';
import { SEED_ITEMS, itemsPerUom } from './items';
import { SEED_PARTNERS } from './partners';
import { todayISO } from '../services/dates';
import { round2 } from '../services/num';
import { pbaLineId } from './purchLine';
import { SEED_PURCHASE_ORDERS, type PurchaseOrder } from './purchaseOrders';

export type PbaStatus = 'Draft' | 'Approved' | 'On Hold' | 'Terminated' | 'Closed';
export const PBA_STATUSES: PbaStatus[] = ['Draft', 'Approved', 'On Hold', 'Terminated', 'Closed'];

type PbaAgreementMethod = 'Items' | 'Money';

type PbaRowStatus = 'Open' | 'Closed';

export interface PbaLine {
  id: string;
  itemId: string;
  itemNo: string;
  description: string;
  itemGroupId: string;
  plannedQty: number;
  unitPrice: number;
  /** Committed via linked POs not yet invoiced — calculated, stored here for prototype. */
  cumulativeCommittedQty: number;
  cumulativeCommittedAmountLC: number;
  cumulativeCommittedAmountFC: number;
  /** Fulfilled (invoiced/received) to date. */
  cumulativeQty: number;
  cumulativeAmountLC: number;
  cumulativeAmountFC: number;
  shippingType: string;
  projectId: string;
  freeText: string;
  uomCode: string;
  uomName: string;
  itemsPerUnit: number;
  uomGroupId: string;
  portionOfReturns: number;
  endOfWarranty: string;
  rowStatus: PbaRowStatus;
}

export interface PurchaseBlanketAgreement {
  id: string;

  // Header
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  contactId: string;
  vendorRef: string;
  currency: string;
  /** Auto-filled from BP contactChannels, read-only after BP is selected. */
  phone: string;
  email: string;
  description: string;
  seriesId: string;
  docNum: number;
  agreementMethod: PbaAgreementMethod;
  startDate: string;
  endDate: string;
  projectId: string;
  /** Set when the agreement is terminated; read-only. */
  terminationDate: string;
  signingDate: string;
  status: PbaStatus;

  // General tab
  agreementType: string;
  ignorePrices: boolean;
  paymentTermId: string;
  paymentMethod: string;
  shippingType: string;
  settlementProbability: number;
  remarks: string;
  ownerId: string;
  renewal: boolean;
  reminderDays: number;

  // Details tab
  lines: PbaLine[];

  // Attachments
  attachments: Attachment[];
}

export const PBA_SERIES: DocumentSeries[] = [
  {
    id: 'pba-primary',
    name: 'Primary',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [
      { type: 'literal', value: 'PBA' },
      { type: 'year' },
      { type: 'sequence', padding: 4 },
    ],
  },
];

const TODAY = todayISO();

export const newPbaLine = (patch: Partial<PbaLine> = {}): PbaLine => ({
  id: patch.id ?? `pbal-${crypto.randomUUID().slice(0, 8)}`,
  itemId: '',
  itemNo: '',
  description: '',
  itemGroupId: '',
  plannedQty: 1,
  unitPrice: 0,
  cumulativeCommittedQty: 0,
  cumulativeCommittedAmountLC: 0,
  cumulativeCommittedAmountFC: 0,
  cumulativeQty: 0,
  cumulativeAmountLC: 0,
  cumulativeAmountFC: 0,
  shippingType: '',
  projectId: '',
  freeText: '',
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  uomGroupId: '',
  portionOfReturns: 0,
  endOfWarranty: '',
  rowStatus: 'Open',
  ...patch,
});

export function blankPurchaseBlanketAgreement(ownerId: string): Omit<PurchaseBlanketAgreement, 'id'> {
  return {
    vendorId: '',
    vendorCode: '',
    vendorName: '',
    contactId: '',
    vendorRef: '',
    currency: 'PHP',
    phone: '',
    email: '',
    description: '',
    seriesId: PBA_SERIES[0].id,
    docNum: 0,
    agreementMethod: 'Items',
    startDate: TODAY,
    endDate: '',
    projectId: '',
    terminationDate: '',
    signingDate: TODAY,
    status: 'Draft',
    agreementType: 'General',
    ignorePrices: false,
    paymentTermId: termId('Net 30'),
    paymentMethod: 'BANK',
    shippingType: '',
    settlementProbability: 0,
    remarks: '',
    ownerId,
    renewal: false,
    reminderDays: 0,
    lines: [],
    attachments: [],
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const itemByNo = (itemNo: string) => SEED_ITEMS.find((i) => i.itemNo === itemNo)!;
const partnerById = (id: string) => SEED_PARTNERS.find((p) => p.id === id)!;

/** A seeded agreement line, id'd by agreement + item so seeded PO lines can point at it (`pbaLineId`). */
const seedLine = (pbaId: string, itemNo: string, plannedQty: number, patch: Partial<PbaLine> = {}): PbaLine => {
  const item = itemByNo(itemNo);
  return newPbaLine({
    id: pbaLineId(pbaId, itemNo),
    itemId: item.id,
    itemNo: item.itemNo,
    description: item.description || item.name,
    itemGroupId: item.itemGroupId,
    plannedQty,
    unitPrice: round2(item.itemCost),
    uomCode: item.purchasingUom,
    uomName: item.purchasingUom === 'pc' ? 'Piece' : item.purchasingUom,
    itemsPerUnit: itemsPerUom(item, item.purchasingUom) ?? 1,
    ...patch,
  });
};
/** Apple South Asia prices in USD: the item cost at the seed's ₱58 rate. */
const usdLine = (pbaId: string, itemNo: string, plannedQty: number) =>
  seedLine(pbaId, itemNo, plannedQty, { unitPrice: round2(itemByNo(itemNo).itemCost / 58) });

/**
 * The agreement's committed and cumulative figures from the POs drawn on it: open lines of open
 * POs are committed, closed lines of POs that weren't cancelled fulfilled. The app recalculates the same way when a PO is saved.
 */
export function withCommitments(pba: PurchaseBlanketAgreement, pos: readonly Pick<PurchaseOrder, 'status' | 'lines'>[]): PurchaseBlanketAgreement {
  return {
    ...pba,
    lines: pba.lines.map((bl) => {
      let committed = 0;
      let fulfilled = 0;
      for (const po of pos)
        for (const l of po.lines) {
          if (l.agreementId !== pba.id || l.agreementLineId !== bl.id) continue;
          if (po.status === 'Open' && l.status === 'Open') committed += l.quantity;
          if (l.status === 'Closed' && po.status !== 'Cancelled') fulfilled += l.quantity;
        }
      return {
        ...bl,
        cumulativeCommittedQty: committed,
        cumulativeCommittedAmountLC: round2(committed * bl.unitPrice),
        cumulativeCommittedAmountFC: 0,
        cumulativeQty: fulfilled,
        cumulativeAmountLC: round2(fulfilled * bl.unitPrice),
        cumulativeAmountFC: 0,
      };
    }),
  };
}

const seedHeader = (id: string, docNum: number, vendorId: string, patch: Partial<PurchaseBlanketAgreement>): PurchaseBlanketAgreement => {
  const v = partnerById(vendorId);
  const phoneChannel = v.contactChannels.find((ch) => ch.type === 'Phone' || ch.type === 'Mobile');
  const emailChannel = v.contactChannels.find((ch) => ch.type === 'Email');
  return {
    ...blankPurchaseBlanketAgreement(CURRENT_USER_ID),
    id,
    docNum,
    status: 'Approved',
    vendorId,
    vendorCode: v.code,
    vendorName: v.name,
    contactId: v.defaultContactId,
    currency: v.currency === 'All currencies' ? 'PHP' : v.currency,
    phone: phoneChannel?.value ?? '',
    email: emailChannel?.value ?? '',
    paymentTermId: v.vendorPaymentTermId,
    ...patch,
  };
};

const AGREEMENTS: PurchaseBlanketAgreement[] = [
  // Luzon iDistribution — FY2026 volume agreement (iPhones)
  seedHeader('pba-001', 1, 'bp-016', {
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    signingDate: '2025-12-18',
    description: 'Luzon iDistribution — FY2026 volume agreement (iPhones)',
    vendorRef: 'LDC-SA-2026-001',
    settlementProbability: 90,
    remarks: 'Annual volume commitment for iPhone 17, 17e and the iPhone 18 Pro launch. Priced at distributor cost; subject to quarterly reconciliation.',
    lines: [
      seedLine('pba-001', 'IPH-17-256-BLK', 120),
      seedLine('pba-001', 'IPH-17-256-WHT', 60),
      seedLine('pba-001', 'IPH-17-256-LAV', 80),
      seedLine('pba-001', 'IPH-17E-256-SPK', 100),
      seedLine('pba-001', 'IPH-18P-256-BLK', 60),
      seedLine('pba-001', 'IPH-18P-256-SLV', 60),
      seedLine('pba-001', 'IPH-18PM-512-GLC', 30),
    ],
  }),

  // Luzon iDistribution — holiday season allocation
  seedHeader('pba-002', 2, 'bp-016', {
    startDate: '2026-10-01',
    endDate: '2027-01-15',
    signingDate: '2026-09-25',
    description: 'Luzon iDistribution — holiday season allocation',
    vendorRef: 'LDC-SA-2026-002',
    settlementProbability: 75,
    remarks: 'Holiday peak allocation. Covers November–January sell-in window.',
    lines: [
      seedLine('pba-002', 'IPH-17-256-BLK', 60),
      seedLine('pba-002', 'IPH-17-256-LAV', 40),
      seedLine('pba-002', 'ACC-MAGSF2', 80),
    ],
  }),

  // Apple South Asia — FY2026 direct import allocation
  seedHeader('pba-003', 3, 'bp-017', {
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    signingDate: '2025-12-10',
    description: 'Apple South Asia — FY2026 direct import allocation',
    vendorRef: 'ASAP-ALLOC-2026-PH',
    currency: 'USD',
    settlementProbability: 95,
    remarks: 'Allocated import quantities for Mac, iPad and the iPhone 18 Pro launch for FY2026. Priced in USD at ASAP distributor cost.',
    lines: [
      usdLine('pba-003', 'MAC-MBA13-M5-8G-16-512-MDN', 60),
      usdLine('pba-003', 'MAC-MBA13-M5-8G-16-512-SLV', 60),
      usdLine('pba-003', 'MAC-MBA13-M5-10G-24-1T-SKB', 30),
      usdLine('pba-003', 'IPD-PRO-11-256-SG-WF-SBK', 120),
      usdLine('pba-003', 'IPD-AIR-11-128-WF-BLU', 80),
      usdLine('pba-003', 'IPD-AIR-11-256-WF-STL', 60),
      usdLine('pba-003', 'IPH-18P-256-BLK', 60),
      usdLine('pba-003', 'IPH-18P-256-SLV', 60),
      usdLine('pba-003', 'IPH-18PM-512-GLC', 30),
    ],
  }),

  // Techzone Accessories — accessories volume deal (Draft, pending approval)
  seedHeader('pba-004', 0, 'bp-013', {
    startDate: '2026-10-01',
    endDate: '2027-03-31',
    signingDate: '2026-10-09',
    description: 'Techzone Accessories — H2 FY2026 accessories supply',
    vendorRef: 'TZA-SUPPLY-2026-H2',
    status: 'Draft',
    settlementProbability: 60,
    remarks: 'Under review. Covers USB-C cables, MagSafe chargers, and Pencil accessories for the holiday season.',
    lines: [
      seedLine('pba-004', 'ACC-CBL240', 200),
      seedLine('pba-004', 'ACC-PENUSBC', 120),
      seedLine('pba-004', 'ACC-USBCL', 80),
    ],
  }),

  // AWS — annual compute savings plan: the monthly cloud hosting draws on it
  seedHeader('pba-005', 4, 'bp-015', {
    startDate: '2026-01-01',
    endDate: '2027-03-31',
    signingDate: '2025-12-15',
    description: 'AWS — annual compute savings plan',
    vendorRef: 'AWS-SP-2026-PH',
    currency: 'USD',
    settlementProbability: 100,
    remarks: 'Fifteen months of committed cloud hosting at the savings-plan rate.',
    lines: [seedLine('pba-005', 'SVC-CLD-HOST', 15, { unitPrice: 420 })],
  }),
];

/** The seeded agreements, with what the seeded POs commit and fulfil on them. */
export const SEED_PURCHASE_BLANKET_AGREEMENTS: PurchaseBlanketAgreement[] = AGREEMENTS.map((a) => withCommitments(a, SEED_PURCHASE_ORDERS));
