import type { Errors } from '../../../components/form/fields';
import { formatAddress } from '../../../mocks/address';
import { newMemoLine, type MemoLine, type MemoStatus } from '../../../mocks/apCreditMemos';
import type { ApInvoice } from '../../../mocks/apInvoices';
import type { Account } from '../../../mocks/chartOfAccounts';
import type { GoodsReceipt } from '../../../mocks/goodsReceipts';
import { newReturnLine, type GoodsReturn, type ReturnLine, type ReturnStatus } from '../../../mocks/goodsReturns';
import type { Item } from '../../../mocks/items';
import type { Partner } from '../../../mocks/partners';
import { apNumber, listApInvoices, returnableQty } from '../../../services/apInvoices';
import { loadCurrentCompany } from '../../../services/companies';
import { grNumber, grOpenQty, listGoodsReceipts } from '../../../services/goodsReceipts';
import { listGoodsReturns, returnNumber, returnOpenQty } from '../../../services/goodsReturns';
import { loadInventoryMasters } from '../../../services/inventoryMasters';
import { listItems } from '../../../services/items';
import { companyTax, currencies, exchangeRates, taxCodes, taxGroups, withholdingGroups, withholdingTaxes } from '../../../services/masterData';
import { listPartnersByRole } from '../../../services/partners';
import { listPurchaseOrders } from '../../../services/purchaseOrders';
import type { GrContext, GrMasters } from '../goods-receipts/detail/types';

export const RETURNS_PATH = '/purchasing/returns-and-debits-and-debits';
export const RETURN_LIST_PATH = `${RETURNS_PATH}/returns`;
export const MEMO_LIST_PATH = `${RETURNS_PATH}/credit-memos`;

export const MEMO_STATUS_INTENT: Record<MemoStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const RETURN_STATUS_INTENT: Record<ReturnStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
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

/** Loads everything the return and credit memo forms read. */
export async function loadRetMasters(): Promise<RetMasters> {
  const [vendors, items, inv, [company], codes, groups, withholding, wGroups, curs, rates, ours, orders, receipts, invoices, returns] = await Promise.all([
    listPartnersByRole('vendor'),
    listItems(),
    loadInventoryMasters(),
    companyTax.list(),
    taxCodes.list(),
    taxGroups.list(),
    withholdingTaxes.list(),
    withholdingGroups.list(),
    currencies.list(),
    exchangeRates.list(),
    loadCurrentCompany(),
    listPurchaseOrders(),
    listGoodsReceipts(),
    listApInvoices(),
    listGoodsReturns(),
  ]);
  return { vendors, items, inv, tax: { company, codes, groups, withholding, withholdingGroups: wGroups }, currencies: curs, rates, company: ours, orders, receipts, invoices, returns, accounts: inv.accounts };
}

/** The vendor's addresses as pick options, keyed by their formatted text. */
export const vendorAddressOptions = (v: Partner | undefined) =>
  (v?.addresses ?? []).map((a) => ({ value: formatAddress(a, v!.name), label: `${a.label || 'Address'} · ${a.city || a.countryCode}` }));

const extras = (item: Item | undefined) => ({ countryOfOriginCode: item?.countryOfOriginCode ?? '' });

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
