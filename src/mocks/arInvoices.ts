/**
 * A/R invoices: billing a customer (Sales › Invoices). Fields follow the SAP B1 A/R Invoice field
 * map: header, Contents (lines), Logistics, Accounting, Attachments and footer.
 *
 * Settled here, for the prototype:
 * - Lines copy from deliveries (the usual flow) or straight from a sales order, or are entered
 *   by hand. A line from a delivery only bills what was shipped; a line from an order, or by
 *   hand, also ships the stock, as SAP does when there's no delivery.
 * - Service invoices bill amounts to revenue accounts, with no stock.
 * - Adding the invoice posts it: Dr A/R (the customer's control account) / Cr Revenue and Output
 *   VAT. Stock it ships also posts Dr COGS / Cr Inventory at item cost; lines from a delivery
 *   that used the shipped goods account move that cost out of Shipped Goods into COGS.
 * - WTax Liable lines: a top withholding agent deducts creditable withholding tax (1% goods, 2%
 *   services); a government customer also withholds 5% VAT. The WTax Amount comes off the
 *   balance due and posts to the creditable withholding accounts (the customer issues BIR Form
 *   2307). Lines default to liable when the customer withholds.
 * - Use Shipped Goods Account applies only to stock the invoice ships itself (no delivery): its
 *   cost goes to Shipped Goods instead of COGS.
 * - Installments split the balance into equal parts due a payment-term period apart.
 * - Incoming payments, down payments and dunning aren't built: Applied Amount and Total Down
 *   Payment stay 0 (except seeded history); Block Dunning Letters, Payment Block and Max. Cash
 *   Discount are recorded for when they are.
 * - Freight charged to the customer is other income. Rounding goes with it.
 * - Left out: Return Reason and Summary Type (grid layout only), Central Bank Ind. and Deferred
 *   Tax (other localizations), Asset Value Date (no fixed assets yet), Payment Order Run (A/P).
 */
import { CURRENT_USER_ID, type Attachment, type DocumentSeries } from './common';
import { plId, termId } from './masters';
import { SEED_DELIVERIES, type DnLine } from './deliveries';
import { SEED_PARTNERS, formatAddress } from './partners';
import type { PoReference } from './purchaseOrders';
import { H1_SALES, SEED_SALES_ORDERS, seedSoNo, termDaysOf, type SoDocType } from './salesOrders';
import { SEED_ITEMS } from './items';
import { SEED_WAREHOUSES } from './itemMasters';
import { MONTH_NAMES, POS_CUSTOMER_ID, STORE_SALES } from './storeSales';

export type ArStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const AR_STATUSES: ArStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

/** Freight and rounding on an invoice: other income. */
export const FREIGHT_INCOME_ACCOUNT = '7030';
/** Creditable withholding the customer deducts: income tax (EWT) and VAT (government). */
export const CWT_ACCOUNT = '1440';
export const CREDITABLE_VAT_ACCOUNT = '1430';

/** Where a line came from. '' = entered by hand. */
export type ArBaseType = '' | 'SO' | 'DN';

export interface ArLine extends Omit<DnLine, 'baseType' | 'invoicedQty'> {
  baseType: ArBaseType;
  /** Service invoices: the revenue account. */
  glAccount: string;
  /** From a delivery that used the shipped goods account: its cost is still in Shipped Goods. */
  shippedGoods: boolean;
  /** Subject to the customer's withholding. */
  wtaxLiable: boolean;
  /** Sales commission % for this line. */
  commissionPct: number;
}

export interface ArInvoice {
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
  status: ArStatus;
  postingDate: string;
  dueDate: string;
  documentDate: string;
  closeDate: string;

  // Contents
  docType: SoDocType;
  lines: ArLine[];

