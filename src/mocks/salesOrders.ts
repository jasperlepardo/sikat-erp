/**
 * Sales orders. Fields follow the SAP B1 Sales Order field map: header, Contents (lines),
 * Logistics, Accounting, Attachments and footer.
 *
 * Settled here, for the prototype:
 * - Customer name is a snapshot taken when the customer is picked.
 * - Unit Price is net of VAT. A line priced from a gross (VAT-inclusive) list, like the SRP,
 *   takes the list price less the standard 12% VAT: a VATable line comes back to the SRP, and a
 *   zero-rated or exempt customer pays the VAT-exclusive price.
 * - Price Source shows the pricing rule that set the price (special price, period/volume
 *   discount, discount group or the price list) and turns to Manual once the price or discount
 *   is typed over.
 * - Open lines commit stock: adding or updating the order moves the item's Committed in the
 *   line's warehouse by the change in open quantity (inventory units). Closing or cancelling
 *   releases it.
 * - Deliveries aren't built, so Delivered Qty stays 0 except on seeded history.
 * - Return Reason, Summary Type, the drop-ship procurement flags, Central Bank Ind. and Use
 *   Shipped Goods Account are left out: returns, procurement documents, central-bank reporting
 *   and shipped-goods accounting don't exist here. Language shows only with multi-language on.
 * - Withholding by the customer (CWT, government VAT) is shown as a note: the customer deducts
 *   it when paying, it isn't part of the order total.
 */
import type { Attachment } from './common';
import { SEED_ITEMS, itemsPerUom } from './items';
import { SEED_PARTNERS, formatAddress } from './partners';
import type { PoReference } from './purchaseOrders';
import { todayISO } from '../services/dates';

export type SoStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const SO_STATUSES: SoStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

export type SoDocType = 'Item' | 'Service';
export type SoRowStatus = 'Open' | 'Closed';

export interface SoLine {
  id: string;
  /** Item documents. */
  itemId: string;
  itemNo: string;
  /** Defaults from the item; editing it here doesn't change the item. */
  description: string;
  /** In the sales UoM. */
  quantity: number;
  deliveredQty: number;
  uomCode: string;
  uomName: string;
  /** Inventory units in one sales unit. */
  itemsPerUnit: number;
  warehouse: string;
  priceList: string;
  /** Net of VAT, per sales unit, in the document currency. */
  unitPrice: number;
  discountPct: number;
  /** What set the price: "Special price", "Discount group …", the list name, or "Manual". */
  priceSource: string;
  taxCode: string;
  /** Service documents: the revenue account the line posts to. */
  glAccount: string;
  status: SoRowStatus;
}

export interface SalesOrder {
  id: string;

  // Header
  customerId: string;
  customerCode: string;
  customerName: string;
  contactId: string;
  customerRef: string;
  currency: string;
  seriesId: string;
  docNum: number;
  status: SoStatus;
  postingDate: string;
  deliveryDate: string;
  documentDate: string;
  closeDate: string;

  // Contents
  docType: SoDocType;
  lines: SoLine[];

  // Logistics
  shipTo: string;
  billTo: string;
  shippingType: string;
  printPickingSheet: boolean;
  language: string;
  approved: boolean;
  allowPartialDelivery: boolean;
  pickPackRemarks: string;
  bpChannelName: string;
  bpChannelContact: string;

  // Accounting
  journalRemark: string;
  project: string;
  cancellationDate: string;
  requiredDate: string;
  paymentTerms: string;
  paymentMethod: string;
  indicator: string;
  /** The customer's TIN, as printed on the order. */
  federalTaxId: string;
  orderNumber: string;
  dueDate: string;
  /** Manually Recalculate Due Date: months and days added to the posting date instead of the terms. */
  dueMonths: number;
  dueDays: number;
  cashDiscountDays: number;
  references: PoReference[];

  // Attachments
  attachments: Attachment[];

  // Footer
  salesEmployee: string;
  owner: string;
  discountPct: number;
  freight: number;
  freightTaxCode: string;
  /** Round the total by the currency's rounding rule. */
  rounding: boolean;
  remarks: string;
}

export const SALES_SETTINGS = {
  manageFreightInDocuments: true,
  multiLanguageSupport: false,
  /** Warn when an order takes the customer over their credit limit. */
  creditLimitCheck: true,
};

export interface SoSeries {
  id: string;
  name: string;
  firstNo: number;
}
export const SO_SERIES: SoSeries[] = [
  { id: 'sos-primary', name: 'Primary', firstNo: 410001 },
  { id: 'sos-gov', name: 'Government', firstNo: 470001 },
];

