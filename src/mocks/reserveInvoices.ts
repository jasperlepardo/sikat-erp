/**
 * Reserve Invoices: A/R invoices that post A/R and revenue accounting entries immediately,
 * but do NOT relieve inventory. Inventory relief happens later when a Delivery is created
 * against the Reserve Invoice.
 *
 * Document chain: Sales Order → Reserve Invoice → Delivery
 *
 * This contrasts with the normal flow: Sales Order → Delivery → A/R Invoice.
 */
import type { Attachment, DocumentSeries } from './common';
import { employeeId, plId, termId } from './masters';
import type { PoReference } from './purchaseOrders';
import type { SoDocType } from './salesOrders';
import type { DnLine } from './deliveries';

export type ArStatus = 'Draft' | 'Not Confirmed' | 'Open' | 'Closed' | 'Cancelled';
export const RI_STATUSES: ArStatus[] = ['Draft', 'Not Confirmed', 'Open', 'Closed', 'Cancelled'];

/** Where a line came from. '' = entered by hand. */
type RiBaseType = '' | 'SO';

export interface RiLine extends Omit<DnLine, 'baseType' | 'invoicedQty'> {
  baseType: RiBaseType;
  /** Service invoices: the revenue account. */
  glAccount: string;
  /** Subject to the customer's withholding. */
  wtaxLiable: boolean;
  /** Sales commission % for this line. */
  commissionPct: number;
  /** Open quantity for inventory transfer (not yet delivered). */
  openQtyForIt: number;
}

export interface ReserveInvoice {
  id: string;

  // Header
  customerId: string;
  customerCode: string;
  customerName: string;
  contactId: string;
  customerRef: string;
  currency: string;
  seriesId: string;
  docNum: number;
  status: ArStatus;
  postingDate: string;
  dueDate: string;
  documentDate: string;
  closeDate: string;

  // Contents
  docType: SoDocType;
  lines: RiLine[];

  // Logistics
  shipTo: string;
  billTo: string;
  shippingType: string;
  language: string;
  trackingNo: string;
  blockDunning: boolean;
  bpChannelName: string;
  bpChannelContact: string;
  /** Allow partial delivery against this reserve invoice. */
  allowPartialDelivery: boolean;

  // Accounting
  journalRemark: string;
  projectId: string;
  paymentTermId: string;
  paymentMethod: string;
  indicator: string;
  federalTaxId: string;
  orderNumber: string;
  dueMonths: number;
  dueDays: number;
  cashDiscountDays: number;
  references: PoReference[];
  /** The customer's A/R control account (defaults from the customer). */
  controlAccount: string;
  paymentBlock: boolean;
  maxCashDiscount: boolean;
  /** Number of equal installments (1 = due in full on the due date). */
  installments: number;

  // Attachments
  attachments: Attachment[];

  // Footer
  salesEmployeeId: string;
  ownerId: string;
  discountPct: number;
  freight: number;
  freightTaxCode: string;
  rounding: boolean;
  remarks: string;
  /** Paid so far by incoming payments, document currency. */
  appliedAmount: number;
  fxRate: number;
  approved: boolean;
}

export const RI_SERIES: DocumentSeries[] = [
  {
    id: 'ris-primary',
    name: 'Reserve Invoice',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [{ type: 'literal', value: 'RI' }, { type: 'year' }, { type: 'sequence', padding: 5 }],
  },
];

export const newRiLine = (patch: Partial<RiLine> = {}): RiLine => ({
  itemId: '',
  itemNo: '',
  description: '',
  quantity: 1,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  warehouse: '',
  priceListId: plId('Base price'),
  unitPrice: 0,
  discountPct: 0,
  priceSource: '',
  taxCode: '',
  baseType: '',
  baseId: '',
  baseLineId: '',
  baseDocNo: '',
  baseRow: 0,
  unitCostLc: 0,
  glAccount: '',
  wtaxLiable: false,
  commissionPct: 0,
  openQtyForIt: 1,
  ...patch,
  id: patch.id ?? `rl-${crypto.randomUUID().slice(0, 8)}`,
});

export function blankReserveInvoice(today: string, ownerId: string): Omit<ReserveInvoice, 'id'> {
  return {
    customerId: '',
    customerCode: '',
    customerName: '',
    contactId: '',
    customerRef: '',
    currency: 'PHP',
    seriesId: RI_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: today,
    dueDate: today,
    documentDate: today,
    closeDate: '',
    docType: 'Item',
    lines: [],
    shipTo: '',
    billTo: '',
    shippingType: '',
    language: 'English',
    trackingNo: '',
    blockDunning: false,
    bpChannelName: '',
    bpChannelContact: '',
    allowPartialDelivery: true,
    journalRemark: '',
    projectId: '',
    paymentTermId: termId('Net 30'),
    paymentMethod: 'BANK',
    indicator: '',
    federalTaxId: '',
    orderNumber: '',
    dueMonths: 0,
    dueDays: 0,
    cashDiscountDays: 0,
    references: [],
    controlAccount: '',
    paymentBlock: false,
    maxCashDiscount: false,
    installments: 1,
    attachments: [],
    salesEmployeeId: '',
    ownerId,
    discountPct: 0,
    freight: 0,
    freightTaxCode: 'OVAT',
    rounding: false,
    remarks: '',
    appliedAmount: 0,
    fxRate: 1,
    approved: true,
  };
}

