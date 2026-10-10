import { grNumber, grTotal, listGoodsReceipts } from '../../../services/goodsReceipts';
import { taxCodes } from '../../../services/masterData';
import { listPurchaseOrders, poNumber, poTotal } from '../../../services/purchaseOrders';
import { listPurchaseRequests, prNumber } from '../../../services/purchaseRequests';
import { listRfqs, rfqNumber, rfqTotal } from '../../../services/rfqs';
import { PO_LIST_PATH, STATUS_INTENT } from '../orders/detail/PurchaseOrderDetail';
import { PR_LIST_PATH, STATUS_INTENT as PR_STATUS_INTENT } from '../requests/detail/PurchaseRequestDetail';
import { RFQ_LIST_PATH, STATUS_INTENT as RFQ_STATUS_INTENT } from '../rfqs/detail/RfqDetail';
import { GR_LIST_PATH, GR_STATUS_INTENT } from '../receipts/detail/GoodsReceiptDetail';
import { AP_LIST_PATH, AP_STATUS_INTENT } from '../invoices/detail/ApInvoiceDetail';
import { apNumber, apTotal, listApInvoices } from '../../../services/apInvoices';
import { listPayments, overallAmount, paymentNumber, rowSettled } from '../../../services/outgoingPayments';
import { PAYMENT_LIST_PATH, PAYMENT_STATUS_INTENT } from '../payments/detail/PaymentDetail';
import { formatAmount } from '../../../services/format';
import { listGoodsReturns, returnNumber, returnTotal } from '../../../services/goodsReturns';
import { listCreditMemos, memoNumber, memoTotal } from '../../../services/apCreditMemos';
import { RETURN_STATUS_INTENT } from '../returns/GoodsReturnDetail';
import { MEMO_LIST_PATH, MEMO_STATUS_INTENT, RETURN_LIST_PATH } from '../returns/types';
import { dprNumber, dprTotal, listDownPayments } from '../../../services/apDownPayments';
import { DPR_LIST_PATH, DPR_STATUS_INTENT } from '../down-payments/DprDetail';
import { lineage, type LinkedDocument } from './lineage';

export type { LinkedDocument, Relation } from './lineage';

export type DocKind = 'PR' | 'RFQ' | 'PO' | 'GRPO' | 'APINV' | 'PAY' | 'GRET' | 'APCM' | 'DPR';

/** Lines of a document copied from one base document. */
export interface CoveredLine {
  quantity: number;
  uomCode: string;
  itemNo: string;
}

/** One document in the link graph. */
export interface DocNode {
  kind: string;
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
  bases: { kind: string; id: string; lines: CoveredLine[]; note?: string }[];
}

