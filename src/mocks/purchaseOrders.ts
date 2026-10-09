/**
 * Purchase orders. Fields follow the SAP B1 Purchase Order field map: header,
 * Contents (lines), Logistics, Accounting and footer.
 *
 * Open questions in the field map are settled here, for the prototype:
 * - Vendor name is a snapshot taken when the vendor is picked (SAP stores it on
 *   the document); later edits to the vendor don't change the PO.
 * - Close date is system-set when the PO is closed, not entered.
 * - "Approved" unticked saves the PO as Not Confirmed: it can't be copied to a
 *   goods receipt until someone approves it.
 * - Delivery date is required when the PO is added (drafts may leave it blank).
 * - A line with an item picks its UoM from the item's purchasing units, and items per
 *   unit follow the item's conversion. A line without an item has an editable UoM name and
 *   items per unit. Either way the line keeps its own factor, so later item edits don't
 *   change it.
 * - Return Reason is left out — it belongs to returns, not purchase orders.
 */
import type { DocumentSeries } from './common';
import { employeeId, plId, termId } from './masters';
import { SEED_COMPANIES } from './companies';
import { SEED_WAREHOUSES } from './itemMasters';
import { SEED_ITEMS, itemsPerUom } from './items';
import { SEED_PARTNERS, formatAddress } from './partners';
import { todayISO } from '../services/dates';

export type PoStatus = 'Draft' | 'Open' | 'Not Confirmed' | 'Closed' | 'Cancelled';
export const PO_STATUSES: PoStatus[] = ['Draft', 'Open', 'Not Confirmed', 'Closed', 'Cancelled'];

/** Which currency amounts are shown in: local (PHP), system (USD) or the vendor's. */
export type CurrencyView = 'Local' | 'System' | 'BP';
export type PriceMode = 'Net' | 'Gross' | 'Net and Gross';
export const PRICE_MODES: PriceMode[] = ['Net', 'Gross', 'Net and Gross'];
export type RowStatus = 'Open' | 'Closed';

export interface PoLine {
  id: string;
  itemId: string;
  itemNo: string;
  /** Defaults from the item; editing it here doesn't change the item. */
  name: string;
  /** Defaults from the item; editing it here doesn't change the item. */
  description: string;
  /** Vendor's own catalog number for the item (BP catalog numbers). */
  bpCatalogNo: string;
  /** In the purchasing UoM. */
  quantity: number;
  /** Received on goods receipts so far; Open qty = quantity − received. */
  receivedQty: number;
  uomCode: string;
  uomName: string;
  /** Inventory units in one purchasing unit. */
  itemsPerUnit: number;
  warehouse: string;
  priceListId: string;
  /** Net unit price per purchasing unit, in the document currency. */
  unitPrice: number;
  taxCode: string;
  discountPct: number;
  deliveryDate: string;
  blanketAgreement: string;
  mfrNo: string;
  freeText: string;
  requisitionSlipNo: string;
  department: string;
  status: RowStatus;
}

/** Another document this PO refers to or is referred by (Referenced Document). */
export interface PoReference {
  id: string;
  docType: string;
  docNo: string;
  docDate: string;
  remarks: string;
}

export interface PurchaseOrder {
  id: string;

  // Header
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  contactId: string;
  vendorRef: string;
  /** Document currency — the vendor's, or picked when the vendor takes all currencies. */
  currency: string;
  currencyView: CurrencyView;
  seriesId: string;
  docNum: number;
  status: PoStatus;
  postingDate: string;
  deliveryDate: string;
  documentDate: string;
  closeDate: string;

  // Contents
  priceMode: PriceMode;
  lines: PoLine[];

  // Logistics
  shipTo: string;
  /** Our billing address — where the vendor sends its invoice. Always the company's registered address. */
  billTo: string;
  shippingType: string;
  language: string;
  splitByWarehouse: boolean;
  approved: boolean;

  // Accounting
  journalRemark: string;
  paymentTermId: string;
  paymentMethod: string;
  dueDate: string;
  cashDiscountDays: number;
  projectId: string;
  cancellationDate: string;
  requiredDate: string;
  indicator: string;
  orderNumber: string;
  references: PoReference[];

  // Footer
  buyerId: string;
  ownerId: string;
  remarks: string;
  discountPct: number;
  /** Freight, net, in the document currency (when freight is managed on documents). */
  freight: number;
  freightTaxCode: string;
  /** Set on POs created by splitting another across warehouses. */
  splitFrom?: string;
}

export interface PurchasingSettings {
  id: string;
  separateNetGrossPriceMode: boolean;
  manageFreightInDocuments: boolean;
  roundingMethod: 'By Currency' | 'No rounding';
  multiLanguageSupport: boolean;
  duplicateVendorRef: 'Allow' | 'Warn' | 'Block';
  useBpCatalogNumbers: boolean;
}

export const SEED_PURCHASING_SETTINGS: PurchasingSettings[] = [{
  id: 'purchasing',
  separateNetGrossPriceMode: true,
  manageFreightInDocuments: true,
  roundingMethod: 'By Currency',
  multiLanguageSupport: false,
  duplicateVendorRef: 'Warn',
  useBpCatalogNumbers: true,
}];

export type { DocumentSeries };

export const PO_SERIES: DocumentSeries[] = [
  { id: 'ser-primary', name: 'Primary', prefix: 'PO-', firstNo: 260001, manual: false, isDefault: true, active: true },
  { id: 'ser-import', name: 'Import', prefix: 'IMP-', firstNo: 860001, manual: false, isDefault: false, active: true },
  { id: 'ser-manual', name: 'Manual', prefix: 'PO-', firstNo: 1, manual: true, isDefault: false, active: true },
];

export const LANGUAGES = ['English', 'Filipino'];
/** Indicator choices; '' = none. */
export const INDICATORS = ['Regular', 'Consignment', 'Drop ship'];
/** Department choices for service lines; '' = none. */
export const DEPARTMENTS = ['Store operations', 'Service center', 'Marketing', 'IT', 'Finance'];
export const REFERENCE_DOC_TYPES = ['Purchase request', 'Purchase quotation', 'Sales order', 'Contract', 'Email', 'Other'];

