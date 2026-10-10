/**
 * Deliveries: goods shipped to a customer, usually copied from a sales order. Fields follow
 * the SAP B1 Delivery field map: header, Contents (lines), Logistics, Accounting, Attachments
 * and footer.
 *
 * Settled here, for the prototype:
 * - Deliveries are item-type only (a delivery ships stock), so Item/Service type and Summary
 *   Type are left out. Return Reason belongs to returns and Central Bank Ind. to other
 *   countries' localizations; both are left out.
 * - Lines copied from a sales order keep a link to the order line (Base Type / Base Ref. /
 *   Base Key / Base Row). They can ship up to the order line's open quantity, in its unit; the
 *   unit and price come from the order. An order without Allow Partial Delivery ships each
 *   line's open quantity in full.
 * - Adding a delivery posts it: stock goes out of the warehouse, the order lines count it as
 *   delivered (releasing their committed stock), and a journal entry moves the cost — Dr COGS,
 *   or Dr Shipped Goods with Use Shipped Goods Account ticked, Cr Inventory — at the item's cost.
 *   After that only remarks and attachments change.
 * - Cancel puts the stock back, reopens the order lines and reverses the entry. Close stops it
 *   being invoiced.
 * - A/R invoices aren't built yet, so Invoiced Qty stays 0 except on seeded history.
 * - Negative stock isn't allowed: a line can't ship more than the warehouse holds.
 */
import { CURRENT_USER_ID, type Attachment, type DocumentSeries } from './common';
import { plId, termId } from './masters';
import { SEED_SALES_ORDERS, seedRateOn, type SalesOrder } from './salesOrders';
import type { PoReference } from './purchaseOrders';
import { SEED_ITEMS } from './items';

export type DnStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const DN_STATUSES: DnStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

/** Shipped goods (Use Shipped Goods Account): an asset until invoiced. The chart has no dedicated account, so Goods in Transit stands in. */
export const SHIPPED_GOODS_ACCOUNT = '1340';

export interface DnLine {
  id: string;
  itemId: string;
  itemNo: string;
  /** Defaults from the item or the order line; editing it here changes neither. */
  description: string;
  /** Shipped, in the line's unit. */
  quantity: number;
  uomCode: string;
  uomName: string;
  /** Inventory units in one line unit. */
  itemsPerUnit: number;
  warehouse: string;
  priceListId: string;
  /** Net of VAT, per line unit, in the document currency. */
  unitPrice: number;
  discountPct: number;
  priceSource: string;
  taxCode: string;
  /** The sales order and line this was copied from ('' for a line entered by hand). */
  baseType: '' | 'SO';
  baseId: string;
  baseLineId: string;
  /** The order's number, e.g. "Primary 410001", and the line's row number on it. */
  baseDocNo: string;
  baseRow: number;
  /** PHP per inventory unit the stock went out at, fixed when the delivery is added. */
  unitCostLc: number;
  /** Billed so far on A/R invoices, in the line's unit. */
  invoicedQty: number;
}

export interface Delivery {
  id: string;

  // Header
  customerId: string;
  customerCode: string;
  customerName: string;
  contactId: string;
  customerRef: string;
  currency: string;
  seriesId: string;
  /** 0 until added. */
  docNum: number;
  status: DnStatus;
  postingDate: string;
  deliveryDate: string;
  documentDate: string;
  dueDate: string;
  closeDate: string;

  // Contents
  lines: DnLine[];

  // Logistics
  shipTo: string;
  billTo: string;
  shippingType: string;
  language: string;
  trackingNo: string;
  stampNo: string;
  pickPackRemarks: string;
  bpChannelName: string;
  bpChannelContact: string;

  // Accounting
  journalRemark: string;
  projectId: string;
  paymentTermId: string;
  paymentMethod: string;
  indicator: string;
  federalTaxId: string;
  /** The sales order number(s) the lines came from; set by Copy from. */
  orderNumber: string;
  dueMonths: number;
  dueDays: number;
  cashDiscountDays: number;
  references: PoReference[];
  useShippedGoodsAccount: boolean;

  // Attachments
  attachments: Attachment[];

  // Footer
  salesEmployeeId: string;
  ownerId: string;
  discountPct: number;
  freight: number;
  freightTaxCode: string;
  rounding: boolean;
  remarks: string;
  /** PHP per unit of the document currency, fixed when added (1 for PHP). */
  fxRate: number;
}

export const DN_SERIES: DocumentSeries[] = [
  { id: 'dns-primary', name: 'Primary', prefix: '', firstNo: 13, manual: false, isDefault: true, active: true, segments: [{ type: 'literal', value: 'DN' }, { type: 'year' }, { type: 'sequence', padding: 4 }] },
];

