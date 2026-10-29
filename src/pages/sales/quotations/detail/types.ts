import type { Errors } from '../../../../components/form/fields';
import { formatAddress } from '../../../../mocks/address';
import type { Company } from '../../../../mocks/companies';
import type { Currency, ExchangeRate } from '../../../../mocks/currencies';
import { itemsPerUom, seedLineDefaults, type Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import { newQuoteLine, type Quotation, type QuoteLine } from '../../../../mocks/quotations';
import { SYSTEM_TAX_CODES } from '../../../../mocks/taxes';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { BASE_PRICE_LIST_ID, determinePrice, isGrossList } from '../../../../services/priceLists';
import { determineTax, type TaxMasterData } from '../../../../services/taxDetermination';
import { round2 } from '../../../../services/num';

export type Draft = Omit<Quotation, 'id'> & { id?: string };

const ALL_CURRENCIES = 'All currencies';

export interface QtMasters {
  customers: Partner[];
  items: Item[];
  inv: InventoryMasters;
  tax: TaxMasterData;
  currencies: Currency[];
  rates: ExchangeRate[];
  company: Company;
}

export interface QtContext {
  customer?: Partner;
  fx: number;
  /** The rate used, with the bulletin day and source it comes from, for the "Exchange rate" field. PHP → undefined. */
  fxRate?: { rate: number; date: string; source: string };
  rateOf: (code: string) => number;
  vatRegistered: boolean;
  readOnly: boolean;
  added: boolean;
}

export interface QtTabProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  errors: Errors;
  m: QtMasters;
  ctx: QtContext;
}

export function proposedTaxCode(item: Item, customer: Partner | undefined, m: QtMasters, date: string) {
  if (!customer) return '';
  return determineTax('Sales', item, customer, m.tax, date).taxCode?.code ?? '';
}

export function linePricing(
  item: Item,
  l: Pick<QuoteLine, 'priceListId' | 'uomCode' | 'quantity' | 'taxCode'>,
  draft: Draft,
  customers: Partner[],
  vatRegistered: boolean,
  rateOf: (c: string) => number,
  fx: number,
) {
  const customer = customers.find((c) => c.id === draft.customerId);
  const p = determinePrice({ item, partner: customer, priceListId: l.priceListId, uom: l.uomCode, quantity: l.quantity, date: draft.postingDate });
  const vat = vatRegistered ? rateOf(SYSTEM_TAX_CODES.VATABLE) : 0;
  const net = isGrossList(p.basisListId) ? p.price / (1 + vat / 100) : p.price;
  return { unitPrice: fx ? round2(net / fx) : 0, discountPct: p.discountPct, priceSource: p.source.label };
}

export function customerDefaults(c: Partner, d: Draft): Partial<Draft> {
  const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
  const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? bill;
  return {
    customerId: c.id,
    customerCode: c.code,
    customerName: c.name,
    contactId: c.defaultContactId,
    currency: c.currency === ALL_CURRENCIES ? 'PHP' : c.currency,
    paymentTermId: c.customerPaymentTermId,
    paymentMethod: c.defaultPaymentMethod || d.paymentMethod,
    projectId: c.projectId,
    shippingType: c.shippingType,
    federalTaxId: c.tin,
    salesEmployeeId: c.salesEmployeeId,
    journalRemark: `Sales Quotations – ${c.code}`,
    billTo: bill ? formatAddress(bill, c.name) : '',
    shipTo: ship ? formatAddress(ship, c.name) : '',
  };
}

/** A line for `item`: its sales unit, first warehouse, the customer's price list and tax code, priced. */
export function lineFromItem(item: Item, draft: Draft, ctx: QtContext, m: QtMasters, base: Partial<QuoteLine> = {}): QuoteLine {
  const uom = m.inv.uoms.find((u) => u.code === item.salesUom);
  const line = newQuoteLine({
    ...base,
    itemId: item.id,
    itemNo: item.itemNo,
    description: item.description || item.name,
    uomCode: item.salesUom,
    uomName: uom?.name ?? item.salesUom,
    itemsPerUnit: itemsPerUnit(item),
    warehouse: item.inventoryItem ? (item.warehouses[0]?.code ?? 'WH-001') : '',
    priceListId: ctx.customer?.priceListId || BASE_PRICE_LIST_ID,
    taxCode: proposedTaxCode(item, ctx.customer, m, draft.postingDate),
    taxOverridden: false,
    // SAP B1 contents fields that default from the item.
    ...seedLineDefaults(item.id),
    customerDescription: item.description || item.name,
  });
  return { ...line, ...linePricing(item, line, draft, m.customers, ctx.vatRegistered, ctx.rateOf, ctx.fx) };
}

const itemsPerUnit = (item: Item) => itemsPerUom(item, item.salesUom) ?? 1;
