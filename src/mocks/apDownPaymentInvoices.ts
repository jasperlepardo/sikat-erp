/**
 * A/P Down Payment Invoices (Purchasing › Bills › Down payment invoices). The posted liability
 * document for a vendor's advance payment — the tax document that follows an A/P Down Payment
 * Request once the request is approved. Unlike the request (which posts nothing), adding an invoice
 * creates a GL entry: Dr Advances to Suppliers / Cr A/P Control Account.
 *
 * Flow: A/P Down Payment Request → A/P Down Payment Invoice → Outgoing Payment → drawn by A/P Invoice.
 */
import type { DocumentSeries } from './common';
import { blankApInvoice, newApLine, type ApInvoice, type ApLine } from './apInvoices';

export type DpiStatus = 'Draft' | 'Not Confirmed' | 'Open' | 'Closed' | 'Cancelled';
export const DPI_STATUSES: DpiStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

export interface DpiLine extends Omit<ApLine, 'baseType' | 'receiptCostLc' | 'returnedQty'> {
  /** 'PO' when copied from a purchase order, 'DPR' when copied from a down payment request. */
  baseType: 'PO' | 'DPR' | '';
}

export interface DownPaymentInvoice extends Omit<ApInvoice, 'lines' | 'status' | 'downPayment'> {
  status: DpiStatus;
  lines: DpiLine[];
  /** DPM %: the share of the order billed. */
  dpmPct: number;
  /** Paid in PHP so far — the advance the payments put on the vendor's down payment account. */
  paidLc: number;
  /** Drawn on A/P invoices so far, in the document currency. */
  drawnAmount: number;
  /** The down payment account. Default: Advances to Suppliers (1150). */
  downPaymentAccount: string;
  /** Source DPR id this invoice was created from, if any. */
  baseDprId?: string;
}

export const DPI_SERIES: DocumentSeries[] = [
  {
    id: 'dpi-primary',
    name: 'Primary',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [
      { type: 'literal', value: 'ADPI' },
      { type: 'year' },
      { type: 'sequence', padding: 4 },
    ],
  },
];

export const ADVANCES_TO_SUPPLIERS = '1150';

export const newDpiLine = (patch: Partial<DpiLine> = {}): DpiLine => {
  const { baseType: _b, receiptCostLc: _r, returnedQty: _q, ...base } = newApLine();
  return { ...base, id: `dil-${crypto.randomUUID().slice(0, 8)}`, baseType: '', ...patch };
};

export function blankDownPaymentInvoice(today: string, buyerId: string): Omit<DownPaymentInvoice, 'id'> {
  const { downPayment: _d, lines: _l, status: _s, ...base } = blankApInvoice(today, buyerId);
  return {
    ...base,
    seriesId: DPI_SERIES[0].id,
    status: 'Draft',
    lines: [],
    dpmPct: 100,
    paidLc: 0,
    drawnAmount: 0,
    downPaymentAccount: ADVANCES_TO_SUPPLIERS,
  };
}

/** @public */
export const SEED_DOWN_PAYMENT_INVOICES: DownPaymentInvoice[] = [];
