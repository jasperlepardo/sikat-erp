import type { PartnerRole } from '../../../mocks/partners';
import { taxCodes } from '../../../services/masterData';
import { listPurchaseOrders, poNumber, poTotal } from '../../../services/purchaseOrders';
import { PO_LIST_PATH, STATUS_INTENT } from '../../purchasing/orders/detail/PurchaseOrderDetail';
import { grNumber, grTotal, listGoodsReceipts } from '../../../services/goodsReceipts';
import { GR_LIST_PATH, GR_STATUS_INTENT } from '../../purchasing/receipts/detail/GoodsReceiptDetail';
import { apNumber, apTotal, listApInvoices } from '../../../services/apInvoices';
import { AP_LIST_PATH, AP_STATUS_INTENT } from '../../purchasing/invoices/detail/ApInvoiceDetail';
import { listPayments, overallAmount, paymentNumber } from '../../../services/outgoingPayments';
import { PAYMENT_LIST_PATH, PAYMENT_STATUS_INTENT } from '../../purchasing/payments/detail/PaymentDetail';

export type DocType = 'PR' | 'RFQ' | 'PO' | 'GRPO' | 'APINV' | 'PAY' | 'SQ' | 'SO';
export type StatusIntent = 'default' | 'primary' | 'warning' | 'success' | 'danger';

/**
 * Any document a partner appears on, in one shape, so the Transactions tab can list them
 * together. Each document type adds a source below.
 */
export interface PartnerDocument {
  id: string;
  type: DocType;
  number: string;
  /** Extra line under the number, e.g. the vendor's reference. */
  subcopy?: string;
  date: string;
  dueDate: string;
  status: string;
  intent: StatusIntent;
  /** Still in progress: not closed, cancelled, or a draft. */
  open: boolean;
  currency: string;
  total: number;
  /** Where the document opens. */
  href: string;
  /** Can be paid from the partner page: open A/P invoices without a payment block. */
  payable: boolean;
}

interface DocSource {
  label: string;
  /** Which partners it applies to. */
  role: Extract<PartnerRole, 'vendor' | 'customer'>;
  /** Undefined until the module is built. */
  list?: (partnerId: string) => Promise<PartnerDocument[]>;
}

/** Document types in the order they happen: request, quote, order, receipt. */
export const DOC_SOURCES: Record<DocType, DocSource> = {
  PR: { label: 'Purchase request', role: 'vendor' },
  RFQ: { label: 'Request for quotation', role: 'vendor' },
  PO: {
    label: 'Purchase order',
    role: 'vendor',
    list: async (partnerId) => {
      const [orders, codes] = await Promise.all([listPurchaseOrders(), taxCodes.list()]);
      return orders
        .filter((po) => po.vendorId === partnerId)
        .map((po) => ({
          id: po.id,
          type: 'PO' as const,
          number: poNumber(po),
          subcopy: po.vendorRef ? `ref. ${po.vendorRef}` : undefined,
          date: po.postingDate,
          dueDate: po.dueDate,
          status: po.status,
          intent: STATUS_INTENT[po.status],
          open: po.status === 'Open' || po.status === 'Not Confirmed',
          currency: po.currency,
          total: poTotal(po, codes),
          href: `${PO_LIST_PATH}/${po.id}`,
          // Bills are paid now, not orders.
          payable: false,
        }));
    },
  },
  GRPO: {
    label: 'Goods receipt PO',
    role: 'vendor',
    list: async (partnerId) => {
      const [receipts, codes] = await Promise.all([listGoodsReceipts(), taxCodes.list()]);
      return receipts
        .filter((gr) => gr.vendorId === partnerId)
        .map((gr) => ({
          id: gr.id,
          type: 'GRPO' as const,
          number: grNumber(gr),
          subcopy: gr.orderNumber ? `PO ${gr.orderNumber}` : undefined,
          date: gr.postingDate,
          dueDate: gr.dueDate,
          status: gr.status,
          intent: GR_STATUS_INTENT[gr.status],
          open: gr.status === 'Open',
          currency: gr.currency,
          total: grTotal(gr, codes),
          href: `${GR_LIST_PATH}/${gr.id}`,
          payable: false,
        }));
    },
  },
  APINV: {
    label: 'A/P invoice',
    role: 'vendor',
    list: async (partnerId) => {
      const [invoices, codes] = await Promise.all([listApInvoices(), taxCodes.list()]);
      return invoices
        .filter((inv) => inv.vendorId === partnerId)
        .map((inv) => ({
          id: inv.id,
          type: 'APINV' as const,
          number: apNumber(inv),
          subcopy: inv.vendorRef ? `ref. ${inv.vendorRef}` : undefined,
          date: inv.postingDate,
          dueDate: inv.dueDate,
          status: inv.status,
          intent: AP_STATUS_INTENT[inv.status],
          open: inv.status === 'Open',
          currency: inv.currency,
          total: apTotal(inv, codes),
          href: `${AP_LIST_PATH}/${inv.id}`,
          payable: !inv.paymentBlock,
        }));
    },
  },
  PAY: {
    label: 'Outgoing payment',
    role: 'vendor',
    list: async (partnerId) =>
      (await listPayments())
        .filter((p) => p.vendorId === partnerId)
        .map((p) => ({
          id: p.id,
          type: 'PAY' as const,
          number: paymentNumber(p),
          subcopy: p.rows.filter((r) => r.selected && r.amount > 0).map((r) => r.docNo).join(', ') || (p.onAccount ? 'On account' : undefined),
          date: p.postingDate,
          dueDate: p.dueDate,
          status: p.status,
          intent: PAYMENT_STATUS_INTENT[p.status],
          open: false,
          currency: p.currency,
          total: overallAmount(p),
          href: `${PAYMENT_LIST_PATH}/${p.id}`,
          payable: false,
        })),
  },
  SQ: { label: 'Sales quotation', role: 'customer' },
  SO: { label: 'Sales order', role: 'customer' },
};

/** The document types that apply to a partner with these roles. */
export const docTypesFor = (roles: PartnerRole[]) =>
  (Object.keys(DOC_SOURCES) as DocType[]).filter((t) => roles.includes(DOC_SOURCES[t].role));

/** Every document of these types for the partner, newest first. */
export async function listPartnerDocuments(partnerId: string, types: DocType[]): Promise<PartnerDocument[]> {
  const lists = await Promise.all(types.map((t) => DOC_SOURCES[t].list?.(partnerId) ?? []));
  return lists.flat().sort((a, b) => b.date.localeCompare(a.date));
}
