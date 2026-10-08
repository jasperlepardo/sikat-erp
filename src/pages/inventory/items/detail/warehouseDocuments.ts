import { consumptionsAt } from '../../../../services/costLayers';
import { listDeliveries, dnInventoryQty, dnNumber } from '../../../../services/deliveries';
import { grNumber, listGoodsReceipts } from '../../../../services/goodsReceipts';
import { listGoodsReturns, returnNumber } from '../../../../services/goodsReturns';
import { listTransfers, transferNumber } from '../../../../services/inventoryTransfers';
import { listPurchaseOrders, openQty as poOpenQty, poNumber } from '../../../../services/purchaseOrders';
import { listSalesOrders, openQty as soOpenQty, soNumber } from '../../../../services/salesOrders';
import type { StatusIntent } from '../../../partners/detail/partnerDocuments';
import { PO_LIST_PATH, STATUS_INTENT } from '../../../purchasing/orders/detail/PurchaseOrderDetail';
import { GR_LIST_PATH, GR_STATUS_INTENT } from '../../../purchasing/receipts/detail/GoodsReceiptDetail';
import { RETURN_STATUS_INTENT } from '../../../purchasing/returns/GoodsReturnDetail';
import { RETURN_LIST_PATH } from '../../../purchasing/returns/types';
import { SO_STATUS_INTENT } from '../../../sales/orders/detail/SalesOrderDetail';
import { SO_LIST_PATH } from '../../../sales/orders/detail/types';
import { DN_STATUS_INTENT } from '../../../sales/deliveries/detail/DeliveryDetail';
import { DN_LIST_PATH } from '../../../sales/deliveries/detail/types';
import { TRANSFER_LIST_PATH, TRANSFER_STATUS_INTENT } from '../../transfers/InventoryTransferDetail';

/**
 * What a document row does to the item's stock in one warehouse: moves it in or out (receipts,
 * returns, deliveries, transfers), or reserves it (sales orders commit, purchase orders order).
 */
export type StockEffect = 'in' | 'out' | 'committed' | 'ordered';

/** One document row for the item in one warehouse. */
export interface WarehouseDocument {
  id: string;
  /** Document type, e.g. "Purchase order". */
  type: string;
  number: string;
  /** The partner, or for a transfer the other warehouse. */
  subcopy: string;
  date: string;
  status: string;
  intent: StatusIntent;
  effect: StockEffect;
  /**
   * In the item's inventory unit. For an open order, what's still to receive or deliver; for a
   * closed, draft or cancelled one, the row's full quantity. For a movement, what moved.
   */
  quantity: number;
  /** Counts toward the warehouse's figures: a posted movement, or an order row still open. Otherwise shown muted. */
  live: boolean;
  /** PHP per inventory unit: a receipt's landed cost, or what a delivery's units cost (FIFO: the batches it used). */
  unitCost?: number;
  /** FIFO: the batches a delivery's or return's units came out of, as sub-rows. */
  batches?: WarehouseDocument[];
  href: string;
}

