import { grNumber, grTotal, listGoodsReceipts } from '../../../services/goodsReceipts';
import { cachedUntilChange } from '../../../services/store';
import { taxCodes } from '../../../services/masterData';
import { listPurchaseOrders, poNumber, poTotal } from '../../../services/purchaseOrders';
import { listPurchaseRequests, prNumber } from '../../../services/purchaseRequests';
import { listRfqs, rfqNumber, rfqTotal } from '../../../services/rfqs';
import { PO_LIST_PATH, STATUS_INTENT } from '../purchase-orders/detail/PurchaseOrderDetail';
import { PR_LIST_PATH, STATUS_INTENT as PR_STATUS_INTENT } from '../purchase-requests/detail/PurchaseRequestDetail';
import { RFQ_LIST_PATH, STATUS_INTENT as RFQ_STATUS_INTENT } from '../purchase-quotations/detail/PurchaseQuotationDetail';
import { GR_LIST_PATH, GR_STATUS_INTENT } from '../goods-receipts/detail/GoodsReceiptDetail';
import { AP_LIST_PATH, AP_STATUS_INTENT } from '../vendor-invoices/detail/ApInvoiceDetail';
import { apNumber, apTotal, listApInvoices } from '../../../services/apInvoices';
import { APRI_LIST_PATH, AP_RI_STATUS_INTENT } from '../reserve-invoices/detail/ApReserveInvoiceDetail';
import { apRiNumber, apRiTotals, listApReserveInvoices } from '../../../services/apReserveInvoices';
import { listPayments, overallAmount, paymentNumber, rowSettled } from '../../../services/outgoingPayments';
import { PAYMENT_LIST_PATH, PAYMENT_STATUS_INTENT } from '../payments-made/detail/PaymentDetail';
import { formatAmount } from '../../../services/format';
import { listGoodsReturns, returnNumber, returnTotal } from '../../../services/goodsReturns';
import { listCreditMemos, memoNumber, memoTotal } from '../../../services/apCreditMemos';
import { RETURN_STATUS_INTENT } from './returnsTypes';
import { MEMO_LIST_PATH, MEMO_STATUS_INTENT, RETURN_LIST_PATH } from './returnsTypes';
import { dprNumber, dprTotal, listDownPayments } from '../../../services/apDownPayments';
import { DPR_LIST_PATH, DPR_STATUS_INTENT } from '../down-payment-requests/detail/DprDetail';
import { listPurchaseBlanketAgreements, pbaNumber, pbaTotals } from '../../../services/purchaseBlanketAgreements';
import { PBA_LIST_PATH, PBA_STATUS_INTENT } from '../purchase-agreements/PurchaseBlanketAgreementList';
import { listLandedCosts, lcNumber, lcTotals } from '../../../services/landedCosts';
import { LC_LIST_PATH, LC_STATUS_INTENT } from '../landed-costs/detail/types';
import { lineage, type LinkedDocument } from './lineage';

export type { LinkedDocument, Relation } from './lineage';

export type DocKind = 'PR' | 'RFQ' | 'PO' | 'GRPO' | 'APINV' | 'APRI' | 'PAY' | 'GRET' | 'APCM' | 'DPR' | 'PBA' | 'LC';

/** Lines of a document copied from one base document. */
export interface CoveredLine {
  quantity: number;
  uomCode: string;
  itemNo: string;
  description?: string;
  /** The item's id, for finding the documents an item is on. */
  itemId?: string;
}