/** Each document type's documents, as graph nodes. */
const SOURCES: Record<DocKind, () => Promise<DocNode[]>> = {
  PR: async () => {
    const requests = await listPurchaseRequests();
    return requests.map((pr) => ({
      kind: 'PR' as const,
      id: pr.id,
      type: 'Purchase request',
      number: pr.docNum ? prNumber(pr) : pr.id,
      href: `${PR_LIST_PATH}/${pr.docNum ? prNumber(pr) : pr.id}`,
      date: pr.postingDate,
      status: pr.status,
      intent: PR_STATUS_INTENT[pr.status],
      currency: 'PHP',
      total: 0,
      bases: [],
    }));
  },

  RFQ: async () => {
    const [rfqList, codes] = await Promise.all([listRfqs(), taxCodes.list()]);
    return rfqList.map((rfq) => ({
      kind: 'RFQ' as const,
      id: rfq.id,
      type: 'Purchase quotation',
      number: rfq.docNum ? rfqNumber(rfq) : rfq.id,
      href: `${RFQ_LIST_PATH}/${rfq.docNum ? rfqNumber(rfq) : rfq.id}`,
      date: rfq.postingDate,
      status: rfq.status,
      intent: RFQ_STATUS_INTENT[rfq.status],
      currency: rfq.currency,
      total: rfqTotal(rfq, codes),
      bases: rfq.basePrId ? [{ kind: 'PR' as const, id: rfq.basePrId, lines: [] }] : [],
    }));
  },

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
      bases: po.baseRfqId ? [{ kind: 'RFQ' as const, id: po.baseRfqId, lines: [] }] : [],
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
      bases: [
        ...[...new Map(inv.lines.filter((l) => l.baseType).map((l) => [`${l.baseType}:${l.baseId}`, l])).values()].map((b) => ({
          kind: b.baseType as DocKind,
          id: b.baseId,
          lines: inv.lines.filter((l) => l.baseType === b.baseType && l.baseId === b.baseId),
        })),
        // Down payments it drew count as bases too: the advance came before the bill.
        ...(inv.drawnDownPayments ?? []).map((d) => ({ kind: 'DPR' as const, id: d.requestId, lines: [], note: `Drew ${inv.currency} ${formatAmount(d.amount)}` })),
      ],
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
        .map((r) => ({ kind: (r.docType === 'DPR' ? 'DPR' : 'APINV') as DocKind, id: r.invoiceId, lines: [], note: `Paid ${p.currency} ${formatAmount(rowSettled(r))}` })),
    })),
  // Return lines come from receipt lines (unbilled goods) or invoice lines (billed goods).
  GRET: async () => {
    const [returns, codes] = await Promise.all([listGoodsReturns(), taxCodes.list()]);
    return returns.map((r) => ({
      kind: 'GRET',
      id: r.id,
      type: 'Goods return',
      number: returnNumber(r),
      href: `${RETURN_LIST_PATH}/${r.id}`,
      date: r.postingDate,
      status: r.status,
      intent: RETURN_STATUS_INTENT[r.status],
      currency: r.currency,
      total: returnTotal(r, codes),
      bases: [...new Map(r.lines.filter((l) => l.baseType).map((l) => [`${l.baseType}:${l.baseId}`, l])).values()].map((b) => ({
        kind: (b.baseType === 'GRPO' ? 'GRPO' : 'APINV') as DocKind,
        id: b.baseId,
        lines: r.lines.filter((l) => l.baseType === b.baseType && l.baseId === b.baseId),
      })),
    }));
  },
  // Credit memo lines come from invoice lines or goods return lines.
  APCM: async () => {
    const [memos, codes] = await Promise.all([listCreditMemos(), taxCodes.list()]);
    return memos.map((m) => ({
      kind: 'APCM',
      id: m.id,
      type: 'A/P credit memo',
      number: memoNumber(m),
      href: `${MEMO_LIST_PATH}/${m.id}`,
      date: m.postingDate,
      status: m.status,
      intent: MEMO_STATUS_INTENT[m.status],
      currency: m.currency,
      total: memoTotal(m, codes),
      bases: [...new Map(m.lines.filter((l) => l.baseType).map((l) => [`${l.baseType}:${l.baseId}`, l])).values()].map((b) => ({
        kind: (b.baseType === 'GRET' ? 'GRET' : 'APINV') as DocKind,
        id: b.baseId,
        lines: m.lines.filter((l) => l.baseType === b.baseType && l.baseId === b.baseId),
      })),
    }));
  },
  // A down payment request is figured on PO lines.
  DPR: async () => {
    const [requests, codes] = await Promise.all([listDownPayments(), taxCodes.list()]);
    return requests.map((d) => ({
      kind: 'DPR',
      id: d.id,
      type: 'A/P down payment request',
      number: dprNumber(d),
      href: `${DPR_LIST_PATH}/${d.id}`,
      date: d.postingDate,
      status: d.status,
      intent: DPR_STATUS_INTENT[d.status],
      currency: d.currency,
      total: dprTotal(d, codes),
      bases: [...new Set(d.lines.filter((l) => l.baseType).map((l) => l.baseId))].map((poId) => ({
        kind: 'PO' as const,
        id: poId,
        lines: d.lines.filter((l) => l.baseId === poId),
      })),
    }));
  },
};

/** Every document linked to this one, however far back or forward. See `lineage`. */
export async function linkedDocuments(kind: DocKind, id: string): Promise<LinkedDocument[]> {
  const nodes = (await Promise.all(Object.values(SOURCES).map((load) => load()))).flat();
  return lineage(nodes, kind, id);
}
