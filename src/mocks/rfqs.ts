/**
 * Purchase quotations / RFQs (Purchasing › Quotations). A price request sent to
 * a vendor asking for pricing on items we intend to buy. No stock committed.
 *
 * Settled here:
 * - Lines track requiredQty (what we need) and quotedQty (vendor's offered amount).
 * - Adding assigns a number and sets status to Open. No stock moves.
 * - Copy to Purchase Order carries quoted prices forward to a new PO draft.
 * - Valid Until dates track whether the quote is still usable.
 * - No warehouse on lines — that is decided when the PO is created.
 */
import type { DocumentSeries } from './common';
import type { PoReference } from './purchaseOrders';
import { employeeId, plId, termId } from './masters';
import { SEED_PARTNERS } from './partners';
import { SEED_ITEMS, itemsPerUom } from './items';
import { SEED_COMPANIES } from './companies';
import { SEED_WAREHOUSES } from './itemMasters';
import { formatAddress } from './address';
import { todayISO } from '../services/dates';

export type RfqStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const RFQ_STATUSES: RfqStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

export type { DocumentSeries };

export interface RfqLine {
  id: string;
  itemId: string;
  itemNo: string;
  /** Editable per line; defaults from item name. */
  description: string;
  /** Optional; defaults from header requiredDate. */
  requiredDate: string;
  /** Date the vendor provided pricing for this line. */
  quotedDate: string;
  requiredQty: number;
  /** Vendor's quoted quantity; may differ from requiredQty. 0 = no response yet. */
  quotedQty: number;
  uomCode: string;
  uomName: string;
  itemsPerUnit: number;
  priceListId: string;
  /** Vendor's quoted unit price. */
  unitPrice: number;
  discountPct: number;
  taxCode: string;
  blanketAgreement: string;
  requisitionSlipNo: string;
  /** Line-level vendor override; '' = use header vendor. */
  lineVendorId: string;
}

export interface Rfq {
  id: string;

  // Header
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  contactId: string;
  vendorRef: string;
  currency: string;
  seriesId: string;
  docNum: number;
  status: RfqStatus;
  postingDate: string;
  validUntil: string;
  documentDate: string;
  requiredDate: string;

  // Contents
  summaryType: string;
  lines: RfqLine[];

  // Logistics
  shipTo: string;
  /** Vendor's remittance/billing address — where we send payment. */
  payTo: string;
  shippingType: string;
  language: string;

  // Accounting
  journalRemark: string;
  paymentTermId: string;
  paymentMethod: string;
  cashDiscountDays: number;
  projectId: string;
  cancellationDate: string;
  indicator: string;
  orderNumber: string;
  references: PoReference[];

  // Footer
  buyerId: string;
  ownerId: string;
  discountPct: number;
  freight: number;
  freightTaxCode: string;
  rounding: boolean;
  remarks: string;

  /** Id of the purchase request this RFQ was raised from, if any. */
  basePrId: string;
  /** Id of the PO this was copied to (set when the RFQ closes via copy-to-PO). */
  convertedToPoId: string;
}

export const RFQ_SERIES: DocumentSeries[] = [
  {
    id: 'rfqs-primary',
    name: 'RFQ',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [
      { type: 'literal', value: 'RFQ' },
      { type: 'year' },
      { type: 'sequence', padding: 4 },
    ],
  },
];

const TODAY = todayISO();

export const newRfqLine = (patch: Partial<RfqLine> = {}): RfqLine => ({
  id: `rl-${crypto.randomUUID().slice(0, 8)}`,
  itemId: '',
  itemNo: '',
  description: '',
  requiredDate: '',
  quotedDate: '',
  requiredQty: 1,
  quotedQty: 0,
  uomCode: 'pc',
  uomName: 'Piece',
  itemsPerUnit: 1,
  priceListId: plId('Last purchase price'),
  unitPrice: 0,
  discountPct: 0,
  taxCode: '',
  blanketAgreement: '',
  requisitionSlipNo: '',
  lineVendorId: '',
  ...patch,
});