export interface BlanketAgreement {
  no: string;
  vendorId: string;
  description: string;
  validTo: string;
}
export const BLANKET_AGREEMENTS: BlanketAgreement[] = [
  { no: 'BA-2026-001', vendorId: 'bp-016', description: 'Luzon iDistribution — FY2026 volume agreement', validTo: '2026-12-31' },
  { no: 'BA-2026-002', vendorId: 'bp-016', description: 'Luzon iDistribution — holiday season allocation', validTo: '2027-01-15' },
  { no: 'BA-2026-003', vendorId: 'bp-015', description: 'AWS — annual compute savings plan', validTo: '2027-03-31' },
  { no: 'BA-2026-004', vendorId: 'bp-017', description: 'Apple South Asia — FY2026 direct import allocation', validTo: '2026-12-31' },
];

/** Where service-only POs ship to (Company Details › General › Local Language). */
/** The seed company's address, as service-only POs print it for Ship To. */
const COMPANY_ADDRESS = formatAddress(SEED_COMPANIES[0].address, SEED_COMPANIES[0].name);

const TODAY = todayISO();

/**
 * What a PO still has on order, per "itemId@warehouse", in inventory units: the open quantity of its
 * open rows. Only added POs that still expect deliveries (Open, Not Confirmed) count. Items' Ordered
 * is the sum of this over every PO.
 */
export function openOrdered(po: Pick<PurchaseOrder, 'status' | 'lines'> | undefined) {
  const out = new Map<string, number>();
  if (!po || (po.status !== 'Open' && po.status !== 'Not Confirmed')) return out;
  for (const l of po.lines) {
    if (l.status !== 'Open' || !l.warehouse || !l.itemId) continue;
    const qty = Math.max(0, l.quantity - l.receivedQty) * (l.itemsPerUnit || 1);
    if (qty) out.set(`${l.itemId}@${l.warehouse}`, (out.get(`${l.itemId}@${l.warehouse}`) ?? 0) + qty);
  }
  return out;
}

export const newPoLine = (patch: Partial<PoLine> = {}): PoLine => ({
  id: `ln-${crypto.randomUUID().slice(0, 8)}`,
  itemId: '',
  itemNo: '',
  name: '',
  description: '',
  bpCatalogNo: '',
  quantity: 1,
  receivedQty: 0,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  warehouse: 'WH-MNL',
  priceListId: plId('Last purchase price'),
  unitPrice: 0,
  taxCode: '',
  discountPct: 0,
  deliveryDate: '',
  blanketAgreement: '',
  mfrNo: '',
  freeText: '',
  requisitionSlipNo: '',
  department: '',
  status: 'Open',
  ...patch,
});