export const NO_SALES_EMPLOYEE = '-No Sales Employee-';

/** What an open item order commits, in inventory units per "itemId@warehouse" (none while draft, closed or cancelled). */
export function openCommitted(so: Pick<SalesOrder, 'status' | 'docType' | 'lines'>) {
  const out = new Map<string, number>();
  if (so.status !== 'Open' || so.docType !== 'Item') return out;
  for (const l of so.lines) {
    if (!l.itemId || !l.warehouse || l.status === 'Closed') continue;
    const key = `${l.itemId}@${l.warehouse}`;
    out.set(key, (out.get(key) ?? 0) + Math.max(0, l.quantity - l.deliveredQty) * (l.itemsPerUnit || 1));
  }
  return out;
}

const TODAY = todayISO();

export const newSoLine = (patch: Partial<SoLine> = {}): SoLine => ({
  itemId: '',
  itemNo: '',
  description: '',
  quantity: 1,
  deliveredQty: 0,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  warehouse: 'WH-MNL',
  priceList: 'Base price',
  unitPrice: 0,
  discountPct: 0,
  priceSource: '',
  taxCode: '',
  glAccount: '',
  status: 'Open',
  ...patch,
  // A copied line passes id: undefined; it still needs an id of its own.
  id: patch.id ?? `sl-${crypto.randomUUID().slice(0, 8)}`,
});

