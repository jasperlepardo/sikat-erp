import type { Errors } from '../../../../components/form/fields';
import type { Account } from '../../../../mocks/chartOfAccounts';
import type { Company } from '../../../../mocks/companies';
import type { Currency, ExchangeRate } from '../../../../mocks/currencies';
import { itemsPerUom, type Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import { newSoLine, type SoLine } from '../../../../mocks/salesOrders';
import { SYSTEM_TAX_CODES, rateAt } from '../../../../mocks/taxes';
import type { DocumentSeries } from '../../../../mocks/common';
import { todayISO } from '../../../../services/dates';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { rateOn } from '../../../../services/masterData';
import { BASE_PRICE_LIST_ID, determinePrice, isGrossList } from '../../../../services/priceLists';
import { inventoryQty, openQty, type SoInput } from '../../../../services/salesOrders';
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
  soSeries: DocumentSeries[];
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
  /** What this order commits as saved, per "itemId@warehouse" — already inside each warehouse's Committed. */
  ownCommitted: Map<string, number>;
}

export interface SoTabProps {
  draft: SoDraft;
  update: (patch: Partial<SoDraft>) => void;
  errors: Errors;
  m: SoMasters;
  ctx: SoContext;
}

export function buildContext(draft: SoDraft, m: SoMasters, ownCommitted = new Map<string, number>()): SoContext {
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
    ownCommitted,
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
export function linePricing(item: Item, l: Pick<SoLine, 'priceListId' | 'uomCode' | 'quantity' | 'taxCode'>, draft: SoDraft, ctx: SoContext) {
  const p = determinePrice({ item, partner: ctx.customer, priceListId: l.priceListId, uom: l.uomCode, quantity: l.quantity, date: draft.postingDate });
  const vat = ctx.vatRegistered ? ctx.rateOf(SYSTEM_TAX_CODES.VATABLE) : 0;
  const net = isGrossList(p.basisListId) ? p.price / (1 + vat / 100) : p.price;
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
    priceListId: ctx.customer?.priceListId || BASE_PRICE_LIST_ID,
    taxCode: proposedTaxCode(item, ctx.customer, m, draft.postingDate),
  });
  return { ...line, ...linePricing(item, line, draft, ctx) };
}

/** Available to promise in a warehouse: In Stock − Committed, giving back what this order already commits there. */
export const availableIn = (item: Item, warehouse: string, ownCommitted = new Map<string, number>()) => {
  const w = item.warehouses.find((x) => x.code === warehouse);
  return w ? round4(w.inStock - w.committed + (ownCommitted.get(`${item.id}@${warehouse}`) ?? 0)) : 0;
};

/** An item the order's open lines need more of in a warehouse than it has free, in the inventory unit. */
export interface Shortage {
  item: Item;
  warehouse: string;
  /** What the order's open lines need there. */
  need: number;
  /** In stock − committed elsewhere. */
  available: number;
  /** need − available. */
  short: number;
  /** Already coming on open purchase orders. */
  ordered: number;
  /** What's still uncovered after the incoming POs: the suggested purchase quantity. */
  toOrder: number;
}

/** Stocked items whose open lines need more than the warehouse has free (lines on the same item and warehouse added up). */
export function shortages(draft: SoDraft, m: SoMasters, ownCommitted = new Map<string, number>()): Shortage[] {
  const need = new Map<string, { item: Item; warehouse: string; qty: number }>();
  for (const l of draft.lines) {
    const item = m.items.find((i) => i.id === l.itemId);
    if (!item?.inventoryItem || !l.warehouse) continue;
    const key = `${item.id}@${l.warehouse}`;
    const row = need.get(key) ?? { item, warehouse: l.warehouse, qty: 0 };
    row.qty += inventoryQty(l, openQty(l));
    need.set(key, row);
  }
  return [...need.values()].flatMap(({ item, warehouse, qty }) => {
    const available = availableIn(item, warehouse, ownCommitted);
    const short = round4(qty - available);
    if (short <= 0) return [];
    const ordered = item.warehouses.find((w) => w.code === warehouse)?.ordered ?? 0;
    return [{ item, warehouse, need: round4(qty), available, short, ordered, toOrder: round4(Math.max(0, short - ordered)) }];
  });
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
