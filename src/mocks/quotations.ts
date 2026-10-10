/**
 * Sales quotations (Sales › Quotations). A price offer to a customer — no stock commitment,
 * no posting. Expires on Valid Until; open until copied to an order or closed/cancelled.
 *
 * Settled here, for the prototype:
 * - Item-type only (same as sales orders in this codebase).
 * - Lines share the SoLine shape minus deliveredQty and status — quotation lines don't track
 *   fulfilment.
 * - Adding a quotation assigns its number and sets status to Open. No stock moves.
 * - Copy to Sales Order: all open lines carry over; the order then commits stock.
 * - Closing or cancelling a quotation releases nothing (there was nothing committed).
 */
import type { Attachment, DocumentSeries } from './common';
import { CURRENT_USER_ID } from './common';
import { plId, termId } from './masters';
import type { PoReference } from './purchaseOrders';
import { todayISO } from '../services/dates';
import { SEED_ITEMS, itemsPerUom } from './items';
import { SEED_PARTNERS, formatAddress } from './partners';
import { H1_SALES, SEED_SALES_ORDERS } from './salesOrders';
import { MONTH_NAMES } from './storeSales';

export type QuotationStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const QUOTATION_STATUSES: QuotationStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

export interface QuoteLine {
  id: string;
  itemId: string;
  itemNo: string;
  description: string;
  quantity: number;
  uomCode: string;
  uomName: string;
  itemsPerUnit: number;
  warehouse: string;
  priceListId: string;
  unitPrice: number;
  discountPct: number;
  priceSource: string;
  taxCode: string;
  glAccount: string;
}

export interface Quotation {
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
  status: QuotationStatus;
  postingDate: string;
  validUntil: string;
  documentDate: string;
  closeDate: string;

  // Contents
  lines: QuoteLine[];

  // Logistics
  shipTo: string;
  billTo: string;
  shippingType: string;
  language: string;
  bpChannelName: string;
  bpChannelContact: string;

  // Accounting
  journalRemark: string;
  projectId: string;
  paymentTermId: string;
  paymentMethod: string;
  indicator: string;
  federalTaxId: string;
  orderNumber: string;
  dueMonths: number;
  dueDays: number;
  cashDiscountDays: number;
  references: PoReference[];

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

  /** Id of the sales order this was copied to, if any. */
  convertedToOrderId: string;
}

export const QT_SERIES: DocumentSeries[] = [
  {
    id: 'qts-primary',
    name: 'Quotation',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [
      { type: 'literal', value: 'QT' },
      { type: 'year' },
      { type: 'sequence', padding: 4 },
    ],
  },
];

const TODAY = todayISO();

export const newQuoteLine = (patch: Partial<QuoteLine> = {}): QuoteLine => ({
  itemId: '',
  itemNo: '',
  description: '',
  quantity: 1,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  warehouse: 'WH-MNL',
  priceListId: plId('Base price'),
  unitPrice: 0,
  discountPct: 0,
  priceSource: '',
  taxCode: '',
  glAccount: '',
  ...patch,
  id: patch.id ?? `ql-${crypto.randomUUID().slice(0, 8)}`,
});

export function blankQuotation(ownerId: string): Omit<Quotation, 'id'> {
  return {
    customerId: '',
    customerCode: '',
    customerName: '',
    contactId: '',
    customerRef: '',
    currency: 'PHP',
    seriesId: QT_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: TODAY,
    validUntil: '',
    documentDate: TODAY,
    closeDate: '',
    lines: [],
    shipTo: '',
    billTo: '',
    shippingType: '',
    language: 'English',
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
    attachments: [],
    salesEmployeeId: '',
    ownerId,
    discountPct: 0,
    freight: 0,
    freightTaxCode: '31',
    rounding: false,
    remarks: '',
    convertedToOrderId: '',
  };
}

// ── Seed helpers ─────────────────────────────────────────────────────────────

const byId = (id: string) => SEED_ITEMS.find((i) => i.id === id)!;
const byItemNo = (itemNo: string) => SEED_ITEMS.find((i) => i.itemNo === itemNo)!;
const partner = (id: string) => SEED_PARTNERS.find((p) => p.id === id)!;
const round2 = (n: number) => Math.round(n * 100) / 100;

const qtLine = (id: string, item: ReturnType<typeof byId>, quantity: number, patch: Partial<QuoteLine> = {}): QuoteLine =>
  newQuoteLine({
    id,
    itemId: item.id,
    itemNo: item.itemNo,
    description: item.name,
    quantity,
    uomCode: item.salesUom,
    uomName: item.salesUom === 'pc' ? 'Piece' : item.salesUom,
    itemsPerUnit: itemsPerUom(item, item.salesUom) ?? 1,
    warehouse: item.inventoryItem ? 'WH-MNL' : '',
    priceListId: plId('Base price'),
    unitPrice: round2(item.basePrice / 1.12),
    priceSource: 'Base price',
    taxCode: '31',
    ...patch,
  });

