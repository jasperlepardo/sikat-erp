/**
 * "Create {target}" document hops for purchasing. Each entry turns a source document's open lines
 * into a CopyPanel source (see CreateFromPanel), so the picker opens ON the source document and the
 * chosen lines travel to the target /new as `location.state.picks`. Type-only path imports keep this
 * out of the page chunks (see paths.ts); never import a routed page module here.
 */
import type { CopySourceType } from './CopyPanel';
import { formatDate } from '../../../services/dates';
import { openQty, poNumber } from '../../../services/purchaseOrders';
import { grNumber, grOpenQty } from '../../../services/goodsReceipts';
import { apNumber, returnableQty } from '../../../services/apInvoices';
import { returnNumber, returnOpenQty } from '../../../services/goodsReturns';
import { AP_LIST_PATH, APRI_LIST_PATH, GR_LIST_PATH, MEMO_LIST_PATH, RETURN_LIST_PATH } from '../paths';
import type { Item } from '../../../mocks/items';
import type { PurchaseOrder } from '../../../mocks/purchaseOrders';
import type { GoodsReceipt } from '../../../mocks/goodsReceipts';
import type { ApInvoice } from '../../../mocks/apInvoices';
import type { GoodsReturn } from '../../../mocks/goodsReturns';

/** A line chosen in the picker, carried to the target's prefill effect. */
export type LinePick = { lineId: string; qty: number };

/** One document a CopyPanel source lists. */
type CopyDoc = CopySourceType<string>['docs'][number];
/** One open line in that doc. */
type CopyLine = CopyDoc['lines'][number];

/**
 * One source→target "Create {target}" hop. `Source` is the fully-typed source document. The entry
 * knows how to render the source's open lines as a CopyPanel source, and where to navigate with the
 * resulting picks. `items` is passed so a hop can exclude non-inventory lines where it must.
 */
export interface CopyHop<Source> {
  /** Stable key — menu item key + CopyPanel source key + e2e hook, e.g. 'po-to-gr'. */
  id: string;
  /** Target noun for the label: the menu reads `Create ${targetNoun}…`. */
  targetNoun: string;
  /** Target route, built from an imported *_LIST_PATH constant — never a page import. */
  targetNewPath: string;
  /** location.state key the target page already reads to find its source. */
  stateKey: string;
  /** Extra static state merged into the navigation (e.g. an A/R invoice goods/services lineFilter). */
  extraState?: Record<string, unknown>;
  /** Menu icon. */
  icon: string;
  /** CopyPanel column header for the line's full quantity, e.g. "Ordered". */
  totalHeader: string;
  /** CopyPanel column header for the editable quantity, e.g. "Receive". */
  qtyHeader: string;
  /** CopyPanel hint under the document picker. */
  hint: string;
  /** CopyPanel source label, e.g. "Purchase orders". */
  sourceLabel: string;
  /** Does this source instance have at least one open line to copy? Gates the menu item. */
  hasOpenLines: (doc: Source, items: readonly Item[]) => boolean;
  /** Map the source to a CopyPanel doc using the right open-qty field; undefined when nothing's open. */
  sourceToCopyDoc: (doc: Source, items: readonly Item[]) => CopyDoc | undefined;
}

/** Shared line mapper: a document line → a CopyPanel line, with the hop's open quantity. */
const copyLine = (l: { id: string; itemNo: string; name: string; description?: string; warehouse: string; quantity: number; uomCode: string }, open: number): CopyLine => ({
  id: l.id, itemNo: l.itemNo, name: l.name, description: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open,
});

const isInventory = (itemId: string, items: readonly Item[]) => !!items.find((i) => i.id === itemId)?.inventoryItem;

// ── PO → … ──────────────────────────────────────────────────────────────────
const poLabel = (po: PurchaseOrder) => ({ id: po.id, label: `${poNumber(po)} · ${po.vendorName}`, description: `${formatDate(po.postingDate)} · ${po.currency}` });
const poOpenLines = (po: PurchaseOrder) => po.lines.filter((l) => l.status === 'Open' && openQty(l) > 0).map((l) => copyLine(l, openQty(l)));
const poHasOpen = (po: PurchaseOrder) => po.lines.some((l) => l.status === 'Open' && openQty(l) > 0);
const poDoc = (po: PurchaseOrder): CopyDoc | undefined => (poHasOpen(po) ? { ...poLabel(po), lines: poOpenLines(po) } : undefined);

/** PO → goods receipt: receive this PO's open lines. */
export const PO_TO_GR: CopyHop<PurchaseOrder> = {
  id: 'po-to-gr', targetNoun: 'goods receipt', targetNewPath: `${GR_LIST_PATH}/new`, stateKey: 'fromPo', icon: 'inventory',
  totalHeader: 'Ordered', qtyHeader: 'Receive', hint: 'Receive quantities can be at most the PO open qty.', sourceLabel: 'Purchase orders',
  hasOpenLines: poHasOpen, sourceToCopyDoc: poDoc,
};

/** PO → A/P invoice: bill straight from the PO (the invoice receives the stock too). */
export const PO_TO_AP: CopyHop<PurchaseOrder> = {
  id: 'po-to-ap', targetNoun: 'A/P invoice', targetNewPath: `${AP_LIST_PATH}/new`, stateKey: 'fromPo', icon: 'request_quote',
  totalHeader: 'Ordered', qtyHeader: 'Bill', hint: 'Bill straight from the PO — the invoice receives the stock too.', sourceLabel: 'Purchase orders',
  hasOpenLines: poHasOpen, sourceToCopyDoc: poDoc,
};

