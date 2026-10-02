import type { Errors } from '../../../../components/form/fields';
import type { Currency, ExchangeRate } from '../../../../mocks/currencies';
import { itemsPerUom, unitCost, unitPrice, type Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { Company } from '../../../../mocks/companies';
import { PURCHASING_SETTINGS, newPoLine, type PoLine } from '../../../../mocks/purchaseOrders';
import { rateAt, vatNotPaidToVendor } from '../../../../mocks/taxes';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { rateOn } from '../../../../services/masterData';
import type { PoInput } from '../../../../services/purchaseOrders';
import { determineTax, type TaxMasterData } from '../../../../services/taxDetermination';

export type PoDraft = PoInput;

/** Master data the PO form reads, loaded once. */
export interface PoMasters {
  vendors: Partner[];
  items: Item[];
  inv: InventoryMasters;
  tax: TaxMasterData;
  currencies: Currency[];
  rates: ExchangeRate[];
  /** The company picked in the navbar switcher: "our" address on service-only POs. */
  company: Company;
}

export interface PoTabProps {
  draft: PoDraft;
  update: (patch: Partial<PoDraft>) => void;
  errors: Errors;
  m: PoMasters;
  ctx: PoContext;
  /** A vendor changed from inside the PO (e.g. an address added), so the form uses the saved record. */
  onVendorSaved: (vendor: Partner) => void;
}

/** Values derived from the draft and master data that several tabs need. */
export interface PoContext {
  vendor?: Partner;
  /** Tax rate (%) of a code on the posting date. */
  rateOf: (taxCode: string) => number;
  /** Codes whose VAT the vendor isn't paid: reverse charge (45, you remit it) and importation (46, paid to Customs). */
  isReverseCharge: (taxCode: string) => boolean;
  /** PHP per unit of the document currency on the posting date (1 for PHP, 0 when missing). */
  fx: number;
  /** Closed or cancelled: read-only except remarks. */
  readOnly: boolean;
  /** Added (has a number): vendor, series and number can't change. */
  added: boolean;
}

export const ALL_CURRENCIES = 'All currencies';

export function buildContext(draft: PoDraft, m: PoMasters): PoContext {
  const date = draft.postingDate || new Date().toISOString().slice(0, 10);
  return {
    vendor: m.vendors.find((v) => v.id === draft.vendorId),
    rateOf: (code) => {
      const c = m.tax.codes.find((x) => x.code === code);
      return c ? (rateAt(c, date) ?? 0) : 0;
    },
    isReverseCharge: (code) => vatNotPaidToVendor(m.tax.codes.find((x) => x.code === code)),
    fx: draft.currency === 'PHP' ? 1 : (rateOn(m.rates, draft.currency, date)?.rate ?? 0),
    readOnly: draft.status === 'Closed' || draft.status === 'Cancelled',
    added: draft.status !== 'Draft',
  };
}

import { formatAddress } from '../../../../mocks/address';

export { formatAddress };

/**
 * Ship To default: the address of the warehouse the goods go to (first stocked
 * line), or the current company's address when the PO only has services.
 */
export function defaultShipTo(lines: PoLine[], m: PoMasters) {
  const stocked = lines.find((l) => l.warehouse && m.items.find((i) => i.id === l.itemId)?.inventoryItem);
  const wh = stocked && m.inv.warehouses.find((w) => w.code === stocked.warehouse);
  return wh ? formatAddress(wh.address, wh.name) : lines.length ? formatAddress(m.company.address, m.company.name) : '';
}

/**
 * Price in PHP of one `uom` of the item from a price list. Price lists aren't built yet:
 * "Last purchase price" is the item cost; the others use the item's selling price for that
 * unit (its own price, or qty × base price).
 */
export const listPrice = (item: Item, priceList: string, uom = item.purchasingUom) =>
  priceList === 'Last purchase price' ? unitCost(item, uom) : unitPrice(item, uom);

/** Proposed tax code for an item bought from the vendor (Settings › Accounting & Tax rules). */
export const proposedTaxCode = (item: Item, vendor: Partner | undefined, m: PoMasters, date: string) =>
  vendor ? (determineTax('Purchase', item, vendor, m.tax, date).taxCode?.code ?? '') : '';

/** A line with every default taken from the item, vendor and header. */
export function lineFromItem(item: Item, draft: PoDraft, ctx: PoContext, m: PoMasters, base: Partial<PoLine> = {}): PoLine {
  const priceList = ctx.vendor?.priceList && ctx.vendor.priceList !== 'Base price' ? ctx.vendor.priceList : 'Last purchase price';
  const uom = m.inv.uoms.find((u) => u.code === item.purchasingUom);
  return newPoLine({
    ...base,
    itemId: item.id,
    itemNo: item.itemNo,
    description: item.description,
    bpCatalogNo:
      (PURCHASING_SETTINGS.useBpCatalogNumbers && item.vendors.find((v) => v.vendorId === draft.vendorId)?.vendorItemNo) || '',
    uomCode: item.purchasingUom,
    uomName: uom?.name ?? item.purchasingUom,
    itemsPerUnit: itemsPerUom(item, item.purchasingUom) ?? 1,
    warehouse: item.inventoryItem ? (item.warehouses[0]?.code ?? 'WH-MNL') : '',
    priceList,
    unitPrice: ctx.fx ? Math.round((listPrice(item, priceList) / ctx.fx) * 100) / 100 : 0,
    taxCode: proposedTaxCode(item, ctx.vendor, m, draft.postingDate),
    mfrNo: item.manufacturers.find((x) => x.code === item.manufacturer)?.catalogNo ?? '',
    deliveryDate: draft.deliveryDate,
  });
}

/** Amount conversion for the Local / System / BP currency toggle. */
export function viewCurrency(draft: PoDraft, ctx: PoContext, m: PoMasters) {
  const system = m.currencies.find((c) => c.isSystem)?.code ?? 'USD';
  const systemFx = rateOn(m.rates, system, draft.postingDate)?.rate ?? 0;
  if (draft.currencyView === 'Local') return { code: 'PHP', convert: (n: number) => n * ctx.fx };
  if (draft.currencyView === 'System') {
    return { code: system, convert: (n: number) => (systemFx ? (n * ctx.fx) / systemFx : 0) };
  }
  return { code: draft.currency, convert: (n: number) => n };
}
