import type { Errors } from '../../../../components/form/fields';
import { newApRiLine, type ApRiLine, type ApReserveInvoice } from '../../../../mocks/apReserveInvoices';
import type { PurchaseOrder } from '../../../../mocks/purchaseOrders';
import type { Account } from '../../../../mocks/chartOfAccounts';
import type { ApRiInput } from '../../../../services/apReserveInvoices';
import { buildGrContext, defaultPayTo, linesFromPo, type GrContext, type GrMasters } from '../../goods-receipts/detail/types';
import type { Item } from '../../../../mocks/items';
import { openQty, poNumber } from '../../../../services/purchaseOrders';
import { itemsPerUom } from '../../../../mocks/items';
import { vendorDeliveryLocation } from '../../../../mocks/itemMasters';
import { BASE_PRICE_LIST_ID, LAST_PURCHASE_PRICE_LIST_ID, determinePrice } from '../../../../services/priceLists';
import { proposedTaxCode } from '../../purchase-orders/detail/types';

export type ApriDraft = ApRiInput;
export type ApriContext = GrContext;

export interface ApriMasters extends GrMasters {
  accounts: Account[];
}

export interface ApriSectionProps {
  draft: ApriDraft;
  update: (patch: Partial<ApriDraft>) => void;
  errors: Errors;
  m: ApriMasters;
  ctx: ApriContext;
}

export const buildApriContext = (draft: ApriDraft, m: ApriMasters): ApriContext =>
  buildGrContext(draft as Parameters<typeof buildGrContext>[0], m);

export type { ApReserveInvoice, PurchaseOrder };

export function riLineFromItem(item: Item, draft: ApriDraft, ctx: ApriContext, m: ApriMasters, base: Partial<ApRiLine> = {}): ApRiLine {
  const priceListId =
    ctx.vendor?.priceListId && ctx.vendor.priceListId !== BASE_PRICE_LIST_ID ? ctx.vendor.priceListId : LAST_PURCHASE_PRICE_LIST_ID;
  const warehouse = item.inventoryItem ? vendorDeliveryLocation(item.warehouses.map((w) => w.code), m.inv.warehouses) : '';
  const uomCode = item.purchasingUom;
  const uomName = m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode;
  const itemsPerUnit = itemsPerUom(item, uomCode) ?? 1;
  const taxCode = proposedTaxCode(item, ctx.vendor, m, draft.postingDate);
  const p = determinePrice({ item, partner: ctx.vendor, priceListId, uom: uomCode, quantity: 1, date: draft.postingDate });
  const unitPrice = ctx.fx ? Math.round((p.price / ctx.fx) * 100) / 100 : 0;
  return newApRiLine({
    ...base,
    itemId: item.id,
    itemNo: item.itemNo,
    name: item.name,
    description: item.description,
    uomCode,
    uomName,
    itemsPerUnit,
    warehouse,
    priceListId,
    unitPrice,
    discountPct: p.discountPct,
    taxCode,
  });
}

export function riLinesFromPo(po: PurchaseOrder, picks: { lineId: string; qty: number }[], m: ApriMasters): ApRiLine[] {
  return linesFromPo(po, picks, m).map((l) => {
    return newApRiLine({
      itemId: l.itemId,
      itemNo: l.itemNo,
      name: l.name,
      description: l.description,
      quantity: Math.min(picks.find((p) => p.lineId === l.baseLineId)?.qty ?? l.quantity, openQty(po.lines.find((pl) => pl.id === l.baseLineId)!)),
      uomCode: l.uomCode,
      uomName: l.uomName,
      itemsPerUnit: l.itemsPerUnit,
      warehouse: l.warehouse,
      priceListId: l.priceListId,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      taxCode: l.taxCode,
      blanketAgreement: l.blanketAgreement,
      freeText: l.freeText,
      baseType: 'PO' as const,
      baseId: po.id,
      baseLineId: l.baseLineId || l.id,
      baseDocNo: poNumber(po),
      bpCatalogNo: '',
      countryOfOriginCode: '',
    });
  });
}

export const orderNumbersOf = (lines: ApRiLine[]) =>
  [...new Set(lines.filter((l) => l.baseType === 'PO' && l.baseDocNo).map((l) => l.baseDocNo))].join(', ');

export { defaultPayTo, openQty };
