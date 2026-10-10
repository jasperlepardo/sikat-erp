import type { Attachment, DocumentSeries } from './common';
import { CURRENT_USER_ID } from './common';
import { termId } from './masters';
import { SEED_ITEMS, itemsPerUom } from './items';
import { SEED_PARTNERS } from './partners';
import { todayISO } from '../services/dates';

export type PbaStatus = 'Draft' | 'Approved' | 'On Hold' | 'Terminated' | 'Closed';
export const PBA_STATUSES: PbaStatus[] = ['Draft', 'Approved', 'On Hold', 'Terminated', 'Closed'];

export type PbaAgreementMethod = 'Items' | 'Money';
export const PBA_AGREEMENT_METHODS: PbaAgreementMethod[] = ['Items', 'Money'];

export type PbaRowStatus = 'Open' | 'Closed';

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
const round2 = (n: number) => Math.round(n * 100) / 100;

const seedLine = (id: string, itemNo: string, plannedQty: number, patch: Partial<PbaLine> = {}): PbaLine => {
  const item = itemByNo(itemNo);
  return newPbaLine({
    id,
    itemId: item.id,
    itemNo: item.itemNo,
    description: item.name,
    itemGroupId: item.itemGroupId,
    plannedQty,
    unitPrice: round2(item.itemCost),
    uomCode: item.purchasingUom,
    uomName: item.purchasingUom === 'pc' ? 'Piece' : item.purchasingUom,
    itemsPerUnit: itemsPerUom(item, item.purchasingUom) ?? 1,
    ...patch,
  });
};

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

export const SEED_PURCHASE_BLANKET_AGREEMENTS: PurchaseBlanketAgreement[] = [
  // Luzon iDistribution — FY2026 volume agreement (iPhones & accessories)
  seedHeader('pba-001', 1, 'bp-016', {
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    signingDate: '2025-12-18',
    description: 'Luzon iDistribution — FY2026 volume agreement (iPhones)',
    vendorRef: 'LDC-SA-2026-001',
    settlementProbability: 90,
    remarks: 'Annual volume commitment for iPhone 17 and iPhone 17E. Priced at distributor cost; subject to quarterly reconciliation.',
    lines: [
      seedLine('pba-001-1', 'IPH-17-256-BLK', 120, {
        cumulativeQty: 26,
        cumulativeAmountLC: round2(26 * itemByNo('IPH-17-256-BLK').itemCost),
        cumulativeCommittedQty: 12,
        cumulativeCommittedAmountLC: round2(12 * itemByNo('IPH-17-256-BLK').itemCost),
      }),
      seedLine('pba-001-2', 'IPH-17-256-LAV', 80, {
        cumulativeQty: 40,
        cumulativeAmountLC: round2(40 * itemByNo('IPH-17-256-LAV').itemCost),
        cumulativeCommittedQty: 16,
        cumulativeCommittedAmountLC: round2(16 * itemByNo('IPH-17-256-LAV').itemCost),
      }),
      seedLine('pba-001-3', 'IPH-17E-256-SPK', 100, {
        cumulativeQty: 40,
        cumulativeAmountLC: round2(40 * itemByNo('IPH-17E-256-SPK').itemCost),
        cumulativeCommittedQty: 16,
        cumulativeCommittedAmountLC: round2(16 * itemByNo('IPH-17E-256-SPK').itemCost),
      }),
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
      seedLine('pba-002-1', 'IPH-17-256-BLK', 60, {
        cumulativeCommittedQty: 12,
        cumulativeCommittedAmountLC: round2(12 * itemByNo('IPH-17-256-BLK').itemCost),
      }),
      seedLine('pba-002-2', 'IPH-17-256-LAV', 40),
      seedLine('pba-002-3', 'ACC-MAGSF2', 80, {
        cumulativeCommittedQty: 24,
        cumulativeCommittedAmountLC: round2(24 * itemByNo('ACC-MAGSF2').itemCost),
      }),
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
    remarks: 'Allocated import quantities for Mac, iPad and accessories for FY2026. Priced in USD at ASAP distributor cost.',
    lines: [
      seedLine('pba-003-1', 'MAC-MBA13-M5-8G-16-512-MDN', 60, {
        unitPrice: round2(itemByNo('MAC-MBA13-M5-8G-16-512-MDN').itemCost / 58),
        cumulativeQty: 30,
        cumulativeAmountLC: round2(30 * (itemByNo('MAC-MBA13-M5-8G-16-512-MDN').itemCost / 58)),
        cumulativeCommittedQty: 15,
        cumulativeCommittedAmountLC: round2(15 * (itemByNo('MAC-MBA13-M5-8G-16-512-MDN').itemCost / 58)),
      }),
      seedLine('pba-003-2', 'IPD-PRO-11-256-SG-WF-SBK', 120, {
        unitPrice: round2(itemByNo('IPD-PRO-11-256-SG-WF-SBK').itemCost / 58),
        cumulativeQty: 44,
        cumulativeAmountLC: round2(44 * (itemByNo('IPD-PRO-11-256-SG-WF-SBK').itemCost / 58)),
        cumulativeCommittedQty: 4,
        cumulativeCommittedAmountLC: round2(4 * (itemByNo('IPD-PRO-11-256-SG-WF-SBK').itemCost / 58)),
      }),
      seedLine('pba-003-3', 'IPD-AIR-11-128-WF-BLU', 80, {
        unitPrice: round2(itemByNo('IPD-AIR-11-128-WF-BLU').itemCost / 58),
        cumulativeQty: 12,
        cumulativeAmountLC: round2(12 * (itemByNo('IPD-AIR-11-128-WF-BLU').itemCost / 58)),
        cumulativeCommittedQty: 30,
        cumulativeCommittedAmountLC: round2(30 * (itemByNo('IPD-AIR-11-128-WF-BLU').itemCost / 58)),
      }),
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
      seedLine('pba-004-1', 'ACC-CBL240', 200),
      seedLine('pba-004-2', 'ACC-PENUSBC', 120),
      seedLine('pba-004-3', 'ACC-USBCL', 80),
    ],
  }),
];