export function blankRfq(ownerId: string): Omit<Rfq, 'id'> {
  return {
    vendorId: '',
    vendorCode: '',
    vendorName: '',
    contactId: '',
    vendorRef: '',
    currency: 'PHP',
    seriesId: RFQ_SERIES[0].id,
    docNum: 0,
    status: 'Draft',
    postingDate: TODAY,
    validUntil: '',
    documentDate: TODAY,
    requiredDate: '',
    summaryType: '',
    lines: [],
    shipTo: '',
    payTo: '',
    shippingType: '',
    language: 'English',
    journalRemark: '',
    paymentTermId: termId('Net 30'),
    paymentMethod: 'BANK',
    cashDiscountDays: 0,
    projectId: '',
    cancellationDate: '',
    indicator: '',
    orderNumber: '',
    references: [],
    buyerId: ownerId,
    ownerId,
    discountPct: 0,
    freight: 0,
    freightTaxCode: '44',
    rounding: false,
    remarks: '',
    basePrId: '',
    convertedToPoId: '',
  };
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

const byItemNo = (itemNo: string) => SEED_ITEMS.find((i) => i.itemNo === itemNo)!;
const vend = (id: string) => SEED_PARTNERS.find((p) => p.id === id)!;

const rl = (id: string, itemNo: string, requiredQty: number, patch: Partial<RfqLine> = {}): RfqLine => {
  const item = byItemNo(itemNo);
  return newRfqLine({
    id,
    itemId: item.id,
    itemNo: item.itemNo,
    description: item.name,
    requiredQty,
    uomCode: item.purchasingUom,
    uomName: item.purchasingUom === 'pc' ? 'Piece' : item.purchasingUom,
    itemsPerUnit: itemsPerUom(item, item.purchasingUom) ?? 1,
    taxCode: '44',
    ...patch,
  });
};

const mnl = SEED_WAREHOUSES.find((w) => w.code === 'WH-MNL')!;
const MNL_SHIP_TO = formatAddress(mnl.address, mnl.name);
const COMPANY_ADDRESS = formatAddress(SEED_COMPANIES[0].address, SEED_COMPANIES[0].name);

const rfq = (id: string, docNum: number, vendorId: string, patch: Partial<Rfq>): Rfq => {
  const v = vend(vendorId);
  const billAddr = v.addresses.find((a) => a.id === v.defaultBillToId) ?? v.addresses[0];
  return {
    ...blankRfq(employeeId('Andrea Ramos')),
    id,
    docNum,
    status: 'Open',
    vendorId: v.id,
    vendorCode: v.code,
    vendorName: v.name,
    contactId: v.defaultContactId,
    currency: v.currency?.startsWith('All') ? 'PHP' : (v.currency || 'PHP'),
    paymentTermId: v.vendorPaymentTermId,
    paymentMethod: v.defaultPaymentMethod || 'BANK',
    shippingType: v.shippingType || '',
    journalRemark: `Purchase Quotations – ${v.code}`,
    payTo: billAddr ? formatAddress(billAddr, v.name) : '',
    ...patch,
  };
};

export const SEED_RFQS: Rfq[] = [
  // ── Luzon iDistribution: holiday iPhone 18 Pro allocation ─────────────────
  rfq('rfq-001', 1, 'bp-016', {
    postingDate: '2026-09-18', documentDate: '2026-09-18', validUntil: '2026-10-18',
    basePrId: 'prq-001',
    requiredDate: '2026-10-15',
    shipTo: MNL_SHIP_TO,
    lines: [
      rl('rfq-001-1', 'IPH-18P-256-BLK', 20, { requiredDate: '2026-10-15', unitPrice: 68200, quotedQty: 20, quotedDate: '2026-09-20', taxCode: '44' }),
      rl('rfq-001-2', 'IPH-18P-256-SLV', 20, { requiredDate: '2026-10-15', unitPrice: 68200, quotedQty: 15, quotedDate: '2026-09-20', taxCode: '44' }),
      rl('rfq-001-3', 'IPH-18PM-512-GLC', 10, { requiredDate: '2026-10-15', unitPrice: 89500, quotedQty: 10, quotedDate: '2026-09-20', taxCode: '44' }),
    ],
    remarks: 'Holiday season allocation. Luzon responded on 20 Sep; Silver allocation is short (15 of 20). Following up on the 5-unit gap.',
  }),

  // ── Techzone: October chargers and MagSafe (from prq-003, converted → po-045) ──
  rfq('rfq-002', 2, 'bp-013', {
    postingDate: '2026-09-24', documentDate: '2026-09-24', validUntil: '2026-10-24',
    basePrId: 'prq-003',
    requiredDate: '2026-10-03',
    shipTo: MNL_SHIP_TO,
    status: 'Closed',
    convertedToPoId: 'po-045',
    lines: [
      rl('rfq-002-1', 'ACC-PWR20', 100, { requiredDate: '2026-10-03', unitPrice: 1680, quotedQty: 100, quotedDate: '2026-09-26', taxCode: '44', discountPct: 8 }),
      rl('rfq-002-2', 'ACC-MAGSF1', 2, { requiredDate: '2026-10-03', unitPrice: 24 * 2410, quotedQty: 2, quotedDate: '2026-09-26', taxCode: '44' }),
    ],
    remarks: 'Techzone quoted on 26 Sep with the standard 8% discount on chargers. Ordered on 1 Oct.',
  }),

  // ── Apple South Asia: iPad Pro import quote (converted → po-039) ───────────
  rfq('rfq-003', 3, 'bp-017', {
    postingDate: '2026-09-05', documentDate: '2026-09-05', validUntil: '2026-10-05',
    requiredDate: '2026-09-22', shipTo: MNL_SHIP_TO,
    currency: 'USD',
    status: 'Closed',
    convertedToPoId: 'po-039',
    lines: [
      rl('rfq-003-1', 'IPD-PRO-11-256-SG-WF-SBK', 120, {
        requiredDate: '2026-09-22', unitPrice: 685, quotedQty: 120, quotedDate: '2026-09-08', taxCode: '46',
      }),
    ],
    remarks: 'Quote for the DepEd Pasig award (120 iPad Pro 11"). Apple confirmed allocation on 8 Sep; converted to IMP-2026-0003 (po-039).',
  }),

  // ── Luzon iDistribution: MacBook Air for B2B pipeline ──────────────────────
  rfq('rfq-004', 4, 'bp-016', {
    postingDate: '2026-09-28', documentDate: '2026-09-28', validUntil: '2026-10-28',
    requiredDate: '2026-10-20',
    shipTo: MNL_SHIP_TO,
    lines: [
      rl('rfq-004-1', 'MAC-MBA13-M5-8G-16-512-MDN', 15, { requiredDate: '2026-10-20', taxCode: '44' }),
      rl('rfq-004-2', 'MAC-MBA13-M5-8G-16-512-SKB', 10, { requiredDate: '2026-10-20', taxCode: '44' }),
      rl('rfq-004-3', 'MAC-MBA13-M5-10G-24-1T-SKB', 5, { requiredDate: '2026-10-20', taxCode: '44' }),
    ],
    remarks: 'MacBook Air quote for B2B pipeline — Pasig City LGU and two insurance clients. Awaiting Luzon pricing.',
  }),

  // ── AWS: annual cloud services renewal ─────────────────────────────────────
  rfq('rfq-005', 5, 'bp-015', {
    postingDate: '2026-10-01', documentDate: '2026-10-01', validUntil: '2026-11-01',
    requiredDate: '2026-10-15',
    shipTo: COMPANY_ADDRESS, shippingType: '',
    currency: 'USD',
    lines: [
      rl('rfq-005-1', 'SVC-CLD-HOST', 12, {
        requiredDate: '2026-10-15', unitPrice: 420, quotedQty: 12, quotedDate: '2026-10-02', taxCode: '45',
      }),
    ],
    remarks: 'Annual compute renewal at Oct 2026 rates. AWS confirmed 12 months on 2 Oct.',
  }),

  // ── Cancelled: alternate allocation that didn't materialize ───────────────
  rfq('rfq-006', 6, 'bp-016', {
    status: 'Cancelled',
    postingDate: '2026-08-15', documentDate: '2026-08-15', validUntil: '2026-09-15',
    requiredDate: '2026-09-01', shipTo: MNL_SHIP_TO,
    lines: [
      rl('rfq-006-1', 'IPH-18P-256-BLK', 50, { requiredDate: '2026-09-01', taxCode: '44' }),
    ],
    remarks: 'Cancelled — Luzon iDistribution allocation too small. Switched to direct import from Apple South Asia.',
  }),

  // ── Draft: preliminary quote for Duo launch ───────────────────────────────
  rfq('rfq-007', 0, 'bp-016', {
    status: 'Draft',
    postingDate: TODAY, documentDate: TODAY, validUntil: '',
    shipTo: MNL_SHIP_TO,
    lines: [
      rl('rfq-007-1', 'IPH-DUO-256-STW', 6, { taxCode: '44' }),
      rl('rfq-007-2', 'IPH-DUO-256-NSK', 6, { taxCode: '44' }),
      rl('rfq-007-3', 'IPH-DUO-512-NSK', 4, { taxCode: '44' }),
    ],
    remarks: 'Draft — checking Luzon availability before sending. iPhone Duo launch.',
  }),
];
