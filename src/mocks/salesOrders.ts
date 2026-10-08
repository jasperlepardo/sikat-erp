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
import type { Attachment, DocumentSeries } from './common';
import { termId } from './masters';
import { SEED_ITEMS, itemsPerUom } from './items';
import { SEED_PARTNERS, formatAddress } from './partners';
import type { PoReference } from './purchaseOrders';
import { todayISO } from '../services/dates';
import { SEED_RATES } from './currencies';
import { RETAIL_SALES, type RetailMeans } from './retailHistory';

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
  paymentTermId: string;
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

export const SO_SERIES: DocumentSeries[] = [
  { id: 'sos-primary', name: 'Primary', prefix: 'SO-', firstNo: 410001, manual: false, isDefault: true, active: true },
  { id: 'sos-gov', name: 'Government', prefix: 'SO-', firstNo: 470001, manual: false, isDefault: false, active: true },
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
    paymentTermId: termId('Net 30'),
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

/** The BSP reference rate on a date (the latest on or before it), PHP per unit — for seeded foreign-currency documents. */
export function seedRateOn(currency: string, date: string) {
  const day = SEED_RATES.filter((d) => d.date <= date && d.rates[currency] > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
  return day?.rates[currency] ?? 0;
}

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
    paymentTermId: c.customerPaymentTermId,
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

const RETAIL_PAYMENT_METHOD: Record<RetailMeans, string> = { gcash: 'GCASH', cash: 'CASH', card: 'CARD' };

const idOf = (itemNo: string) => SEED_ITEMS.find((i) => i.itemNo === itemNo)!.id;
/** Corporate orders are numbered after the store walk-in sales. */
export const CORPORATE_SO_START = 410013 + RETAIL_SALES.length;
const CORPORATE_ORDERS: SalesOrder[] = [
  header('so-c01', CORPORATE_SO_START, 'bp-004', {
    postingDate: '2026-08-06', documentDate: '2026-08-06', deliveryDate: '2026-08-14', status: 'Closed', closeDate: '2026-08-14',
    customerRef: 'CGS-PO-2026-0412', remarks: 'Laptops for the new Clark office. Delivered, invoiced and paid.',
    lines: [line('so-c01-1', idOf('MAC-MBA13-M5-8G-16-512-MDN'), 10, { deliveredQty: 10, status: 'Closed', priceList: 'Wholesale', discountPct: 3, priceSource: 'Discount group Customers – Trade × Mac: 3%' })],
  }),
  header('so-c02', CORPORATE_SO_START + 1, 'bp-005', {
    postingDate: '2026-08-20', documentDate: '2026-08-20', deliveryDate: '2026-08-29', status: 'Closed', closeDate: '2026-08-29',
    customerRef: 'MPAS-PO-0820', remarks: 'iPad Pro and Pencil Pro kits for the storyboard team.',
    lines: [
      line('so-c02-1', idOf('IPD-PRO-11-256-SG-WF-SBK'), 4, { deliveredQty: 4, status: 'Closed', priceList: 'Wholesale', discountPct: 3, priceSource: 'Discount group Customers – Trade × iPad: 3%' }),
      line('so-c02-2', idOf('ACC-PENPRO'), 4, { deliveredQty: 4, status: 'Closed', priceList: 'Wholesale', discountPct: 5, priceSource: 'Discount group Customers – Trade × Accessories: 5%' }),
    ],
  }),
  header('so-c03', CORPORATE_SO_START + 2, 'bp-044', {
    postingDate: '2026-08-26', documentDate: '2026-08-26', deliveryDate: '2026-09-01', status: 'Closed', closeDate: '2026-09-01',
    customerRef: 'KVA-MNL-0826', remarks: 'MacBook Airs for the Manila design team. Delivered 1 Sep; the invoice is past due.',
    lines: [line('so-c03-1', idOf('MAC-MBA13-M5-8G-16-512-SKB'), 6, { deliveredQty: 6, status: 'Closed' })],
  }),
  header('so-c04', CORPORATE_SO_START + 3, 'bp-007', {
    postingDate: '2026-09-09', documentDate: '2026-09-09', deliveryDate: '2026-09-11', status: 'Closed', closeDate: '2026-09-11',
    customerRef: 'GNB-2026-PEN', remarks: 'Apple Pencils for the cooperative’s teacher-members. VAT-exempt sale to a cooperative; half paid.',
    lines: [line('so-c04-1', idOf('ACC-PENUSBC'), 12, { deliveredQty: 12, status: 'Closed', taxCode: '33' })],
  }),
  header('so-c05', CORPORATE_SO_START + 4, 'bp-041', {
    postingDate: '2026-09-24', documentDate: '2026-09-24', deliveryDate: '2026-10-02',
    customerRef: 'ARHI-PR-2026-118', remarks: 'Phones for the field researchers. 12 delivered 2 Oct; 8 wait on Luzon’s balance (PO 260051).',
    lines: [line('so-c05-1', idOf('IPH-17-256-LAV'), 20, { deliveredQty: 12, priceList: 'Wholesale', discountPct: 2, priceSource: 'Discount group Customers – Trade × iPhone: 2%' })],
  }),
  header('so-c06', CORPORATE_SO_START + 5, 'bp-040', {
    postingDate: '2026-10-05', documentDate: '2026-10-05', deliveryDate: '2026-10-20',
    customerRef: 'SBML-PO-2026-077', remarks: 'iPad Airs for the vessel crews. Nothing on hand; on order from Apple (Import 860007).',
    lines: [line('so-c06-1', idOf('IPD-AIR-11-128-WF-BLU'), 30, { priceList: 'Wholesale', discountPct: 3, priceSource: 'Discount group Customers – Trade × iPad: 3%' })],
  }),
];

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
  // A USD export order: priced in PHP from the price list, converted at the BSP rate on the posting date.
  header('so-009', 410007, 'bp-010', {
    postingDate: '2026-09-08',
    documentDate: '2026-09-08',
    deliveryDate: '2026-09-10',
    customerRef: 'HBL-PO-SG-2026-077',
    status: 'Closed',
    closeDate: '2026-09-10',
    remarks: 'MacBooks for Harbourline’s Manila sales office, billed in USD. Delivered and invoiced 10 Sep; half paid 22 Sep, balance outstanding.',
    lines: [
      line('so-009-1', 'apl-0240', 3, {
        deliveredQty: 3,
        status: 'Closed',
        discountPct: 3,
        unitPrice: round2(byId('apl-0240').basePrice / 1.12 / seedRateOn('USD', '2026-09-08')),
        priceSource: 'Discount group Customers – Trade × Mac: 3%',
      }),
    ],
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
  // Open orders for the 20W adapter (apl-0361): Committed at the Manila warehouse and at a store.
  header('so-010', 410008, 'bp-003', {
    postingDate: '2026-10-06',
    documentDate: '2026-10-06',
    deliveryDate: '2026-10-16',
    customerRef: 'BSB-PO-2026-1188',
    remarks: 'Chargers for the branch phone refresh. 28 on hand in Manila; the rest on PO 260035.',
    lines: [line('so-010-1', 'apl-0361', 36, { priceList: 'Wholesale', discountPct: 5, priceSource: 'Discount group Customers – Trade × Accessories: 5%' })],
  }),
  header('so-011', 410009, 'bp-001', {
    postingDate: '2026-10-07',
    documentDate: '2026-10-07',
    deliveryDate: '2026-10-09',
    remarks: 'Walk-in reservation at Greenbelt 3, paid; customer picks up Friday.',
    paymentMethod: 'GCASH',
    lines: [line('so-011-1', 'apl-0361', 1, { warehouse: 'ST-001', priceList: 'Retail', priceSource: 'Retail' })],
  }),
  // Sales that explain where received stock went (with the deliveries in mocks/deliveries.ts).
  header('so-012', 470002, 'bp-009', {
    seriesId: 'sos-gov',
    postingDate: '2026-09-04',
    documentDate: '2026-09-04',
    deliveryDate: '2026-10-06',
    customerRef: 'SO-2026-0412',
    remarks: 'DepEd Pasig — 40 iPads for teachers (PhilGEPS award). First 24 delivered 6 Oct; the rest on PO 260006.',
    lines: [line('so-012-1', 'apl-0080', 40, { priceList: 'Government', priceSource: 'Government', deliveredQty: 24 })],
  }),
  header('so-013', 410010, 'bp-002', {
    postingDate: '2026-09-02',
    documentDate: '2026-09-02',
    deliveryDate: '2026-09-04',
    status: 'Closed',
    closeDate: '2026-09-04',
    customerRef: 'NPM-PR-2026-0877',
    remarks: 'MacBook Airs for the mall admin offices. Delivered in full 4 Sep.',
    lines: [
      line('so-013-1', 'apl-0242', 15, { deliveredQty: 15, status: 'Closed', priceList: 'Wholesale', discountPct: 3, priceSource: 'Discount group Customers – Trade × Mac: 3%' }),
      line('so-013-2', 'apl-0243', 8, { deliveredQty: 8, status: 'Closed', priceList: 'Wholesale', discountPct: 3, priceSource: 'Discount group Customers – Trade × Mac: 3%' }),
    ],
  }),
  header('so-014', 410011, 'bp-001', {
    postingDate: '2026-09-06',
    documentDate: '2026-09-06',
    deliveryDate: '2026-09-06',
    status: 'Closed',
    closeDate: '2026-09-06',
    remarks: 'Walk-in sale at the Cebu store, picked up the same day.',
    paymentMethod: 'GCASH',
    lines: [line('so-014-1', 'apl-0010', 2, { warehouse: 'WH-CEB', deliveredQty: 2, status: 'Closed', priceList: 'Retail', priceSource: 'Retail' })],
  }),
  header('so-015', 410012, 'bp-001', {
    postingDate: '2026-09-13',
    documentDate: '2026-09-13',
    deliveryDate: '2026-09-13',
    status: 'Closed',
    closeDate: '2026-09-13',
    remarks: 'Walk-in sale at the Davao store, picked up the same day.',
    paymentMethod: 'GCASH',
    lines: [
      line('so-015-1', 'apl-0002', 1, { warehouse: 'WH-DVO', deliveredQty: 1, status: 'Closed', priceList: 'Retail', priceSource: 'Retail' }),
      line('so-015-2', 'apl-0007', 1, { warehouse: 'WH-DVO', deliveredQty: 1, status: 'Closed', priceList: 'Retail', priceSource: 'Retail' }),
    ],
  }),
  // Store walk-in sales of the replenishment stock (mocks/retailHistory.ts), sold in pieces.
  ...RETAIL_SALES.map((r) =>
    header(r.id, 410013 + r.n, 'bp-001', {
      postingDate: r.date,
      documentDate: r.date,
      deliveryDate: r.date,
      status: 'Closed',
      closeDate: r.date,
      remarks: `Walk-in sale at ${r.store}, picked up the same day.`,
      paymentMethod: RETAIL_PAYMENT_METHOD[r.means],
      lines: r.lines.map((l, i) =>
        line(`${r.id}-${i + 1}`, l.itemId, l.quantity, {
          warehouse: r.store, uomCode: 'pc', uomName: 'Piece', itemsPerUnit: 1, deliveredQty: l.quantity, status: 'Closed', priceList: 'Retail', priceSource: 'Retail',
        }),
      ),
    }),
  ),
  // B2B orders at every stage, each supplied by its own PO into Pasig (po-055–po-060).
  ...CORPORATE_ORDERS,
];
