import type { Errors } from '../../../components/form/fields';
import { newMemoLine, type MemoLine } from '../../../mocks/apCreditMemos';
import type { ApInvoice } from '../../../mocks/apInvoices';
import type { Account } from '../../../mocks/chartOfAccounts';
import type { GoodsReceipt } from '../../../mocks/goodsReceipts';
import { newReturnLine, type GoodsReturn, type ReturnLine } from '../../../mocks/goodsReturns';
import type { Item } from '../../../mocks/items';
import { apNumber, returnableQty } from '../../../services/apInvoices';
import { grNumber, grOpenQty } from '../../../services/goodsReceipts';
import { returnNumber, returnOpenQty } from '../../../services/goodsReturns';
import type { GrContext, GrMasters } from '../receipts/detail/types';

export const RETURNS_PATH = '/purchasing/returns-and-debits';
export const RETURN_LIST_PATH = `${RETURNS_PATH}/returns`;
export const MEMO_LIST_PATH = `${RETURNS_PATH}/credit-memos`;

export const MEMO_STATUS_INTENT: Record<'Draft' | 'Open' | 'Closed' | 'Cancelled', 'default' | 'primary' | 'success' | 'danger'> = {
  Draft: 'default',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

/** Master data the return and credit memo forms read, loaded once. */
export interface RetMasters extends GrMasters {
  receipts: GoodsReceipt[];
  invoices: ApInvoice[];
  returns: GoodsReturn[];
  accounts: Account[];
}

export type RetContext = GrContext;

/** What both line shapes share, for the lines table. */
export type AnyReturnLine = ReturnLine | MemoLine;

export interface RetSectionProps<D> {
  draft: D;
  update: (patch: Partial<D>) => void;
  errors: Errors;
  m: RetMasters;
  ctx: RetContext;
}

const extras = (item: Item | undefined) => ({ countryOfOrigin: item?.countryOfOrigin ?? '' });

/** Return lines sending back receipt lines not yet billed, each `qty` (defaults to what's open). */
export function returnFromReceipt(gr: GoodsReceipt, picks: { lineId: string; qty: number }[], items: Item[]): ReturnLine[] {
  return picks.flatMap(({ lineId, qty }) => {
    const gl = gr.lines.find((l) => l.id === lineId);
    if (!gl) return [];
    const { invoicedQty: _i, returnedQty: _r, id: _id, ...line } = gl;
    return [newReturnLine({ ...line, ...extras(items.find((i) => i.id === gl.itemId)), quantity: Math.min(qty, grOpenQty(gl, gr)), baseType: 'GRPO', baseId: gr.id, baseLineId: gl.id, baseDocNo: grNumber(gr) })];
  });
}

/** Return lines sending back billed goods from an invoice. */
export function returnFromInvoice(inv: ApInvoice, picks: { lineId: string; qty: number }[]): ReturnLine[] {
  return picks.flatMap(({ lineId, qty }) => {
    const il = inv.lines.find((l) => l.id === lineId);
    if (!il) return [];
    const { returnedQty: _r, receiptCostLc: _c, bpCatalogNo: _b, baseType: _t, id: _id, ...line } = il;
    return [newReturnLine({ ...line, quantity: Math.min(qty, returnableQty(il)), baseType: 'APINV', baseId: inv.id, baseLineId: il.id, baseDocNo: apNumber(inv) })];
  });
}

/** Credit memo lines crediting an invoice's lines; stocked items return their goods by default. */
export function memoFromInvoice(inv: ApInvoice, picks: { lineId: string; qty: number }[], items: Item[]): MemoLine[] {
  return picks.flatMap(({ lineId, qty }) => {
    const il = inv.lines.find((l) => l.id === lineId);
    if (!il) return [];
    const { returnedQty: _r, baseType: _t, id: _id, ...line } = il;
    const stocked = Boolean(items.find((i) => i.id === il.itemId)?.inventoryItem);
    return [newMemoLine({ ...line, quantity: Math.min(qty, il.quantity), baseType: 'APINV', baseId: inv.id, baseLineId: il.id, baseDocNo: apNumber(inv), returnGoods: stocked && returnableQty(il) > 0, invoiceId: inv.id })];
  });
}

/** Credit memo lines crediting a goods return's lines. The goods already left, so no stock moves. */
export function memoFromReturn(r: GoodsReturn, picks: { lineId: string; qty: number }[], items: Item[]): MemoLine[] {
  return picks.flatMap(({ lineId, qty }) => {
    const rl = r.lines.find((l) => l.id === lineId);
    if (!rl) return [];
    const { creditedQty: _c, baseType, baseId, id: _id, ...line } = rl;
    const item = items.find((i) => i.id === rl.itemId);
    return [
      newMemoLine({
        ...line,
        bpCatalogNo: item?.vendors.find((v) => v.vendorId === r.vendorId)?.vendorItemNo ?? '',
        quantity: Math.min(qty, returnOpenQty(rl, r)),
        baseType: 'GRET',
        baseId: r.id,
        baseLineId: rl.id,
        baseDocNo: returnNumber(r),
        returnGoods: false,
        invoiceId: baseType === 'APINV' ? baseId : '',
      }),
    ];
  });
}

/** Where a copied line came from, for the base document column. */
export function baseLink(l: AnyReturnLine) {
  switch (l.baseType) {
    case 'GRPO':
      return { href: `#/purchasing/goods-receipts/${l.baseId}`, label: `Receipt ${l.baseDocNo}` };
    case 'APINV':
      return { href: `#/purchasing/bills/${l.baseId}`, label: `A/P invoice ${l.baseDocNo}` };
    case 'GRET':
      return { href: `#${RETURN_LIST_PATH}/${l.baseId}`, label: `Return ${l.baseDocNo}` };
    default:
      return undefined;
  }
}
