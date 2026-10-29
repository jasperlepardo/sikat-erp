/**
 * "Create {target}" document hops for sales. Mirrors purchasing/shared/copyHops: each entry turns a
 * source document's open lines into a CopyPanel source for the shared CreateFromPanel, so the picker
 * opens ON the source and the chosen lines travel to the target /new as `location.state.picks`.
 * Reuses the CopyHop/LinePick contract from purchasing/shared (sales already imports from there).
 */
import type { CopySourceType } from '../../purchasing/shared/CopyPanel';
import type { CopyHop } from '../../purchasing/shared/copyHops';
import { formatDate } from '../../../services/dates';
import { openQty, soNumber } from '../../../services/salesOrders';
import { dnNumber, dnOpenQty } from '../../../services/deliveries';
import { srNumber, srOpenQty } from '../../../services/salesReturns';
import { arNumber } from '../../../services/arInvoices';
import { AR_CM_LIST_PATH, AR_LIST_PATH, DN_LIST_PATH, SR_LIST_PATH } from '../paths';
import type { Item } from '../../../mocks/items';
import type { SalesOrder } from '../../../mocks/salesOrders';
import type { Delivery } from '../../../mocks/deliveries';
import type { SalesReturn } from '../../../mocks/salesReturns';
import type { ArInvoice } from '../../../mocks/arInvoices';

export type { CopyHop, LinePick } from '../../purchasing/shared/copyHops';

type CopyDoc = CopySourceType<string>['docs'][number];

/** A sales document line → a CopyPanel line (sales uses the line's description as its display name). */
const copyLine = (l: { id: string; itemNo: string; description: string; warehouse: string; quantity: number; uomCode: string }, open: number): CopyDoc['lines'][number] => ({
  id: l.id, itemNo: l.itemNo, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open,
});

const isInventory = (itemId: string, items: readonly Item[]) => !!items.find((i) => i.id === itemId)?.inventoryItem;

// ── sales order → … ───────────────────────────────────────────────────────────
const soHasOpen = (so: SalesOrder) => so.lines.some((l) => openQty(l) > 0);
const soDocFor = (so: SalesOrder, lines: CopyDoc['lines']): CopyDoc | undefined =>
  lines.length ? { id: so.id, label: `${soNumber(so)} · ${so.customerName}`, description: `${formatDate(so.postingDate)} · ${so.currency}`, lines } : undefined;

/** Sales order → delivery: ship this order's open lines. */
export const SO_TO_DN: CopyHop<SalesOrder> = {
  id: 'so-to-dn', targetNoun: 'delivery', targetNewPath: `${DN_LIST_PATH}/new`, stateKey: 'fromOrder', icon: 'local_shipping',
  totalHeader: 'Ordered', qtyHeader: 'Deliver', hint: 'Open lines come at their open quantity; ship less if the order allows partial delivery.', sourceLabel: 'Sales orders',
  hasOpenLines: soHasOpen,
  sourceToCopyDoc: (so) => soDocFor(so, so.lines.filter((l) => openQty(l) > 0).map((l) => copyLine(l, openQty(l)))),
};

/** Sales order → A/R invoice (goods): bill the open stocked lines; the invoice ships them too. */
export const SO_TO_AR_GOODS: CopyHop<SalesOrder> = {
  id: 'so-to-ar-goods', targetNoun: 'A/R invoice (goods)', targetNewPath: `${AR_LIST_PATH}/new`, stateKey: 'fromOrder', extraState: { lineFilter: 'goods' }, icon: 'receipt',
  totalHeader: 'Ordered', qtyHeader: 'Bill', hint: 'Bills straight from the order with no delivery: adding the invoice also ships the stock.', sourceLabel: 'Sales orders',
  hasOpenLines: (so, items) => so.lines.some((l) => openQty(l) > 0 && isInventory(l.itemId, items)),
  sourceToCopyDoc: (so, items) => soDocFor(so, so.lines.filter((l) => openQty(l) > 0 && isInventory(l.itemId, items)).map((l) => copyLine(l, openQty(l)))),
};