/** PO → A/P reserve invoice: bill now; goods are received later against the invoice. */
export const PO_TO_APRI: CopyHop<PurchaseOrder> = {
  id: 'po-to-apri', targetNoun: 'A/P reserve invoice', targetNewPath: `${APRI_LIST_PATH}/new`, stateKey: 'fromPo', icon: 'receipt_long',
  totalHeader: 'Ordered', qtyHeader: 'Invoice', hint: 'Bill from the PO; goods are received later with a goods receipt against this invoice.', sourceLabel: 'Purchase orders',
  hasOpenLines: poHasOpen, sourceToCopyDoc: poDoc,
};

// ── goods receipt → … ───────────────────────────────────────────────────────
const grHasOpen = (gr: GoodsReceipt) => gr.lines.some((l) => grOpenQty(l, gr) > 0);
const grDoc = (gr: GoodsReceipt): CopyDoc | undefined =>
  grHasOpen(gr) ? { id: gr.id, label: `Receipt ${grNumber(gr)}`, description: `${formatDate(gr.postingDate)} · ${gr.currency}`, lines: gr.lines.filter((l) => grOpenQty(l, gr) > 0).map((l) => copyLine(l, grOpenQty(l, gr))) } : undefined;

/** Goods receipt → A/P invoice: bill what was received (the three-way match). */
export const GR_TO_AP: CopyHop<GoodsReceipt> = {
  id: 'gr-to-ap', targetNoun: 'A/P invoice', targetNewPath: `${AP_LIST_PATH}/new`, stateKey: 'fromReceipt', icon: 'request_quote',
  totalHeader: 'Received', qtyHeader: 'Bill', hint: 'Bill what was received: the usual three-way match.', sourceLabel: 'Goods receipts',
  hasOpenLines: grHasOpen, sourceToCopyDoc: grDoc,
};

/** Goods receipt → goods return: send received (not-yet-billed) goods back. */
export const GR_TO_RETURN: CopyHop<GoodsReceipt> = {
  id: 'gr-to-return', targetNoun: 'goods return', targetNewPath: `${RETURN_LIST_PATH}/new`, stateKey: 'fromReceipt', icon: 'assignment_return',
  totalHeader: 'Received', qtyHeader: 'Return', hint: 'Goods not yet billed: returning them lowers what the vendor can bill.', sourceLabel: 'Goods receipts',
  hasOpenLines: grHasOpen, sourceToCopyDoc: grDoc,
};

// ── A/P invoice → … ─────────────────────────────────────────────────────────
/** A/P invoice → goods return: send billed inventory goods back (waits for a credit memo). */
export const AP_TO_RETURN: CopyHop<ApInvoice> = {
  id: 'ap-to-return', targetNoun: 'goods return', targetNewPath: `${RETURN_LIST_PATH}/new`, stateKey: 'fromInvoice', icon: 'assignment_return',
  totalHeader: 'Billed', qtyHeader: 'Return', hint: "Goods already billed: the return waits for the vendor's credit memo.", sourceLabel: 'A/P invoices',
  hasOpenLines: (inv, items) => inv.lines.some((l) => returnableQty(l) > 0 && isInventory(l.itemId, items)),
  sourceToCopyDoc: (inv, items) => {
    const lines = inv.lines.filter((l) => returnableQty(l) > 0 && isInventory(l.itemId, items)).map((l) => copyLine(l, returnableQty(l)));
    return lines.length ? { id: inv.id, label: `A/P invoice ${apNumber(inv)}`, description: `${formatDate(inv.postingDate)} · ${inv.currency}`, lines } : undefined;
  },
};

/** A/P invoice → A/P credit memo: credit billed lines (price adjustment or returned goods). */
export const AP_TO_APCM: CopyHop<ApInvoice> = {
  id: 'ap-to-apcm', targetNoun: 'A/P credit memo', targetNewPath: `${MEMO_LIST_PATH}/new`, stateKey: 'fromInvoice', icon: 'receipt',
  totalHeader: 'Billed', qtyHeader: 'Credit', hint: 'Credit billed lines: a price adjustment, or tick Return goods on the memo to send them back.', sourceLabel: 'A/P invoices',
  hasOpenLines: (inv) => inv.lines.some((l) => l.quantity > 0),
  sourceToCopyDoc: (inv) => {
    const lines = inv.lines.filter((l) => l.quantity > 0).map((l) => copyLine(l, l.quantity));
    return lines.length ? { id: inv.id, label: `A/P invoice ${apNumber(inv)}`, description: `${formatDate(inv.postingDate)} · ${inv.currency}`, lines } : undefined;
  },
};

// ── goods return → … ────────────────────────────────────────────────────────
/** Goods return → A/P credit memo: credit goods already sent back. */
export const RETURN_TO_APCM: CopyHop<GoodsReturn> = {
  id: 'return-to-apcm', targetNoun: 'A/P credit memo', targetNewPath: `${MEMO_LIST_PATH}/new`, stateKey: 'fromReturn', icon: 'receipt',
  totalHeader: 'Returned', qtyHeader: 'Credit', hint: 'Credit goods already sent back on this return. No stock moves.', sourceLabel: 'Goods returns',
  hasOpenLines: (ret) => ret.lines.some((l) => returnOpenQty(l, ret) > 0),
  sourceToCopyDoc: (ret) => {
    const lines = ret.lines.filter((l) => returnOpenQty(l, ret) > 0).map((l) => copyLine(l, returnOpenQty(l, ret)));
    return lines.length ? { id: ret.id, label: `Return ${returnNumber(ret)}`, description: `${formatDate(ret.postingDate)} · ${ret.currency}`, lines } : undefined;
  },
};