export function blankSalesOrder(owner: string): Omit<SalesOrder, 'id'> {
  return {
    customerId: '',
    customerCode: '',
    customerName: '',
    contactId: '',
    customerRef: '',
    currency: 'PHP',
    seriesId: SO_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: TODAY,
    deliveryDate: '',
    documentDate: TODAY,
    closeDate: '',
    docType: 'Item',
    lines: [],
    shipTo: '',
    billTo: '',
    shippingType: '',
    printPickingSheet: false,
    language: 'English',
    approved: true,
    allowPartialDelivery: true,
    pickPackRemarks: '',
    bpChannelName: '',
    bpChannelContact: '',
    journalRemark: '',
    project: '— None —',
    cancellationDate: '',
    requiredDate: '',
    paymentTerms: 'Net 30',
    paymentMethod: 'BANK',
    indicator: '— None —',
    federalTaxId: '',
    orderNumber: '',
    dueDate: '',
    dueMonths: 0,
    dueDays: 0,
    cashDiscountDays: 0,
    references: [],
    attachments: [],
    salesEmployee: NO_SALES_EMPLOYEE,
    owner,
    discountPct: 0,
    freight: 0,
    freightTaxCode: '31',
    rounding: false,
    remarks: '',
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const byId = (id: string) => SEED_ITEMS.find((i) => i.id === id)!;
const partner = (id: string) => SEED_PARTNERS.find((p) => p.id === id)!;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A seeded line: SRP-based list price net of 12% VAT, with the rule that priced it. */
const line = (id: string, itemId: string, quantity: number, patch: Partial<SoLine> = {}): SoLine => {
  const item = byId(itemId);
  return newSoLine({
    id,
    itemId,
    itemNo: item.itemNo,
    description: item.name,
    quantity,
    uomCode: item.salesUom,
    uomName: item.salesUom === 'pc' ? 'Piece' : item.salesUom,
    itemsPerUnit: itemsPerUom(item, item.salesUom) ?? 1,
    warehouse: 'WH-MNL',
    priceList: 'Base price',
    unitPrice: round2(item.basePrice / 1.12),
    priceSource: 'Base price',
    taxCode: '31',
    ...patch,
  });
};

const header = (id: string, docNum: number, customerId: string, patch: Partial<SalesOrder>): SalesOrder => {
  const c = partner(customerId);
  const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
  const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? bill;
  return {
    ...blankSalesOrder('Jasper L.'),
    id,
    docNum,
    status: 'Open',
    customerId,
    customerCode: c.code,
    customerName: c.name,
    contactId: c.defaultContactId,
    currency: c.currency === 'All currencies' ? 'PHP' : c.currency,
    paymentTerms: c.customerPaymentTerms,
    federalTaxId: c.tin,
    shippingType: c.shippingType,
    salesEmployee: c.salesEmployee || NO_SALES_EMPLOYEE,
    allowPartialDelivery: c.allowPartialDelivery,
    billTo: bill ? formatAddress(bill, c.name) : '',
    shipTo: ship ? formatAddress(ship, c.name) : '',
    journalRemark: `Sales Orders – ${c.code}`,
    ...patch,
  };
};

export const SEED_SALES_ORDERS: SalesOrder[] = [
  header('so-001', 410001, 'bp-003', {
    postingDate: '2026-09-22',
    documentDate: '2026-09-22',
    deliveryDate: '2026-10-08',
    customerRef: 'BSB-PR-2026-0915',
    remarks: 'Laptop refresh, batch 1 of 3. Special price: 6% off Wholesale (contract through Dec 2026).',
    lines: [
      line('so-001-1', 'apl-0239', 12, { priceList: 'Wholesale', unitPrice: round2(94750 / 1.12), discountPct: 6, priceSource: 'Special price: 6% off Wholesale' }),
      line('so-001-2', 'apl-0240', 8, { priceList: 'Wholesale', unitPrice: round2(94750 / 1.12), discountPct: 6, priceSource: 'Special price: 6% off Wholesale', deliveredQty: 8, status: 'Closed' }),
    ],
  }),
  header('so-002', 470001, 'bp-009', {
    seriesId: 'sos-gov',
    postingDate: '2026-09-30',
    documentDate: '2026-09-30',
    deliveryDate: '2026-10-20',
    customerRef: 'DepEd-Pasig-PO-26-0412',
    project: 'PRJ-002 DepEd Pasig iPad rollout',
    remarks: 'Awarded under public bidding; contract price per the special price list.',
    lines: [line('so-002-1', 'apl-0079', 120, { priceList: 'Government', unitPrice: round2(69900 / 1.12), priceSource: 'Special price (100+)' })],
  }),
  header('so-003', 410002, 'bp-001', {
    postingDate: '2026-10-05',
    documentDate: '2026-10-05',
    deliveryDate: '2026-10-05',
    status: 'Draft',
    docNum: 0,
    remarks: 'Walk-in reservation, customer pays on pick-up.',
    paymentMethod: 'GCASH',
    lines: [line('so-003-1', 'apl-0361', 2, { priceList: 'Retail', priceSource: 'Retail' })],
  }),
  header('so-004', 410003, 'bp-004', {
    postingDate: '2026-08-14',
    documentDate: '2026-08-14',
    deliveryDate: '2026-08-21',
    status: 'Closed',
    closeDate: '2026-08-21',
    remarks: 'Delivered and invoiced in full.',
    lines: [line('so-004-1', 'apl-0362', 30, { deliveredQty: 30, status: 'Closed', discountPct: 5, taxCode: '32', priceSource: 'Discount group Customers – Trade × Accessories: 5%' })],
  }),
  header('so-005', 410004, 'bp-005', {
    postingDate: '2026-08-26',
    documentDate: '2026-08-26',
    deliveryDate: '2026-08-28',
    customerRef: 'MPAS-PO-0826',
    status: 'Closed',
    closeDate: '2026-08-28',
    remarks: 'Render workstation refresh for the animation team. Delivered, invoiced and paid.',
    lines: [
      line('so-005-1', 'apl-0241', 4, { deliveredQty: 4, status: 'Closed', discountPct: 3, priceSource: 'Discount group Customers – Trade × Mac: 3%' }),
      line('so-005-2', 'apl-0364', 4, { deliveredQty: 4, status: 'Closed', discountPct: 5, priceSource: 'Discount group Customers – Trade × Accessories: 5%' }),
    ],
  }),
  header('so-006', 410005, 'bp-002', {
    postingDate: '2026-09-15',
    documentDate: '2026-09-15',
    deliveryDate: '2026-10-09',
    customerRef: 'NPM-PR-2026-0931',
    remarks: 'Mall management phones. 6 delivered and billed; the other 4 on the next delivery.',
    lines: [line('so-006-1', 'apl-0002', 10, { deliveredQty: 6 })],
  }),
  header('so-007', 410006, 'bp-007', {
    postingDate: '2026-09-29',
    documentDate: '2026-09-29',
    deliveryDate: '2026-10-12',
    customerRef: 'GNB-2026-RAFFLE',
    remarks: 'AirPods for the cooperative’s members’ raffle. VAT-exempt sale to a cooperative.',
    lines: [line('so-007-1', 'apl-0352', 6, { taxCode: '33' })],
  }),
  header('so-008', 0, 'bp-006', {
    postingDate: '2026-10-03',
    documentDate: '2026-10-03',
    deliveryDate: '2026-10-10',
    status: 'Draft',
    remarks: 'Phone order, customer to confirm colour. 10.10 sale applies.',
    paymentMethod: 'CASH',
    lines: [line('so-008-1', 'apl-0350', 1, { discountPct: 10, taxCode: '33', priceSource: 'Period discount 10%' })],
  }),
];