/** Empty seed — no seed data needed for Reserve Invoices. */
export const SEED_RESERVE_INVOICES: ReserveInvoice[] = [
  {
    id: 'ri-001',
    docNum: 1,
    seriesId: RI_SERIES[0].id,
    status: 'Open',
    customerId: 'bp-003',
    customerCode: 'BP-0003',
    customerName: 'Bayanihan Savings Bank Corp.',
    contactId: 'bp-003-c1',
    customerRef: 'BSB-PO-2026-0890',
    currency: 'PHP',
    postingDate: '2026-09-25',
    dueDate: '2026-10-25',
    documentDate: '2026-09-25',
    closeDate: '',
    docType: 'Item',
    shipTo: '',
    billTo: '',
    shippingType: '',
    language: 'English',
    trackingNo: '',
    blockDunning: false,
    bpChannelName: '',
    bpChannelContact: '',
    allowPartialDelivery: true,
    journalRemark: 'Reserve Invoice – BP-0003',
    projectId: '',
    paymentTermId: termId('Net 30'),
    paymentMethod: 'BANK',
    indicator: '',
    federalTaxId: '',
    orderNumber: 'SO-2026-0023',
    references: [],
    controlAccount: '1120',
    paymentBlock: false,
    maxCashDiscount: false,
    installments: 1,
    dueMonths: 0,
    dueDays: 30,
    cashDiscountDays: 0,
    attachments: [],
    salesEmployeeId: employeeId('Ben Salazar'),
    ownerId: employeeId('Ben Salazar'),
    discountPct: 0,
    freight: 0,
    freightTaxCode: 'OVAT',
    rounding: false,
    remarks: 'Branch rollout — Phase 1. Inventory to be delivered in batches per branch schedule.',
    appliedAmount: 0,
    fxRate: 1,
    approved: true,
    lines: [
      newRiLine({
        id: 'rl-001-1',
        itemId: 'apl-0239',
        itemNo: 'MAC-MBA13-M5-8G-16-512-SKB',
        description: 'MacBook Air 13-inch (M5), 8GB, 16GB, 512GB, Sky Blue',
        quantity: 12,
        uomCode: 'pc',
        uomName: 'Piece',
        itemsPerUnit: 1,
        unitPrice: 84598.21,
        taxCode: 'OVAT',
        wtaxLiable: true,
        openQtyForIt: 12,
        baseType: 'SO',
        baseId: 'so-001',
        baseLineId: 'so-001-1',
        baseDocNo: 'SO-2026-0023',
      }),
      newRiLine({
        id: 'rl-001-2',
        itemId: 'apl-0240',
        itemNo: 'MAC-MBA13-M5-8G-16-512-MDN',
        description: 'MacBook Air 13-inch (M5), 8GB, 16GB, 512GB, Midnight',
        quantity: 8,
        uomCode: 'pc',
        uomName: 'Piece',
        itemsPerUnit: 1,
        unitPrice: 84598.21,
        taxCode: 'OVAT',
        wtaxLiable: true,
        openQtyForIt: 8,
        baseType: 'SO',
        baseId: 'so-001',
        baseLineId: 'so-001-2',
        baseDocNo: 'SO-2026-0023',
      }),
    ],
  },
  {
    id: 'ri-002',
    docNum: 2,
    seriesId: RI_SERIES[0].id,
    status: 'Open',
    customerId: 'bp-009',
    customerCode: 'BP-0009',
    customerName: 'Department of Education – Schools Division Office of Pasig City',
    contactId: 'bp-009-c1',
    customerRef: 'DepEd-Pasig-BAC-2026-112',
    currency: 'PHP',
    postingDate: '2026-10-02',
    dueDate: '2026-10-31',
    documentDate: '2026-10-02',
    closeDate: '',
    docType: 'Item',
    shipTo: '',
    billTo: '',
    shippingType: '',
    language: 'English',
    trackingNo: '',
    blockDunning: false,
    bpChannelName: '',
    bpChannelContact: '',
    allowPartialDelivery: true,
    journalRemark: 'Reserve Invoice – BP-0009',
    projectId: '',
    paymentTermId: termId('Net 30'),
    paymentMethod: 'BANK',
    indicator: '',
    federalTaxId: '',
    orderNumber: 'SO-2026-470001',
    references: [],
    controlAccount: '1120',
    paymentBlock: false,
    maxCashDiscount: false,
    installments: 1,
    dueMonths: 0,
    dueDays: 30,
    cashDiscountDays: 0,
    attachments: [],
    salesEmployeeId: employeeId('Dino Pascual'),
    ownerId: employeeId('Dino Pascual'),
    discountPct: 0,
    freight: 0,
    freightTaxCode: 'OVAT',
    rounding: false,
    remarks: 'DepEd Pasig iPad procurement — 120 units for classroom use. Delivery per school.',
    appliedAmount: 0,
    fxRate: 1,
    approved: true,
    lines: [
      newRiLine({
        id: 'rl-002-1',
        itemId: 'apl-0079',
        itemNo: 'IPD-PRO-11-256-SG-WF-SBK',
        description: 'iPad Pro (M5), 11-inch, 256GB, Standard glass, Wi-Fi, Space Black',
        quantity: 120,
        uomCode: 'pc',
        uomName: 'Piece',
        itemsPerUnit: 1,
        unitPrice: 62410.71,
        taxCode: 'OVAT',
        wtaxLiable: false,
        openQtyForIt: 120,
        baseType: 'SO',
        baseId: 'so-002',
        baseLineId: 'so-002-1',
        baseDocNo: 'SO-2026-470001',
      }),
    ],
  },
];
