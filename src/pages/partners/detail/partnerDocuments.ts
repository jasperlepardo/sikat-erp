import type { PartnerRole } from '../../../mocks/partners';
import { taxCodes } from '../../../services/masterData';
import { listPurchaseOrders, poNumber, poTotal } from '../../../services/purchaseOrders';
import { PO_LIST_PATH, STATUS_INTENT } from '../../purchasing/orders/detail/PurchaseOrderDetail';

export type DocType = 'PR' | 'RFQ' | 'PO' | 'SQ' | 'SO';
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
  /** Can be paid from the partner page (purchase orders, until bills exist). */
  payable: boolean;
}

interface DocSource {
  label: string;
  /** Which partners it applies to. */
  role: Extract<PartnerRole, 'vendor' | 'customer'>;
  /** Undefined until the module is built. */
  list?: (partnerId: string) => Promise<PartnerDocument[]>;
}

/** Document types in the order they happen: request, quote, order. */
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
          payable: true,
        }));
    },
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
