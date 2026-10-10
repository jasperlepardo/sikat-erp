import type { Attachment, DocumentSeries } from './common';
import { CURRENT_USER_ID } from './common';
import { termId } from './masters';
import { SEED_ITEMS, itemsPerUom } from './items';
import { SEED_PARTNERS } from './partners';
import { todayISO } from '../services/dates';

export type BaStatus = 'Draft' | 'Approved' | 'On Hold' | 'Terminated' | 'Closed';
export const BA_STATUSES: BaStatus[] = ['Draft', 'Approved', 'On Hold', 'Terminated', 'Closed'];

export type BaAgreementMethod = 'Items' | 'Money';
export const BA_AGREEMENT_METHODS: BaAgreementMethod[] = ['Items', 'Money'];

export type BaRowStatus = 'Open' | 'Closed';

export interface BaLine {
  id: string;
  itemId: string;
  itemNo: string;
  description: string;
  itemGroupId: string;
  plannedQty: number;
  unitPrice: number;
  /** Committed via linked orders not yet invoiced — calculated, stored here for prototype. */
  cumulativeCommittedQty: number;
  cumulativeCommittedAmountLC: number;
  cumulativeCommittedAmountFC: number;
  /** Fulfilled (invoiced/delivered) to date. */
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
  rowStatus: BaRowStatus;
}

export interface BlanketAgreement {
  id: string;

  // Header
  customerId: string;
  customerCode: string;
  customerName: string;
  contactId: string;
  customerRef: string;
  currency: string;
  /** Auto-filled from BP contactChannels, read-only after BP is selected. */
  phone: string;
  email: string;
  description: string;
  seriesId: string;
  docNum: number;
  agreementMethod: BaAgreementMethod;
  startDate: string;
  endDate: string;
  projectId: string;
  /** Set when the agreement is terminated; read-only. */
  terminationDate: string;
  signingDate: string;
  status: BaStatus;

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
  lines: BaLine[];

  // Attachments
  attachments: Attachment[];
}

export const BA_SERIES: DocumentSeries[] = [
  {
    id: 'ba-primary',
    name: 'Primary',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [
      { type: 'literal', value: 'BA' },
      { type: 'year' },
      { type: 'sequence', padding: 4 },
    ],
  },
];

const TODAY = todayISO();

export const newBaLine = (patch: Partial<BaLine> = {}): BaLine => ({
  id: patch.id ?? `bal-${crypto.randomUUID().slice(0, 8)}`,
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

export function blankBlanketAgreement(ownerId: string): Omit<BlanketAgreement, 'id'> {
  return {
    customerId: '',
    customerCode: '',
    customerName: '',
    contactId: '',
    customerRef: '',
    currency: 'PHP',
    phone: '',
    email: '',
    description: '',
    seriesId: BA_SERIES[0].id,
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

const itemById = (id: string) => SEED_ITEMS.find((i) => i.id === id)!;
const partnerById = (id: string) => SEED_PARTNERS.find((p) => p.id === id)!;
const round2 = (n: number) => Math.round(n * 100) / 100;

const seedLine = (id: string, itemId: string, plannedQty: number, patch: Partial<BaLine> = {}): BaLine => {
  const item = itemById(itemId);
  return newBaLine({
    id,
    itemId,
    itemNo: item.itemNo,
    description: item.name,
    itemGroupId: item.itemGroupId,
    plannedQty,
    unitPrice: round2(item.basePrice / 1.12),
    uomCode: item.salesUom,
    uomName: item.salesUom === 'pc' ? 'Piece' : item.salesUom,
    itemsPerUnit: itemsPerUom(item, item.salesUom) ?? 1,
    ...patch,
  });
};

const seedHeader = (id: string, docNum: number, customerId: string, patch: Partial<BlanketAgreement>): BlanketAgreement => {
  const c = partnerById(customerId);
  const phoneChannel = c.contactChannels.find((ch) => ch.type === 'Phone' || ch.type === 'Mobile');
  const emailChannel = c.contactChannels.find((ch) => ch.type === 'Email');
  return {
    ...blankBlanketAgreement(CURRENT_USER_ID),
    id,
    docNum,
    status: 'Approved',
    customerId,
    customerCode: c.code,
    customerName: c.name,
    contactId: c.defaultContactId,
    currency: c.currency === 'All currencies' ? 'PHP' : c.currency,
    phone: phoneChannel?.value ?? '',
    email: emailChannel?.value ?? '',
    paymentTermId: c.customerPaymentTermId,
    ...patch,
  };
};

// Cumulative figures are what services/blanketAgreements works out from the linked order lines:
// committed = open lines on open orders, cumulative = closed lines.
const used = (l: BaLine, qty: number): Partial<BaLine> => ({ cumulativeQty: qty, cumulativeAmountLC: round2(qty * l.unitPrice) });
const committed = (l: BaLine, qty: number): Partial<BaLine> => ({ cumulativeCommittedQty: qty, cumulativeCommittedAmountLC: round2(qty * l.unitPrice) });
const withUse = (l: BaLine, patch: (l: BaLine) => Partial<BaLine>): BaLine => ({ ...l, ...patch(l) });

export const SEED_BLANKET_AGREEMENTS: BlanketAgreement[] = [
  // so-001: 12 Sky Blue still open (committed), 8 Midnight delivered (closed).
  seedHeader('ba-001', 1, 'bp-003', {
    startDate: '2026-07-01',
    endDate: '2026-12-31',
    signingDate: '2026-06-28',
    description: 'MacBook laptop refresh programme, H2 2026',
    customerRef: 'BSB-CONTRACT-2026-01',
    remarks: 'Commitment for up to 50 MacBook Airs at the special pricing agreed in June. Delivery in batches per approved PR.',
    settlementProbability: 85,
    lines: [
      withUse(seedLine('ba-001-1', 'apl-0239', 25, { unitPrice: round2(94750 / 1.12) }), (l) => committed(l, 12)),
      withUse(seedLine('ba-001-2', 'apl-0240', 25, { unitPrice: round2(94750 / 1.12) }), (l) => used(l, 8)),
    ],
  }),
  // so-004: the 30 power adapters of August.
  seedHeader('ba-002', 2, 'bp-004', {
    startDate: '2026-08-01',
    endDate: '2027-07-31',
    signingDate: '2026-07-28',
    description: 'Annual device refresh — Clarkfield GS, Aug 2026 – Jul 2027',
    customerRef: 'CGS-FA-2026-ANN',
    remarks: 'Annual agreement for Mac, iPad and accessories for the Clark and Pampanga offices.',
    settlementProbability: 90,
    lines: [
      seedLine('ba-002-1', 'apl-0239', 20, { unitPrice: round2(94750 / 1.12) }),
      seedLine('ba-002-2', 'apl-0079', 15),
      withUse(seedLine('ba-002-3', 'apl-0362', 40), (l) => used(l, 30)),
    ],
  }),
  // so-013: the 23 MacBook Airs delivered in September fulfilled it.
  seedHeader('ba-003', 3, 'bp-002', {
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    signingDate: '2025-12-20',
    description: 'Northgate Prime — annual mall device contract',
    customerRef: 'NPM-SAFC-2026',
    status: 'Closed',
    remarks: 'Closed — fulfilled in full by the September MacBook Air order.',
    settlementProbability: 100,
    lines: [
      withUse(seedLine('ba-003-1', 'apl-0242', 15, { rowStatus: 'Closed' }), (l) => used(l, 15)),
      withUse(seedLine('ba-003-2', 'apl-0243', 8, { rowStatus: 'Closed' }), (l) => used(l, 8)),
    ],
  }),
];
