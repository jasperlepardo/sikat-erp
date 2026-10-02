import { lineNet, listPurchaseOrders, openQty, poNumber } from '../../../../services/purchaseOrders';
import { DOC_SOURCES, type DocType, type StatusIntent } from '../../../partners/detail/partnerDocuments';
import { PO_LIST_PATH, STATUS_INTENT } from '../../../purchasing/orders/detail/PurchaseOrderDetail';
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
};

export const isBuilt = (type: DocType) => !!ITEM_SOURCES[type];

/** The document types that apply to the item: purchasing ones for a purchase item, sales ones for a sales item. */
export const docTypesFor = (item: Pick<Draft, 'purchaseItem' | 'salesItem'>) =>
  (Object.keys(DOC_SOURCES) as DocType[]).filter((t) => (DOC_SOURCES[t].role === 'vendor' ? item.purchaseItem : item.salesItem));

/** Every row of these document types with the item on it, newest first. */
export async function listItemDocuments(itemId: string, types: DocType[]): Promise<ItemDocument[]> {
  const lists = await Promise.all(types.map((t) => ITEM_SOURCES[t]?.(itemId) ?? []));
  return lists.flat().sort((a, b) => b.date.localeCompare(a.date));
}