const qtHeader = (id: string, docNum: number, customerId: string, patch: Partial<Quotation>): Quotation => {
  const c = partner(customerId);
  const bill = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
  const ship = c.addresses.find((a) => a.id === c.defaultShipToId) ?? bill;
  return {
    ...blankQuotation(CURRENT_USER_ID),
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
    salesEmployeeId: c.salesEmployeeId,
    billTo: bill ? formatAddress(bill, c.name) : '',
    shipTo: ship ? formatAddress(ship, c.name) : '',
    journalRemark: `Sales Quotations – ${c.code}`,
    ...patch,
  };
};

// Converted: CGS — 10 MacBook Airs (Midnight) → so-c01
const qt001 = qtHeader('qt-001', 1, 'bp-004', {
  postingDate: '2026-07-25', documentDate: '2026-07-25', validUntil: '2026-08-31',
  status: 'Closed', closeDate: '2026-08-06',
  customerRef: 'CGS-RFQ-2026-0412',
  convertedToOrderId: 'so-c01',
  remarks: 'Laptops for the new Clark office. Customer confirmed on 6 Aug.',
  lines: [
    qtLine('qt-001-1', byItemNo('MAC-MBA13-M5-8G-16-512-MDN'), 10, {
      priceListId: plId('Wholesale'), discountPct: 3, priceSource: 'Discount group Customers – Trade × Mac: 3%',
      unitPrice: round2(byItemNo('MAC-MBA13-M5-8G-16-512-MDN').basePrice / 1.12),
    }),
  ],
});

// Converted: MPAS — 4 iPad Pro 11" + 4 Apple Pencil Pro → so-c02
const qt002 = qtHeader('qt-002', 2, 'bp-005', {
  postingDate: '2026-08-12', documentDate: '2026-08-12', validUntil: '2026-09-12',
  status: 'Closed', closeDate: '2026-08-20',
  customerRef: 'MPAS-RFQ-0812',
  convertedToOrderId: 'so-c02',
  remarks: 'iPad Pro and Pencil Pro kits for the storyboard team. Order placed 20 Aug.',
  lines: [
    qtLine('qt-002-1', byItemNo('IPD-PRO-11-256-SG-WF-SBK'), 4, {
      priceListId: plId('Wholesale'), discountPct: 3, priceSource: 'Discount group Customers – Trade × iPad: 3%',
      unitPrice: round2(byItemNo('IPD-PRO-11-256-SG-WF-SBK').basePrice / 1.12),
    }),
    qtLine('qt-002-2', byItemNo('ACC-PENPRO'), 4, {
      priceListId: plId('Wholesale'), discountPct: 5, priceSource: 'Discount group Customers – Trade × Accessories: 5%',
      unitPrice: round2(byItemNo('ACC-PENPRO').basePrice / 1.12),
    }),
  ],
});

// Converted: Kessler & Voss — 6 MacBook Airs (Sky Blue) → so-c03
const qt003 = qtHeader('qt-003', 3, 'bp-044', {
  postingDate: '2026-08-20', documentDate: '2026-08-20', validUntil: '2026-09-20',
  status: 'Closed', closeDate: '2026-08-26',
  customerRef: 'KVA-MNL-RFQ-0820',
  convertedToOrderId: 'so-c03',
  remarks: 'MacBook Airs for the Manila design team. Order confirmed 26 Aug.',
  lines: [
    qtLine('qt-003-1', byItemNo('MAC-MBA13-M5-8G-16-512-SKB'), 6, {
      unitPrice: round2(byItemNo('MAC-MBA13-M5-8G-16-512-SKB').basePrice / 1.12),
    }),
  ],
});

// Converted: Bayanihan Savings Bank — 20 MacBook Airs (contract price) → so-001
const qt004 = qtHeader('qt-004', 4, 'bp-003', {
  postingDate: '2026-09-10', documentDate: '2026-09-10', validUntil: '2026-10-10',
  status: 'Closed', closeDate: '2026-09-22',
  customerRef: 'BSB-RFQ-2026-0915',
  convertedToOrderId: 'so-001',
  remarks: 'Laptop refresh batch 1. Special price at 6% off Wholesale (contract through Dec 2026). Order placed 22 Sep.',
  lines: [
    qtLine('qt-004-1', byId('apl-0239'), 12, {
      priceListId: plId('Wholesale'),
      unitPrice: round2(94750 / 1.12),
      discountPct: 6,
      priceSource: 'Special price: 6% off Wholesale',
    }),
    qtLine('qt-004-2', byId('apl-0240'), 8, {
      priceListId: plId('Wholesale'),
      unitPrice: round2(94750 / 1.12),
      discountPct: 6,
      priceSource: 'Special price: 6% off Wholesale',
    }),
  ],
});

// Converted: ARHI — 20 iPhone 17 (research staff) → so-c05
const qt005 = qtHeader('qt-005', 5, 'bp-041', {
  postingDate: '2026-09-18', documentDate: '2026-09-18', validUntil: '2026-10-18',
  status: 'Closed', closeDate: '2026-09-24',
  customerRef: 'ARHI-RFQ-2026-118',
  convertedToOrderId: 'so-c05',
  remarks: 'Phones for the field research team. Tax status: BIR exemption ruling lapsed — quoted at standard 12% VAT. Order placed 24 Sep.',
  lines: [
    qtLine('qt-005-1', byItemNo('IPH-17-256-LAV'), 20, {
      priceListId: plId('Wholesale'), discountPct: 2, priceSource: 'Discount group Customers – Trade × iPhone: 2%',
      unitPrice: round2(byItemNo('IPH-17-256-LAV').basePrice / 1.12),
    }),
  ],
});