/** Every document row for the item in the warehouse, newest first. */
export async function listWarehouseDocuments(itemId: string, warehouse: string): Promise<WarehouseDocument[]> {
  const [taken, pos, grs, rets, sos, dns, its] = await Promise.all([
    consumptionsAt(itemId, warehouse),
    listPurchaseOrders(),
    listGoodsReceipts(),
    listGoodsReturns(),
    listSalesOrders(),
    listDeliveries(),
    listTransfers(),
  ]);
  const here = (l: { itemId: string; warehouse: string }) => l.itemId === itemId && l.warehouse === warehouse;
  const moved = (status: string) => status !== 'Draft' && status !== 'Cancelled';
  const rows: WarehouseDocument[] = [
    ...pos.flatMap((po) =>
      po.lines.filter(here).map((l) => {
        const open = (po.status === 'Open' || po.status === 'Not Confirmed') && l.status === 'Open';
        return {
          id: `po:${po.id}:${l.id}`, type: 'Purchase order', number: poNumber(po), subcopy: po.vendorName, date: po.postingDate,
          status: po.status, intent: STATUS_INTENT[po.status], effect: 'ordered' as const,
          quantity: (open ? poOpenQty(l) : l.quantity) * (l.itemsPerUnit || 1), live: open && poOpenQty(l) > 0, href: `${PO_LIST_PATH}/${po.id}`,
        };
      }),
    ),
    ...grs.flatMap((gr) =>
      gr.lines.filter(here).map((l) => ({
        id: `gr:${gr.id}:${l.id}`, type: 'Goods receipt', number: grNumber(gr), subcopy: gr.vendorName, date: gr.postingDate,
        status: gr.status, intent: GR_STATUS_INTENT[gr.status], effect: 'in' as const,
        quantity: l.quantity * (l.itemsPerUnit || 1), live: moved(gr.status), unitCost: l.unitCostLc, href: `${GR_LIST_PATH}/${gr.id}`,
      })),
    ),
    ...rets.flatMap((r) =>
      r.lines.filter(here).map((l) => ({
        id: `ret:${r.id}:${l.id}`, type: 'Goods return', number: returnNumber(r), subcopy: r.vendorName, date: r.postingDate,
        status: r.status, intent: RETURN_STATUS_INTENT[r.status], effect: 'out' as const,
        quantity: l.quantity * (l.itemsPerUnit || 1), live: moved(r.status), href: `${RETURN_LIST_PATH}/${r.id}`,
      })),
    ),
    ...sos.flatMap((so) =>
      so.lines.filter(here).map((l) => {
        const open = so.status === 'Open' && so.docType === 'Item';
        return {
          id: `so:${so.id}:${l.id}`, type: 'Sales order', number: so.docNum ? soNumber(so) : 'Draft', subcopy: so.customerName, date: so.postingDate,
          status: so.status, intent: SO_STATUS_INTENT[so.status], effect: 'committed' as const,
          quantity: (open ? soOpenQty(l) : l.quantity) * (l.itemsPerUnit || 1), live: open && soOpenQty(l) > 0, href: `${SO_LIST_PATH}/${so.id}`,
        };
      }),
    ),
    ...dns.flatMap((dn) =>
      dn.lines.filter(here).map((l) => ({
        id: `dn:${dn.id}:${l.id}`, type: 'Delivery', number: dnNumber(dn), subcopy: dn.customerName, date: dn.postingDate,
        status: dn.status, intent: DN_STATUS_INTENT[dn.status], effect: 'out' as const,
        quantity: dnInventoryQty(l), live: moved(dn.status), unitCost: l.unitCostLc, href: `${DN_LIST_PATH}/${dn.id}`,
      })),
    ),
    // A transfer line leaves the header's From warehouse and arrives at its own To warehouse.
    ...its.flatMap((t) =>
      t.lines
        .filter((l) => l.itemId === itemId && (t.fromWarehouse === warehouse || (l.toWarehouse || t.toWarehouse) === warehouse))
        .map((l) => {
          const to = l.toWarehouse || t.toWarehouse;
          const out = t.fromWarehouse === warehouse;
          return {
            id: `it:${t.id}:${l.id}`, type: 'Inventory transfer', number: t.docNum ? transferNumber(t) : 'Draft',
            subcopy: out ? `To ${to || '—'}` : `From ${t.fromWarehouse}`, date: t.postingDate,
            status: t.status, intent: TRANSFER_STATUS_INTENT[t.status], effect: out ? ('out' as const) : ('in' as const),
            quantity: l.quantity, live: t.status === 'Posted', href: `${TRANSFER_LIST_PATH}/${t.id}`,
          };
        }),
    ),
  ];
  // FIFO: hang each document's batch breakdown under its first row for the item.
  const seen = new Set<string>();
  for (const row of rows) {
    const docId = row.id.split(':')[1];
    if (seen.has(docId)) continue;
    const parts = taken.filter((c) => c.docId === docId);
    if (!parts.length) continue;
    seen.add(docId);
    row.batches = parts.map((c, i) => {
      const gr = grs.find((g) => g.id === c.receiptId);
      return {
        id: `${row.id}:batch-${i}`, type: 'Batch', number: gr ? grNumber(gr) : c.receiptId === 'opening' ? 'Opening stock' : c.receiptId ? 'Stock count' : 'Beyond recorded batches',
        subcopy: c.receivedOn ? `Received ${c.receivedOn}` : 'At the last batch’s cost', date: c.date, status: '', intent: 'default', effect: row.effect,
        quantity: c.qty, live: row.live, unitCost: c.unitCost, href: gr ? `${GR_LIST_PATH}/${gr.id}` : '',
      };
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
