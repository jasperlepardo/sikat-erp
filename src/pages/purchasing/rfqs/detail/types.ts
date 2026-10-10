import type { Errors } from '../../../../components/form/fields';
import type { Currency, ExchangeRate } from '../../../../mocks/currencies';
import { rateAt, vatNotPaidToVendor } from '../../../../mocks/taxes';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { rateOn } from '../../../../services/masterData';
import { todayISO } from '../../../../services/dates';
import type { Partner } from '../../../../mocks/partners';
import type { Company } from '../../../../mocks/companies';
import type { Item } from '../../../../mocks/items';
import type { RfqInput } from '../../../../services/rfqs';
import { itemsPerUom } from '../../../../mocks/items';
import { BLANKET_AGREEMENTS } from '../../../../mocks/purchaseOrders';
import { newRfqLine, type RfqLine } from '../../../../mocks/rfqs';
import { determineTax, type TaxMasterData } from '../../../../services/taxDetermination';
import { BASE_PRICE_LIST_ID, LAST_PURCHASE_PRICE_LIST_ID, determinePrice } from '../../../../services/priceLists';

import { formatAddress } from '../../../../mocks/address';
export { formatAddress };

export type RfqDraft = RfqInput;

export interface RfqMasters {
  vendors: Partner[];
  items: Item[];
  inv: InventoryMasters;
  tax: TaxMasterData;
  currencies: Currency[];
  rates: ExchangeRate[];
  company: Company;
}

export interface RfqTabProps {
  draft: RfqDraft;
  update: (patch: Partial<RfqDraft>) => void;
  errors: Errors;
  m: RfqMasters;
  ctx: RfqContext;
  onVendorSaved: (vendor: Partner) => void;
}

export interface RfqContext {
  vendor?: Partner;
  rateOf: (taxCode: string) => number;
  isReverseCharge: (taxCode: string) => boolean;
  fx: number;
  fxDate: string;
  readOnly: boolean;
  added: boolean;
}

export const ALL_CURRENCIES = 'All currencies';

export function buildContext(draft: RfqDraft, m: RfqMasters): RfqContext {
  const date = draft.postingDate || todayISO();
  const fxRate = draft.currency === 'PHP' ? undefined : rateOn(m.rates, draft.currency, date);
  return {
    vendor: m.vendors.find((v) => v.id === draft.vendorId),
    rateOf: (code) => {
      const c = m.tax.codes.find((x) => x.code === code);
      return c ? (rateAt(c, date) ?? 0) : 0;
    },
    isReverseCharge: (code) => vatNotPaidToVendor(m.tax.codes.find((x) => x.code === code)),
    fx: draft.currency === 'PHP' ? 1 : (fxRate?.rate ?? 0),
    fxDate: fxRate?.date ?? '',
    readOnly: draft.status === 'Closed' || draft.status === 'Cancelled',
    added: draft.status !== 'Draft',
  };
}

/** Proposed tax code for an item purchased from the vendor. */
export const proposedTaxCode = (item: Item, vendor: Partner | undefined, m: RfqMasters, date: string) =>
  vendor ? (determineTax('Purchase', item, vendor, m.tax, date).taxCode?.code ?? '') : '';

/** Default ship-to: warehouse of first inventory line, or company address for service-only. */
export function defaultShipTo(lines: RfqLine[], m: RfqMasters) {
  const stocked = lines.find((l) => l.itemId && m.items.find((i) => i.id === l.itemId)?.inventoryItem);
  if (stocked) {
    const wh = m.inv.warehouses.find((w) => w.code === 'WH-MNL');
    if (wh) return formatAddress(wh.address, wh.name);
  }
  return lines.length ? formatAddress(m.company.address, m.company.name) : '';
}

export function linePricing(item: Item, l: Pick<RfqLine, 'priceListId' | 'uomCode' | 'requiredQty'>, draft: RfqDraft, ctx: RfqContext) {
  const p = determinePrice({
    item,
    partner: ctx.vendor,
    priceListId: l.priceListId,
    uom: l.uomCode,
    quantity: l.requiredQty,
    date: draft.postingDate,
  });
  return { unitPrice: ctx.fx ? Math.round((p.price / ctx.fx) * 100) / 100 : 0, discountPct: p.discountPct, source: p.source };
}

export function lineFromItem(item: Item, draft: RfqDraft, ctx: RfqContext, m: RfqMasters, base: Partial<RfqLine> = {}): RfqLine {
  const priceListId = ctx.vendor?.priceListId && ctx.vendor.priceListId !== BASE_PRICE_LIST_ID ? ctx.vendor.priceListId : LAST_PURCHASE_PRICE_LIST_ID;
  const uom = m.inv.uoms.find((u) => u.code === item.purchasingUom);
  const line = newRfqLine({
    ...base,
    itemId: item.id,
    itemNo: item.itemNo,
    description: item.name,
    uomCode: item.purchasingUom,
    uomName: uom?.name ?? item.purchasingUom,
    itemsPerUnit: itemsPerUom(item, item.purchasingUom) ?? 1,
    priceListId,
    taxCode: proposedTaxCode(item, ctx.vendor, m, draft.postingDate),
    requiredDate: draft.requiredDate,
  });
  const { unitPrice, discountPct } = linePricing(item, line, draft, ctx);
  return { ...line, unitPrice, discountPct };
}

export function blanketOptions(vendorId: string, postingDate: string) {
  return [
    { value: '', label: '— None —' },
    ...BLANKET_AGREEMENTS.filter((b) => b.vendorId === vendorId && b.validTo >= postingDate).map((b) => ({
      value: b.no,
      label: `${b.no} · ${b.description}`,
    })),
  ];
}
