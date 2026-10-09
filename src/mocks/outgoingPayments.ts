/**
 * Outgoing payments (Banking › Outgoing Payments). Money paid to a vendor against its open
 * A/P invoices (or on account), or straight to G/L accounts.
 *
 * Settled here, for the prototype:
 * - Payment types are Vendor and Account. Customer refunds need A/R credit memos, which aren't
 *   built, so the Customer type is left out — as are endorsed incoming checks (no check register
 *   yet) and the Payment Wizard.
 * - A vendor payment is in the vendor's currency and lists only open invoices in it. Each invoice
 *   is cleared at the rate it was booked at; paying at another rate makes the realized exchange
 *   gain (7020) or loss (8020) on the payment's journal entry.
 * - Partial payments are allowed; an invoice closes when it's paid in full. Over- and
 *   under-payment allowances aren't applied.
 * - Payment terms carry no cash discount yet, so the discount % is entered per row. A discount
 *   taken goes to Purchase Discounts.
 * - House bank accounts (Banking › Accounts) aren't built, so the cash-flagged accounts in the
 *   chart stand in for them, with the bank details below. Checks are numbered per bank account;
 *   printing and voiding checks wait for Checks for Payment.
 * - Journal entries aren't a module yet, so there's no Transaction No.: the form shows the entry.
 */
import type { Attachment, DocumentSeries } from './common';
import type { PoReference } from './purchaseOrders';

export type PaymentType = 'Vendor' | 'Account';
export type PaymentStatus = 'Draft' | 'Posted' | 'Cancelled';
export const PAYMENT_STATUSES: PaymentStatus[] = ['Draft', 'Posted', 'Cancelled'];

/** One open A/P invoice in the payment, and how much of it this payment settles. */
export interface PaymentRow {
  id: string;
  invoiceId: string;
  /** "Primary 290004", for display. */
  docNo: string;
  /** The vendor's invoice no. */
  vendorRef: string;
  docDate: string;
  dueDate: string;
  /** Net payment due on the invoice (after withholding), document currency. */
  total: number;
  /** Withholding taken off the invoice. */
  wtAmount: number;
  /** Still unpaid when the row was picked. */
  balanceDue: number;
  cashDiscountPct: number;
  /** Total Payment: what this payment puts toward the invoice, before the cash discount. */
  amount: number;
  /** PHP per unit of currency the invoice was booked at — the rate it's cleared at. */
  invoiceFx: number;
  projectId: string;
  /** Ticked for payment. Unticked rows stay listed but aren't paid. */
  selected: boolean;
  /** What the row pays: an A/P invoice (default) or an A/P down payment request. */
  docType?: 'APINV' | 'DPR';
  /** For a down payment request: the account the advance goes to (Advances to Suppliers by default). */
  account?: string;
  /** The row can't be ticked: the document has a payment block. */
  blocked?: boolean;
}

/** One G/L line of an Account payment. */
export interface AccountRow {
  id: string;
  account: string;
  remarks: string;
  amount: number;
  projectId: string;
}

export interface CheckRow {
  id: string;
  /** The house bank account the check is drawn on. */
  account: string;
  dueDate: string;
  manual: boolean;
  /** 0 until added (auto numbering) unless typed for a manual check. */
  checkNo: number;
  endorsable: boolean;
  amount: number;
}

export interface CardRow {
  id: string;
  /** Card brand (Settings › Banking › Card brands). */
  cardBrandId: string;
  account: string;
  voucherNo: string;
  payments: number;
  amount: number;
}

export interface PaymentMeans {
  transfer: { account: string; date: string; reference: string; amount: number };
  cash: { account: string; amount: number };
  checks: CheckRow[];
  cards: CardRow[];
  /** Charged by the bank on top of the payment, in the payment currency. */
  bankCharge: number;
}

export interface OutgoingPayment {
  id: string;
  type: PaymentType;

