/**
 * A/R Down Payment Invoices (Sales › Invoicing › Down payment invoices). The posted document for a
 * customer's advance — the mirror of the A/P down payment invoice. Under IFRS 15, billing before the
 * performance obligation is satisfied recognizes a contract liability, not revenue: adding one posts
 * Dr A/R / Cr Customer Down Payments (2150) + Cr Output VAT. No revenue — that waits for the real
 * A/R invoice, which draws this down.
 *
 * Flow: (Sales order) → A/R Down Payment Invoice → Incoming Payment → drawn by A/R Invoice.
 */
import { CURRENT_USER_ID, type DocumentSeries } from './common';
import { blankArInvoice, newArLine, type ArInvoice, type ArLine } from './arInvoices';

export type DiStatus = 'Draft' | 'Not Confirmed' | 'Open' | 'Closed' | 'Cancelled';
export const DI_STATUSES: DiStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

export interface DiLine extends Omit<ArLine, 'baseType'> {
  /** 'SO' when copied from a sales order. */
  baseType: 'SO' | '';
}

export interface ArDownPaymentInvoice extends Omit<ArInvoice, 'lines' | 'status'> {
  status: DiStatus;
  lines: DiLine[];
  /** DPM %: the share of the order billed in advance. */
  dpmPct: number;
  /** Received in PHP so far — the advance the payments put on the customer's down payment account. */
  paidLc: number;
  /** Drawn on A/R invoices so far, in the document currency. */
  drawnAmount: number;
  /** The down payment account. Default: Customer Down Payments (2150). */
  downPaymentAccount: string;
  /** Source sales order id this invoice was created from, if any. */
  baseSoId?: string;
}

export const DI_SERIES: DocumentSeries[] = [
  {
    id: 'ar-di-primary',
    name: 'A/R Down Payment Invoice',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [
      { type: 'literal', value: 'ARDI' },
      { type: 'year' },
      { type: 'sequence', padding: 4 },
    ],
  },
];

/** IFRS 15 contract liability for customer advances billed before delivery. */
export const CUSTOMER_DOWN_PAYMENTS = '2150';

export const newDiLine = (patch: Partial<DiLine> = {}): DiLine => {
  const { baseType: _b, ...base } = newArLine();
  return { ...base, id: `dil-${crypto.randomUUID().slice(0, 8)}`, baseType: '', ...patch };
};

export function blankArDownPaymentInvoice(today: string, ownerId: string): Omit<ArDownPaymentInvoice, 'id'> {
  const { lines: _l, status: _s, ...base } = blankArInvoice(today, ownerId);
  return {
    ...base,
    seriesId: DI_SERIES[0].id,
    status: 'Draft',
    lines: [],
    dpmPct: 100,
    paidLc: 0,
    drawnAmount: 0,
    downPaymentAccount: CUSTOMER_DOWN_PAYMENTS,
  };
}

/** @public */
export const SEED_AR_DOWN_PAYMENT_INVOICES: ArDownPaymentInvoice[] = [
  {
    ...blankArDownPaymentInvoice('2026-09-10', CURRENT_USER_ID),
    id: 'ardi-001',
    docNum: 1,
    status: 'Open',
    approved: true,
    customerId: 'bp-004',
    customerName: 'Clarkfield Global Services Inc.',
    currency: 'PHP',
    controlAccount: '1120',
    docType: 'Service',
    dpmPct: 60,
    postingDate: '2026-09-10',
    documentDate: '2026-09-10',
    dueDate: '2026-10-10',
    journalRemark: 'A/R Down Payment – Clarkfield Global Services Inc.',
    remarks: '60% mobilization advance before the Clark office IT rollout begins.',
    lines: [newDiLine({ description: '60% mobilization advance — Clark office IT rollout', quantity: 1, unitPrice: 500000, taxCode: 'ZVAT', glAccount: '4030', baseType: '' })],
  },
  {
    ...blankArDownPaymentInvoice('2026-09-22', CURRENT_USER_ID),
    id: 'ardi-002',
    docNum: 2,
    status: 'Open',
    approved: true,
    customerId: 'bp-005',
    customerName: 'Mactan Pixel Animation Studio Inc.',
    currency: 'PHP',
    controlAccount: '1120',
    docType: 'Service',
    dpmPct: 50,
    postingDate: '2026-09-22',
    documentDate: '2026-09-22',
    dueDate: '2026-10-07',
    journalRemark: 'A/R Down Payment – Mactan Pixel Animation Studio Inc.',
    remarks: '50% advance for the render-farm buildout.',
    lines: [newDiLine({ description: '50% advance — render-farm buildout', quantity: 1, unitPrice: 300000, taxCode: 'ZVAT', glAccount: '4030', baseType: '' })],
  },
];
