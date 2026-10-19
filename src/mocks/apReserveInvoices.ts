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

// No seed data — reserve invoices start empty in the demo.
export const SEED_AP_RESERVE_INVOICES: ApReserveInvoice[] = [];
