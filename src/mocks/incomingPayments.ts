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
import type { Attachment, DocumentSeries } from './common';
import { SEED_AR_INVOICES, SEED_CREDITED, SEED_PAID, SEED_POS_INVOICES, seedArNo, seedNetDue, type ArInvoice } from './arInvoices';
import { cardBrandId, type CARD_BRANDS } from './masters';
import { SALES_MONTHS } from './storeSales';
import { seedRateOn } from './salesOrders';
import type { PoReference } from './purchaseOrders';

export type IncomingType = 'Customer' | 'Account';
export type IncomingStatus = 'Draft' | 'Posted' | 'Cancelled';
export const INCOMING_STATUSES: IncomingStatus[] = ['Draft', 'Posted', 'Cancelled'];

/** One open A/R invoice (or installment of one) in the payment. */
export interface IncomingRow {
  id: string;
  invoiceId: string;
  /** "SI-2026-0002", for display. */
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
  projectId: string;
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
  cardBrandId: string;
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
  projectId: string;
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

export const INCOMING_SERIES: DocumentSeries[] = [
  { id: 'rcs-primary', name: 'Regular', prefix: '', firstNo: 9, manual: false, isDefault: true, active: true, segments: [{ type: 'literal', value: 'RCV' }, { type: 'year' }, { type: 'sequence', padding: 4 }] },
  { id: 'rcs-manual', name: 'Manual', prefix: 'RCV-', firstNo: 1, manual: true, isDefault: false, active: true },
  { id: 'rcs-gcash', name: 'GCash', prefix: '', firstNo: 1, manual: false, isDefault: false, active: true, conditions: [{ field: 'paymentMethod', value: 'GCASH' }], segments: [{ type: 'literal', value: 'GCS' }, { type: 'year' }, { type: 'sequence', padding: 4 }] },
  { id: 'rcs-cash', name: 'Cash', prefix: '', firstNo: 1, manual: false, isDefault: false, active: true, conditions: [{ field: 'paymentMethod', value: 'CASH' }], segments: [{ type: 'literal', value: 'CSH' }, { type: 'year' }, { type: 'sequence', padding: 4 }] },
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
export const newReceivedCard = (patch: Partial<ReceivedCard> = {}): ReceivedCard => ({ cardBrandId: '', last4: '', voucherNo: '', amount: 0, ...patch, id: patch.id ?? rid('rcd') });
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
    projectId: '',
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
    docNo: seedArNo(inv),
    installment: 0,
    installments: 1,
    docDate: inv.postingDate,
    dueDate: inv.dueDate,
    total: due,
    wtAmount: round2(arTotal(inv) - due),
    // Seeded credits all came before the payments.
    balanceDue: round2(due - (SEED_CREDITED[inv.id] ?? 0)),
    blocked: false,
    cashDiscountPct: 0,
    amount,
    invoiceFx: inv.fxRate || 1,
    controlAccount: inv.controlAccount,
    projectId: '',
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
    rows: [row(inv, SEED_PAID[inv.id])],
    means: { ...base.means, ...meansPatch },
    ...patch,
  };
}

const total = (id: string) => SEED_PAID[id];

