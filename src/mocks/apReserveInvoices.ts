/**
 * A/P Reserve Invoices. A vendor bills before goods are delivered; the invoice creates a
 * payable liability without moving stock. When the goods arrive, a Goods Receipt PO is
 * created referencing this invoice — that's when inventory is updated.
 *
 * Same header and line structure as an A/P Invoice, but:
 * - Lines carry no warehouse / bin: stock hasn't been received yet.
 * - No "Copy from receipt" — the base document is always a PO (or entered by hand).
 * - Applied amount accumulates as receipts are closed against it; it closes when fully received.
 * - Journal on posting: Dr Purchase account + Input VAT / Cr Vendor Payable — no inventory entry.
 */
import type { Attachment, DocumentSeries } from './common';
import type { PoReference } from './purchaseOrders';
import { newGrLine, type GrLine } from './goodsReceipts';

export type ApRiStatus = 'Draft' | 'Not Confirmed' | 'Open' | 'Closed' | 'Cancelled';
export const AP_RI_STATUSES: ApRiStatus[] = ['Draft', 'Not Confirmed', 'Open', 'Closed', 'Cancelled'];

export interface ApRiLine extends Omit<GrLine, 'invoicedQty' | 'binId' | 'binCode'> {
  /** The PO this line was copied from ('' if entered by hand). */
  baseType: 'PO' | '';
  /** The vendor's catalog number for the item. */
  bpCatalogNo: string;
  countryOfOriginCode: string;
  /** Quantity received so far via Goods Receipts that reference this line. */
  receivedQty?: number;
}

export interface ApReserveInvoice {
  id: string;

  // Header
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  contactId: string;
  vendorRef: string;
  currency: string;
  seriesId: string;
  docNum: number;
  status: ApRiStatus;
  postingDate: string;
  dueDate: string;
  documentDate: string;
  closeDate: string;
  approved?: boolean;

  // Lines
  lines: ApRiLine[];

  // Logistics
  shipTo: string;
  payTo: string;
  shippingType: string;
  language: string;

  // Accounting
  journalRemark: string;
  paymentTermId: string;
  paymentMethod: string;
  cashDiscountDays: number;
  projectId: string;
  indicator: string;
  orderNumber: string;
  controlAccount: string;
  paymentBlock: boolean;
  maxCashDiscount: boolean;
  installments: number;
  consolidatingBpId: string;

  // Footer
  discountPct: number;
  freight: number;
  freightTaxCode: string;
  fxRate: number;
  paymentOrderRun: boolean;
  /** Applied against this invoice from outgoing payments. */
  appliedAmount: number;

  references: PoReference[];
  attachments: Attachment[];
  remarks: string;
  buyerId: string;
  ownerId: string;
}

export const AP_RI_SERIES: DocumentSeries[] = [
  {
    id: 'apri-primary',
    name: 'Primary',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [
      { type: 'literal', value: 'APRI' },
      { type: 'year' },
      { type: 'sequence', padding: 4 },
    ],
  },
];

export const newApRiLine = (patch: Partial<ApRiLine> = {}): ApRiLine => {
  const { invoicedQty: _ignored, binId: _bin, binCode: _code, ...base } = newGrLine();
  return { ...base, baseType: '', bpCatalogNo: '', countryOfOriginCode: '', ...patch };
};

