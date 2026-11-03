import { listPurchaseOrders, openQty as poOpenQty, poNumber } from '../../../../services/purchaseOrders';
import { lineNet } from '../../../../services/lineMath';
import type { StatusIntent } from '../../../partners/detail/partnerDocuments';
import { grNumber, listGoodsReceipts } from '../../../../services/goodsReceipts';
import { apNumber, listApInvoices } from '../../../../services/apInvoices';
import { listGoodsReturns, returnNumber } from '../../../../services/goodsReturns';
import { listCreditMemos, memoNumber } from '../../../../services/apCreditMemos';
import { listPurchaseRequests, prNumber } from '../../../../services/purchaseRequests';
import { listRfqs, rfqNumber } from '../../../../services/rfqs';
import { listQuotations, qtNumber } from '../../../../services/quotations';
import { listSalesOrders, openQty as soOpenQty, soNumber } from '../../../../services/salesOrders';
import { dnNumber, listDeliveries } from '../../../../services/deliveries';
import { arNumber, listArInvoices } from '../../../../services/arInvoices';
import type { Draft } from './types';
import {
  AP_LIST_PATH,
  AP_STATUS_INTENT,
  GR_LIST_PATH,
  GR_STATUS_INTENT,
  MEMO_LIST_PATH,
  MEMO_STATUS_INTENT,
  PO_LIST_PATH,
  PO_STATUS_INTENT,
  PR_LIST_PATH,
  PR_STATUS_INTENT,
  RETURN_LIST_PATH,
  RETURN_STATUS_INTENT,
  RFQ_LIST_PATH,
  RFQ_STATUS_INTENT,
} from '../../../purchasing/paths';
import { AR_LIST_PATH, AR_STATUS_INTENT, DN_LIST_PATH, DN_STATUS_INTENT, QT_LIST_PATH, QT_STATUS_INTENT, SO_LIST_PATH, SO_STATUS_INTENT } from '../../../sales/paths';

/** The document types an item's rows can be on, in the order they happen: purchasing, then sales. */
export type ItemDocType = 'PR' | 'RFQ' | 'PO' | 'GRPO' | 'APINV' | 'GRET' | 'APCM' | 'QT' | 'SO' | 'DN' | 'ARINV';

/**
 * A document row the item is on, in one shape, so the Transactions tab can list them together.
 * One per row: a document with the item on two rows shows twice.
 */
export interface ItemDocument {
  id: string;
  /** The item this row belongs to — useful when aggregating across variants. */
  itemId: string;
  type: ItemDocType;
  number: string;
  /** Extra line under the number: the partner (or, on a purchase request, the requester). */
  subcopy?: string;
  date: string;
  /** When the row is due: delivered, or (a request or quotation) needed or valid until. */
  dueDate: string;
  status: string;
  intent: StatusIntent;
  /**
   * Still expecting a delivery: an order in progress with quantity left on the row. Only orders are
   * open — a request or quotation is followed by an order, and receipts, deliveries and invoices are done.
   */
  open: boolean;
  /** Which way the open quantity moves: in from a vendor (purchase order) or out to a customer (sales order). */
  direction: 'in' | 'out';
  /** In the row's unit. */
  quantity: number;
  openQty: number;
  uom: string;
  /** Open quantity in the item's inventory unit, so rows in different units add up. */
  openInventoryQty: number;
  currency: string;
  unitPrice: number;
  /** Row total after its discount; before the document discount and tax. */
  total: number;
  /** Where the document opens. */
  href: string;
}

interface Line {
  id: string;
  itemId: string;
  quantity: number;
  uomCode: string;
  uomName: string;
  itemsPerUnit: number;
  unitPrice: number;
  discountPct: number;
}

/** A closed row: nothing on it is still expected. */
const row = (
  type: ItemDocType,
  doc: { id: string; number: string; subcopy: string; date: string; dueDate: string; status: string; intent: StatusIntent; currency: string; href: string },
  l: Line,
  direction: 'in' | 'out',
  open = 0,
): ItemDocument => ({
  id: `${doc.id}:${l.id}`,
  itemId: l.itemId,
  type,
  number: doc.number,
  subcopy: doc.subcopy,
  date: doc.date,
  dueDate: doc.dueDate,
  status: doc.status,
  intent: doc.intent,
  open: open > 0,
  direction,
  quantity: l.quantity,
  openQty: open,
  uom: l.uomCode || l.uomName,
  openInventoryQty: open * (l.itemsPerUnit || 1),
  currency: doc.currency,
  unitPrice: l.unitPrice,
  total: lineNet(l),
  href: doc.href,
});

