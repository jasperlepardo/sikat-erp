/**
 * Sales quotations (Sales › Quotations). A price offer to a customer — no stock commitment,
 * no posting. Expires on Valid Until; open until copied to an order or closed/cancelled.
 *
 * Settled here, for the prototype:
 * - Item-type only (same as sales orders in this codebase).
 * - Lines share the SoLine shape minus deliveredQty and status — quotation lines don't track
 *   fulfilment.
 * - Adding a quotation assigns its number and sets status to Open. No stock moves.
 * - Copy to Sales Order: all open lines carry over; the order then commits stock.
 * - Closing or cancelling a quotation releases nothing (there was nothing committed).
 */
import type { Attachment, DocumentSeries } from './common';
import { plId, termId } from './masters';
import type { PoReference } from './purchaseOrders';
import { todayISO } from '../services/dates';

export type QuotationStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const QUOTATION_STATUSES: QuotationStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

export interface QuoteLine {
  id: string;
  itemId: string;
  itemNo: string;
  description: string;
  quantity: number;
  uomCode: string;
  uomName: string;
  itemsPerUnit: number;
  warehouse: string;
  priceListId: string;
  unitPrice: number;
  discountPct: number;
  priceSource: string;
  taxCode: string;
  glAccount: string;
}

export interface Quotation {
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
  status: QuotationStatus;
  postingDate: string;
  validUntil: string;
  documentDate: string;
  closeDate: string;

  // Contents
  lines: QuoteLine[];

  // Logistics
  shipTo: string;
  billTo: string;
  shippingType: string;
  language: string;
  bpChannelName: string;
  bpChannelContact: string;

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

  /** Id of the sales order this was copied to, if any. */
  convertedToOrderId: string;
}

export const QT_SERIES: DocumentSeries[] = [
  {
    id: 'qts-primary',
    name: 'Quotation',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [
      { type: 'literal', value: 'QT' },
      { type: 'year' },
      { type: 'sequence', padding: 4 },
    ],
  },
];

const TODAY = todayISO();

export const newQuoteLine = (patch: Partial<QuoteLine> = {}): QuoteLine => ({
  itemId: '',
  itemNo: '',
  description: '',
  quantity: 1,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  warehouse: 'WH-MNL',
  priceListId: plId('Base price'),
  unitPrice: 0,
  discountPct: 0,
  priceSource: '',
  taxCode: '',
  glAccount: '',
  ...patch,
  id: patch.id ?? `ql-${crypto.randomUUID().slice(0, 8)}`,
});

export function blankQuotation(ownerId: string): Omit<Quotation, 'id'> {
  return {
    customerId: '',
    customerCode: '',
    customerName: '',
    contactId: '',
    customerRef: '',
    currency: 'PHP',
    seriesId: QT_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: TODAY,
    validUntil: '',
    documentDate: TODAY,
    closeDate: '',
    lines: [],
    shipTo: '',
    billTo: '',
    shippingType: '',
    language: 'English',
    bpChannelName: '',
    bpChannelContact: '',
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
    attachments: [],
    salesEmployeeId: '',
    ownerId,
    discountPct: 0,
    freight: 0,
    freightTaxCode: '31',
    rounding: false,
    remarks: '',
    convertedToOrderId: '',
  };
}

export const SEED_QUOTATIONS: Quotation[] = [];