export const newDnLine = (patch: Partial<DnLine> = {}): DnLine => ({
  itemId: '',
  itemNo: '',
  description: '',
  quantity: 1,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  warehouse: '',
  priceListId: plId('Base price'),
  unitPrice: 0,
  discountPct: 0,
  priceSource: '',
  taxCode: '',
  baseType: '',
  baseId: '',
  baseLineId: '',
  baseDocNo: '',
  baseRow: 0,
  unitCostLc: 0,
  invoicedQty: 0,
  ...patch,
  // A copied line passes id: undefined; it still needs an id of its own.
  id: patch.id ?? `dl-${crypto.randomUUID().slice(0, 8)}`,
});

export function blankDelivery(today: string, ownerId: string): Omit<Delivery, 'id'> {
  return {
    customerId: '',
    customerCode: '',
    customerName: '',
    contactId: '',
    customerRef: '',
    currency: 'PHP',
    seriesId: DN_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: today,
    deliveryDate: '',
    documentDate: today,
    dueDate: '',
    closeDate: '',
    lines: [],
    shipTo: '',
    billTo: '',
    shippingType: '',
    language: 'English',
    trackingNo: '',
    stampNo: '',
    pickPackRemarks: '',
    bpChannelName: '',
    bpChannelContact: '',
    journalRemark: '',
    projectId: '',
    paymentTermId: termId('Net 30'),
    paymentMethod: 'BANK',
    indicator: '',
    federalTaxId: '',
    orderNumber: '',
    dueMonths: 0,
    dueDays: 0,
    cashDiscountDays: 0,
    references: [],
    useShippedGoodsAccount: false,
    attachments: [],
    salesEmployeeId: '',
    ownerId: ownerId,
    discountPct: 0,
    freight: 0,
    freightTaxCode: '31',
    rounding: false,
    remarks: '',
    fxRate: 1,
  };
}

