/**
 * A/P invoices (bills). Fields follow the SAP B1 A/P Invoice field map: header, Contents
 * (lines), Logistics, Accounting and footer.
 *
 * Settled here, for the prototype:
 * - Documents are item-type only, like purchase orders and receipts: services and expenses are
 *   billed as non-stock items. Item/Service type and Summary type are left out.
 * - Lines copy from goods receipts (the usual three-way match) or straight from a PO. A line from
 *   a receipt only bills what was received; a line from a PO, or entered by hand, also receives
 *   the stock, as SAP does.
 * - A line from a receipt clears Goods Received Not Invoiced at the receipt's cost. When the
 *   invoice's price or exchange rate differs, the difference goes to inventory (re-averaging the
 *   item cost) while the stock is on hand, else to cost of sales.
 * - Withholding tax (EWT, final tax) comes off the vendor's balance when the invoice is added,
 *   as the BIR withholding agent rules have it.
 * - Payments aren't built: Applied amount stays 0 and Balance due is the net payment due.
 *   Down payments, installments and deferred tax wait for them.
 * - Left out as other countries' localizations: VAT code (the tax code is the VAT code here),
 *   Central Bank Ind., Stamp No., Net procedure and the QR code. Distribution rules, commodity
 *   classification and serial numbers wait for their masters.
 */
import type { DocumentSeries } from './common';
import { SEED_GOODS_RECEIPTS, newGrLine, type GoodsReceipt, type GrLine } from './goodsReceipts';
import { SEED_ITEMS } from './items';
import { SEED_PAYMENT_TERMS } from './partnerMasters';
import { SEED_PARTNERS } from './partners';

export type ApStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const AP_STATUSES: ApStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

/** Where a line was copied from. '' = entered by hand. */
export type ApBaseType = 'GRPO' | 'PO' | '';

export interface ApLine extends Omit<GrLine, 'invoicedQty'> {
  baseType: ApBaseType;
  /** The vendor's catalog number for the item. */
  bpCatalogNo: string;
  countryOfOrigin: string;
  /**
   * For a line from a receipt: the receipt's PHP cost per inventory unit — what's in Goods
   * Received Not Invoiced for it. 0 otherwise.
   */
  receiptCostLc: number;
  /** Goods sent back after billing (goods returns, or credit memos that return goods). Missing = 0. */
  returnedQty?: number;
}

/** An amount drawn on an A/P invoice from a paid down payment request. */
export interface DownPaymentDraw {
  requestId: string;
  docNo: string;
  /** In the document currency. */
  amount: number;
  /** PHP it clears from the advance account: the amount at the rate the request was paid at. */
  amountLc: number;
  account: string;
}

export interface ApInvoice extends Omit<GoodsReceipt, 'lines' | 'status'> {
  status: ApStatus;
  lines: ApLine[];

  // Accounting
  /** The vendor's payable control account, or another picked for this invoice. */
  controlAccount: string;
  paymentBlock: boolean;
  maxCashDiscount: boolean;
  /** Splitting the balance over installments waits for payments; always 1 for now. */
  installments: number;
  /** Pay this invoice to another partner (e.g. a parent company) instead. */
  consolidatingBpId: string;

  // Footer
  /** Total Down Payment: what's drawn from paid down payment requests, in the document currency. */
  downPayment: number;
  /** The down payment requests drawn, with the PHP each draw clears from its advance account. */
  drawnDownPayments?: DownPaymentDraw[];
  /** Include in payment runs (Payment Order Ref.). */
  paymentOrderRun: boolean;
  /** Paid or reconciled so far, in the document currency. Payments aren't built, so 0. */
  appliedAmount: number;
}

export const AP_SERIES: DocumentSeries[] = [
  { id: 'aps-primary', name: 'Primary', prefix: 'BILL-', firstNo: 290001, manual: false, isDefault: true, active: true },
];

/** Payable accounts withholding tax is credited to, by kind. */
export const WITHHOLDING_PAYABLE: Record<string, string> = {
  'Expanded (EWT)': '2340',
  'Final (FWT)': '2345',
  'Withholding VAT': '2330',
  'Percentage tax': '2320',
};

export const newApLine = (patch: Partial<ApLine> = {}): ApLine => {
  const { invoicedQty: _ignored, ...base } = newGrLine();
  return { ...base, baseType: '', bpCatalogNo: '', countryOfOrigin: '', receiptCostLc: 0, ...patch };
};

export function blankApInvoice(today: string, buyer: string): Omit<ApInvoice, 'id'> {
  return {
    vendorId: '',
    vendorCode: '',
    vendorName: '',
    contactId: '',
    vendorRef: '',
    currency: 'PHP',
    seriesId: AP_SERIES[0].id,
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
    project: '',
    indicator: '— None —',
    orderNumber: '',
    references: [],
    buyer,
    owner: buyer,
    remarks: '',
    discountPct: 0,
    freight: 0,
    freightTaxCode: '',
    fxRate: 1,
    controlAccount: '',
    paymentBlock: false,
    maxCashDiscount: false,
    installments: 1,
    consolidatingBpId: '',
    downPayment: 0,
    paymentOrderRun: true,
    appliedAmount: 0,
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// One invoice for every receipt billed in full, at the receipt's prices and rate. They're
// unpaid: payments aren't built yet.

const plusDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const termDays = (termId: string) => SEED_PAYMENT_TERMS.find((t) => t.id === termId)?.days ?? 0;

export const SEED_AP_INVOICES: ApInvoice[] = SEED_GOODS_RECEIPTS.filter((gr) => gr.status === 'Closed').map((gr, n): ApInvoice => {
  // Billed when the receipt was closed, but never before the goods arrived.
  const posting = gr.closeDate && gr.closeDate > gr.postingDate ? gr.closeDate : gr.postingDate;
  const vendor = SEED_PARTNERS.find((p) => p.id === gr.vendorId);
  return {
    ...blankApInvoice(posting, gr.buyer),
    id: `ap-${String(n + 1).padStart(3, '0')}`,
    vendorId: gr.vendorId,
    vendorCode: gr.vendorCode,
    vendorName: gr.vendorName,
    contactId: gr.contactId,
    vendorRef: `SI-${String(40100 + n * 7)}`,
    currency: gr.currency,
    docNum: AP_SERIES[0].firstNo + n,
    status: 'Open',
    dueDate: plusDays(posting, termDays(gr.paymentTermId)),
    shipTo: gr.shipTo,
    payTo: gr.payTo,
    shippingType: gr.shippingType,
    journalRemark: `A/P Invoices – ${gr.vendorCode}`,
    paymentTermId: gr.paymentTermId,
    paymentMethod: gr.paymentMethod,
    project: gr.project,
    orderNumber: gr.orderNumber,
    owner: gr.owner,
    discountPct: gr.discountPct,
    fxRate: gr.fxRate,
    controlAccount: vendor?.payableAccount ?? '2010',
    lines: gr.lines.map((l) => {
      const { invoicedQty: _billed, ...line } = l;
      const item = SEED_ITEMS.find((i) => i.id === l.itemId);
      return {
        ...line,
        id: `al-seed-${l.id}`,
        quantity: l.invoicedQty,
        baseType: 'GRPO' as const,
        baseId: gr.id,
        baseLineId: l.id,
        baseDocNo: `${gr.docNum ? `Primary ${gr.docNum}` : 'Draft'}`,
        bpCatalogNo: item?.vendors.find((v) => v.vendorId === gr.vendorId)?.vendorItemNo ?? '',
        countryOfOrigin: item?.countryOfOrigin ?? '',
        receiptCostLc: l.unitCostLc,
      };
    }),
  };
});
