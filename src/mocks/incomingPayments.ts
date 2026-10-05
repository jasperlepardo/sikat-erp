/**
 * Incoming payments (Sales › Payments Received; SAP: Banking › Incoming Payments). Money received
 * from a customer against its open A/R invoices (or on account), or posted straight to G/L
 * accounts. Fields follow the SAP B1 Incoming Payments field map.
 *
 * Settled here, for the prototype:
 * - Payment types are Customer and Account. Vendor refunds settle A/P credit memos, which belong
 *   to the purchasing module, so the Vendor type is left out for now.
 * - The payment means decide the debit: a bank transfer goes straight to the bank account; cash
 *   and checks go to Cash on Hand – Store Collections and cards to Card and E-wallet Settlements
 *   Receivable, as clearing accounts until a deposit (Banking › Deposits, not built yet). The chart
 *   has no separate checks-received account, so checks share the store collections account.
 * - Invoices with installments list one row per installment, oldest first. An invoice closes when
 *   its balance is paid in full; paying only some installments leaves it open.
 * - Each invoice is cleared at the rate it was booked at; collecting at another rate makes the
 *   realized exchange gain (7020) or loss (8020). A cash discount taken goes to Sales Discounts.
 * - Allowed difference: a gap of up to INCOMING_DIFF_ALLOWED pesos between what's received and
 *   what's due posts to Other Income (overpaid) or Miscellaneous Expense (underpaid). A bigger gap
 *   is the Open Balance and blocks adding — pay on account or change Total Payment instead.
 * - Created By Payment Wizard is always No (the wizard isn't built), payment order runs don't
 *   exist, and branches aren't enabled, so those fields show but don't change anything.
 */
import type { Attachment } from './common';
import { SEED_AR_INVOICES, seedNetDue, type ArInvoice } from './arInvoices';
import type { PoReference } from './purchaseOrders';

export type IncomingType = 'Customer' | 'Account';
export type IncomingStatus = 'Draft' | 'Posted' | 'Cancelled';
export const INCOMING_STATUSES: IncomingStatus[] = ['Draft', 'Posted', 'Cancelled'];

/** One open A/R invoice (or installment of one) in the payment. */
export interface IncomingRow {
  id: string;
  invoiceId: string;
  /** "Primary 430002", for display. */
  docNo: string;
  /** Installment number, or 0 for an invoice without installments. */
  installment: number;
  installments: number;
  docDate: string;
  dueDate: string;
  /** What the invoice (or installment) asks for, net of withholding, document currency. */
  total: number;
  /** Withholding the customer took off the invoice. */
  wtAmount: number;
  /** Still unpaid when the row was listed. */
  balanceDue: number;
  blocked: boolean;
  cashDiscountPct: number;
  /** Total Payment: what this payment puts toward it, before the cash discount. */
  amount: number;
  /** PHP per unit the invoice was booked at — the rate it's cleared at. */
  invoiceFx: number;
  /** The invoice's A/R account — what the payment credits. */
  controlAccount: string;
  project: string;
  selected: boolean;
}

export interface IncomingAccountRow {
  id: string;
  account: string;
  /** Doc. Remarks: what the amount is for. */
  remarks: string;
  amount: number;
}

/** A customer's check received. */
export interface ReceivedCheck {
  id: string;
  dueDate: string;
  amount: number;
  /** The customer's bank, branch, account and check number, as printed on the check. */
  bank: string;
  branch: string;
  accountNo: string;
  checkNo: string;
  endorsed: boolean;
}

export interface ReceivedCard {
  id: string;
  /** Card brand (Settings › Banking › Card brands). */
  card: string;
  /** Last four digits only. */
  last4: string;
  voucherNo: string;
  amount: number;
}

export interface IncomingMeans {
  transfer: { account: string; date: string; reference: string; amount: number };
  cash: { account: string; amount: number };
  checks: ReceivedCheck[];
  /** The clearing account checks post to until they're deposited. */
  checkAccount: string;
  cards: ReceivedCard[];
  cardAccount: string;
}

export interface IncomingPayment {
  id: string;
  type: IncomingType;