  // Logistics
  shipTo: string;
  billTo: string;
  shippingType: string;
  language: string;
  trackingNo: string;
  blockDunning: boolean;
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
  /** The customer's A/R control account (defaults from the customer). */
  controlAccount: string;
  paymentBlock: boolean;
  maxCashDiscount: boolean;
  /** Number of equal installments (1 = due in full on the due date). */
  installments: number;
  /** Stock this invoice ships (lines not from a delivery) goes to Shipped Goods, not COGS. */
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
  /** Paid so far by incoming payments, document currency. */
  appliedAmount: number;
  fxRate: number;
}

export const AR_SERIES: DocumentSeries[] = [
  { id: 'ars-primary', name: 'Sales Invoice', prefix: '', firstNo: 13, manual: false, isDefault: true, active: true, segments: [{ type: 'literal', value: 'SI' }, { type: 'year' }, { type: 'sequence', padding: 4 }] },
  { id: 'ars-or', name: 'Official Receipt', prefix: '', firstNo: 3, manual: false, isDefault: false, active: true, segments: [{ type: 'literal', value: 'OR' }, { type: 'year' }, { type: 'sequence', padding: 4 }] },  { id: 'ars-pos', name: 'POS Sales', prefix: '', firstNo: 1, manual: false, isDefault: false, active: true, segments: [{ type: 'literal', value: 'POS' }, { type: 'year' }, { type: 'sequence', padding: 5 }] },
];

export const POS_SERIES_ID = 'ars-pos';

/** A seeded invoice's number as the series formats it: SI-2026-0001, OR-2026-0001, POS-2026-00001. */
export const seedArNo = (a: Pick<ArInvoice, 'seriesId' | 'docNum' | 'postingDate'>) => {
  const series = AR_SERIES.find((x) => x.id === a.seriesId) ?? AR_SERIES[0];
  const literal = series.segments?.find((x) => x.type === 'literal');
  const pad = series.segments?.find((x) => x.type === 'sequence');
  return `${literal?.value ?? 'SI'}-${a.postingDate.slice(0, 4)}-${String(a.docNum).padStart(pad?.padding ?? 4, '0')}`;
};

export const OR_SERIES_ID = 'ars-or';

export const newArLine = (patch: Partial<ArLine> = {}): ArLine => ({
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
  glAccount: '',
  shippedGoods: false,
  wtaxLiable: false,
  commissionPct: 0,
  ...patch,
  // A copied line passes id: undefined; it still needs an id of its own.
  id: patch.id ?? `al-${crypto.randomUUID().slice(0, 8)}`,
});