export function blankApReserveInvoice(today: string, buyerId: string): Omit<ApReserveInvoice, 'id'> {
  return {
    vendorId: '',
    vendorCode: '',
    vendorName: '',
    contactId: '',
    vendorRef: '',
    currency: 'PHP',
    seriesId: AP_RI_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: today,
    dueDate: '',
    documentDate: today,
    closeDate: '',
    lines: [],
    shipTo: '',
    payTo: '',
    shippingType: '',
    language: 'English',
    journalRemark: '',
    paymentTermId: '',
    paymentMethod: '',
    cashDiscountDays: 0,
    projectId: '',
    indicator: '',
    orderNumber: '',
    controlAccount: '',
    paymentBlock: false,
    maxCashDiscount: false,
    installments: 1,
    consolidatingBpId: '',
    discountPct: 0,
    freight: 0,
    freightTaxCode: '',
    fxRate: 1,
    paymentOrderRun: true,
    appliedAmount: 0,
    approved: true,
    references: [],
    attachments: [],
    remarks: '',
    buyerId,
    ownerId: buyerId,
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// Apple South Asia bills before the shipment clears customs — the classic
// reserve invoice case. One Closed (MacBook Air, po-007 — goods received
// 1 Sep via gr-083); one Open (iPhone 18 Pro, po-006 — delivery expected 6 Oct).

const MNL_SHIP_TO = 'Pasig warehouse\n155 Dr. Sixto Antonio Ave.\nCity of Pasig\n1600 Metro Manila';

const apriBase = (id: string, docNum: number, patch: Partial<ApReserveInvoice>): ApReserveInvoice => ({
  ...blankApReserveInvoice('2026-08-19', 'emp-001'),
  id,
  docNum,
  vendorId: 'bp-017',
  vendorCode: 'BP-0017',
  vendorName: 'Apple South Asia Pte. Ltd.',
  contactId: 'bp-017-c1',
  currency: 'USD',
  paymentTermId: 'pt-004',
  paymentMethod: 'BANK',
  shipTo: MNL_SHIP_TO,
  payTo: '',
  shippingType: 'sh-own',
  journalRemark: 'A/P Reserve Invoices – BP-0017',
  controlAccount: '2010',
  ...patch,
});

const apriLine = (id: string, patch: Partial<ApRiLine>): ApRiLine => ({
  ...newApRiLine({ id }),
  priceListId: 'prl-005',
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  warehouse: '',
  taxCode: '46',
  baseType: 'PO',
  ...patch,
});

export const SEED_AP_RESERVE_INVOICES: ApReserveInvoice[] = [
  // APRI-2026-0001 — MacBook Air back-to-school import (po-007, IMP-2026-0002)
  apriBase('apri-001', 1, {
    vendorRef: 'ASA-INV-7738115',
    postingDate: '2026-08-19',
    documentDate: '2026-08-19',
    dueDate: '2026-09-18',
    closeDate: '2026-09-02',
    status: 'Closed',
    fxRate: 61.655,
    freight: 1200,
    freightTaxCode: '46',
    orderNumber: 'IMP-2026-0002',
    remarks: 'Back-to-school MacBook Air import. Billed before shipment; goods received complete on 1 Sep.',
    lines: [
      apriLine('apri-001-1', {
        itemId: 'apl-0240', itemNo: 'MAC-MBA13-M5-8G-16-512-MDN',
        name: '', description: 'MacBook Air 13-inch (M5), M5 10C CPU/8C GPU, 16GB, 512GB, Midnight',
        quantity: 15, unitPrice: 1395.19, blanketAgreement: 'BA-2026-004',
        baseId: 'po-007', baseLineId: 'po-007-1', baseDocNo: 'IMP-2026-0002',
        receivedQty: 15,
      }),
      apriLine('apri-001-2', {
        itemId: 'apl-0242', itemNo: 'MAC-MBA13-M5-8G-16-512-SLV',
        name: '', description: 'MacBook Air 13-inch (M5), M5 10C CPU/8C GPU, 16GB, 512GB, Silver',
        quantity: 15, unitPrice: 1395.19, blanketAgreement: 'BA-2026-004',
        baseId: 'po-007', baseLineId: 'po-007-2', baseDocNo: 'IMP-2026-0002',
        receivedQty: 15,
      }),
      apriLine('apri-001-3', {
        itemId: 'apl-0243', itemNo: 'MAC-MBA13-M5-10G-24-1T-SKB',
        name: '', description: 'MacBook Air 13-inch (M5), M5 10C CPU/10C GPU, 24GB, 1TB, Sky Blue',
        quantity: 8, unitPrice: 1720.31, blanketAgreement: 'BA-2026-004',
        baseId: 'po-007', baseLineId: 'po-007-3', baseDocNo: 'IMP-2026-0002',
        receivedQty: 8,
      }),
    ],
  }),
  // APRI-2026-0002 — iPhone 18 Pro launch import (po-006, IMP-2026-0001)
  apriBase('apri-002', 2, {
    vendorRef: 'ASA-INV-7741902',
    postingDate: '2026-09-23',
    documentDate: '2026-09-23',
    dueDate: '2026-10-23',
    closeDate: '',
    status: 'Open',
    fxRate: 62.698,
    freight: 1850,
    freightTaxCode: '46',
    orderNumber: 'IMP-2026-0001',
    remarks: 'iPhone 18 Pro launch import. Billed before clearance; goods expected 6 Oct.',
    references: [{ id: 'apri-002-r1', docType: 'Email', docNo: 'Allocation notice 2026-09-16', docDate: '2026-09-16', remarks: 'iPhone 18 Pro launch allocation' }],
    lines: [
      apriLine('apri-002-1', {
        itemId: 'apl-0017', itemNo: 'IPH-18P-256-BLK',
        name: '', description: 'iPhone 18 Pro, 256GB, Black',
        quantity: 20, unitPrice: 1286.81, blanketAgreement: 'BA-2026-004',
        baseId: 'po-006', baseLineId: 'po-006-1', baseDocNo: 'IMP-2026-0001',
        receivedQty: 0,
      }),
      apriLine('apri-002-2', {
        itemId: 'apl-0018', itemNo: 'IPH-18P-256-SLV',
        name: '', description: 'iPhone 18 Pro, 256GB, Silver',
        quantity: 20, unitPrice: 1286.81, blanketAgreement: 'BA-2026-004',
        baseId: 'po-006', baseLineId: 'po-006-2', baseDocNo: 'IMP-2026-0001',
        receivedQty: 0,
      }),
      apriLine('apri-002-3', {
        itemId: 'apl-0007', itemNo: 'IPH-18PM-512-GLC',
        name: '', description: 'iPhone 18 Pro Max, 512GB, Glacier',
        quantity: 10, unitPrice: 1571.29, blanketAgreement: 'BA-2026-004',
        baseId: 'po-006', baseLineId: 'po-006-3', baseDocNo: 'IMP-2026-0001',
        receivedQty: 0,
      }),
      apriLine('apri-002-4', {
        itemId: 'itm-044', itemNo: 'SVC-MANUALS',
        name: 'Printed Apple training manuals', description: 'Printed Apple training manuals (imported)',
        quantity: 200, unitPrice: 3.5, taxCode: '49',
        baseId: 'po-006', baseLineId: 'po-006-4', baseDocNo: 'IMP-2026-0001',
        receivedQty: 0,
      }),
    ],
  }),
];
