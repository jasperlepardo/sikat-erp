/**
 * A/P credit memos (Purchasing › Returns & Debits). The vendor's credit note: what they owe back.
 * Fields follow the SAP B1 A/P Credit Memo field map.
 *
 * Settled here, for the prototype:
 * - Item-type only, like the other purchasing documents.
 * - Lines copy from A/P invoices or goods returns, or are entered by hand. Copying from a goods
 *   receipt isn't offered: an unbilled receipt owes nothing to credit — return it with a goods
 *   return instead.
 * - A line from an invoice either returns the goods (stock out at the invoice's cost) or is a
 *   price adjustment only (the credit comes off the stock's cost while it's on hand, else cost of
 *   sales). A line from a goods return never moves stock — the return already did — and clears
 *   Goods Received Not Invoiced.
 * - A memo from invoices or returns uses the invoice's exchange rate, so it carries no exchange
 *   difference; one entered by hand uses the posting date's rate.
 * - Withholding taken on the invoice is reversed in the same proportion.
 * - When added, the credit is applied to the invoices it came from, up to their balances. Credit
 *   left over stays open (Open Balance) and is applied to the vendor's other open invoices with
 *   Apply credit (SAP's Copy To). Using it in an outgoing payment isn't built yet.
 * - Down payments, deferred tax, distribution rules, commodity classification, serial numbers,
 *   the QR code, Central Bank Ind. and the client's custom print UDFs are left out.
 */
import { blankApInvoice, newApLine, type ApInvoice, type ApLine } from './apInvoices';

export type MemoStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const MEMO_STATUSES: MemoStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

export type MemoBaseType = 'APINV' | 'GRET' | '';

export interface MemoLine extends Omit<ApLine, 'baseType' | 'returnedQty'> {
  baseType: MemoBaseType;
  returnReason: string;
  /** Send the goods back with this line. Off = price adjustment only. Never on for lines from a goods return. */
  returnGoods: boolean;
  /** For a line from a goods return: the A/P invoice behind that return line, if any. */
  invoiceId: string;
}

/** Credit applied to an invoice: by this memo when added, or later with Apply credit. */
export interface CreditApplication {
  invoiceId: string;
  docNo: string;
  amount: number;
  date: string;
}

export interface ApCreditMemo extends Omit<ApInvoice, 'lines' | 'status'> {
  status: MemoStatus;
  lines: MemoLine[];
  applications: CreditApplication[];
}

export const MEMO_SERIES = [{ id: 'cms-primary', name: 'Primary', firstNo: 620001 }];

export const newMemoLine = (patch: Partial<MemoLine> = {}): MemoLine => {
  const { returnedQty: _r, baseType: _b, ...base } = newApLine();
  return { ...base, id: `ml-${crypto.randomUUID().slice(0, 8)}`, baseType: '', returnReason: '', returnGoods: true, invoiceId: '', ...patch };
};

export function blankCreditMemo(today: string, buyer: string): Omit<ApCreditMemo, 'id'> {
  return { ...blankApInvoice(today, buyer), seriesId: MEMO_SERIES[0].id, status: 'Draft', lines: [], applications: [], paymentOrderRun: false };
}

export const SEED_CREDIT_MEMOS: ApCreditMemo[] = [];
