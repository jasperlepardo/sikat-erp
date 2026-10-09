/**
 * Goods returns (Purchasing › Returns & Debits). Goods sent back to a vendor — defective, wrong
 * item, excess. Fields follow the SAP B1 Goods Return field map.
 *
 * Settled here, for the prototype:
 * - Item-type only, like the other purchasing documents (no Item/Service type or Summary type).
 * - Lines copy from goods receipts (goods not yet billed) or A/P invoices (goods already billed),
 *   or are entered by hand. Adding the return takes the stock out at the cost it came in at:
 *   Dr Goods Received Not Invoiced / Cr Inventory.
 * - A line from a receipt only lowers what's left to bill on it — there's nothing to credit, so
 *   it's closed at once. A line from an invoice (or entered by hand) waits for an A/P credit memo
 *   to credit the vendor; the return stays Open until every such line is credited.
 * - A return doesn't reopen the PO: a replacement is a new PO line or a new PO.
 * - Withholding (xWTCode, rate, taxable amount) shows per line for the credit memo to reverse.
 *   The client's custom UDF columns for its BIR print layout (xSupplierName, xAddress,
 *   xTINnumber, xCardType, Customer Description, Amount in Printout, Price for Report) aren't
 *   standard fields and are left out, as are distribution rules, serial numbers, the QR code
 *   and Central Bank Ind.
 */
import type { Attachment, DocumentSeries } from './common';
import { blankGoodsReceipt, newGrLine, type GoodsReceipt, type GrLine } from './goodsReceipts';

export type ReturnStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const RETURN_STATUSES: ReturnStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

/** Return reasons (SAP: Return Reason master). */
export const RETURN_REASONS = ['Defective', 'Damaged in transit', 'Wrong item', 'Excess quantity', 'Expired / near expiry', 'Not as ordered', 'Other'];

export type ReturnBaseType = 'GRPO' | 'APINV' | '';

export interface ReturnLine extends Omit<GrLine, 'invoicedQty' | 'returnedQty'> {
  baseType: ReturnBaseType;
  returnReason: string;
  countryOfOriginCode: string;
  /** Credited so far on A/P credit memos copied from this line. */
  creditedQty: number;
}

export interface GoodsReturn extends Omit<GoodsReceipt, 'lines' | 'status'> {
  status: ReturnStatus;
  lines: ReturnLine[];
  consolidatingBpId: string;
  attachments: Attachment[];
}

export const RETURN_SERIES: DocumentSeries[] = [
  { id: 'rts-primary', name: 'Primary', prefix: 'RTN-', firstNo: 610001, manual: false, isDefault: true, active: true },
];

export const newReturnLine = (patch: Partial<ReturnLine> = {}): ReturnLine => {
  const { invoicedQty: _i, returnedQty: _r, ...base } = newGrLine();
  return { ...base, id: `rl-${crypto.randomUUID().slice(0, 8)}`, baseType: '', returnReason: '', countryOfOriginCode: '', creditedQty: 0, ...patch };
};

export function blankGoodsReturn(today: string, buyerId: string): Omit<GoodsReturn, 'id'> {
  return { ...blankGoodsReceipt(today, buyerId), seriesId: RETURN_SERIES[0].id, status: 'Draft', lines: [], consolidatingBpId: '', attachments: [] };
}

/** A return line only needs crediting when the goods were billed (or it was entered by hand). */
export const needsCredit = (l: Pick<ReturnLine, 'baseType'>) => l.baseType !== 'GRPO';

export const SEED_GOODS_RETURNS: GoodsReturn[] = [];