/** A delivery's header, taken from the sales order it's copied from. */
export function deliveryHeaderFrom(so: Pick<SalesOrder, 'customerId' | 'customerCode' | 'customerName' | 'contactId' | 'customerRef' | 'currency' | 'shipTo' | 'billTo' | 'shippingType' | 'language' | 'pickPackRemarks' | 'bpChannelName' | 'bpChannelContact' | 'projectId' | 'paymentTermId' | 'paymentMethod' | 'indicator' | 'federalTaxId' | 'salesEmployeeId' | 'discountPct' | 'freightTaxCode' | 'rounding' | 'dueMonths' | 'dueDays' | 'cashDiscountDays'>): Partial<Delivery> {
  return {
    customerId: so.customerId,
    customerCode: so.customerCode,
    customerName: so.customerName,
    contactId: so.contactId,
    customerRef: so.customerRef,
    currency: so.currency,
    shipTo: so.shipTo,
    billTo: so.billTo,
    shippingType: so.shippingType,
    language: so.language,
    pickPackRemarks: so.pickPackRemarks,
    bpChannelName: so.bpChannelName,
    bpChannelContact: so.bpChannelContact,
    projectId: so.projectId,
    paymentTermId: so.paymentTermId,
    paymentMethod: so.paymentMethod,
    indicator: so.indicator,
    federalTaxId: so.federalTaxId,
    salesEmployeeId: so.salesEmployeeId,
    discountPct: so.discountPct,
    freightTaxCode: so.freightTaxCode,
    rounding: so.rounding,
    dueMonths: so.dueMonths,
    dueDays: so.dueDays,
    cashDiscountDays: so.cashDiscountDays,
    journalRemark: `Deliveries – ${so.customerCode}`,
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// History behind the seeded orders' delivered quantities. Seeded stock already reflects it, and
// (like other seeded history) it has no journal entry.

const so = (id: string) => SEED_SALES_ORDERS.find((o) => o.id === id)!;

function fromOrder(id: string, docNum: number, orderId: string, lineIds: string[], patch: Partial<Delivery>): Delivery {
  const order = so(orderId);
  return {
    ...blankDelivery(patch.postingDate ?? order.postingDate, CURRENT_USER_ID),
    ...deliveryHeaderFrom(order),
    id,
    docNum,
    status: 'Open',
    orderNumber: `${order.docNum}`,
    lines: lineIds.map((lid) => {
      const l = order.lines.find((x) => x.id === lid)!;
      return newDnLine({
        id: `${id}-${lid}`,
        itemId: l.itemId,
        itemNo: l.itemNo,
        description: l.description,
        quantity: l.deliveredQty,
        uomCode: l.uomCode,
        uomName: l.uomName,
        itemsPerUnit: l.itemsPerUnit,
        warehouse: l.warehouse,
        priceListId: l.priceListId,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        priceSource: l.priceSource,
        taxCode: l.taxCode,
        baseType: 'SO',
        baseId: order.id,
        baseLineId: l.id,
        baseDocNo: `SO-${order.postingDate.slice(0, 4)}-${String(order.docNum).padStart(4, '0')}`,
        baseRow: order.lines.indexOf(l) + 1,
        // History went out at the item's cost.
        unitCostLc: SEED_ITEMS.find((i) => i.id === l.itemId)?.itemCost ?? 0,
      });
    }),
    ...patch,
  };
}

export const SEED_DELIVERIES: Delivery[] = [
  fromOrder('dn-001', 1, 'so-001', ['so-001-2'], {
    postingDate: '2026-09-29',
    documentDate: '2026-09-29',
    deliveryDate: '2026-09-29',
    status: 'Closed',
    closeDate: '2026-10-05',
    trackingNo: 'LBC-7710-2290-14',
    remarks: 'First 8 MacBook Airs, delivered to Bayanihan head office. Balance to follow. Billed 5 Oct.',
  }),
  fromOrder('dn-002', 2, 'so-004', ['so-004-1'], {
    postingDate: '2026-08-21',
    documentDate: '2026-08-21',
    deliveryDate: '2026-08-21',
    status: 'Closed',
    closeDate: '2026-08-21',
    remarks: 'Delivered in full and invoiced.',
  }),
  fromOrder('dn-003', 3, 'so-005', ['so-005-1', 'so-005-2'], {
    postingDate: '2026-08-28',
    documentDate: '2026-08-28',
    deliveryDate: '2026-08-28',
    status: 'Closed',
    closeDate: '2026-08-28',
    trackingNo: '2GO-CEB-88140223',
    remarks: 'Shipped to the Mactan studio by 2GO Express; invoiced the same day.',
  }),
  fromOrder('dn-005', 4, 'so-009', ['so-009-1'], {
    postingDate: '2026-09-10',
    documentDate: '2026-09-10',
    deliveryDate: '2026-09-10',
    status: 'Closed',
    closeDate: '2026-09-10',
    fxRate: seedRateOn('USD', '2026-09-10'),
    trackingNo: 'LBC-7740-1185-02',
    remarks: 'Delivered to Harbourline’s BGC office; invoiced the same day.',
  }),
  fromOrder('dn-004', 5, 'so-006', ['so-006-1'], {
    postingDate: '2026-09-18',
    documentDate: '2026-09-18',
    deliveryDate: '2026-09-18',
    status: 'Closed',
    closeDate: '2026-09-18',
    remarks: 'First 6 of 10 iPhones, picked up by Northgate’s admin. Invoiced on delivery.',
  }),
  // Invoiced in full (A/R invoices SI-2026-0006 through SI-2026-0010), so closed.
  fromOrder('dn-006', 6, 'so-012', ['so-012-1'], {
    postingDate: '2026-10-06',
    documentDate: '2026-10-06',
    deliveryDate: '2026-10-06',
    status: 'Closed',
    closeDate: '2026-10-06',
    remarks: 'First 24 of 40 iPads, delivered to the DepEd Pasig division office.',
  }),
  fromOrder('dn-007', 7, 'so-013', ['so-013-1', 'so-013-2'], {
    postingDate: '2026-09-04',
    documentDate: '2026-09-04',
    deliveryDate: '2026-09-04',
    status: 'Closed',
    closeDate: '2026-09-04',
    remarks: '23 MacBook Airs delivered to Northgate’s admin offices.',
  }),
  // Corporate orders (so-c01–so-c05). All invoiced but dn-c05, which waits to be billed with the rest of the order.
  ...([
    ['dn-c01', 'so-c01', ['so-c01-1'], '2026-08-14', 'Delivered to Clarkfield’s Clark office.'],
    ['dn-c02', 'so-c02', ['so-c02-1', 'so-c02-2'], '2026-08-29', 'Shipped to the Mactan studio by 2GO Express.'],
    ['dn-c03', 'so-c03', ['so-c03-1'], '2026-09-01', 'Delivered to Kessler & Voss, BGC.'],
    ['dn-c04', 'so-c04', ['so-c04-1'], '2026-09-11', 'Picked up by the cooperative’s treasurer.'],
    ['dn-c05', 'so-c05', ['so-c05-1'], '2026-10-02', 'First 12 of 20, delivered to the institute’s Pasig office. Billed with the rest, as the institute asked.'],
  ] as const).map(([id, so, lines, date, remarks], k) =>
    fromOrder(id, 8 + k, so, [...lines], { postingDate: date, documentDate: date, deliveryDate: date, ...(id === 'dn-c05' ? {} : { status: 'Closed' as const, closeDate: date }), remarks }),
  ),
];
// The closed deliveries were invoiced in full (mocks/arInvoices.ts).
for (const d of SEED_DELIVERIES.filter((x) => x.status === 'Closed')) d.lines.forEach((l) => (l.invoicedQty = l.quantity));
