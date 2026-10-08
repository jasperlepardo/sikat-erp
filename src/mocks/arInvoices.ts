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
import type { Attachment, DocumentSeries } from './common';
import { termId } from './masters';
import { SEED_DELIVERIES, type DnLine } from './deliveries';
import { SEED_PARTNERS, formatAddress } from './partners';
import { RETAIL_SALES } from './retailHistory';
import type { PoReference } from './purchaseOrders';
import type { SoDocType } from './salesOrders';

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
  project: string;
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
  salesEmployee: string;
  owner: string;
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
  { id: 'ars-primary', name: 'Primary', prefix: 'AR-', firstNo: 430001, manual: false, isDefault: true, active: true },
];

export const newArLine = (patch: Partial<ArLine> = {}): ArLine => ({
  itemId: '',
  itemNo: '',
  description: '',
  quantity: 1,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  warehouse: '',
  priceList: 'Base price',
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

export function blankArInvoice(today: string, owner: string): Omit<ArInvoice, 'id'> {
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
    project: '— None —',
    paymentTermId: termId('Net 30'),
    paymentMethod: 'BANK',
    indicator: '— None —',
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
    salesEmployee: '-No Sales Employee-',
    owner,
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
    ...blankArInvoice(dn.postingDate, 'Jasper L.'),
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
      newArLine({ ...l, id: `${id}-${l.id}`, baseType: 'DN', baseId: dn.id, baseLineId: l.id, baseDocNo: `Primary ${dn.docNum}`, baseRow: i + 1, glAccount: '', shippedGoods: false, wtaxLiable }),
    ),
    ...rest,
  };
};

/** Header fields of the service invoice's customer, from the partner record. */
function subic(): Partial<ArInvoice> {
  const c = SEED_PARTNERS.find((p) => p.id === 'bp-040')!;
  const addr = c.addresses.find((a) => a.id === c.defaultBillToId) ?? c.addresses[0];
  return { customerId: c.id, customerCode: c.code, customerName: c.name, contactId: c.defaultContactId, federalTaxId: c.tin, billTo: addr ? formatAddress(addr, c.name) : '', shipTo: addr ? formatAddress(addr, c.name) : '' };
}

const invoices: ArInvoice[] = [
  fromDelivery('ar-001', 430001, 'dn-002', {
    postingDate: '2026-08-21', documentDate: '2026-08-21', dueDate: '2026-09-20', status: 'Closed', closeDate: '2026-09-18',
    remarks: 'Paid by bank transfer 18 Sep 2026.',
  }),
  fromDelivery('ar-002', 430002, 'dn-003', {
    postingDate: '2026-08-28', documentDate: '2026-08-28', dueDate: '2026-09-12', status: 'Closed', closeDate: '2026-09-10',
    remarks: 'Paid in full by BPI transfer, 10 Sep 2026.',
  }),
  fromDelivery('ar-003', 430003, 'dn-004', {
    postingDate: '2026-09-18', documentDate: '2026-09-18', dueDate: '2026-10-18', wtaxLiable: true,
    remarks: 'Northgate withholds 1% (top withholding agent); half paid by check on 2 Oct, balance due 18 Oct.',
  }),
  fromDelivery('ar-005', 430005, 'dn-005', {
    postingDate: '2026-09-10', documentDate: '2026-09-10', dueDate: '2026-09-10',
    remarks: 'USD invoice at the 10 Sep BSP rate. Half paid 22 Sep at that day’s rate (realized difference on the payment); the open half is revalued at month-end.',
  }),
  fromDelivery('ar-006', 430006, 'dn-006', {
    postingDate: '2026-10-06', documentDate: '2026-10-06', dueDate: '2026-11-05',
    remarks: 'First 24 of 40 iPads for DepEd Pasig. Not yet paid.',
  }),
  fromDelivery('ar-007', 430007, 'dn-007', {
    postingDate: '2026-09-04', documentDate: '2026-09-04', dueDate: '2026-10-04', wtaxLiable: true,
    remarks: 'Northgate withholds 1% (top withholding agent). Past due; follow up with their accounts payable.',
  }),
  fromDelivery('ar-008', 430008, 'dn-008', {
    postingDate: '2026-09-06', documentDate: '2026-09-06', dueDate: '2026-09-06', status: 'Closed', closeDate: '2026-09-06',
    remarks: 'Cebu store walk-in, paid by GCash at pick-up.',
  }),
  fromDelivery('ar-009', 430009, 'dn-009', {
    postingDate: '2026-09-13', documentDate: '2026-09-13', dueDate: '2026-09-13', status: 'Closed', closeDate: '2026-09-13',
    remarks: 'Davao store walk-in, paid by GCash at pick-up.',
  }),
  {
    ...blankArInvoice('2026-09-30', 'Jasper L.'),
    id: 'ar-004',
    docNum: 430004,
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
  // Store walk-in sales (mocks/retailHistory.ts): invoiced on pick-up and paid on the spot.
  ...RETAIL_SALES.map((r) =>
    fromDelivery(`ar-${r.id}`, 430010 + r.n, `dn-${r.id}`, {
      postingDate: r.date, documentDate: r.date, dueDate: r.date, status: 'Closed', closeDate: r.date,
      remarks: `Walk-in sale at ${r.store}, paid by ${r.means === 'gcash' ? 'GCash' : r.means} at pick-up.`,
    }),
  ),
  // Corporate orders: paid, past due, half paid and not yet due.
  ...([
    // [id, delivery, posted, due, closed (paid in full) on, remarks]
    ['ar-c01', 'dn-c01', '2026-08-14', '2026-09-13', '2026-09-10', 'Paid by bank transfer 10 Sep 2026.'],
    ['ar-c02', 'dn-c02', '2026-08-29', '2026-09-13', '2026-09-12', 'Paid by BPI transfer 12 Sep 2026.'],
    ['ar-c03', 'dn-c03', '2026-09-01', '2026-09-16', '', 'Past due; second reminder sent 1 Oct.'],
    ['ar-c04', 'dn-c04', '2026-09-11', '2026-09-26', '', 'Half paid 25 Sep; the cooperative pays the balance after its October dividend.'],
    ['ar-c05', 'dn-c05', '2026-10-02', '2026-11-01', '', 'First 12 iPhones. Not yet due.'],
  ] as const).map(([id, dn, date, due, paid, remarks], k) =>
    fromDelivery(id, 430010 + RETAIL_SALES.length + k, dn, { postingDate: date, documentDate: date, dueDate: due, remarks, ...(paid ? { status: 'Closed' as const, closeDate: paid } : {}) }),
  ),
];

/** Paid so far by the seeded incoming payments (document currency). */
const APPLIED: Record<string, number | 'full' | 'half'> = {
  'ar-001': 'full', 'ar-002': 'full', 'ar-003': 'half', 'ar-005': 'half', 'ar-008': 'full', 'ar-009': 'full',
  ...Object.fromEntries(RETAIL_SALES.map((r) => [`ar-${r.id}`, 'full' as const])),
  'ar-c01': 'full', 'ar-c02': 'full', 'ar-c04': 'half',
};

export const SEED_AR_INVOICES: ArInvoice[] = invoices.map((a) => {
  const rule = APPLIED[a.id];
  const due = seedNetDue(a);
  const appliedAmount = rule === 'full' ? due : rule === 'half' ? round2(due / 2) : (rule ?? 0);
  return { ...a, appliedAmount };
});
