/**
 * Sales returns (Sales › Returns & Credits). Goods sent back by a customer — defective, wrong
 * item, excess delivery. Fields mirror the purchasing Goods Return, adapted for the sales side.
 *
 * Settled here, for the prototype:
 * - Item-type only, like the other sales documents (no Item/Service type or Summary type).
 * - Lines copy from deliveries, or are entered by hand. Returning the goods puts stock back
 *   in: Dr Inventory / Cr COGS — the reverse of the delivery journal.
 * - A return stays Open until every line is covered by an A/R credit memo. A credit memo
 *   copied from a return carries the credit to the customer.
 * - A return doesn't reopen the delivery: a replacement is a new order or a new delivery.
 */
import { CURRENT_USER_ID, type DocumentSeries } from './common';
import { blankDelivery, newDnLine, SEED_DELIVERIES, type Delivery, type DnLine } from './deliveries';
import { SEED_PARTNERS, formatAddress } from './partners';
import { termId } from './masters';

export type SrStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const SR_STATUSES: SrStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

export type SrBaseType = 'DN' | '';

export interface SrLine extends Omit<DnLine, 'invoicedQty' | 'baseType'> {
  baseType: SrBaseType;
  returnReason: string;
  countryOfOriginCode: string;
  /** Quantity already copied to an A/R credit memo. */
  creditedQty: number;
}

export interface SalesReturn extends Omit<Delivery, 'lines' | 'status'> {
  status: SrStatus;
  lines: SrLine[];
}

export const SR_SERIES: DocumentSeries[] = [
  {
    id: 'srs-primary',
    name: 'Sales Return',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [
      { type: 'literal', value: 'SRT' },
      { type: 'year' },
      { type: 'sequence', padding: 4 },
    ],
  },
];

export const newSrLine = (patch: Partial<SrLine> = {}): SrLine => {
  const { invoicedQty: _i, ...base } = newDnLine();
  return {
    ...base,
    id: `srl-${crypto.randomUUID().slice(0, 8)}`,
    baseType: '',
    returnReason: '',
    countryOfOriginCode: '',
    creditedQty: 0,
    ...patch,
  };
};

export function blankSalesReturn(today: string, ownerId: string): Omit<SalesReturn, 'id'> {
  const { status: _s, lines: _l, ...base } = blankDelivery(today, ownerId);
  return {
    ...base,
    seriesId: SR_SERIES[0].id,
    status: 'Draft',
    lines: [],
    journalRemark: '',
  };
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// History (no journal entries, like other seeded documents). Stock already reflects the returns.

const dn = (id: string) => SEED_DELIVERIES.find((d) => d.id === id)!;
const bp = (id: string) => SEED_PARTNERS.find((p) => p.id === id)!;

function fromDelivery(
  id: string,
  docNum: number,
  dnId: string,
  linePicks: { lineId: string; qty: number; creditedQty: number; returnReason: string }[],
  patch: Partial<SalesReturn>,
): SalesReturn {
  const delivery = dn(dnId);
  const customer = bp(delivery.customerId);
  const bill = customer.addresses.find((a) => a.id === customer.defaultBillToId) ?? customer.addresses[0];
  const ship = customer.addresses.find((a) => a.id === customer.defaultShipToId) ?? bill;
  const lines: SrLine[] = linePicks.flatMap(({ lineId, qty, creditedQty, returnReason }) => {
    const dl = delivery.lines.find((l) => l.id === lineId);
    if (!dl) return [];
    const { invoicedQty: _i, ...base } = dl;
    return [newSrLine({
      ...base,
      id: `${id}-${lineId}`,
      quantity: qty,
      baseType: 'DN',
      baseId: delivery.id,
      baseLineId: dl.id,
      baseDocNo: `DN-${delivery.postingDate.slice(0, 4)}-${String(delivery.docNum).padStart(4, '0')}`,
      baseRow: delivery.lines.indexOf(dl) + 1,
      creditedQty,
      returnReason,
      countryOfOriginCode: '',
    })];
  });
  return {
    ...blankDelivery(patch.postingDate ?? delivery.postingDate, CURRENT_USER_ID),
    customerId: customer.id,
    customerCode: customer.code,
    customerName: customer.name,
    contactId: delivery.contactId || customer.defaultContactId,
    currency: delivery.currency,
    paymentTermId: customer.customerPaymentTermId ?? termId('Net 30'),
    federalTaxId: customer.tin,
    salesEmployeeId: delivery.salesEmployeeId,
    billTo: bill ? formatAddress(bill, customer.name) : '',
    shipTo: ship ? formatAddress(ship, customer.name) : '',
    shippingType: delivery.shippingType,
    fxRate: delivery.fxRate,
    discountPct: 0,
    journalRemark: `Sales Returns – ${customer.code}`,
    orderNumber: delivery.orderNumber,
    seriesId: SR_SERIES[0].id,
    ...patch,
    id,
    docNum,
    lines,
  };
}

export const SEED_SALES_RETURNS: SalesReturn[] = [
  // SRT-2026-0001: Bayanihan returns 1 wrong-spec MacBook Air from DN-2026-0001, before it was billed.
  // Closed — credited by A/R credit memo ACM-2026-0003 (acm-003).
  fromDelivery('sr-001', 1, 'dn-001', [
    { lineId: 'dn-001-so-001-2', qty: 1, creditedQty: 1, returnReason: 'Wrong item' },
  ], {
    postingDate: '2026-10-03',
    documentDate: '2026-10-03',
    dueDate: '2026-11-02',
    status: 'Closed',
    closeDate: '2026-10-05',
    remarks: 'Branch ordered the wrong colour (Sky Blue instead of Midnight). Unit returned in original packaging. Credit memo ACM-2026-0003 issued.',
    customerRef: 'BSB-RMA-2026-0003',
  }),
];
