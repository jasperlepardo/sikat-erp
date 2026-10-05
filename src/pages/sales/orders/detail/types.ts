import type { Errors } from '../../../../components/form/fields';
import type { Account } from '../../../../mocks/chartOfAccounts';
import type { Company } from '../../../../mocks/companies';
import type { Currency, ExchangeRate } from '../../../../mocks/currencies';
import { itemsPerUom, type Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import { newSoLine, type SoLine } from '../../../../mocks/salesOrders';
import { SYSTEM_TAX_CODES, rateAt } from '../../../../mocks/taxes';
import { todayISO } from '../../../../services/dates';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { rateOn } from '../../../../services/masterData';
import { determinePrice, isGrossList } from '../../../../services/priceLists';
import type { SoInput } from '../../../../services/salesOrders';
import { determineTax, type TaxMasterData } from '../../../../services/taxDetermination';

export type SoDraft = SoInput;

export const SO_LIST_PATH = '/sales/sales-orders';
export const ALL_CURRENCIES = 'All currencies';

/** Master data the sales order form reads, loaded once. */
export interface SoMasters {
  customers: Partner[];
  items: Item[];
  inv: InventoryMasters;
  tax: TaxMasterData;
  currencies: Currency[];
  rates: ExchangeRate[];
  accounts: Account[];
  company: Company;
}

/** Values derived from the draft and master data that several sections need. */
export interface SoContext {
  customer?: Partner;
  /** Tax rate (%) of a code on the posting date. */
  rateOf: (taxCode: string) => number;
  /** PHP per unit of the document currency on the posting date (1 for PHP, 0 when missing). */
  fx: number;
  /** The company charges VAT (so VAT-inclusive list prices carry it). */
  vatRegistered: boolean;
  fxDate: string;
  /** Closed or cancelled: read-only except remarks and attachments. */
  readOnly: boolean;
  /** Added (has a number): customer, series and currency can't change. */
  added: boolean;
}

export interface SoTabProps {
  draft: SoDraft;
  update: (patch: Partial<SoDraft>) => void;
  errors: Errors;
  m: SoMasters;
  ctx: SoContext;
}

export function buildContext(draft: SoDraft, m: SoMasters): SoContext {
  const date = draft.postingDate || todayISO();
  const fxRate = draft.currency === 'PHP' ? undefined : rateOn(m.rates, draft.currency, date);
  return {
    customer: m.customers.find((c) => c.id === draft.customerId),
    rateOf: (code) => {
      const c = m.tax.codes.find((x) => x.code === code);
      return c ? (rateAt(c, date) ?? 0) : 0;
    },
    fx: draft.currency === 'PHP' ? 1 : (fxRate?.rate ?? 0),
    fxDate: fxRate?.date ?? '',
    vatRegistered: m.tax.company.vatRegistered,
    readOnly: draft.status === 'Closed' || draft.status === 'Cancelled',
    added: draft.status !== 'Draft',
  };
}

/** Proposed output tax code for selling the item to the customer (Settings › Accounting & Tax rules). */
export const proposedTaxCode = (item: Item, customer: Partner | undefined, m: SoMasters, date: string) =>
  customer ? (determineTax('Sales', item, customer, m.tax, date).taxCode?.code ?? '') : '';

/**
 * Unit price (net of VAT, document currency), discount and price source for a line: special
 * price, period/volume discount or discount group on top of the price list (Inventory › Price
 * Lists). A VAT-inclusive list price (like the SRP) has the standard 12% VAT taken out — not the
 * line's rate, so a zero-rated or exempt customer pays the VAT-exclusive price, not the SRP.
 */
export function linePricing(item: Item, l: Pick<SoLine, 'priceList' | 'uomCode' | 'quantity' | 'taxCode'>, draft: SoDraft, ctx: SoContext) {
  const p = determinePrice({ item, partner: ctx.customer, priceList: l.priceList, uom: l.uomCode, quantity: l.quantity, date: draft.postingDate });
  const vat = ctx.vatRegistered ? ctx.rateOf(SYSTEM_TAX_CODES.VATABLE) : 0;
  const net = isGrossList(p.basisList) ? p.price / (1 + vat / 100) : p.price;
  return {
    unitPrice: ctx.fx ? Math.round((net / ctx.fx) * 100) / 100 : 0,
    discountPct: p.discountPct,
    priceSource: p.source.label,
  };
}

/** The warehouse a line ships from: the first of the item's warehouses with stock, else its first. */
const defaultWarehouse = (item: Item) => (item.warehouses.find((w) => w.inStock - w.committed > 0) ?? item.warehouses[0])?.code ?? 'WH-MNL';

/** A line with every default taken from the item, customer and header. */
export function lineFromItem(item: Item, draft: SoDraft, ctx: SoContext, m: SoMasters, base: Partial<SoLine> = {}): SoLine {
  const uom = m.inv.uoms.find((u) => u.code === item.salesUom);
  const line = newSoLine({
    ...base,
    itemId: item.id,
    itemNo: item.itemNo,
    description: item.name,
    uomCode: item.salesUom,
    uomName: uom?.name ?? item.salesUom,
    itemsPerUnit: itemsPerUom(item, item.salesUom) ?? 1,
    warehouse: item.inventoryItem ? defaultWarehouse(item) : '',
    priceList: ctx.customer?.priceList || 'Base price',
    taxCode: proposedTaxCode(item, ctx.customer, m, draft.postingDate),
  });
  return { ...line, ...linePricing(item, line, draft, ctx) };
}

/** Available to promise in a warehouse: In Stock − Committed (this order's own commitment excluded by the caller). */
export const availableIn = (item: Item, warehouse: string) => {
  const w = item.warehouses.find((x) => x.code === warehouse);
  return w ? w.inStock - w.committed : 0;
};
