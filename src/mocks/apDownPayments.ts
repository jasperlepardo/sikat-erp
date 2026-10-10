/**
 * A/P down payment requests (Purchasing › Bills › Down payment requests). What a vendor asks to be
 * paid before it delivers — a percentage of an order. Fields follow the SAP B1 A/P Down Payment
 * Request field map.
 *
 * Settled here, for the prototype:
 * - Item-type only, like the other purchasing documents. Lines are entered by hand or copied from
 *   an open PO; copying doesn't change the PO's quantities.
 * - Adding a request posts nothing and moves no stock: it's only what's owed up front.
 * - It's paid with an outgoing payment, which lists it beside the vendor's open bills. The
 *   payment posts Dr the vendor's down payment account (Advances to Suppliers by default) / Cr the
 *   payment means.
 * - The A/P invoice that bills the goods draws the paid amount (its Total Down Payment), clearing
 *   the advance. The request closes once drawn in full, or when closed by hand.
 * - The A/P Down Payment Invoice (a tax document for the payment) isn't built: VAT on the
 *   advance waits for the A/P invoice, and withholding is shown per line but taken on the invoice.
 * - Installments, distribution rules, commodity classification, serial numbers, the QR code,
 *   Central Bank Ind. and the client's custom print UDFs are left out.
 */
import type { DocumentSeries } from './common';
import { blankApInvoice, newApLine, type ApInvoice, type ApLine } from './apInvoices';

export type DprStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const DPR_STATUSES: DprStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

export interface DprLine extends Omit<ApLine, 'baseType' | 'receiptCostLc' | 'returnedQty'> {
  /** 'PO' when copied from a purchase order. */
  baseType: 'PO' | '';
}

export interface DownPaymentRequest extends Omit<ApInvoice, 'lines' | 'status' | 'downPayment'> {
  status: DprStatus;
  lines: DprLine[];
  /** DPM %: the share of the order requested up front. */
  dpmPct: number;
  /** Paid in PHP so far — the advance the payments put on the vendor's down payment account. */
  paidLc: number;
  /** Drawn on A/P invoices so far, in the document currency. */
  drawnAmount: number;
  /** The down payment account payments post to; the vendor's, or Advances to Suppliers. */
  downPaymentAccount: string;
}

export const DPR_SERIES: DocumentSeries[] = [
  { id: 'dps-primary', name: 'Primary', prefix: '', firstNo: 3, manual: false, isDefault: true, active: true, segments: [{ type: 'literal', value: 'DPR' }, { type: 'year' }, { type: 'sequence', padding: 4 }] },
];
export const ADVANCES_TO_SUPPLIERS = '1150';

export const newDprLine = (patch: Partial<DprLine> = {}): DprLine => {
  const { baseType: _b, receiptCostLc: _r, returnedQty: _q, ...base } = newApLine();
  return { ...base, id: `dl-${crypto.randomUUID().slice(0, 8)}`, baseType: '', ...patch };
};

export function blankDownPaymentRequest(today: string, buyerId: string): Omit<DownPaymentRequest, 'id'> {
  const { downPayment: _d, lines: _l, status: _s, ...base } = blankApInvoice(today, buyerId);
  return { ...base, seriesId: DPR_SERIES[0].id, status: 'Draft', lines: [], dpmPct: 100, paidLc: 0, drawnAmount: 0, downPaymentAccount: ADVANCES_TO_SUPPLIERS };
}

export const SEED_DOWN_PAYMENTS: DownPaymentRequest[] = [];