// Converted: SBML — 30 iPad Air 11" (vessel crews) → so-c06
const qt006 = qtHeader('qt-006', 6, 'bp-040', {
  postingDate: '2026-09-28', documentDate: '2026-09-28', validUntil: '2026-10-28',
  status: 'Closed', closeDate: '2026-10-05',
  customerRef: 'SBML-RFQ-2026-029',
  convertedToOrderId: 'so-c06',
  remarks: 'iPad Airs for the vessel crews at Subic Bay. Quoted zero-rated (pending SBMA cert copy). Order placed 5 Oct.',
  lines: [
    qtLine('qt-006-1', byItemNo('IPD-AIR-11-128-WF-BLU'), 30, {
      priceListId: plId('Wholesale'), discountPct: 3, priceSource: 'Discount group Customers – Trade × iPad: 3%',
      unitPrice: round2(byItemNo('IPD-AIR-11-128-WF-BLU').basePrice / 1.12),
      taxCode: '32',
    }),
  ],
});

// Open: Northgate Prime Malls — iPhone 17 units for store managers
const qt007 = qtHeader('qt-007', 7, 'bp-002', {
  postingDate: '2026-10-03', documentDate: '2026-10-03', validUntil: '2026-11-03',
  customerRef: 'NPM-RFQ-2026-1003',
  remarks: 'Submitted 3 Oct; awaiting purchasing committee approval. PO expected mid-November.',
  lines: [
    qtLine('qt-007-1', byItemNo('IPH-17-256-BLK'), 15, {
      priceListId: plId('Wholesale'), discountPct: 2, priceSource: 'Discount group Customers – Trade × iPhone: 2%',
      unitPrice: round2(byItemNo('IPH-17-256-BLK').basePrice / 1.12),
    }),
    qtLine('qt-007-2', byItemNo('ACC-MAGSF2'), 15, {
      priceListId: plId('Wholesale'), discountPct: 5, priceSource: 'Discount group Customers – Trade × Accessories: 5%',
      unitPrice: round2(byItemNo('ACC-MAGSF2').basePrice / 1.12),
    }),
  ],
});

// Expired: Guro ng Bayan Cooperative — USB-C Apple Pencils for end-of-year teacher giveaway
const qt008 = qtHeader('qt-008', 8, 'bp-007', {
  postingDate: '2026-08-01', documentDate: '2026-08-01', validUntil: '2026-09-01',
  customerRef: 'GNB-RFQ-2026-PENCIL',
  remarks: "Quote for the end-of-year teacher giveaway. PO delayed beyond validity; customer to request a new quote. VAT-exempt (cooperative).",
  lines: [
    qtLine('qt-008-1', byItemNo('ACC-PENUSBC'), 24, {
      taxCode: '33',
      unitPrice: round2(byItemNo('ACC-PENUSBC').basePrice / 1.12),
    }),
  ],
});

// January–June: the quoted corporate orders (mocks/salesOrders.ts), quoted a week before the
// customer ordered and closed when it did.
const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const H1_QUOTES: Quotation[] = H1_SALES.filter((p) => p.quoted).map((p) => {
  const quoted = plusDays(p.ordered, -7);
  const order = SEED_SALES_ORDERS.find((o) => o.id === `so-${p.id}`)!;
  return qtHeader(`qt-${p.id}`, 0, p.customerId, {
    postingDate: quoted, documentDate: quoted, validUntil: plusDays(quoted, 30),
    status: 'Closed', closeDate: p.ordered,
    customerRef: p.customerRef.replace('-PO-', '-RFQ-').replace('-PR-', '-RFQ-'),
    convertedToOrderId: order.id,
    remarks: `${p.remarks} Customer confirmed on ${Number(p.ordered.slice(8))} ${MONTH_NAMES[Number(p.ordered.slice(5, 7)) - 1].slice(0, 3)}.`,
    lines: order.lines.map((l, k) =>
      qtLine(`qt-${p.id}-${k + 1}`, byId(l.itemId), l.quantity, { priceListId: l.priceListId, discountPct: l.discountPct, priceSource: l.priceSource, taxCode: l.taxCode }),
    ),
  });
});

/** Every seeded quotation, numbered in date order (drafts have no number). */
export const SEED_QUOTATIONS: Quotation[] = [qt001, qt002, qt003, qt004, qt005, qt006, qt007, qt008, ...H1_QUOTES]
  .sort((a, b) => a.postingDate.localeCompare(b.postingDate) || a.id.localeCompare(b.id))
  .map((q, n, all) => (q.status === 'Draft' ? { ...q, docNum: 0 } : { ...q, docNum: all.slice(0, n).filter((x) => x.status !== 'Draft').length + 1 }));
