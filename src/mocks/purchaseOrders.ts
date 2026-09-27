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
 * - UoM groups aren't modelled yet, so every line behaves like the "Manual" UoM
 *   group: UoM name and items per unit are editable on the line.
 * - Return Reason is left out — it belongs to returns, not purchase orders.
 */
import { SEED_ITEMS } from './items';

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
  priceList: string;
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
  payTo: string;
  shippingType: string;
  language: string;
  splitByWarehouse: boolean;
  approved: boolean;

  // Accounting
  journalRemark: string;
  paymentTerms: string;
  paymentMethod: string;
  dueDate: string;
  cashDiscountDays: number;
  project: string;
  cancellationDate: string;
  requiredDate: string;
  indicator: string;
  orderNumber: string;
  references: PoReference[];

  // Footer
  buyer: string;
  owner: string;
  remarks: string;
  discountPct: number;
  /** Freight, net, in the document currency (when freight is managed on documents). */
  freight: number;
  freightTaxCode: string;
  /** Set on POs created by splitting another across warehouses. */
  splitFrom?: string;
}

/**
 * Purchasing document settings (Administration › Document settings / General
 * settings in SAP). Fixed for the prototype; the form reads them to show or
 * hide conditional fields.
 */
export const PURCHASING_SETTINGS = {
  /** Shows the Net / Gross / Net and Gross price mode on documents. */
  separateNetGrossPriceMode: true,
  /** Shows Freight in the footer. */
  manageFreightInDocuments: true,
  /** 'By Currency' shows the Rounding row, using the document currency's rounding rule. */
  roundingMethod: 'By Currency' as 'By Currency' | 'No rounding',
  /** Shows Language on Logistics. */
  multiLanguageSupport: false,
  /** What happens when another PO from the same vendor has the same Vendor Ref. No. */
  duplicateVendorRef: 'Warn' as 'Allow' | 'Warn' | 'Block',
  /** Uses the vendor's catalog number on lines when one is defined. */
  useBpCatalogNumbers: true,
};

export interface DocumentSeries {
  id: string;
  name: string;
  /** First number of the series; the next number is one past the highest used. */
  firstNo: number;
  /** Manual series: the user types the number. */
  manual: boolean;
  active: boolean;
}

export const PO_SERIES: DocumentSeries[] = [
  { id: 'ser-primary', name: 'Primary', firstNo: 260001, manual: false, active: true },
  { id: 'ser-import', name: 'Import', firstNo: 860001, manual: false, active: true },
  { id: 'ser-manual', name: 'Manual', firstNo: 1, manual: true, active: true },
];

export const LANGUAGES = ['English', 'Filipino'];
export const INDICATORS = ['— None —', 'Regular', 'Consignment', 'Drop ship'];
export const DEPARTMENTS = ['— None —', 'Store operations', 'Service center', 'Marketing', 'IT', 'Finance'];
export const REFERENCE_DOC_TYPES = ['Purchase request', 'Purchase quotation', 'Sales order', 'Contract', 'Email', 'Other'];

export interface BlanketAgreement {
  no: string;
  vendorId: string;
  description: string;
  validTo: string;
}
export const BLANKET_AGREEMENTS: BlanketAgreement[] = [
  { no: 'BA-2026-001', vendorId: 'bp-016', description: 'Apple distributor — FY2026 volume agreement', validTo: '2026-12-31' },
  { no: 'BA-2026-002', vendorId: 'bp-016', description: 'Apple distributor — holiday season allocation', validTo: '2027-01-15' },
  { no: 'BA-2026-003', vendorId: 'bp-015', description: 'CloudStack — annual hosting commitment', validTo: '2027-03-31' },
];

/** Where service-only POs ship to (Company Details › General › Local Language). */
export const COMPANY_ADDRESS = 'Sikat Tech Inc.\nUnit 1203, Tektite East Tower, Exchange Road\nOrtigas Center, Pasig 1605, Metro Manila';

const TODAY = new Date().toISOString().slice(0, 10);