export function blankPurchaseOrder(buyerId: string): Omit<PurchaseOrder, 'id'> {
  return {
    vendorId: '',
    vendorCode: '',
    vendorName: '',
    contactId: '',
    vendorRef: '',
    currency: 'PHP',
    currencyView: 'BP',
    seriesId: 'ser-primary',
    docNum: 0,
    status: 'Draft',
    postingDate: TODAY,
    deliveryDate: '',
    documentDate: TODAY,
    closeDate: '',
    priceMode: 'Net',
    lines: [],
    shipTo: '',
    billTo: '',
    shippingType: '',
    language: 'English',
    splitByWarehouse: false,
    approved: true,
    journalRemark: '',
    paymentTermId: termId('Net 30'),
    paymentMethod: 'BANK',
    dueDate: '',
    cashDiscountDays: 0,
    projectId: '',
    cancellationDate: '',
    requiredDate: '',
    indicator: '',
    orderNumber: '',
    references: [],
    buyerId: buyerId,
    ownerId: buyerId,
    remarks: '',
    discountPct: 0,
    freight: 0,
    freightTaxCode: '44',
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const byNo = (itemNo: string) => SEED_ITEMS.find((i) => i.itemNo === itemNo)!;

/** A seeded line for an Apple item at the item cost (VAT-exclusive). */
const line = (n: string, itemNo: string, quantity: number, patch: Partial<PoLine> = {}): PoLine => {
  const item = byNo(itemNo);
  return newPoLine({
    id: n,
    itemId: item.id,
    itemNo,
    name: item.name,
    description: item.description,
    quantity,
    uomCode: item.purchasingUom,
    uomName: item.purchasingUom === 'pc' ? 'Piece' : item.purchasingUom,
    itemsPerUnit: itemsPerUom(item, item.purchasingUom) ?? 1,
    unitPrice: item.itemCost,
    taxCode: '44',
    mfrNo: item.manufacturers[0]?.catalogNo ?? '',
    // Non-stock items (services, imported manuals) go to no warehouse.
    warehouse: item.inventoryItem ? 'WH-MNL' : '',
    ...patch,
  });
};

/** Demo conversion for USD-billed imports (BSP reference rate, rounded). */
const USD_PHP = 58;

/** A seeded import line from Apple South Asia: USD cost, 46 Importations. */
const importLine = (n: string, itemNo: string, quantity: number): PoLine => {
  const l = line(n, itemNo, quantity);
  return { ...l, unitPrice: Math.round((l.unitPrice / USD_PHP) * 100) / 100, taxCode: '46', deliveryDate: '2026-10-06' };
};

const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const mnl = SEED_WAREHOUSES.find((w) => w.code === 'WH-MNL')!;
const MNL_SHIP_TO = formatAddress(mnl.address, mnl.name);

const po = (id: string, docNum: number, patch: Partial<PurchaseOrder>): PurchaseOrder => ({
  ...blankPurchaseOrder(employeeId('Andrea Ramos')),
  id,
  docNum,
  vendorId: 'bp-016',
  vendorCode: 'BP-0016',
  vendorName: 'Luzon iDistribution Corp.',
  contactId: 'bp-016-c1',
  shipTo: MNL_SHIP_TO,
  billTo: COMPANY_ADDRESS,
  shippingType: 'sh-own',
  journalRemark: 'Purchase Orders – BP-0016',
  ...patch,
});

/** A PO from any seeded vendor, with the vendor snapshot, currency and terms taken from the partner. */
const vendorPo = (id: string, docNum: number, vendorId: string, patch: Partial<PurchaseOrder>): PurchaseOrder => {
  const v = SEED_PARTNERS.find((p) => p.id === vendorId)!;
  return po(id, docNum, {
    vendorId, vendorCode: v.code, vendorName: v.name, contactId: v.defaultContactId, currency: v.currency,
    paymentTermId: v.vendorPaymentTermId, journalRemark: `Purchase Orders – ${v.code}`,
    ...patch,
  });
};

/** A PO for services: delivered to the office, no shipping type. */
const svcPo = (id: string, docNum: number, vendorId: string, patch: Partial<PurchaseOrder>) =>
  vendorPo(id, docNum, vendorId, { shipTo: COMPANY_ADDRESS, shippingType: '', ...patch });

/** A seeded line for a non-stock item at an agreed price, with the tax code the rules give for its vendor. */
const svc = (n: string, itemNo: string, quantity: number, unitPrice: number, taxCode: string, patch: Partial<PoLine> = {}): PoLine => {
  const item = byNo(itemNo);
  return newPoLine({
    id: n, itemId: item.id, itemNo, name: item.name, description: item.description, quantity,
    uomCode: item.purchasingUom, uomName: item.purchasingUom === 'pc' ? 'Piece' : item.purchasingUom,
    itemsPerUnit: itemsPerUom(item, item.purchasingUom) ?? 1, unitPrice, taxCode, warehouse: '', ...patch,
  });
};

export const SEED_PURCHASE_ORDERS: PurchaseOrder[] = [
  po('po-001', 260001, {
    status: 'Closed',
    postingDate: '2026-09-10', documentDate: '2026-09-10', deliveryDate: '2026-09-17', closeDate: '2026-09-18', dueDate: '2026-10-10',
    vendorRef: 'APD-SO-558120',
    lines: [
      line('po-001-1', 'IPH-17-256-BLK', 10, { receivedQty: 10, status: 'Closed', deliveryDate: '2026-09-17', blanketAgreement: 'BA-2026-001' }),
      line('po-001-2', 'IPH-17-256-WHT', 8, { receivedQty: 8, status: 'Closed', deliveryDate: '2026-09-17', blanketAgreement: 'BA-2026-001' }),
      line('po-001-3', 'ACC-PWR20', 40, { receivedQty: 40, status: 'Closed', deliveryDate: '2026-09-17' }),
    ],
    remarks: 'Received complete on 17 Sep.',
  }),
  po('po-002', 260002, {
    status: 'Open',
    postingDate: '2026-09-18', documentDate: '2026-09-18', deliveryDate: '2026-09-30', dueDate: '2026-10-18',
    vendorRef: 'APD-SO-560044', requiredDate: '2026-09-28', cancellationDate: '2026-10-15',
    lines: [
      line('po-002-1', 'IPH-18P-256-BLK', 12, { receivedQty: 5, deliveryDate: '2026-09-25', blanketAgreement: 'BA-2026-001' }),
      line('po-002-2', 'IPH-18P-256-SLV', 12, { receivedQty: 0, deliveryDate: '2026-09-30', blanketAgreement: 'BA-2026-001' }),
      line('po-002-3', 'IPH-18PM-512-GLC', 6, { deliveryDate: '2026-09-30', blanketAgreement: 'BA-2026-001' }),
      line('po-002-4', 'ACC-CASE-18P', 30, { deliveryDate: '2026-09-30', discountPct: 5 }),
    ],
    references: [{ id: 'po-002-r1', docType: 'Email', docNo: 'Allocation notice 2026-09-16', docDate: '2026-09-16', remarks: 'iPhone 18 Pro launch allocation' }],
  }),
  po('po-003', 260003, {
    status: 'Not Confirmed', approved: false,
    postingDate: '2026-09-25', documentDate: '2026-09-25', deliveryDate: '2026-10-23', dueDate: '2026-10-25',
    lines: [
      line('po-003-1', 'IPH-DUO-256-STW', 4, { deliveryDate: '2026-10-23', warehouse: 'WH-MNL' }),
      line('po-003-2', 'IPH-DUO-256-NSK', 4, { deliveryDate: '2026-10-23', warehouse: 'WH-MNL' }),
      line('po-003-3', 'IPH-DUO-512-NSK', 2, { deliveryDate: '2026-10-23', warehouse: 'WH-MNL' }),
    ],
    remarks: 'iPhone Duo launch stock — waiting for the store manager’s approval.',
  }),
  po('po-004', 0, {
    status: 'Draft',
    postingDate: TODAY, documentDate: TODAY,
    lines: [
      line('po-004-1', 'MAC-MBA13-M5-8G-16-512-MDN', 3),
      line('po-004-2', 'MAC-MBA13-M5-8G-16-512-SKB', 3),
    ],
    remarks: 'Davao back-to-school restock — draft. Received in Pasig, then transferred to the Davao store.',
  }),
  po('po-005', 260004, {
    status: 'Open',
    vendorId: 'bp-015', vendorCode: 'BP-0015', vendorName: 'Amazon Web Services, Inc.', contactId: 'bp-015-c1',
    currency: 'USD', currencyView: 'BP', paymentTermId: termId('Net 7'), shipTo: COMPANY_ADDRESS,
    shippingType: '', journalRemark: 'Purchase Orders – BP-0015',
    postingDate: '2026-09-26', documentDate: '2026-09-26', deliveryDate: '2026-10-01', dueDate: '2026-10-03',
    lines: [
      newPoLine({
        id: 'po-005-1', itemId: 'itm-020', itemNo: 'SVC-CLD-HOST', name: 'Cloud hosting subscription', description: 'Cloud hosting subscription (October 2026)',
        quantity: 1, unitPrice: 420, taxCode: '45', warehouse: '', deliveryDate: '2026-10-01', blanketAgreement: 'BA-2026-003',
        department: 'IT',
      }),
    ],
  }),
  // ── Imports from Apple (Import series) ─────────────────────────────────────
  vendorPo('po-006', 860001, 'bp-017', {
    status: 'Open', seriesId: 'ser-import', currencyView: 'BP', shipTo: MNL_SHIP_TO, shippingType: 'sh-own',
    postingDate: '2026-09-22', documentDate: '2026-09-22', deliveryDate: '2026-10-06', dueDate: '2026-10-22',
    vendorRef: 'ASA-PO-7741902', freightTaxCode: '46', freight: 1850,
    lines: [
      importLine('po-006-1', 'IPH-18P-256-BLK', 20),
      importLine('po-006-2', 'IPH-18P-256-SLV', 20),
      importLine('po-006-3', 'IPH-18PM-512-GLC', 10),
    ].map((l) => ({ ...l, blanketAgreement: 'BA-2026-004' })).concat(
      // Printed materials are VAT-exempt on importation.
      svc('po-006-4', 'SVC-MANUALS', 200, 3.5, '49', { deliveryDate: '2026-10-06' }),
    ),
    remarks: 'Direct import from Apple. Import VAT (46) is paid to the Bureau of Customs on the import entry, not to Apple; the printed manuals are exempt (49). Pier Four Customs Brokerage files the entry; Nordlys Freight flies it in.',
  }),
  vendorPo('po-007', 860002, 'bp-017', {
    status: 'Closed', seriesId: 'ser-import', currencyView: 'BP', shipTo: MNL_SHIP_TO, shippingType: 'sh-own',
    postingDate: '2026-08-18', documentDate: '2026-08-18', deliveryDate: '2026-09-01', closeDate: '2026-09-02', dueDate: '2026-09-17',
    vendorRef: 'ASA-PO-7738115', freightTaxCode: '46', freight: 1200,
    lines: [
      importLine('po-007-1', 'MAC-MBA13-M5-8G-16-512-MDN', 15),
      importLine('po-007-2', 'MAC-MBA13-M5-8G-16-512-SLV', 15),
      importLine('po-007-3', 'MAC-MBA13-M5-10G-24-1T-SKB', 8),
    ].map((l) => ({ ...l, receivedQty: l.quantity, status: 'Closed' as const, deliveryDate: '2026-09-01', blanketAgreement: 'BA-2026-004' })),
    remarks: 'Back-to-school MacBook Air import. Cleared 1 Sep, received complete.',
  }),

  // ── Local goods ────────────────────────────────────────────────────────────
  vendorPo('po-008', 260005, 'bp-013', {
    status: 'Closed', shipTo: MNL_SHIP_TO, shippingType: 'sh-own',
    postingDate: '2026-09-02', documentDate: '2026-09-02', deliveryDate: '2026-09-05', closeDate: '2026-09-06', dueDate: '2026-10-02',
    vendorRef: 'TZ-SO-44102', cashDiscountDays: 10,
    lines: [
      line('po-008-1', 'ACC-CBL1M', 50, { receivedQty: 50, status: 'Closed', deliveryDate: '2026-09-05', unitPrice: 1450 }),
      line('po-008-2', 'ACC-MAGSF1', 30, { receivedQty: 30, status: 'Closed', deliveryDate: '2026-09-05', unitPrice: 24 * 2280 }),
      line('po-008-3', 'ACC-PWR20', 60, { receivedQty: 60, status: 'Closed', deliveryDate: '2026-09-05', unitPrice: 1600, discountPct: 8 }),
    ],
    remarks: 'Accessories restock. 2% cash discount if paid within 10 days.',
  }),
  po('po-009', 260006, {
    status: 'Open', projectId: 'prj-002', discountPct: 2, freight: 3500,
    postingDate: '2026-09-21', documentDate: '2026-09-21', deliveryDate: '2026-10-05', dueDate: '2026-10-21', requiredDate: '2026-10-09',
    vendorRef: 'LID-SO-561870',
    lines: [
      line('po-009-1', 'IPD-PRO-11-256-SG-WF-SLV', 40, { receivedQty: 24, deliveryDate: '2026-10-05' }),
      // AppleCare+ is a service: same input VAT, but 2% EWT instead of 1% on goods.
      svc('po-009-2', 'ACP-IPD-2Y', 40, 4200, '44', { warehouse: '', deliveryDate: '2026-10-05' }),
    ],
    references: [{ id: 'po-009-r1', docType: 'Sales order', docNo: 'SO-2026-0412', docDate: '2026-09-19', remarks: 'DepEd Pasig — 40 iPads for teachers (PhilGEPS award)' }],
    remarks: 'DepEd Pasig iPad rollout. 24 of 40 received; balance on 5 Oct.',
  }),
  po('po-010', 260007, {
    status: 'Cancelled',
    postingDate: '2026-09-08', documentDate: '2026-09-08', deliveryDate: '2026-09-20', dueDate: '2026-10-08', closeDate: '2026-09-12',
    lines: [line('po-010-1', 'APD-PRO3', 20, { deliveryDate: '2026-09-20', status: 'Closed' })],
    remarks: 'Cancelled: AirPods Pro allocation moved to the direct Apple import.',
  }),

  // ── Rent, facilities and logistics ─────────────────────────────────────────
  svcPo('po-011', 260008, 'bp-002', {
    status: 'Open', postingDate: '2026-09-25', documentDate: '2026-09-25', deliveryDate: '2026-10-01', dueDate: '2026-10-10',
    vendorRef: 'NPM-SOA-2026-10-118',
    lines: [svc('po-011-1', 'RNT-MALL', 1, 385000, '44', { freeText: 'Unit 2-118, October 2026', deliveryDate: '2026-10-01', department: 'Store operations' })],
  }),
  svcPo('po-012', 260009, 'bp-036', {
    status: 'Open', postingDate: '2026-09-25', documentDate: '2026-09-25', deliveryDate: '2026-10-01', dueDate: '2026-10-05',
    lines: [svc('po-012-1', 'RNT-CEB', 1, 95000, '48', { freeText: 'Cebu store, October 2026', deliveryDate: '2026-10-01', department: 'Store operations' })],
  }),
  svcPo('po-013', 260010, 'bp-014', {
    status: 'Closed', postingDate: '2026-09-01', documentDate: '2026-09-01', deliveryDate: '2026-09-30', closeDate: '2026-09-28', dueDate: '2026-10-15',
    lines: [svc('po-013-1', 'SVC-SECURITY', 2, 92000, '44', { receivedQty: 2, status: 'Closed', freeText: 'Pasig and Muntinlupa stores, September', deliveryDate: '2026-09-30', department: 'Store operations' })],
  }),
  svcPo('po-014', 260011, 'bp-034', {
    status: 'Open', postingDate: '2026-09-15', documentDate: '2026-09-15', deliveryDate: '2026-09-30', dueDate: '2026-09-30',
    lines: [svc('po-014-1', 'SVC-AIRCON', 3, 18500, '44', { receivedQty: 1, freeText: 'Quarterly PMS, three stores', deliveryDate: '2026-09-30', department: 'Store operations' })],
    remarks: 'Withholding follows the vendor override (WC120 contractor), not the item.',
  }),
  svcPo('po-015', 260012, 'bp-027', {
    status: 'Open', postingDate: '2026-09-01', documentDate: '2026-09-01', deliveryDate: '2026-09-30', dueDate: '2026-10-15',
    lines: [svc('po-015-1', 'SVC-COURIER', 40, 850, '44', { receivedQty: 31, freeText: 'Provincial deliveries, September', deliveryDate: '2026-09-30' })],
  }),
  svcPo('po-016', 260013, 'bp-008', {
    status: 'Open', postingDate: '2026-09-01', documentDate: '2026-09-01', deliveryDate: '2026-09-30', dueDate: '2026-10-07',
    lines: [svc('po-016-1', 'SVC-COURIER', 120, 180, '48', { receivedQty: 96, freeText: 'Same-day Metro Manila deliveries, September', deliveryDate: '2026-09-30' })],
  }),
  svcPo('po-017', 260014, 'bp-042', {
    status: 'Open', postingDate: '2026-09-22', documentDate: '2026-09-22', deliveryDate: '2026-10-06', dueDate: '2026-10-22',
    lines: [svc('po-017-1', 'SVC-FREIGHT', 1, 142000, '44', { freeText: 'SIN–MNL air freight for import PO 860001', deliveryDate: '2026-10-06' })],
    references: [{ id: 'po-017-r1', docType: 'Other', docNo: 'PO 860001', docDate: '2026-09-22', remarks: 'Apple South Asia import' }],
  }),
  svcPo('po-018', 260015, 'bp-022', {
    status: 'Open', postingDate: '2026-09-22', documentDate: '2026-09-22', deliveryDate: '2026-10-07', dueDate: '2026-10-14',
    lines: [svc('po-018-1', 'SVC-CUSTOMS', 1, 18000, '44', { freeText: 'Import entry for PO 860001', deliveryDate: '2026-10-07' })],
    references: [{ id: 'po-018-r1', docType: 'Other', docNo: 'PO 860001', docDate: '2026-09-22', remarks: 'Apple South Asia import' }],
  }),
  svcPo('po-019', 260016, 'bp-028', {
    status: 'Closed', priceMode: 'Gross', postingDate: '2026-09-11', documentDate: '2026-09-11', deliveryDate: '2026-09-11', closeDate: '2026-09-11',
    dueDate: '2026-09-11', paymentMethod: 'CASH',
    lines: [svc('po-019-1', 'SVC-POSTAGE', 1, 3200, '44', { receivedQty: 1, status: 'Closed', freeText: 'Registered mail — BIR and warranty documents', deliveryDate: '2026-09-11', department: 'Finance' })],
  }),

  // ── Professionals, freelancers and agents ──────────────────────────────────
  svcPo('po-020', 260017, 'bp-021', {
    status: 'Not Confirmed', approved: false, postingDate: '2026-09-24', documentDate: '2026-09-24', deliveryDate: '2027-04-15', dueDate: '2027-04-30',
    lines: [svc('po-020-1', 'SVC-AUDIT', 1, 450000, '44', { freeText: 'FY2026 financial statement audit', deliveryDate: '2027-04-15', department: 'Finance' })],
    remarks: 'Engagement letter signed; waiting for the CFO’s approval.',
  }),
  svcPo('po-021', 260018, 'bp-033', {
    status: 'Open', postingDate: '2026-09-01', documentDate: '2026-09-01', deliveryDate: '2026-09-30', dueDate: '2026-10-15',
    lines: [svc('po-021-1', 'SVC-LEGAL', 1, 60000, '44', { freeText: 'Monthly retainer, September', deliveryDate: '2026-09-30', department: 'Finance' })],
  }),
  svcPo('po-022', 260019, 'bp-023', {
    status: 'Closed', priceMode: 'Net and Gross', postingDate: '2026-09-03', documentDate: '2026-09-03', deliveryDate: '2026-09-12', closeDate: '2026-09-14', dueDate: '2026-09-21',
    lines: [svc('po-022-1', 'SVC-PHOTO', 1, 45000, '48', { receivedQty: 1, status: 'Closed', freeText: 'iPhone 18 launch product shoot', deliveryDate: '2026-09-12', department: 'Marketing' })],
  }),
  svcPo('po-023', 0, 'bp-037', {
    status: 'Draft', postingDate: TODAY, documentDate: TODAY,
    lines: [svc('po-023-1', 'SVC-VIDEO-EDIT', 4, 8000, '48', { freeText: 'Unboxing reels, October', department: 'Marketing' })],
    remarks: 'Draft — waiting for his sworn declaration before sending (WI011 10% applies until then).',
  }),
  svcPo('po-024', 260020, 'bp-035', {
    status: 'Open', postingDate: '2026-09-16', documentDate: '2026-09-16', deliveryDate: '2026-10-10', dueDate: '2026-10-25',
    lines: [svc('po-024-1', 'SVC-DESIGN', 1, 120000, '44', { freeText: 'Holiday campaign — in-store signage', deliveryDate: '2026-10-10', department: 'Marketing' })],
  }),
  svcPo('po-025', 260021, 'bp-024', {
    status: 'Open', postingDate: '2026-09-14', documentDate: '2026-09-14', deliveryDate: '2026-10-16', dueDate: '2026-10-31',
    lines: [svc('po-025-1', 'SVC-IT-CONSULT', 40, 2500, '44', { receivedQty: 16, freeText: 'MDM setup — Bayanihan Savings Bank deployment', deliveryDate: '2026-10-16', department: 'IT' })],
  }),
  svcPo('po-026', 260022, 'bp-025', {
    status: 'Open', projectId: 'prj-003', postingDate: '2026-09-07', documentDate: '2026-09-07', deliveryDate: '2026-10-31', dueDate: '2026-11-15',
    lines: [svc('po-026-1', 'SVC-SUB-FITOUT', 320, 450, '48', { receivedQty: 120, freeText: 'Cebu store fit-out', deliveryDate: '2026-10-31', department: 'Store operations' })],
    references: [{ id: 'po-026-r1', docType: 'Contract', docNo: 'FO-2026-CEB-01', docDate: '2026-09-05', remarks: '50% down payment paid' }],
  }),
  svcPo('po-027', 260023, 'bp-026', {
    status: 'Open', postingDate: '2026-09-26', documentDate: '2026-09-26', deliveryDate: '2026-09-30', dueDate: '2026-10-15',
    lines: [svc('po-027-1', 'SVC-SALES-COMM', 1, 38500, '48', { freeText: 'Commission — Bayanihan Savings Bank fleet deal', deliveryDate: '2026-09-30', department: 'Store operations' })],
  }),

  // ── Foreign services ───────────────────────────────────────────────────────
  svcPo('po-028', 260024, 'bp-018', {
    status: 'Open', currencyView: 'BP', postingDate: '2026-09-28', documentDate: '2026-09-28', deliveryDate: '2026-10-01', dueDate: '2026-10-01', paymentMethod: 'CARD',
    lines: [svc('po-028-1', 'SVC-AI-SEAT', 25, 30, '45', { freeText: 'ChatGPT Team, October', deliveryDate: '2026-10-01', department: 'IT' })],
  }),
  svcPo('po-029', 260025, 'bp-019', {
    status: 'Open', postingDate: '2026-09-01', documentDate: '2026-09-01', deliveryDate: '2026-09-30', dueDate: '2026-10-30',
    lines: [svc('po-029-1', 'SVC-ADS-DIGITAL', 1, 250000, '44', { freeText: 'Search and YouTube — iPhone 18 launch', deliveryDate: '2026-09-30', department: 'Marketing' })],
  }),
  svcPo('po-030', 260026, 'bp-020', {
    status: 'Closed', postingDate: '2026-09-01', documentDate: '2026-09-01', deliveryDate: '2026-09-30', closeDate: '2026-09-28', dueDate: '2026-09-01', paymentMethod: 'CARD',
    lines: [svc('po-030-1', 'SVC-ADS-DIGITAL', 1, 180000, '44', { receivedQty: 1, status: 'Closed', freeText: 'Facebook and Instagram — iPhone 18 launch', deliveryDate: '2026-09-30', department: 'Marketing' })],
  }),
  svcPo('po-031', 260027, 'bp-029', {
    status: 'Open', currencyView: 'BP', postingDate: '2026-09-10', documentDate: '2026-09-10', deliveryDate: '2026-11-30', dueDate: '2026-12-30',
    lines: [svc('po-031-1', 'SVC-IT-CONSULT', 120, 95, '45', { receivedQty: 48, freeText: 'POS–ERP integration, phase 1', deliveryDate: '2026-11-30', department: 'IT' })],
  }),
  svcPo('po-032', 260028, 'bp-030', {
    status: 'Open', currencyView: 'BP', postingDate: '2026-09-15', documentDate: '2026-09-15', deliveryDate: '2026-10-01', dueDate: '2026-10-31',
    lines: [svc('po-032-1', 'SVC-POS-LICENSE', 1, 4800000, '45', { freeText: 'POS licence, Oct 2026 – Sep 2027, all stores', deliveryDate: '2026-10-01', department: 'IT' })],
  }),
  svcPo('po-033', 260029, 'bp-039', {
    status: 'Open', currencyView: 'BP', postingDate: '2026-09-18', documentDate: '2026-09-18', deliveryDate: '2026-10-01', dueDate: '2026-10-31',
    lines: [svc('po-033-1', 'SVC-SIGNAGE-LIC', 1, 6000, '45', { freeText: 'Video wall content software, annual', deliveryDate: '2026-10-01', department: 'Marketing' })],
    remarks: 'Their Certificate of Residence expired in June — ask for the new one before payment to get the 10% treaty rate back.',
  }),
  svcPo('po-034', 260030, 'bp-038', {
    status: 'Open', currencyView: 'BP', postingDate: '2026-09-25', documentDate: '2026-09-25', deliveryDate: '2026-10-01', dueDate: '2026-10-31',
    lines: [svc('po-034-1', 'SVC-POS-LEASE', 24, 45, '45', { freeText: '24 terminals, October', deliveryDate: '2026-10-01', department: 'Store operations' })],
  }),
  svcPo('po-035', 260031, 'bp-031', {
    status: 'Closed', currencyView: 'BP', postingDate: '2026-08-25', documentDate: '2026-08-25', deliveryDate: '2026-09-08', closeDate: '2026-09-09', dueDate: '2026-09-15',
    lines: [svc('po-035-1', 'SVC-VIDEO-EDIT', 3, 600, '45', { receivedQty: 3, status: 'Closed', freeText: 'Launch motion graphics', deliveryDate: '2026-09-08', department: 'Marketing' })],
  }),
  svcPo('po-036', 260032, 'bp-043', {
    status: 'Not Confirmed', approved: false, currencyView: 'BP', postingDate: '2026-09-27', documentDate: '2026-09-27', deliveryDate: '2026-11-15', dueDate: '2026-12-15',
    lines: [svc('po-036-1', 'SVC-ADVISORY', 1, 28000, '45', { freeText: 'Store layout and staffing review', deliveryDate: '2026-11-15', department: 'Store operations' })],
  }),
  svcPo('po-037', 260033, 'bp-032', {
    status: 'Open', currencyView: 'BP', postingDate: '2026-09-28', documentDate: '2026-09-28', deliveryDate: '2026-09-30', dueDate: '2026-10-05',
    lines: [svc('po-037-1', 'SVC-LOAN-INT', 1, 18750, '48', { freeText: 'Interest, Q3 2026 — USD 1.5M facility', deliveryDate: '2026-09-30', department: 'Finance' })],
  }),

  // ── Backorders for open sales orders ───────────────────────────────────────
  // Bought to cover what the seeded sales orders want beyond stock on hand.
  po('po-038', 260034, {
    status: 'Open', postingDate: '2026-09-23', documentDate: '2026-09-23', deliveryDate: '2026-10-07', dueDate: '2026-10-23',
    vendorRef: 'LID-SO-562114',
    lines: [line('po-038-1', 'MAC-MBA13-M5-8G-16-512-SKB', 10, { deliveryDate: '2026-10-07' })],
    references: [{ id: 'po-038-r1', docType: 'Sales order', docNo: 'Primary 410001', docDate: '2026-09-22', remarks: 'Bayanihan Savings Bank — 12 MacBook Air, 3 on hand' }],
    remarks: 'Backorder for Bayanihan Savings Bank’s laptop refresh (SO 410001): 9 short, ordering 10.',
  }),
  vendorPo('po-039', 860003, 'bp-017', {
    status: 'Open', seriesId: 'ser-import', currencyView: 'BP', shipTo: MNL_SHIP_TO, shippingType: 'sh-own',
    postingDate: '2026-09-30', documentDate: '2026-09-30', deliveryDate: '2026-10-14', dueDate: '2026-10-30', projectId: 'prj-002',
    vendorRef: 'ASA-PH-2026-10-0081',
    lines: [{ ...importLine('po-039-1', 'IPD-PRO-11-256-SG-WF-SBK', 120), deliveryDate: '2026-10-14' }],
    references: [{ id: 'po-039-r1', docType: 'Sales order', docNo: 'Government 470001', docDate: '2026-09-30', remarks: 'DepEd Pasig — 120 iPad Pro, 4 on hand' }],
    remarks: 'Direct import for the DepEd Pasig award (SO 470001). Ships with the next Apple allocation; 4 already on hand stay as buffer.',
  }),
  // Ordered for the 20W adapter (apl-0361): 40 bought, 10 received, 30 still to come.
  po('po-040', 260035, {
    status: 'Open', postingDate: '2026-10-06', documentDate: '2026-10-06', deliveryDate: '2026-10-13', dueDate: '2026-11-05',
    vendorRef: 'LID-SO-562377',
    lines: [line('po-040-1', 'ACC-PWR20', 40, { receivedQty: 10, deliveryDate: '2026-10-13', unitPrice: 1590 })],
    references: [{ id: 'po-040-r1', docType: 'Sales order', docNo: 'Primary 410008', docDate: '2026-10-06', remarks: 'Bayanihan Savings Bank — 36 chargers, 28 on hand' }],
    remarks: 'Backorder for Bayanihan Savings Bank’s chargers (SO 410008), plus store restock. First 10 received.',
  }),

  // ── Store replenishment buys ──────────────────────────────────────────────
  // Received into Pasig, restocked to the stores the next day and sold there (mocks/retailHistory.ts).
  po('po-041', 260036, {
    status: 'Closed', postingDate: '2026-09-08', documentDate: '2026-09-08', deliveryDate: '2026-09-11', closeDate: '2026-09-12', dueDate: '2026-10-12',
    vendorRef: 'LID-SO-561020',
    lines: [
      line('po-041-1', 'IPH-17-256-LAV', 24, { receivedQty: 24, status: 'Closed', deliveryDate: '2026-09-11', blanketAgreement: 'BA-2026-001' }),
      line('po-041-2', 'IPH-17E-256-SPK', 24, { receivedQty: 24, status: 'Closed', deliveryDate: '2026-09-11', blanketAgreement: 'BA-2026-001' }),
      line('po-041-3', 'IPH-18P-256-BLK', 12, { receivedQty: 12, status: 'Closed', deliveryDate: '2026-09-11' }),
    ],
    remarks: 'Store replenishment, iPhone. Received complete 11 Sep; out to the stores 12 Sep.',
  }),
  vendorPo('po-042', 260037, 'bp-013', {
    status: 'Closed', shipTo: MNL_SHIP_TO, shippingType: 'sh-own',
    postingDate: '2026-09-14', documentDate: '2026-09-14', deliveryDate: '2026-09-16', closeDate: '2026-09-17', dueDate: '2026-10-17',
    vendorRef: 'TZ-SO-44188',
    lines: [
      line('po-042-1', 'ACC-PWR20', 120, { receivedQty: 120, status: 'Closed', deliveryDate: '2026-09-16', unitPrice: 1620, discountPct: 8 }),
      line('po-042-2', 'ACC-CBL1M', 120, { receivedQty: 120, status: 'Closed', deliveryDate: '2026-09-16', unitPrice: 1520 }),
    ],
    remarks: 'Store replenishment, chargers and cables. Received complete 16 Sep.',
  }),
  vendorPo('po-043', 860004, 'bp-017', {
    status: 'Closed', seriesId: 'ser-import', currencyView: 'BP', shipTo: MNL_SHIP_TO, shippingType: 'sh-own',
    postingDate: '2026-09-09', documentDate: '2026-09-09', deliveryDate: '2026-09-22', closeDate: '2026-09-23', dueDate: '2026-10-23',
    vendorRef: 'ASA-PO-7739402',
    lines: [importLine('po-043-1', 'IPD-AIR-11-128-WF-BLU', 12), importLine('po-043-2', 'IPD-AIR-11-256-WF-STL', 16)].map((l) => ({
      ...l, receivedQty: l.quantity, status: 'Closed' as const, deliveryDate: '2026-09-22', blanketAgreement: 'BA-2026-004',
    })),
    remarks: 'iPad Air import for the stores. Cleared 22 Sep, received complete.',
  }),
  po('po-044', 260038, {
    status: 'Closed', postingDate: '2026-09-24', documentDate: '2026-09-24', deliveryDate: '2026-09-29', closeDate: '2026-09-30', dueDate: '2026-10-30',
    vendorRef: 'LID-SO-562201',
    lines: [
      line('po-044-1', 'IPH-17-256-LAV', 16, { receivedQty: 16, status: 'Closed', deliveryDate: '2026-09-29', blanketAgreement: 'BA-2026-001' }),
      line('po-044-2', 'IPH-17E-256-SPK', 16, { receivedQty: 16, status: 'Closed', deliveryDate: '2026-09-29', blanketAgreement: 'BA-2026-001' }),
    ],
    remarks: 'Second iPhone replenishment of the month. Billed; not yet due.',
  }),
  vendorPo('po-045', 260039, 'bp-013', {
    status: 'Open', shipTo: MNL_SHIP_TO, shippingType: 'sh-own',
    postingDate: '2026-10-01', documentDate: '2026-10-01', deliveryDate: '2026-10-03', dueDate: '2026-11-02',
    vendorRef: 'TZ-SO-44260',
    lines: [
      line('po-045-1', 'ACC-PWR20', 100, { receivedQty: 60, deliveryDate: '2026-10-03', unitPrice: 1680, discountPct: 8 }),
      line('po-045-2', 'ACC-MAGSF1', 2, { receivedQty: 1, deliveryDate: '2026-10-03', unitPrice: 24 * 2410 }),
    ],
    remarks: 'October accessories. Techzone shipped 60 chargers and 1 of 2 boxes of MagSafe; the rest is backordered.',
  }),

  // ── Earlier replenishment, July–October ────────────────────────────────────
  // Same flow as above (mocks/retailHistory.ts). Prices drift batch to batch, which FIFO costing shows.
  ...[
    { id: 'po-046', no: 260040, vendor: 'bp-016', on: '2026-07-06', in: '2026-07-09', lines: [['IPH-17-256-LAV', 20, 55778], ['IPH-17E-256-SPK', 20, 43206]] },
    { id: 'po-047', no: 260041, vendor: 'bp-013', on: '2026-07-13', in: '2026-07-15', lines: [['ACC-PWR20', 80, 1455], ['ACC-CBL1M', 80, 1430], ['ACC-USBCL', 2, 24 * 1500]] },
    { id: 'po-048', no: 260042, vendor: 'bp-013', on: '2026-07-27', in: '2026-07-29', lines: [['ACC-PWR35D', 16, 3850], ['ACC-PWR96', 12, 4620], ['ACC-CBL240', 16, 1480]] },
    { id: 'po-050', no: 260043, vendor: 'bp-016', on: '2026-08-03', in: '2026-08-06', lines: [['IPH-17-256-LAV', 16, 55778], ['IPH-17E-256-SPK', 16, 43206], ['ACC-MAGSF1', 1, 24 * 2250]] },
    { id: 'po-051', no: 260044, vendor: 'bp-013', on: '2026-08-17', in: '2026-08-19', lines: [['ACC-PWR20', 100, 1468], ['ACC-CBL1M', 60, 1445], ['ACC-USBCL', 2, 24 * 1525]] },
    { id: 'po-052', no: 260045, vendor: 'bp-016', on: '2026-08-24', in: '2026-08-26', lines: [['ACC-PWR35D', 12, 3960], ['ACC-PWR96', 10, 4760], ['ACC-MAGSF2', 1, 24 * 3180]] },
    { id: 'po-053', no: 260046, vendor: 'bp-013', on: '2026-09-21', in: '2026-09-23', lines: [['ACC-CBL240', 12, 1545], ['ACC-PENUSBC', 24, 4650], ['ACC-USBCL', 1, 24 * 1560]] },
    { id: 'po-054', no: 260047, vendor: 'bp-016', on: '2026-10-02', in: '2026-10-04', lines: [['ACC-PWR35D', 10, 3990], ['ACC-PWR96', 8, 4690], ['ACC-MAGSF2', 1, 24 * 3220]] },
  ].map((o) =>
    vendorPo(o.id, o.no, o.vendor, {
      status: 'Closed', shipTo: MNL_SHIP_TO, shippingType: 'sh-own',
      postingDate: o.on, documentDate: o.on, deliveryDate: o.in, closeDate: o.in, dueDate: plusDays(o.in, 30),
      vendorRef: `${o.vendor === 'bp-013' ? 'TZ' : 'LID'}-SO-${o.no - 200000}`,
      lines: (o.lines as [string, number, number][]).map(([itemNo, qty, price], i) =>
        line(`${o.id}-${i + 1}`, itemNo, qty, { receivedQty: qty, status: 'Closed', deliveryDate: o.in, unitPrice: price }),
      ),
      remarks: 'Store replenishment. Received complete; out to the stores the next day.',
    }),
  ),
  vendorPo('po-049', 860005, 'bp-017', {
    status: 'Closed', seriesId: 'ser-import', currencyView: 'BP', shipTo: MNL_SHIP_TO, shippingType: 'sh-own',
    postingDate: '2026-07-20', documentDate: '2026-07-20', deliveryDate: '2026-08-01', closeDate: '2026-08-01', dueDate: '2026-08-31',
    vendorRef: 'ASA-PO-7731266',
    lines: [importLine('po-049-1', 'ACC-PENUSBC', 40), importLine('po-049-2', 'ACC-MAGSF2', 1)].map((l) => ({
      ...l, receivedQty: l.quantity, status: 'Closed' as const, deliveryDate: '2026-08-01', unitPrice: Math.round(l.unitPrice * 0.97 * 100) / 100,
    })),
    remarks: 'Pencil and MagSafe import at Apple’s Q3 price. Cleared 1 Aug.',
  }),

  // ── Corporate order supply ─────────────────────────────────────────────────
  // Bought for specific B2B sales orders (see mocks/salesOrders.ts) and delivered from Pasig.
  po('po-055', 260048, {
    status: 'Closed', postingDate: '2026-08-06', documentDate: '2026-08-06', deliveryDate: '2026-08-12', closeDate: '2026-08-12', dueDate: '2026-09-11',
    vendorRef: 'LID-SO-550310',
    lines: [line('po-055-1', 'MAC-MBA13-M5-8G-16-512-MDN', 10, { receivedQty: 10, status: 'Closed', deliveryDate: '2026-08-12' })],
    remarks: 'For Clarkfield’s order. Received complete 12 Aug.',
  }),
  vendorPo('po-056', 860006, 'bp-017', {
    status: 'Closed', seriesId: 'ser-import', currencyView: 'BP', shipTo: MNL_SHIP_TO, shippingType: 'sh-own',
    postingDate: '2026-08-18', documentDate: '2026-08-18', deliveryDate: '2026-08-28', closeDate: '2026-08-28', dueDate: '2026-09-27',
    vendorRef: 'ASA-PO-7733015',
    lines: [importLine('po-056-1', 'IPD-PRO-11-256-SG-WF-SBK', 4), importLine('po-056-2', 'ACC-PENPRO', 4)].map((l) => ({ ...l, receivedQty: l.quantity, status: 'Closed' as const, deliveryDate: '2026-08-28' })),
    remarks: 'For Mactan Pixel’s animation workstations. Cleared 28 Aug.',
  }),
  po('po-057', 260049, {
    status: 'Closed', postingDate: '2026-08-25', documentDate: '2026-08-25', deliveryDate: '2026-08-29', closeDate: '2026-08-29', dueDate: '2026-09-28',
    vendorRef: 'LID-SO-551188',
    lines: [line('po-057-1', 'MAC-MBA13-M5-8G-16-512-SKB', 6, { receivedQty: 6, status: 'Closed', deliveryDate: '2026-08-29' })],
    remarks: 'For Kessler & Voss. Received complete 29 Aug.',
  }),
  po('po-058', 260050, {
    status: 'Closed', postingDate: '2026-09-08', documentDate: '2026-09-08', deliveryDate: '2026-09-10', closeDate: '2026-09-10', dueDate: '2026-10-10',
    vendorRef: 'LID-SO-556420',
    lines: [line('po-058-1', 'ACC-PENUSBC', 12, { receivedQty: 12, status: 'Closed', deliveryDate: '2026-09-10', unitPrice: 4620 })],
    remarks: 'For the Guro ng Bayan cooperative’s teachers. Received 10 Sep.',
  }),
  po('po-059', 260051, {
    status: 'Open', postingDate: '2026-09-25', documentDate: '2026-09-25', deliveryDate: '2026-10-01', dueDate: '2026-10-25',
    vendorRef: 'LID-SO-561944',
    lines: [line('po-059-1', 'IPH-17-256-LAV', 20, { receivedQty: 12, deliveryDate: '2026-10-01' })],
    remarks: 'For ASEAN Health. Luzon shipped 12 of 20 on 1 Oct; 8 to follow.',
  }),
  vendorPo('po-060', 860007, 'bp-017', {
    status: 'Open', seriesId: 'ser-import', currencyView: 'BP', shipTo: MNL_SHIP_TO, shippingType: 'sh-own',
    postingDate: '2026-10-06', documentDate: '2026-10-06', deliveryDate: '2026-10-16', dueDate: '2026-11-15',
    vendorRef: 'ASA-PO-7741102',
    lines: [{ ...importLine('po-060-1', 'IPD-AIR-11-128-WF-BLU', 30), deliveryDate: '2026-10-16' }],
    remarks: 'Backorder for Subic Bay Marine’s 30 iPad Airs (SO for Subic Bay, 5 Oct). Ships with the mid-October allocation.',
  }),
];

