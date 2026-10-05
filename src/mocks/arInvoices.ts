/**
 * A/R invoices: billing a customer (Sales › Invoices). Fields follow the SAP B1 A/R Invoice field
 * map: header, Contents (lines), Logistics, Accounting, Attachments and footer.
 *
 * Settled here, for the prototype:
 * - Lines copy from deliveries (the usual flow) or straight from a sales order, or are entered
 *   by hand. A line from a delivery only bills what was shipped; a line from an order, or by
 *   hand, also ships the stock, as SAP does when there's no delivery.
 * - Service invoices bill amounts to revenue accounts, with no stock.
 * - Adding the invoice posts it: Dr A/R (the customer's control account) / Cr Revenue and Output
 *   VAT. Stock it ships also posts Dr COGS / Cr Inventory at item cost; lines from a delivery
 *   that used the shipped goods account move that cost out of Shipped Goods into COGS.
 * - WTax Liable lines: a top withholding agent deducts creditable withholding tax (1% goods, 2%
 *   services); a government customer also withholds 5% VAT. The WTax Amount comes off the
 *   balance due and posts to the creditable withholding accounts (the customer issues BIR Form
 *   2307). Lines default to liable when the customer withholds.
 * - Use Shipped Goods Account applies only to stock the invoice ships itself (no delivery): its
 *   cost goes to Shipped Goods instead of COGS.
 * - Installments split the balance into equal parts due a payment-term period apart.
 * - Incoming payments, down payments and dunning aren't built: Applied Amount and Total Down
 *   Payment stay 0 (except seeded history); Block Dunning Letters, Payment Block and Max. Cash
 *   Discount are recorded for when they are.
 * - Freight charged to the customer is other income. Rounding goes with it.
 * - Left out: Return Reason and Summary Type (grid layout only), Central Bank Ind. and Deferred
 *   Tax (other localizations), Asset Value Date (no fixed assets yet), Payment Order Run (A/P).
 */
import type { Attachment } from './common';
import { SEED_DELIVERIES, type DnLine } from './deliveries';
import type { PoReference } from './purchaseOrders';
import type { SoDocType } from './salesOrders';

export type ArStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const AR_STATUSES: ArStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

/** Freight and rounding on an invoice: other income. */
export const FREIGHT_INCOME_ACCOUNT = '7030';
/** Creditable withholding the customer deducts: income tax (EWT) and VAT (government). */
export const CWT_ACCOUNT = '1440';
export const CREDITABLE_VAT_ACCOUNT = '1430';

/** Where a line came from. '' = entered by hand. */
export type ArBaseType = '' | 'SO' | 'DN';

export interface ArLine extends Omit<DnLine, 'baseType' | 'invoicedQty'> {
  baseType: ArBaseType;
  /** Service invoices: the revenue account. */
  glAccount: string;
  /** From a delivery that used the shipped goods account: its cost is still in Shipped Goods. */
  shippedGoods: boolean;
  /** Subject to the customer's withholding. */
  wtaxLiable: boolean;
  /** Sales commission % for this line. */
  commissionPct: number;
}

export interface ArInvoice {
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
  lines: ArLine[];

  // Logistics
  shipTo: string;
  billTo: string;
  shippingType: string;
  language: string;
  trackingNo: string;
  blockDunning: boolean;
  bpChannelName: string;
  bpChannelContact: string;

  // Accounting
  journalRemark: string;
  project: string;
  paymentTerms: string;
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
  /** Stock this invoice ships (lines not from a delivery) goes to Shipped Goods, not COGS. */
  useShippedGoodsAccount: boolean;

  // Attachments
  attachments: Attachment[];

  // Footer
  salesEmployee: string;
  owner: string;
  discountPct: number;
  freight: number;
  freightTaxCode: string;
  rounding: boolean;
  remarks: string;
  /** Paid so far by incoming payments, document currency. */
  appliedAmount: number;
  fxRate: number;
}

export const AR_SERIES = [{ id: 'ars-primary', name: 'Primary', firstNo: 430001 }];

export const newArLine = (patch: Partial<ArLine> = {}): ArLine => ({
  itemId: '',
  itemNo: '',
  description: '',
  quantity: 1,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  warehouse: '',
  priceList: 'Base price',
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
  shippedGoods: false,
  wtaxLiable: false,
  commissionPct: 0,
  ...patch,
  // A copied line passes id: undefined; it still needs an id of its own.
  id: patch.id ?? `al-${crypto.randomUUID().slice(0, 8)}`,
});

export function blankArInvoice(today: string, owner: string): Omit<ArInvoice, 'id'> {
  return {
    customerId: '',
    customerCode: '',
    customerName: '',
    contactId: '',
    customerRef: '',
    currency: 'PHP',
    seriesId: AR_SERIES[0].id,
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
    journalRemark: '',
    project: '— None —',
    paymentTerms: 'Net 30',
    paymentMethod: 'BANK',
    indicator: '— None —',
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
    useShippedGoodsAccount: false,
    attachments: [],
    salesEmployee: '-No Sales Employee-',
    owner,
    discountPct: 0,
    freight: 0,
    freightTaxCode: '31',
    rounding: false,
    remarks: '',
    appliedAmount: 0,
    fxRate: 1,
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// The invoice behind the closed Clarkfield delivery: billed and paid in August. History, so no
// journal entry, like other seeded documents.

const dn = SEED_DELIVERIES.find((d) => d.id === 'dn-002')!;

export const SEED_AR_INVOICES: ArInvoice[] = [
  {
    ...blankArInvoice('2026-08-21', 'Jasper L.'),
    ...dn,
    id: 'ar-001',
    seriesId: AR_SERIES[0].id,
    docNum: 430001,
    status: 'Closed',
    postingDate: '2026-08-21',
    documentDate: '2026-08-21',
    dueDate: '2026-09-20',
    closeDate: '2026-09-18',
    docType: 'Item',
    journalRemark: `A/R Invoices – ${dn.customerCode}`,
    orderNumber: dn.orderNumber,
    controlAccount: '1120',
    appliedAmount: 142215.09,
    remarks: 'Paid by bank transfer 18 Sep 2026.',
    lines: dn.lines.map((l) => newArLine({ ...l, id: `ar-001-${l.id}`, baseType: 'DN', baseId: dn.id, baseLineId: l.id, baseDocNo: `Primary ${dn.docNum}`, baseRow: 1, glAccount: '', shippedGoods: false })),
  },
];