/** Each document's rows for any of the item ids. */
const rowsOf = <D extends { lines: readonly Line[] }>(docs: readonly D[], ids: Set<string>, toRow: (d: D, l: D['lines'][number]) => ItemDocument) =>
  docs.flatMap((d) => d.lines.filter((l) => ids.has(l.itemId)).map((l) => toRow(d, l)));

const inProgress = (status: string) => status === 'Open' || status === 'Not Confirmed';

interface ItemDocSource {
  label: string;
  /** Which side of the item it applies to. */
  role: 'purchase' | 'sales';
  list: (ids: Set<string>) => Promise<ItemDocument[]>;
}

/** How each document type lists an item's rows, in the order they happen. */
export const ITEM_DOC_SOURCES: Record<ItemDocType, ItemDocSource> = {
  PR: {
    label: 'Purchase request',
    role: 'purchase',
    list: async (ids) =>
      rowsOf(await listPurchaseRequests(), ids, (pr, l) => {
        const number = pr.docNum ? prNumber(pr) : pr.id;
        return row('PR', { id: pr.id, number, subcopy: pr.requesterName, date: pr.postingDate, dueDate: l.requiredDate || pr.requiredDate, status: pr.status, intent: PR_STATUS_INTENT[pr.status], currency: 'PHP', href: `${PR_LIST_PATH}/${number}` }, l, 'in');
      }),
  },
  RFQ: {
    label: 'Purchase quotation',
    role: 'purchase',
    list: async (ids) =>
      rowsOf(await listRfqs(), ids, (q, l) => {
        const number = q.docNum ? rfqNumber(q) : q.id;
        return row('RFQ', { id: q.id, number, subcopy: q.vendorName, date: q.postingDate, dueDate: l.requiredDate || q.requiredDate, status: q.status, intent: RFQ_STATUS_INTENT[q.status], currency: q.currency, href: `${RFQ_LIST_PATH}/${number}` }, l, 'in');
      }),
  },
  PO: {
    label: 'Purchase order',
    role: 'purchase',
    list: async (ids) =>
      rowsOf(await listPurchaseOrders(), ids, (po, l) =>
        row(
          'PO',
          { id: po.id, number: poNumber(po), subcopy: po.vendorName, date: po.postingDate, dueDate: l.deliveryDate || po.deliveryDate, status: po.status, intent: PO_STATUS_INTENT[po.status], currency: po.currency, href: `${PO_LIST_PATH}/${po.id}` },
          l,
          'in',
          inProgress(po.status) && l.status === 'Open' ? poOpenQty(l) : 0,
        ),
      ),
  },
  GRPO: {
    label: 'Goods receipt PO',
    role: 'purchase',
    list: async (ids) =>
      rowsOf(await listGoodsReceipts(), ids, (gr, l) =>
        row('GRPO', { id: gr.id, number: grNumber(gr), subcopy: gr.vendorName, date: gr.postingDate, dueDate: gr.postingDate, status: gr.status, intent: GR_STATUS_INTENT[gr.status], currency: gr.currency, href: `${GR_LIST_PATH}/${gr.id}` }, l, 'in'),
      ),
  },
  APINV: {
    label: 'A/P invoice',
    role: 'purchase',
    list: async (ids) =>
      rowsOf(await listApInvoices(), ids, (inv, l) =>
        row('APINV', { id: inv.id, number: apNumber(inv), subcopy: inv.vendorName, date: inv.postingDate, dueDate: inv.dueDate, status: inv.status, intent: AP_STATUS_INTENT[inv.status], currency: inv.currency, href: `${AP_LIST_PATH}/${inv.id}` }, l, 'in'),
      ),
  },
  GRET: {
    label: 'Goods return',
    role: 'purchase',
    list: async (ids) =>
      rowsOf(await listGoodsReturns(), ids, (r, l) =>
        row('GRET', { id: r.id, number: returnNumber(r), subcopy: r.vendorName, date: r.postingDate, dueDate: r.postingDate, status: r.status, intent: RETURN_STATUS_INTENT[r.status], currency: r.currency, href: `${RETURN_LIST_PATH}/${r.id}` }, l, 'in'),
      ),
  },
  APCM: {
    label: 'A/P credit memo',
    role: 'purchase',
    list: async (ids) =>
      rowsOf(await listCreditMemos(), ids, (c, l) =>
        row('APCM', { id: c.id, number: memoNumber(c), subcopy: c.vendorName, date: c.postingDate, dueDate: c.dueDate, status: c.status, intent: MEMO_STATUS_INTENT[c.status], currency: c.currency, href: `${MEMO_LIST_PATH}/${c.id}` }, l, 'in'),
      ),
  },
  QT: {
    label: 'Sales quotation',
    role: 'sales',
    list: async (ids) =>
      rowsOf(await listQuotations(), ids, (q, l) => {
        const number = q.docNum ? qtNumber(q) : q.id;
        return row('QT', { id: q.id, number, subcopy: q.customerName, date: q.postingDate, dueDate: q.validUntil, status: q.status, intent: QT_STATUS_INTENT[q.status], currency: q.currency, href: `${QT_LIST_PATH}/${number}` }, l, 'out');
      }),
  },
  SO: {
    label: 'Sales order',
    role: 'sales',
    list: async (ids) =>
      rowsOf(await listSalesOrders(), ids, (so, l) =>
        row(
          'SO',
          { id: so.id, number: soNumber(so), subcopy: so.customerName, date: so.postingDate, dueDate: so.deliveryDate, status: so.status, intent: SO_STATUS_INTENT[so.status], currency: so.currency, href: `${SO_LIST_PATH}/${so.id}` },
          l,
          'out',
          inProgress(so.status) ? soOpenQty(l) : 0,
        ),
      ),
  },
  DN: {
    label: 'Delivery',
    role: 'sales',
    list: async (ids) =>
      rowsOf(await listDeliveries(), ids, (dn, l) =>
        row('DN', { id: dn.id, number: dnNumber(dn), subcopy: dn.customerName, date: dn.postingDate, dueDate: dn.deliveryDate || dn.postingDate, status: dn.status, intent: DN_STATUS_INTENT[dn.status], currency: dn.currency, href: `${DN_LIST_PATH}/${dn.id}` }, l, 'out'),
      ),
  },
  ARINV: {
    label: 'A/R invoice',
    role: 'sales',
    list: async (ids) =>
      rowsOf(await listArInvoices(), ids, (ar, l) =>
        row('ARINV', { id: ar.id, number: arNumber(ar), subcopy: ar.customerName, date: ar.postingDate, dueDate: ar.dueDate, status: ar.status, intent: AR_STATUS_INTENT[ar.status], currency: ar.currency, href: `${AR_LIST_PATH}/${ar.id}` }, l, 'out'),
      ),
  },
};

const ALL_TYPES = Object.keys(ITEM_DOC_SOURCES) as ItemDocType[];

/** The document types that apply to the item: purchasing ones for a purchase item, sales ones for a sales item. A parent item gets all of them. */
export const docTypesFor = (item: Pick<Draft, 'purchaseItem' | 'salesItem' | 'variantAxes'>) =>
  item.variantAxes.length ? ALL_TYPES : ALL_TYPES.filter((t) => (ITEM_DOC_SOURCES[t].role === 'purchase' ? item.purchaseItem : item.salesItem));

/** Every row of these document types with any of the given item ids on it, newest first. Each type is read once. */
export async function listItemDocuments(itemId: string | string[], types: ItemDocType[]): Promise<ItemDocument[]> {
  const ids = new Set(Array.isArray(itemId) ? itemId : [itemId]);
  const rows = await Promise.all(types.map((t) => ITEM_DOC_SOURCES[t].list(ids)));
  return rows.flat().sort((a, b) => b.date.localeCompare(a.date));
}
