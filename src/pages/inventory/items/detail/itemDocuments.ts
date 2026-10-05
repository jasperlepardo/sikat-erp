import { lineNet, listPurchaseOrders, openQty, poNumber } from '../../../../services/purchaseOrders';
import { DOC_SOURCES, type DocType, type StatusIntent } from '../../../partners/detail/partnerDocuments';
import { PO_LIST_PATH, STATUS_INTENT } from '../../../purchasing/orders/detail/PurchaseOrderDetail';
import { grNumber, listGoodsReceipts } from '../../../../services/goodsReceipts';
import { GR_LIST_PATH, GR_STATUS_INTENT } from '../../../purchasing/receipts/detail/GoodsReceiptDetail';
import { apNumber, listApInvoices } from '../../../../services/apInvoices';
import { AP_LIST_PATH, AP_STATUS_INTENT } from '../../../purchasing/invoices/detail/ApInvoiceDetail';
import { listGoodsReturns, returnNumber } from '../../../../services/goodsReturns';
import { listCreditMemos, memoNumber } from '../../../../services/apCreditMemos';
import { RETURN_STATUS_INTENT } from '../../../purchasing/returns/GoodsReturnDetail';
import { MEMO_LIST_PATH, MEMO_STATUS_INTENT, RETURN_LIST_PATH } from '../../../purchasing/returns/types';
import type { Draft } from './types';

/**
 * A document row the item is on, in one shape, so the Transactions tab can list them together.
 * One per row: a document with the item on two rows shows twice.
 */
export interface ItemDocument {
  id: string;
  type: DocType;
  number: string;
  /** Extra line under the number: the partner on the document. */
  subcopy?: string;
  date: string;
  /** When the row is due to be delivered. */
  dueDate: string;
  status: string;
  intent: StatusIntent;
  /** Still expecting a delivery: the document is in progress and the row has quantity left. */
  open: boolean;
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

/** How each document type lists an item's rows. A type without an entry isn't built yet. */
const ITEM_SOURCES: Partial<Record<DocType, (itemId: string) => Promise<ItemDocument[]>>> = {
  PO: async (itemId) =>
    (await listPurchaseOrders()).flatMap((po) => {
      const inProgress = po.status === 'Open' || po.status === 'Not Confirmed';
      return po.lines
        .filter((l) => l.itemId === itemId)
        .map((l) => {
          const left = openQty(l);
          return {
            id: `${po.id}:${l.id}`,
            type: 'PO' as const,
            number: poNumber(po),
            subcopy: po.vendorName,
            date: po.postingDate,
            dueDate: l.deliveryDate || po.deliveryDate,
            status: po.status,
            intent: STATUS_INTENT[po.status],
            open: inProgress && l.status === 'Open' && left > 0,
            quantity: l.quantity,
            openQty: left,
            uom: l.uomCode || l.uomName,
            openInventoryQty: left * (l.itemsPerUnit || 1),
            currency: po.currency,
            unitPrice: l.unitPrice,
            total: lineNet(l),
            href: `${PO_LIST_PATH}/${po.id}`,
          };
        });
    }),
  // A receipt is a delivery that's happened: nothing on it is still expected.
  GRPO: async (itemId) =>
    (await listGoodsReceipts()).flatMap((gr) =>
      gr.lines
        .filter((l) => l.itemId === itemId)
        .map((l) => ({
          id: `${gr.id}:${l.id}`,
          type: 'GRPO' as const,
          number: grNumber(gr),
          subcopy: gr.vendorName,
          date: gr.postingDate,
          dueDate: gr.postingDate,
          status: gr.status,
          intent: GR_STATUS_INTENT[gr.status],
          open: false,
          quantity: l.quantity,
          openQty: 0,
          uom: l.uomCode || l.uomName,
          openInventoryQty: 0,
          currency: gr.currency,
          unitPrice: l.unitPrice,
          total: lineNet(l),
          href: `${GR_LIST_PATH}/${gr.id}`,
        })),
    ),
  // A bill is for what's been delivered: nothing on it is still expected.
  APINV: async (itemId) =>
    (await listApInvoices()).flatMap((inv) =>
      inv.lines
        .filter((l) => l.itemId === itemId)
        .map((l) => ({
          id: `${inv.id}:${l.id}`,
          type: 'APINV' as const,
          number: apNumber(inv),
          subcopy: inv.vendorName,
          date: inv.postingDate,
          dueDate: inv.dueDate,
          status: inv.status,
          intent: AP_STATUS_INTENT[inv.status],
          open: false,
          quantity: l.quantity,
          openQty: 0,
          uom: l.uomCode || l.uomName,
          openInventoryQty: 0,
          currency: inv.currency,
          unitPrice: l.unitPrice,
          total: lineNet(l),
          href: `${AP_LIST_PATH}/${inv.id}`,
        })),
    ),
  // Goods sent back: nothing on a return or credit memo is still expected.
  GRET: async (itemId) =>
    (await listGoodsReturns()).flatMap((r) =>
      r.lines
        .filter((l) => l.itemId === itemId)
        .map((l) => ({
          id: `${r.id}:${l.id}`, type: 'GRET' as const, number: returnNumber(r), subcopy: r.vendorName, date: r.postingDate, dueDate: r.postingDate,
          status: r.status, intent: RETURN_STATUS_INTENT[r.status], open: false, quantity: l.quantity, openQty: 0, uom: l.uomCode || l.uomName,
          openInventoryQty: 0, currency: r.currency, unitPrice: l.unitPrice, total: lineNet(l), href: `${RETURN_LIST_PATH}/${r.id}`,
        })),
    ),
  APCM: async (itemId) =>
    (await listCreditMemos()).flatMap((c) =>
      c.lines
        .filter((l) => l.itemId === itemId)
        .map((l) => ({
          id: `${c.id}:${l.id}`, type: 'APCM' as const, number: memoNumber(c), subcopy: c.vendorName, date: c.postingDate, dueDate: c.dueDate,
          status: c.status, intent: MEMO_STATUS_INTENT[c.status], open: false, quantity: l.quantity, openQty: 0, uom: l.uomCode || l.uomName,
          openInventoryQty: 0, currency: c.currency, unitPrice: l.unitPrice, total: lineNet(l), href: `${MEMO_LIST_PATH}/${c.id}`,
        })),
    ),
};

export const isBuilt = (type: DocType) => !!ITEM_SOURCES[type];

/** The document types that apply to the item: purchasing ones for a purchase item, sales ones for a sales item. */
export const docTypesFor = (item: Pick<Draft, 'purchaseItem' | 'salesItem'>) =>
  // Payments have no item rows, so they never apply to an item.
  (Object.keys(DOC_SOURCES) as DocType[]).filter((t) => t !== 'PAY' && (DOC_SOURCES[t].role === 'vendor' ? item.purchaseItem : item.salesItem));

/** Every row of these document types with the item on it, newest first. */
export async function listItemDocuments(itemId: string, types: DocType[]): Promise<ItemDocument[]> {
  const lists = await Promise.all(types.map((t) => ITEM_SOURCES[t]?.(itemId) ?? []));
  return lists.flat().sort((a, b) => b.date.localeCompare(a.date));
}
