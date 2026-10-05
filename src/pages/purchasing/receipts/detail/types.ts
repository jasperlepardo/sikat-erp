import type { Errors } from '../../../../components/form/fields';
import { formatAddress } from '../../../../mocks/address';
import { newGrLine, type GrLine } from '../../../../mocks/goodsReceipts';
import { itemsPerUom, type Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { PurchaseOrder } from '../../../../mocks/purchaseOrders';
import { rateAt, vatNotPaidToVendor } from '../../../../mocks/taxes';
import { todayISO } from '../../../../services/dates';
import type { GrInput } from '../../../../services/goodsReceipts';
import { rateOn } from '../../../../services/masterData';
import { determinePrice } from '../../../../services/priceLists';
import { openQty, poNumber } from '../../../../services/purchaseOrders';
import { binFor } from '../../../inventory/transfers/TransferLines';
import { proposedTaxCode, type PoMasters } from '../../orders/detail/types';

export type GrDraft = GrInput;

/** Master data the receipt form reads, loaded once: the PO form's, plus the POs to copy from. */
export interface GrMasters extends PoMasters {
  orders: PurchaseOrder[];
}

export interface GrSectionProps {
  draft: GrDraft;
  update: (patch: Partial<GrDraft>) => void;
  errors: Errors;
  m: GrMasters;
  ctx: GrContext;
}

/** Values derived from the draft and master data that several sections need. */
export interface GrContext {
  vendor?: Partner;
  rateOf: (taxCode: string) => number;
  isReverseCharge: (taxCode: string) => boolean;
  /** PHP per unit of the document currency: the rate on the posting date, or the one fixed when added. */
  fx: number;
  fxDate: string;
  fxSource: string;
  /** Added (open, closed or cancelled): only remarks change. */
  readOnly: boolean;
  /** Has lines copied from a PO: the vendor and currency are locked to it. */
  based: boolean;
}

/** Works for any purchasing document with these header fields (receipts, A/P invoices). */
export function buildGrContext(
  draft: Pick<GrDraft, 'postingDate' | 'status' | 'currency' | 'vendorId' | 'fxRate'> & { lines: { baseId: string }[] },
  m: PoMasters,
): GrContext {
  const date = draft.postingDate || todayISO();
  const added = draft.status !== 'Draft';
  const fxRate = draft.currency === 'PHP' || added ? undefined : rateOn(m.rates, draft.currency, date);
  return {
    vendor: m.vendors.find((v) => v.id === draft.vendorId),
    rateOf: (code) => {
      const c = m.tax.codes.find((x) => x.code === code);
      return c ? (rateAt(c, date) ?? 0) : 0;
    },
    isReverseCharge: (code) => vatNotPaidToVendor(m.tax.codes.find((x) => x.code === code)),
    fx: draft.currency === 'PHP' ? 1 : added ? draft.fxRate : (fxRate?.rate ?? 0),
    fxDate: added ? draft.postingDate : (fxRate?.date ?? ''),
    fxSource: fxRate?.source === 'BSP RERB' ? 'BSP' : added ? 'fixed when added' : 'manual',
    readOnly: added,
    based: draft.lines.some((l) => l.baseId),
  };
}

/** Ship To default: the warehouse the first stocked line goes to, or the company for services only. */
export function defaultShipTo(lines: Pick<GrLine, 'warehouse' | 'itemId'>[], m: PoMasters) {
  const stocked = lines.find((l) => l.warehouse && m.items.find((i) => i.id === l.itemId)?.inventoryItem);
  const wh = stocked && m.inv.warehouses.find((w) => w.code === stocked.warehouse);
  return wh ? formatAddress(wh.address, wh.name) : lines.length ? formatAddress(m.company.address, m.company.name) : '';
}

/** Pay To default: the vendor's default bill-to address. */
export function defaultPayTo(vendor: Partner | undefined) {
  const a = vendor?.addresses.find((x) => x.id === vendor.defaultBillToId) ?? vendor?.addresses[0];
  return a ? formatAddress(a, vendor?.name) : '';
}

/** Where a line's stock is put away by default: the item's bin there, else the receiving bin. */
export const defaultBin = (item: Item, warehouse: string, m: PoMasters) =>
  binFor(item, m.inv.warehouses.find((w) => w.code === warehouse), m.inv.bins, '', true);

/** A line's unit price (document currency) and discount from the price list and discount rules. */
export function linePricing(item: Item, l: Pick<GrLine, 'priceList' | 'uomCode' | 'quantity'>, draft: Pick<GrDraft, 'postingDate'>, ctx: Pick<GrContext, 'vendor' | 'fx'>) {
  const p = determinePrice({ item, partner: ctx.vendor, priceList: l.priceList, uom: l.uomCode, quantity: l.quantity, date: draft.postingDate });
  return { unitPrice: ctx.fx ? Math.round((p.price / ctx.fx) * 100) / 100 : 0, discountPct: p.discountPct };
}

/** A hand-entered line with every default taken from the item, vendor and header. */
export function lineFromItem(item: Item, draft: Pick<GrDraft, 'postingDate'>, ctx: Pick<GrContext, 'vendor' | 'fx'>, m: PoMasters, base: Partial<GrLine> = {}): GrLine {
  const priceList = ctx.vendor?.priceList && ctx.vendor.priceList !== 'Base price' ? ctx.vendor.priceList : 'Last purchase price';
  const warehouse = item.inventoryItem ? (item.warehouses[0]?.code ?? 'WH-MNL') : '';
  const line = newGrLine({
    ...base,
    itemId: item.id,
    itemNo: item.itemNo,
    name: item.name,
    description: item.description,
    uomCode: item.purchasingUom,
    uomName: m.inv.uoms.find((u) => u.code === item.purchasingUom)?.name ?? item.purchasingUom,
    itemsPerUnit: itemsPerUom(item, item.purchasingUom) ?? 1,
    warehouse,
    bin: warehouse ? defaultBin(item, warehouse, m) : '',
    priceList,
    taxCode: proposedTaxCode(item, ctx.vendor, m, draft.postingDate),
  });
  return { ...line, ...linePricing(item, line, draft, ctx) };
}

/** Receipt lines for PO lines, each receiving `qty` (defaults to what's open), with the PO line's terms. */
export function linesFromPo(po: PurchaseOrder, picks: { lineId: string; qty: number }[], m: PoMasters): GrLine[] {
  return picks.flatMap(({ lineId, qty }) => {
    const pl = po.lines.find((l) => l.id === lineId);
    const item = pl && m.items.find((i) => i.id === pl.itemId);
    if (!pl || !item) return [];
    return [
      newGrLine({
        itemId: pl.itemId,
        itemNo: pl.itemNo,
        name: pl.name,
        description: pl.description,
        quantity: Math.min(qty, openQty(pl)),
        uomCode: pl.uomCode,
        uomName: pl.uomName,
        itemsPerUnit: pl.itemsPerUnit,
        warehouse: pl.warehouse,
        bin: pl.warehouse ? defaultBin(item, pl.warehouse, m) : '',
        priceList: pl.priceList,
        unitPrice: pl.unitPrice,
        discountPct: pl.discountPct,
        taxCode: pl.taxCode,
        blanketAgreement: pl.blanketAgreement,
        requisitionSlipNo: pl.requisitionSlipNo,
        freeText: pl.freeText,
        baseId: po.id,
        baseLineId: pl.id,
        baseDocNo: poNumber(po),
      }),
    ];
  });
}
