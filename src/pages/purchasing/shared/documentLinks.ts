import { grNumber, grTotal, listGoodsReceipts } from '../../../services/goodsReceipts';
import { taxCodes } from '../../../services/masterData';
import { listPurchaseOrders, poNumber, poTotal } from '../../../services/purchaseOrders';
import { PO_LIST_PATH, STATUS_INTENT } from '../orders/detail/PurchaseOrderDetail';
import { GR_LIST_PATH, GR_STATUS_INTENT } from '../receipts/detail/GoodsReceiptDetail';
import { AP_LIST_PATH, AP_STATUS_INTENT } from '../invoices/detail/ApInvoiceDetail';
import { apNumber, apTotal, listApInvoices } from '../../../services/apInvoices';
import { listPayments, overallAmount, paymentNumber, rowSettled } from '../../../services/outgoingPayments';
import { PAYMENT_LIST_PATH, PAYMENT_STATUS_INTENT } from '../payments/detail/PaymentDetail';
import { formatAmount } from '../../../services/format';
import { lineage, type LinkedDocument } from './lineage';

export type { LinkedDocument, Relation } from './lineage';

/**
 * Every document type that takes part in copy-from / copy-to. Adding one (purchase request,
 * RFQ, A/P invoice, goods return…) is a new entry in SOURCES whose documents name their bases.
 */
export type DocKind = 'PO' | 'GRPO' | 'APINV' | 'PAY';

/** Lines of a document copied from one base document. */
export interface CoveredLine {
  quantity: number;
  uomCode: string;
  itemNo: string;
}

/** One document in the link graph. */
export interface DocNode {
  kind: DocKind;
  id: string;
  /** "Purchase order", "Goods receipt PO", … */
  type: string;
  number: string;
  href: string;
  date: string;
  status: string;
  intent: 'default' | 'primary' | 'warning' | 'success' | 'danger';
  currency: string;
  total: number;
  /** The documents this one was copied from, with the lines that came from each (or, for a payment, what it paid). */
  bases: { kind: DocKind; id: string; lines: CoveredLine[]; note?: string }[];
}

/** Each document type's documents, as graph nodes. */
const SOURCES: Record<DocKind, () => Promise<DocNode[]>> = {
  // Purchase requests and RFQs aren't built, so POs have no bases yet. When they are, PO lines
  // get a base link and this lists it — the walk below then reaches them from any document.
  PO: async () => {
    const [orders, codes] = await Promise.all([listPurchaseOrders(), taxCodes.list()]);
    return orders.map((po) => ({
      kind: 'PO',
      id: po.id,
      type: 'Purchase order',
      number: poNumber(po),
      href: `${PO_LIST_PATH}/${po.id}`,
      date: po.postingDate,
      status: po.status,
      intent: STATUS_INTENT[po.status],
      currency: po.currency,
      total: poTotal(po, codes),
      bases: [],
    }));
  },
  // Receipt lines are copied from PO lines only.
  GRPO: async () => {
    const [receipts, codes] = await Promise.all([listGoodsReceipts(), taxCodes.list()]);
    return receipts.map((gr) => ({
      kind: 'GRPO',
      id: gr.id,
      type: 'Goods receipt PO',
      number: grNumber(gr),
      href: `${GR_LIST_PATH}/${gr.id}`,
      date: gr.postingDate,
      status: gr.status,
      intent: GR_STATUS_INTENT[gr.status],
      currency: gr.currency,
      total: grTotal(gr, codes),
      bases: [...new Set(gr.lines.map((l) => l.baseId).filter(Boolean))].map((poId) => ({
        kind: 'PO' as const,
        id: poId,
        lines: gr.lines.filter((l) => l.baseId === poId),
      })),
    }));
  },
  // Invoice lines are copied from receipt lines or straight from PO lines.
  APINV: async () => {
    const [invoices, codes] = await Promise.all([listApInvoices(), taxCodes.list()]);
    return invoices.map((inv) => ({
      kind: 'APINV',
      id: inv.id,
      type: 'A/P invoice',
      number: apNumber(inv),
      href: `${AP_LIST_PATH}/${inv.id}`,
      date: inv.postingDate,
      status: inv.status,
      intent: AP_STATUS_INTENT[inv.status],
      currency: inv.currency,
      total: apTotal(inv, codes),
      bases: [...new Map(inv.lines.filter((l) => l.baseType).map((l) => [`${l.baseType}:${l.baseId}`, l])).values()].map((b) => ({
        kind: b.baseType as 'GRPO' | 'PO',
        id: b.baseId,
        lines: inv.lines.filter((l) => l.baseType === b.baseType && l.baseId === b.baseId),
      })),
    }));
  },
  // A payment's bases are the invoices it paid; an Account payment has none.
  PAY: async () =>
    (await listPayments()).map((p) => ({
      kind: 'PAY',
      id: p.id,
      type: p.type === 'Vendor' ? 'Outgoing payment' : 'Outgoing payment (G/L)',
      number: paymentNumber(p),
      href: `${PAYMENT_LIST_PATH}/${p.id}`,
      date: p.postingDate,
      status: p.status,
      intent: PAYMENT_STATUS_INTENT[p.status],
      currency: p.currency,
      total: overallAmount(p),
      bases: p.rows
        .filter((r) => r.selected && r.amount > 0)
        .map((r) => ({ kind: 'APINV' as const, id: r.invoiceId, lines: [], note: `Paid ${p.currency} ${formatAmount(rowSettled(r))}` })),
    })),
};

/** Every document linked to this one, however far back or forward. See `lineage`. */
export async function linkedDocuments(kind: DocKind, id: string): Promise<LinkedDocument[]> {
  const nodes = (await Promise.all(Object.values(SOURCES).map((load) => load()))).flat();
  return lineage(nodes, kind, id);
}