/** A document's lines as covered lines: what it moves, for item timelines. */
export const coveredLines = (lines: { itemId: string; itemNo: string; description?: string; uomCode: string; quantity?: number }[]): CoveredLine[] =>
  lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, itemNo: l.itemNo, description: l.description, uomCode: l.uomCode, quantity: l.quantity ?? 0 }));

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
  /** The vendor or customer on it; '' when it has none (a purchase request, a G/L payment). */
  partnerId: string;
  /** Its item lines. */
  items: CoveredLine[];
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
      partnerId: '',
      items: coveredLines(pr.lines),
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
      partnerId: rfq.vendorId,
      items: coveredLines(rfq.lines),
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
      partnerId: po.vendorId,
      items: coveredLines(po.lines),
      bases: [
        ...(po.baseRfqId ? [{ kind: 'RFQ' as const, id: po.baseRfqId, lines: [] }] : []),
        ...[...new Set(po.lines.map((l) => l.agreementId).filter(Boolean))].map((id) => ({
          kind: 'PBA' as const,
          id,
          lines: [] as CoveredLine[],
        })),
      ],
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
      partnerId: gr.vendorId,
      items: coveredLines(gr.lines),
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
      partnerId: inv.vendorId,
      items: coveredLines(inv.lines),
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
  APRI: async () => {
    const [invoices, codes] = await Promise.all([listApReserveInvoices(), taxCodes.list()]);
    return invoices.map((inv) => ({
      kind: 'APRI' as const,
      id: inv.id,
      type: 'A/P reserve invoice',
      number: apRiNumber(inv),
      href: `${APRI_LIST_PATH}/${inv.id}`,
      date: inv.postingDate,
      status: inv.status,
      intent: AP_RI_STATUS_INTENT[inv.status],
      currency: inv.currency,
      total: apRiTotals(inv, (code) => { const c = codes.find((x) => x.code === code); return c?.rates?.[0]?.rate ?? 0; }).total,
      partnerId: inv.vendorId,
      items: coveredLines(inv.lines),
      bases: [...new Map(inv.lines.filter((l) => l.baseType).map((l) => [`${l.baseType}:${l.baseId}`, l])).values()].map((b) => ({
        kind: 'PO' as DocKind,
        id: b.baseId,
        lines: inv.lines.filter((l) => l.baseId === b.baseId),
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
      partnerId: p.vendorId ?? '',
      items: [],
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
      partnerId: r.vendorId,
      items: coveredLines(r.lines),
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
      partnerId: m.vendorId,
      items: coveredLines(m.lines),
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
      partnerId: d.vendorId,
      items: coveredLines(d.lines),
      bases: [...new Set(d.lines.filter((l) => l.baseType).map((l) => l.baseId))].map((poId) => ({
        kind: 'PO' as const,
        id: poId,
        lines: d.lines.filter((l) => l.baseId === poId),
      })),
    }));
  },

  PBA: async () => {
    const pbas = await listPurchaseBlanketAgreements();
    return pbas.map((pba) => ({
      kind: 'PBA' as const,
      id: pba.id,
      type: 'Purchase blanket agreement',
      number: pba.docNum ? pbaNumber(pba) : pba.id,
      href: `${PBA_LIST_PATH}/${pba.docNum ? pbaNumber(pba) : pba.id}`,
      date: pba.startDate,
      status: pba.status,
      intent: PBA_STATUS_INTENT[pba.status],
      currency: pba.currency,
      total: pbaTotals(pba).plannedTotal,
      partnerId: pba.vendorId,
      items: [],
      bases: [],
    }));
  },

  LC: async () => {
    const docs = await listLandedCosts();
    return docs.map((lc) => ({
      kind: 'LC' as const,
      id: lc.id,
      type: 'Landed costs',
      number: lc.docNum ? lcNumber(lc) : lc.id,
      href: `${LC_LIST_PATH}/${lc.docNum ? lcNumber(lc) : lc.id}`,
      date: lc.postingDate,
      status: lc.status,
      intent: LC_STATUS_INTENT[lc.status],
      currency: lc.currency,
      total: lcTotals(lc.costs),
      partnerId: lc.vendorId,
      items: coveredLines(lc.lines),
      bases: [...new Set(lc.lines.map((l) => l.baseId))].map((grId) => ({
        kind: 'GRPO' as const,
        id: grId,
        lines: coveredLines(lc.lines.filter((l) => l.baseId === grId)),
      })),
    }));
  },
};

/**
 * Every purchasing document, as graph nodes. Built once and shared until any collection changes (the
 * Activity tabs, document flows and CRM › Activities all ask for it), so treat the nodes as read-only.
 */
const allPurchaseDocNodes = cachedUntilChange(async () => (await Promise.all(Object.values(SOURCES).map((load) => load()))).flat());

export async function purchaseDocNodes(): Promise<DocNode[]> {
  return [...(await allPurchaseDocNodes())];
}

/** Every document linked to this one, however far back or forward. See `lineage`. */
export async function linkedDocuments(kind: DocKind, id: string): Promise<LinkedDocument[]> {
  return lineage(await purchaseDocNodes(), kind, id);
}