const PAYMENTS: IncomingPayment[] = [
  customerPayment('rc-001', 1, 'ar-001', { postingDate: '2026-09-18', documentDate: '2026-09-18', dueDate: '2026-09-18', reference: 'CGS-RTGS-0918', remarks: 'Clarkfield, bank transfer to BDO.' }, {
    transfer: { account: '1015', date: '2026-09-18', reference: 'BDO RTGS 2026091800417', amount: total('ar-001') },
  }),
  customerPayment('rc-002', 2, 'ar-002', { postingDate: '2026-09-10', documentDate: '2026-09-10', dueDate: '2026-09-10', reference: 'MPAS-PAY-0910' }, {
    transfer: { account: '1016', date: '2026-09-10', reference: 'BPI InstaPay 51420177', amount: total('ar-002') },
  }),
  customerPayment('rc-003', 3, 'ar-003', { postingDate: '2026-10-02', documentDate: '2026-10-02', dueDate: '2026-10-09', reference: 'NPM-CHK-2026-1002', remarks: 'Half of invoice SI-2026-0003; BIR Form 2307 for the 1% to follow.' }, {
    checks: [newReceivedCheck({ id: 'rc-003-chk1', dueDate: '2026-10-09', amount: total('ar-003'), bank: 'Metrobank', branch: 'Ortigas', accountNo: '7-012-55210-3', checkNo: '0004417' })],
  }),
  customerPayment('rc-005', 5, 'ar-005', { postingDate: '2026-09-22', documentDate: '2026-09-22', dueDate: '2026-09-22', currency: 'USD', fxRate: seedRateOn('USD', '2026-09-22'), reference: 'HBL-TT-0922', remarks: 'Half of USD invoice SI-2026-0004, wired to the BDO USD account. Collected at the 22 Sep rate.' }, {
    transfer: { account: '1018', date: '2026-09-22', reference: 'BDO USD TT 26092200188', amount: total('ar-005') },
  }),
  {
    ...blankIncomingPayment('2026-09-30'),
    id: 'rc-004',
    docNum: 4,
    status: 'Posted',
    type: 'Account',
    journalRemark: 'Incoming – 7010',
    remarks: 'September interest on the BDO operating account.',
    accountRows: [newIncomingAccountRow({ id: 'rc-004-1', account: '7010', remarks: 'Interest income, September 2026', amount: 1842.65 })],
    means: { ...blankIncomingMeans('2026-09-30'), transfer: { account: '1015', date: '2026-09-30', reference: 'BDO interest credit', amount: 1842.65 } },
  },
  // Corporate collections.
  ...([
    ['rc-c01', 'ar-c01', '2026-09-10', '1015', 'BDO RTGS 2026091000288', 'CGS-PAY-0910'],
    ['rc-c02', 'ar-c02', '2026-09-12', '1016', 'BPI InstaPay 51477902', 'MPAS-PAY-0912'],
    ['rc-c04', 'ar-c04', '2026-09-25', '1017', 'UnionBank PESONet 0925-3318', 'GNB-PAY-0925'],
  ] as const).map(([id, inv, date, account, bankRef, reference], k) =>
    customerPayment(id, 6 + k, inv, { postingDate: date, documentDate: date, dueDate: date, reference }, {
      transfer: { account, date, reference: bankRef, amount: total(inv) },
    }),
  ),
  // Clarkfield pays the bundle order's Sales Invoice and Official Receipt together.
  (() => {
    const si = SEED_AR_INVOICES.find((a) => a.id === 'ar-b01-si')!;
    const or = SEED_AR_INVOICES.find((a) => a.id === 'ar-b01-or')!;
    const amount = round2(total(si.id) + total(or.id));
    return {
      ...customerPayment('rc-b01', 9, si.id, { postingDate: '2026-10-08', documentDate: '2026-10-08', dueDate: '2026-10-08', reference: 'CGS-PAY-1008', remarks: 'so-b01 bundle: Sales Invoice and Official Receipt in one transfer.' }, {
        transfer: { account: '1015', date: '2026-10-08', reference: 'BDO RTGS 2026100800361', amount },
      }),
      rows: [row(si, total(si.id)), row(or, total(or.id))],
    };
  })(),
];

// ── POS collections ──────────────────────────────────────────────────────────
// What the stores took at the till each month, settling that month's POS invoices: cash into
// Store Collections, card slips into Card Settlements Receivable, by brand. Banking them is in
// the ledger (the monthly deposits and card settlements).

/** Each brand's share of card sales; cash takes the rest. */
const CARD_MIX: [brand: (typeof CARD_BRANDS)[number], share: number][] = [['Visa', 0.38], ['Mastercard', 0.2], ['American Express', 0.04], ['JCB', 0.02], ['UnionPay', 0.01]];

const POS_COLLECTIONS: IncomingPayment[] = SALES_MONTHS.flatMap((m) => {
  const invoices = SEED_POS_INVOICES.filter((a) => a.postingDate === m.end);
  if (!invoices.length) return [];
  const c = invoices[0];
  const rows = invoices.map((inv) => row(inv, SEED_PAID[inv.id]));
  const total = round2(rows.reduce((n, r) => n + r.amount, 0));
  const cards = CARD_MIX.map(([brand, share]) =>
    newReceivedCard({ id: `rc-pos-${m.month}-${cardBrandId(brand)}`, cardBrandId: cardBrandId(brand), voucherNo: `POS-${m.month.replace('-', '')}-${brand.slice(0, 4).toUpperCase()}`, amount: round2(total * share) }),
  );
  const cash = round2(total - cards.reduce((n, x) => n + x.amount, 0));
  const base = blankIncomingPayment(m.end);
  return [{
    ...base,
    id: `rc-pos-${m.month.replace('-', '')}`,
    status: 'Posted' as const,
    customerId: c.customerId,
    customerCode: c.customerCode,
    customerName: c.customerName,
    billTo: c.billTo,
    contactId: c.contactId,
    controlAccount: c.controlAccount,
    journalRemark: `POS Collections – ${m.month}`,
    reference: `POS-${m.month}`,
    remarks: `Cash and card sales at the stores, ${m.month}: ${invoices.length} store invoices.`,
    rows,
    means: { ...base.means, cash: { ...base.means.cash, amount: cash }, cards },
  }];
});

/** Numbered in date order, like payments added one after another. */
export const SEED_INCOMING_PAYMENTS: IncomingPayment[] = [...PAYMENTS, ...POS_COLLECTIONS]
  .sort((a, b) => a.postingDate.localeCompare(b.postingDate) || a.id.localeCompare(b.id))
  .map((p, n) => ({ ...p, docNum: n + 1 }));