export function blankArInvoice(today: string, ownerId: string): Omit<ArInvoice, 'id'> {
  return {
    customerId: '',
    customerCode: '',
    customerName: '',
    contactId: '',
    customerRef: '',
    currency: 'PHP',
    seriesId: AR_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: today,
    dueDate: today,
    documentDate: today,
    closeDate: '',
    docType: 'Item',
    lines: [],
    shipTo: '',
    billTo: '',
    shippingType: '',
    language: 'English',
    trackingNo: '',
    blockDunning: false,
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
    controlAccount: '',
    paymentBlock: false,
    maxCashDiscount: false,
    installments: 1,
    useShippedGoodsAccount: false,
    attachments: [],
    salesEmployeeId: '',
    ownerId: ownerId,
    discountPct: 0,
    freight: 0,
    freightTaxCode: '31',
    rounding: false,
    remarks: '',
    appliedAmount: 0,
    fxRate: 1,
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// History, so no journal entries, like other seeded documents. Applied amounts tie out to the
// seeded incoming payments (mocks/incomingPayments).

const round2 = (n: number) => Math.round(n * 100) / 100;
const RATE: Record<string, number> = { '31': 12, '32': 0, '33': 0 };

/**
 * What a seeded invoice asks the customer to pay: total (net + VAT) less the 1% / 2% creditable
 * withholding on WTax Liable lines — the same arithmetic as services/arInvoices.
 */
export function seedNetDue(a: Pick<ArInvoice, 'lines' | 'docType'>) {
  let total = 0;
  let goods = 0;
  let services = 0;
  for (const l of a.lines) {
    const net = round2(l.quantity * l.unitPrice * (1 - l.discountPct / 100));
    total += net + round2((net * (RATE[l.taxCode] ?? 0)) / 100);
    if (l.wtaxLiable) (a.docType === 'Service' ? (services += net) : (goods += net));
  }
  const wtax = round2(goods * 0.01) + round2(services * 0.02);
  return round2(round2(total) - wtax);
}

const fromDelivery = (id: string, docNum: number, dnId: string, patch: Partial<ArInvoice> & { wtaxLiable?: boolean }): ArInvoice => {
  const dn = SEED_DELIVERIES.find((d) => d.id === dnId)!;
  const { wtaxLiable = false, ...rest } = patch;
  return {
    ...blankArInvoice(dn.postingDate, CURRENT_USER_ID),
    ...dn,
    id,
    seriesId: AR_SERIES[0].id,
    docNum,
    status: 'Open',
    docType: 'Item',
    closeDate: '',
    journalRemark: `A/R Invoices – ${dn.customerCode}`,
    orderNumber: dn.orderNumber,
    controlAccount: '1120',
    appliedAmount: 0,
    remarks: '',
    lines: dn.lines.map((l, i) =>
      newArLine({ ...l, id: `${id}-${l.id}`, baseType: 'DN', baseId: dn.id, baseLineId: l.id, baseDocNo: `DN-${dn.postingDate.slice(0, 4)}-${String(dn.docNum).padStart(4, '0')}`, baseRow: i + 1, glAccount: '', shippedGoods: false, wtaxLiable }),
    ),
    ...rest,
  };
};

/** Build an invoice directly from a sales order (no delivery), optionally filtering lines. */
const fromSalesOrder = (
  id: string,
  seriesId: string,
  docNum: number,
  soId: string,
  lineIds: string[],
  patch: Partial<ArInvoice> & { wtaxLiable?: boolean },
): ArInvoice => {
  const so = SEED_SALES_ORDERS.find((s) => s.id === soId)!;
  const c = SEED_PARTNERS.find((p) => p.id === so.customerId)!;
  const addr = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
  const { wtaxLiable = false, ...rest } = patch;
  return {
    ...blankArInvoice(so.postingDate, CURRENT_USER_ID),
    id,
    seriesId,
    docNum,
    status: 'Open',
    customerId: c.id,
    customerCode: c.code,
    customerName: c.name,
    contactId: so.contactId,
    federalTaxId: so.federalTaxId,
    currency: so.currency,
    paymentTermId: so.paymentTermId,
    customerRef: so.customerRef,
    billTo: addr ? formatAddress(addr, c.name) : '',
    shipTo: so.shipTo,
    projectId: so.projectId,
    salesEmployeeId: so.salesEmployeeId,
    docType: so.docType,
    orderNumber: so.docNum ? String(so.docNum) : '',
    controlAccount: '1120',
    journalRemark: `A/R Invoices – ${c.code}`,
    appliedAmount: 0,
    remarks: '',
    lines: so.lines
      .filter((l) => lineIds.includes(l.id))
      .map((l, i) => newArLine({ id: `${id}-${i + 1}`, itemId: l.itemId, itemNo: l.itemNo, description: l.description, quantity: l.quantity, uomCode: l.uomCode, uomName: l.uomName, itemsPerUnit: l.itemsPerUnit, warehouse: l.warehouse, priceListId: l.priceListId, unitPrice: l.unitPrice, discountPct: l.discountPct, priceSource: l.priceSource, taxCode: l.taxCode, glAccount: l.glAccount, baseType: 'SO', baseId: so.id, baseLineId: l.id, baseDocNo: `SO-${so.postingDate.slice(0, 4)}-${String(so.docNum).padStart(4, '0')}`, baseRow: so.lines.indexOf(l) + 1, wtaxLiable })),
    ...rest,
  };
};

/** Header fields of the service invoice's customer, from the partner record. */
function subic(): Partial<ArInvoice> {
  const c = SEED_PARTNERS.find((p) => p.id === 'bp-040')!;
  const addr = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
  return { customerId: c.id, customerCode: c.code, customerName: c.name, contactId: c.defaultContactId, federalTaxId: c.tin, billTo: addr ? formatAddress(addr, c.name) : '', shipTo: addr ? formatAddress(addr, c.name) : '' };
}

/** The bundle order's number, for the remarks of the two invoices that split it. */
const BUNDLE_NO = seedSoNo(SEED_SALES_ORDERS.find((o) => o.id === 'so-b01')!);

const invoices: ArInvoice[] = [
  fromDelivery('ar-001', 1, 'dn-002', {
    postingDate: '2026-08-21', documentDate: '2026-08-21', dueDate: '2026-09-20', status: 'Closed', closeDate: '2026-09-18',
    remarks: 'Paid by bank transfer 18 Sep 2026.',
  }),
  fromDelivery('ar-002', 2, 'dn-003', {
    postingDate: '2026-08-28', documentDate: '2026-08-28', dueDate: '2026-09-12', status: 'Closed', closeDate: '2026-09-10',
    remarks: 'Paid in full by BPI transfer, 10 Sep 2026.',
  }),
  fromDelivery('ar-003', 3, 'dn-004', {
    postingDate: '2026-09-18', documentDate: '2026-09-18', dueDate: '2026-10-18', wtaxLiable: true,
    remarks: 'Northgate withholds 1% (top withholding agent). 2 defective units credited 25 Sep (ACM-2026-0002); half paid by check on 2 Oct, balance due 18 Oct.',
  }),
  fromDelivery('ar-005', 4, 'dn-005', {
    postingDate: '2026-09-10', documentDate: '2026-09-10', dueDate: '2026-09-10',
    remarks: 'USD invoice at the 10 Sep BSP rate. Half paid 22 Sep at that day’s rate (realized difference on the payment); the open half is revalued at month-end.',
  }),
  fromDelivery('ar-006', 5, 'dn-006', {
    postingDate: '2026-10-06', documentDate: '2026-10-06', dueDate: '2026-11-05',
    remarks: 'First 24 of 40 iPads for DepEd Pasig. Not yet paid.',
  }),
  fromDelivery('ar-007', 6, 'dn-007', {
    postingDate: '2026-09-04', documentDate: '2026-09-04', dueDate: '2026-10-04', wtaxLiable: true,
    remarks: 'Northgate withholds 1% (top withholding agent). Past due; follow up with their accounts payable.',
  }),
  {
    ...blankArInvoice('2026-09-30', CURRENT_USER_ID),
    id: 'ar-004',
    seriesId: OR_SERIES_ID,
    docNum: 1,
    status: 'Open',
    docType: 'Service',
    ...subic(),
    customerRef: 'SBML-WO-2026-114',
    dueDate: '2026-10-30',
    paymentTermId: termId('Net 30'),
    controlAccount: '1120',
    journalRemark: 'A/R Invoices – BP-0040',
    remarks: 'Fleet device setup and MDM enrolment, 60 iPads at the Subic yard. Not yet paid.',
    lines: [
      newArLine({ id: 'ar-004-1', description: 'Device setup and MDM enrolment — 60 iPads, on site', glAccount: '4030', quantity: 1, unitPrice: 45000, taxCode: '31', priceSource: 'Manual' }),
      newArLine({ id: 'ar-004-2', description: 'Staff training, half day', glAccount: '4030', quantity: 1, unitPrice: 12000, taxCode: '31', priceSource: 'Manual' }),
    ],
  },
  // Corporate orders: paid, past due and half paid. ASEAN's first 12 iPhones (dn-c05) aren't billed
  // yet: the institute asked for one invoice once all 20 are delivered.
  ...([
    // [id, delivery, posted, due, closed (paid in full) on, remarks]
    ['ar-c01', 'dn-c01', '2026-08-14', '2026-09-13', '2026-09-10', 'Paid by bank transfer 10 Sep 2026.'],
    ['ar-c02', 'dn-c02', '2026-08-29', '2026-09-13', '2026-09-12', 'Paid by BPI transfer 12 Sep 2026.'],
    ['ar-c03', 'dn-c03', '2026-09-01', '2026-09-16', '', 'Past due; second reminder sent 1 Oct.'],
    ['ar-c04', 'dn-c04', '2026-09-11', '2026-09-26', '', 'Half paid 25 Sep; the cooperative pays the balance after its October dividend.'],
  ] as const).map(([id, dn, date, due, paid, remarks], k) =>
    fromDelivery(id, 7 + k, dn, { postingDate: date, documentDate: date, dueDate: due, remarks, ...(paid ? { status: 'Closed' as const, closeDate: paid } : {}) }),
  ),
  // Bayanihan's first 8 MacBook Airs, billed after the wrong-colour unit came back on SRT-2026-0001:
  // the delivery is billed in full and the return's credit memo is applied here.
  fromDelivery('ar-008', 12, 'dn-001', {
    postingDate: '2026-10-05', documentDate: '2026-10-05', dueDate: '2026-11-04',
    remarks: 'First 8 MacBook Airs. The returned unit is credited by ACM-2026-0003, applied to this invoice.',
  }),
  // Mixed bundle order so-b01 (CGS): split into SI for goods and OR for services.
  fromSalesOrder('ar-b01-si', AR_SERIES[0].id, 11, 'so-b01', ['so-b01-1'], {
    postingDate: '2026-09-17', documentDate: '2026-09-17', dueDate: '2026-10-17', status: 'Closed', closeDate: '2026-10-08',
    remarks: `MacBook Airs — goods lines of ${BUNDLE_NO}. Paid by bank transfer 8 Oct.`,
  }),
  fromSalesOrder('ar-b01-or', OR_SERIES_ID, 2, 'so-b01', ['so-b01-2', 'so-b01-3'], {
    postingDate: '2026-09-17', documentDate: '2026-09-17', dueDate: '2026-10-17', docType: 'Service', status: 'Closed', closeDate: '2026-10-08',
    remarks: `Device setup and same-day delivery — service lines of ${BUNDLE_NO}. Paid with the Sales Invoice.`,
  }),
];

// ── January–June corporate orders ────────────────────────────────────────────
// Billed on delivery, paid on the due date (mocks/incomingPayments.ts). Northgate withholds 1%.

const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const H1_INVOICES: ArInvoice[] = H1_SALES.map((p) => {
  const c = SEED_PARTNERS.find((x) => x.id === p.customerId)!;
  const due = plusDays(p.delivered, termDaysOf(c.customerPaymentTermId));
  return fromDelivery(`ar-${p.id}`, 0, `dn-${p.id}`, {
    postingDate: p.delivered, documentDate: p.delivered, dueDate: due, status: 'Closed', closeDate: due, wtaxLiable: c.topWithholdingAgent,
    remarks: `Paid by bank transfer on the due date.`,
  });
});
invoices.push(...H1_INVOICES);

// ── Store sales (POS) ────────────────────────────────────────────────────────
// Each store's month at the till, posted by the POS as one invoice to the walk-in customer
// (mocks/storeSales.ts). Prices are the SRP less VAT; paid in full at the till, so they're
// closed by the month's POS collection.

const MONTH_NAME = (month: string) => `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

const itemById = new Map(SEED_ITEMS.map((i) => [i.id, i]));

const POS_INVOICES: ArInvoice[] = STORE_SALES.map((sale, n) => {
  const c = SEED_PARTNERS.find((p) => p.id === POS_CUSTOMER_ID)!;
  const store = SEED_WAREHOUSES.find((w) => w.code === sale.store)!;
  const id = `pos-${sale.month.replace('-', '')}-${sale.store}`;
  const units = sale.lines.reduce((k, l) => k + l.qty, 0);
  return {
    ...blankArInvoice(sale.date, CURRENT_USER_ID),
    id,
    seriesId: POS_SERIES_ID,
    docNum: n + 1,
    status: 'Closed',
    closeDate: sale.date,
    customerId: c.id,
    customerCode: c.code,
    customerName: c.name,
    contactId: c.defaultContactId,
    customerRef: `${sale.store}-${sale.month}`,
    paymentTermId: termId('COD'),
    paymentMethod: 'CASH',
    shipTo: `${store.name}`,
    billTo: c.name,
    controlAccount: '1120',
    journalRemark: `POS Sales – ${store.code} ${MONTH_NAME(sale.month)}`,
    remarks: `${store.name}: POS sales for ${MONTH_NAME(sale.month)}, ${units} units.`,
    lines: sale.lines.map((l, k) => {
      const item = itemById.get(l.itemId)!;
      return newArLine({
        id: `${id}-${k + 1}`, itemId: item.id, itemNo: item.itemNo, description: item.name, quantity: l.qty,
        uomCode: item.salesUom, uomName: item.salesUom === 'pc' ? 'Piece' : item.salesUom, itemsPerUnit: 1, warehouse: sale.store,
        priceListId: plId('Base price'), unitPrice: round2(item.basePrice / 1.12), priceSource: 'Base price (SRP)', taxCode: '31',
      });
    }),
  };
});
invoices.push(...POS_INVOICES);

/** Paid by the seeded incoming payments (document currency). */
const PAID: Record<string, 'full' | 'half'> = {
  'ar-001': 'full', 'ar-002': 'full', 'ar-003': 'half', 'ar-005': 'half',
  'ar-c01': 'full', 'ar-c02': 'full', 'ar-c04': 'half', 'ar-b01-si': 'full', 'ar-b01-or': 'full',
  ...Object.fromEntries([...H1_INVOICES, ...POS_INVOICES].map((a) => [a.id, 'full' as const])),
};

/** A credit for `qty` of a delivered line, at its price with VAT — what a credit memo for it comes to. */
export function seedLineCredit(dnId: string, lineId: string, qty: number) {
  const l = SEED_DELIVERIES.find((d) => d.id === dnId)!.lines.find((x) => x.id === lineId)!;
  const net = round2(qty * l.unitPrice * (1 - l.discountPct / 100));
  return round2(net + round2((net * (RATE[l.taxCode] ?? 0)) / 100));
}

/** Credited by the seeded A/R credit memos (mocks/arCreditMemos.ts), by invoice. */
export const SEED_CREDITED: Record<string, number> = {
  // Northgate's 2 defective iPhones, returned after billing (ACM-2026-0002).
  'ar-003': seedLineCredit('dn-004', 'dn-004-so-006-1', 2),
  // Bayanihan's wrong-colour MacBook Air (SRT-2026-0001 → ACM-2026-0003).
  'ar-008': seedLineCredit('dn-001', 'dn-001-so-001-2', 1),
};

/** What the seeded payments paid on each invoice. */
export const SEED_PAID: Record<string, number> = Object.fromEntries(
  invoices.filter((a) => PAID[a.id]).map((a) => {
    const due = seedNetDue(a);
    return [a.id, PAID[a.id] === 'full' ? round2(due - (SEED_CREDITED[a.id] ?? 0)) : round2(due / 2)];
  }),
);

/** Every seeded invoice, numbered per series in date order. */
export const SEED_AR_INVOICES: ArInvoice[] = (() => {
  const next = new Map<string, number>();
  return invoices
    .map((a) => ({ ...a, appliedAmount: round2((SEED_PAID[a.id] ?? 0) + (SEED_CREDITED[a.id] ?? 0)) }))
    .sort((a, b) => a.postingDate.localeCompare(b.postingDate) || a.id.localeCompare(b.id))
    .map((a) => {
      if (a.status === 'Draft') return { ...a, docNum: 0 };
      const n = (next.get(a.seriesId) ?? 0) + 1;
      next.set(a.seriesId, n);
      return { ...a, docNum: n };
    });
})();