  // Header
  customerId: string;
  customerCode: string;
  /** Editable on the payment, as SAP allows. */
  customerName: string;
  billTo: string;
  contactId: string;
  project: string;
  blanketAgreement: string;
  seriesId: string;
  /** Auto-numbered, or typed for the Manual series. */
  docNum: number;
  status: IncomingStatus;
  postingDate: string;
  documentDate: string;
  /** The BP row's due date in the journal entry; follows the payment means' dates. */
  dueDate: string;
  /** The customer's reference for this payment. */
  reference: string;
  /** The journal entry's number, once added. */
  transNo: number;
  currency: string;
  fxRate: number;
  remarks: string;
  journalRemark: string;
  /** For the part not tied to an invoice (on account): the customer's A/R account by default. */
  controlAccount: string;
  createdByWizard: boolean;
  references: PoReference[];
  attachments: Attachment[];

  // Contents
  rows: IncomingRow[];
  onAccount: number;
  /** Add in Sequence: spread the amount received over the documents in table order. */
  addInSequence: boolean;
  accountRows: IncomingAccountRow[];

  means: IncomingMeans;
  cancelDate: string;
}

export const INCOMING_SERIES = [
  { id: 'rcs-primary', name: 'Primary', firstNo: 440001, manual: false },
  { id: 'rcs-manual', name: 'Manual', firstNo: 1, manual: true },
];

/** Bank accounts a transfer can land in (the cash-flagged bank accounts). */
export const RECEIPT_BANK_DEFAULT = '1015';
export const CASH_CLEARING_ACCOUNT = '1012';
export const CHECK_CLEARING_ACCOUNT = '1012';
export const CARD_CLEARING_ACCOUNT = '1130';
export const SALES_DISCOUNT_ACCOUNT = '4050';
export const OVERPAYMENT_ACCOUNT = '7030';
export const UNDERPAYMENT_ACCOUNT = '6390';
export const FX_GAIN_ACCOUNT = '7020';
export const FX_LOSS_ACCOUNT = '8020';
/** Incoming Amt Diff. Allowed (pesos). */
export const INCOMING_DIFF_ALLOWED = 1;

const rid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

export const newReceivedCheck = (patch: Partial<ReceivedCheck> = {}): ReceivedCheck => ({
  dueDate: '', amount: 0, bank: '', branch: '', accountNo: '', checkNo: '', endorsed: false, ...patch, id: patch.id ?? rid('rck'),
});
export const newReceivedCard = (patch: Partial<ReceivedCard> = {}): ReceivedCard => ({ card: '', last4: '', voucherNo: '', amount: 0, ...patch, id: patch.id ?? rid('rcd') });
export const newIncomingAccountRow = (patch: Partial<IncomingAccountRow> = {}): IncomingAccountRow => ({ account: '', remarks: '', amount: 0, ...patch, id: patch.id ?? rid('iar') });

export const blankIncomingMeans = (today: string): IncomingMeans => ({
  transfer: { account: RECEIPT_BANK_DEFAULT, date: today, reference: '', amount: 0 },
  cash: { account: CASH_CLEARING_ACCOUNT, amount: 0 },
  checks: [],
  checkAccount: CHECK_CLEARING_ACCOUNT,
  cards: [],
  cardAccount: CARD_CLEARING_ACCOUNT,
});