/** Sales order → A/R invoice (services): bill the open service lines on a service invoice. */
export const SO_TO_AR_SERVICES: CopyHop<SalesOrder> = {
  id: 'so-to-ar-services', targetNoun: 'A/R invoice (services)', targetNewPath: `${AR_LIST_PATH}/new`, stateKey: 'fromOrder', extraState: { lineFilter: 'services' }, icon: 'receipt_long',
  totalHeader: 'Ordered', qtyHeader: 'Bill', hint: 'Bills the open service lines on a service invoice.', sourceLabel: 'Sales orders',
  hasOpenLines: (so, items) => so.lines.some((l) => openQty(l) > 0 && !isInventory(l.itemId, items)),
  sourceToCopyDoc: (so, items) => soDocFor(so, so.lines.filter((l) => openQty(l) > 0 && !isInventory(l.itemId, items)).map((l) => copyLine(l, openQty(l)))),
};

// ── delivery → … ──────────────────────────────────────────────────────────────
const dnHasOpen = (dn: Delivery) => dn.lines.some((l) => dnOpenQty(l, dn) > 0);
const dnDocFor = (dn: Delivery): CopyDoc | undefined => {
  const lines = dn.lines.filter((l) => dnOpenQty(l, dn) > 0).map((l) => copyLine(l, dnOpenQty(l, dn)));
  return lines.length ? { id: dn.id, label: `${dnNumber(dn)} · ${dn.customerName}`, description: `${formatDate(dn.postingDate)} · ${dn.currency}`, lines } : undefined;
};

/** Delivery → A/R invoice: bill what was shipped. */
export const DN_TO_AR: CopyHop<Delivery> = {
  id: 'dn-to-ar', targetNoun: 'A/R invoice', targetNewPath: `${AR_LIST_PATH}/new`, stateKey: 'fromDelivery', icon: 'receipt',
  totalHeader: 'Shipped', qtyHeader: 'Bill', hint: "Bills what was shipped, at the delivery's price. The stock already went out with the delivery.", sourceLabel: 'Deliveries',
  hasOpenLines: dnHasOpen, sourceToCopyDoc: dnDocFor,
};

/** Delivery → sales return: take shipped goods back. */
export const DN_TO_SR: CopyHop<Delivery> = {
  id: 'dn-to-sr', targetNoun: 'sales return', targetNewPath: `${SR_LIST_PATH}/new`, stateKey: 'fromDelivery', icon: 'assignment_return',
  totalHeader: 'Shipped', qtyHeader: 'Return', hint: 'Return quantities can be at most the delivery open qty.', sourceLabel: 'Deliveries',
  hasOpenLines: dnHasOpen, sourceToCopyDoc: dnDocFor,
};

// ── sales return → A/R credit memo ──────────────────────────────────────────────
/** Sales return → A/R credit memo: credit goods already returned. */
export const SR_TO_ARCM: CopyHop<SalesReturn> = {
  id: 'sr-to-arcm', targetNoun: 'A/R credit memo', targetNewPath: `${AR_CM_LIST_PATH}/new`, stateKey: 'fromReturn', icon: 'undo',
  totalHeader: 'Returned', qtyHeader: 'Credit', hint: 'Credit goods already sent back on this return.', sourceLabel: 'Sales returns',
  hasOpenLines: (sr) => sr.lines.some((l) => srOpenQty(l, sr) > 0),
  sourceToCopyDoc: (sr) => {
    const lines = sr.lines.filter((l) => srOpenQty(l, sr) > 0).map((l) => copyLine(l, srOpenQty(l, sr)));
    return lines.length ? { id: sr.id, label: `Return ${srNumber(sr)} · ${sr.customerName}`, description: `${formatDate(sr.postingDate)} · ${sr.currency}`, lines } : undefined;
  },
};

// ── A/R invoice → A/R credit memo ────────────────────────────────────────────────
/** A/R invoice → A/R credit memo: credit billed lines. */
export const AR_TO_ARCM: CopyHop<ArInvoice> = {
  id: 'ar-to-arcm', targetNoun: 'A/R credit memo', targetNewPath: `${AR_CM_LIST_PATH}/new`, stateKey: 'fromInvoice', icon: 'undo',
  totalHeader: 'Billed', qtyHeader: 'Credit', hint: 'Credit quantities can be at most the billed quantity.', sourceLabel: 'A/R invoices',
  hasOpenLines: (inv) => inv.lines.some((l) => l.quantity > 0),
  sourceToCopyDoc: (inv) => {
    const lines = inv.lines.filter((l) => l.quantity > 0).map((l) => copyLine(l, l.quantity));
    return lines.length ? { id: inv.id, label: `A/R invoice ${arNumber(inv)} · ${inv.customerName}`, description: `${formatDate(inv.postingDate)} · ${inv.currency}`, lines } : undefined;
  },
};