export const newPoLine = (patch: Partial<PoLine> = {}): PoLine => ({
  id: `ln-${crypto.randomUUID().slice(0, 8)}`,
  itemId: '',
  itemNo: '',
  description: '',
  bpCatalogNo: '',
  quantity: 1,
  receivedQty: 0,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  warehouse: 'WH-MNL',
  priceList: 'Last purchase price',
  unitPrice: 0,
  taxCode: '',
  discountPct: 0,
  deliveryDate: '',
  blanketAgreement: '',
  mfrNo: '',
  freeText: '',
  requisitionSlipNo: '',
  department: '— None —',
  status: 'Open',
  ...patch,
});

export function blankPurchaseOrder(buyer: string): Omit<PurchaseOrder, 'id'> {
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
    payTo: '',
    shippingType: '',
    language: 'English',
    splitByWarehouse: false,
    approved: true,
    journalRemark: '',
    paymentTerms: 'Net 30',
    paymentMethod: 'BANK',
    dueDate: '',
    cashDiscountDays: 0,
    project: '— None —',
    cancellationDate: '',
    requiredDate: '',
    indicator: '— None —',
    orderNumber: '',
    references: [],
    buyer,
    owner: buyer,
    remarks: '',
    discountPct: 0,
    freight: 0,
    freightTaxCode: 'IVS12',
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
    description: item.description,
    quantity,
    uomCode: item.purchasingUom,
    uomName: item.purchasingUom === 'pc' ? 'Piece' : item.purchasingUom,
    itemsPerUnit: item.itemsPerPurchaseUnit,
    unitPrice: item.itemCost,
    taxCode: item.purchaseTaxGroup === 'P-VAT12S' ? 'IVS12' : 'IV12',
    mfrNo: item.manufacturers[0]?.catalogNo ?? '',
    ...patch,
  });
};

const APPLE_PAY_TO = 'Apple Authorized Distributor (placeholder)\n6750 Ayala Ave.\nMakati 1226, Metro Manila';
const MNL_SHIP_TO = 'Manila distribution center\nPasig';

const po = (id: string, docNum: number, patch: Partial<PurchaseOrder>): PurchaseOrder => ({
  ...blankPurchaseOrder('Andrea Ramos'),
  id,
  docNum,
  vendorId: 'bp-016',
  vendorCode: 'BP-0016',
  vendorName: 'Apple Authorized Distributor (placeholder)',
  contactId: 'bp-016-c1',
  shipTo: MNL_SHIP_TO,
  payTo: APPLE_PAY_TO,
  shippingType: 'sh-own',
  journalRemark: 'Purchase Orders – BP-0016',
  ...patch,
});

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
      line('po-003-3', 'IPH-DUO-512-NSK', 2, { deliveryDate: '2026-10-23', warehouse: 'WH-CEB' }),
    ],
    remarks: 'iPhone Duo launch stock — waiting for the store manager’s approval.',
  }),
  po('po-004', 0, {
    status: 'Draft',
    postingDate: TODAY, documentDate: TODAY,
    lines: [
      line('po-004-1', 'MAC-MBA13-M5-8G-16-512-MDN', 3, { warehouse: 'WH-DVO' }),
      line('po-004-2', 'MAC-MBA13-M5-8G-16-512-SKB', 3, { warehouse: 'WH-DVO' }),
    ],
    remarks: 'Davao back-to-school restock — draft.',
  }),
  po('po-005', 260004, {
    status: 'Open',
    vendorId: 'bp-015', vendorCode: 'BP-0015', vendorName: 'CloudStack Pte. Ltd.', contactId: 'bp-015-c1',
    currency: 'USD', currencyView: 'BP', paymentTerms: 'Net 7', shipTo: COMPANY_ADDRESS,
    payTo: 'CloudStack Pte. Ltd.\n71 Robinson Rd.\nSingapore 068895', shippingType: '', journalRemark: 'Purchase Orders – BP-0015',
    postingDate: '2026-09-26', documentDate: '2026-09-26', deliveryDate: '2026-10-01', dueDate: '2026-10-03',
    lines: [
      newPoLine({
        id: 'po-005-1', itemId: 'itm-020', itemNo: 'SVC-CLD-HOST', description: 'Cloud hosting subscription (October 2026)',
        quantity: 1, unitPrice: 420, taxCode: 'IVD12', warehouse: '', deliveryDate: '2026-10-01', blanketAgreement: 'BA-2026-003',
        department: 'IT',
      }),
    ],
  }),
];