export function blankIncomingPayment(today: string): Omit<IncomingPayment, 'id'> {
  return {
    type: 'Customer',
    customerId: '',
    customerCode: '',
    customerName: '',
    billTo: '',
    contactId: '',
    project: '',
    blanketAgreement: '',
    seriesId: INCOMING_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: today,
    documentDate: today,
    dueDate: today,
    reference: '',
    transNo: 0,
    currency: 'PHP',
    fxRate: 1,
    remarks: '',
    journalRemark: '',
    controlAccount: '',
    createdByWizard: false,
    references: [],
    attachments: [],
    rows: [],
    onAccount: 0,
    addInSequence: false,
    accountRows: [],
    means: blankIncomingMeans(today),
    cancelDate: '',
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// The payments behind the seeded invoices' applied amounts. History, so no journal entries.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A payment row settling `amount` of a seeded invoice. */
function row(inv: ArInvoice, amount: number): IncomingRow {
  const due = seedNetDue(inv);
  return {
    id: `${inv.id}-1`,
    invoiceId: inv.id,
    docNo: `Primary ${inv.docNum}`,
    installment: 0,
    installments: 1,
    docDate: inv.postingDate,
    dueDate: inv.dueDate,
    total: due,
    wtAmount: round2(arTotal(inv) - due),
    balanceDue: due,
    blocked: false,
    cashDiscountPct: 0,
    amount,
    invoiceFx: 1,
    controlAccount: inv.controlAccount,
    project: '',
    selected: true,
  };
}
/** The invoice's total before withholding. */
const arTotal = (inv: ArInvoice) =>
  round2(inv.lines.reduce((n, l) => {
    const net = round2(l.quantity * l.unitPrice * (1 - l.discountPct / 100));
    return n + net + round2((net * (l.taxCode === '31' ? 12 : 0)) / 100);
  }, 0));

function customerPayment(id: string, docNum: number, invoiceId: string, patch: Partial<IncomingPayment>, meansPatch: Partial<IncomingMeans>): IncomingPayment {
  const inv = SEED_AR_INVOICES.find((a) => a.id === invoiceId)!;
  const base = blankIncomingPayment(patch.postingDate ?? inv.postingDate);
  return {
    ...base,
    id,
    docNum,
    status: 'Posted',
    customerId: inv.customerId,
    customerCode: inv.customerCode,
    customerName: inv.customerName,
    billTo: inv.billTo,
    contactId: inv.contactId,
    controlAccount: inv.controlAccount,
    journalRemark: `Incoming - ${inv.customerCode}`,
    rows: [row(inv, inv.appliedAmount)],
    means: { ...base.means, ...meansPatch },
    ...patch,
  };
}

const total = (id: string) => SEED_AR_INVOICES.find((a) => a.id === id)!.appliedAmount;

export const SEED_INCOMING_PAYMENTS: IncomingPayment[] = [
  customerPayment('rc-001', 440001, 'ar-001', { postingDate: '2026-09-18', documentDate: '2026-09-18', dueDate: '2026-09-18', reference: 'CGS-RTGS-0918', remarks: 'Clarkfield, bank transfer to BDO.' }, {
    transfer: { account: '1015', date: '2026-09-18', reference: 'BDO RTGS 2026091800417', amount: total('ar-001') },
  }),
  customerPayment('rc-002', 440002, 'ar-002', { postingDate: '2026-09-10', documentDate: '2026-09-10', dueDate: '2026-09-10', reference: 'MPAS-PAY-0910' }, {
    transfer: { account: '1016', date: '2026-09-10', reference: 'BPI InstaPay 51420177', amount: total('ar-002') },
  }),
  customerPayment('rc-003', 440003, 'ar-003', { postingDate: '2026-10-02', documentDate: '2026-10-02', dueDate: '2026-10-09', reference: 'NPM-CHK-2026-1002', remarks: 'Half of invoice 430003; BIR Form 2307 for the 1% to follow.' }, {
    checks: [newReceivedCheck({ id: 'rc-003-chk1', dueDate: '2026-10-09', amount: total('ar-003'), bank: 'Metrobank', branch: 'Ortigas', accountNo: '7-012-55210-3', checkNo: '0004417' })],
  }),
  {
    ...blankIncomingPayment('2026-09-30'),
    id: 'rc-004',
    docNum: 440004,
    status: 'Posted',
    type: 'Account',
    journalRemark: 'Incoming – 7010',
    remarks: 'September interest on the BDO operating account.',
    accountRows: [newIncomingAccountRow({ id: 'rc-004-1', account: '7010', remarks: 'Interest income, September 2026', amount: 1842.65 })],
    means: { ...blankIncomingMeans('2026-09-30'), transfer: { account: '1015', date: '2026-09-30', reference: 'BDO interest credit', amount: 1842.65 } },
  },
];