  // Header
  vendorId: string;
  vendorCode: string;
  /** The vendor's name, or "To order of" for an Account payment. */
  payeeName: string;
  payTo: string;
  contactId: string;
  projectId: string;
  seriesId: string;
  docNum: number;
  status: PaymentStatus;
  postingDate: string;
  documentDate: string;
  /** The due date of the BP row in the journal entry; follows the payment means' dates. */
  dueDate: string;
  reference: string;
  currency: string;
  /** PHP per unit of the payment currency, fixed when posted (1 for PHP). */
  fxRate: number;
  /** Down payment (Pro Forma): a payment on account flagged as an advance. */
  proForma: boolean;
  remarks: string;
  journalRemark: string;
  /** For the part not tied to an invoice: the vendor's payable account by default. */
  controlAccount: string;
  references: PoReference[];
  attachments: Attachment[];

  // Contents
  rows: PaymentRow[];
  /** Payment on account: paid but not matched to any invoice. */
  onAccount: number;
  accountRows: AccountRow[];

  means: PaymentMeans;
  cancelDate: string;
}

export const PAYMENT_SERIES: DocumentSeries[] = [
  { id: 'ops-primary', name: 'Primary', prefix: 'PAY-', firstNo: 510001, manual: false, isDefault: true, active: true },
];

/** House bank details for the cash-flagged bank accounts, until Banking › Accounts is built. */
export const HOUSE_BANKS: Record<string, { bank: string; branch: string; accountNo: string; firstCheckNo: number }> = {
  '1015': { bank: 'BDO Unibank', branch: 'Ortigas Center', accountNo: '0012-3456-7890', firstCheckNo: 100001 },
  '1016': { bank: 'BPI', branch: 'Makati Ayala', accountNo: '3021-0456-77', firstCheckNo: 200001 },
  '1017': { bank: 'UnionBank', branch: 'Pasig Capitol', accountNo: '0001-2233-4455', firstCheckNo: 300001 },
  '1018': { bank: 'BDO Unibank (USD)', branch: 'Ortigas Center', accountNo: '1012-3456-7891', firstCheckNo: 400001 },
};

export const FX_GAIN_ACCOUNT = '7020';
export const FX_LOSS_ACCOUNT = '8020';
export const CASH_DISCOUNT_ACCOUNT = '5060';
export const BANK_CHARGES_ACCOUNT = '6225';
export const CARD_PAYABLE_ACCOUNT = '2035';

const rowId = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

export const newCheckRow = (patch: Partial<CheckRow> = {}): CheckRow => ({
  id: rowId('chk'), account: '1015', dueDate: '', manual: false, checkNo: 0, endorsable: false, amount: 0, ...patch,
});
export const newCardRow = (patch: Partial<CardRow> = {}): CardRow => ({
  id: rowId('crd'), cardBrandId: '', account: CARD_PAYABLE_ACCOUNT, voucherNo: '', payments: 1, amount: 0, ...patch,
});
export const newAccountRow = (patch: Partial<AccountRow> = {}): AccountRow => ({ id: rowId('acr'), account: '', remarks: '', amount: 0, projectId: '', ...patch });

export const blankMeans = (today: string): PaymentMeans => ({
  transfer: { account: '1015', date: today, reference: '', amount: 0 },
  cash: { account: '1011', amount: 0 },
  checks: [],
  cards: [],
  bankCharge: 0,
});

export function blankPayment(today: string): Omit<OutgoingPayment, 'id'> {
  return {
    type: 'Vendor',
    vendorId: '',
    vendorCode: '',
    payeeName: '',
    payTo: '',
    contactId: '',
    projectId: '',
    seriesId: PAYMENT_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: today,
    documentDate: today,
    dueDate: today,
    reference: '',
    currency: 'PHP',
    fxRate: 1,
    proForma: false,
    remarks: '',
    journalRemark: '',
    controlAccount: '',
    references: [],
    attachments: [],
    rows: [],
    onAccount: 0,
    accountRows: [],
    means: blankMeans(today),
    cancelDate: '',
  };
}

/** No payments are seeded: the seeded bills are all unpaid. */
export const SEED_PAYMENTS: OutgoingPayment[] = [];
