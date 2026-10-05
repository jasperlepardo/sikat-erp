import {
  PO_SERIES,
  PURCHASING_SETTINGS,
  SEED_PURCHASE_ORDERS,
  type PoLine,
  type PurchaseOrder,
} from '../mocks/purchaseOrders';
import type { RoundingRule } from '../mocks/currencies';
import type { Item } from '../mocks/items';
import { SYSTEM_ATCS, rateAt, vatNotPaidToVendor, type TaxCode } from '../mocks/taxes';
import { paymentTerms } from './partnerMasters';
import { createCollection } from './store';
import { determineWithholding, type LineParty, type TaxMasterData } from './taxDetermination';
import { todayISO } from './dates';
import { applyOrderedChange } from './items';

const orders = createCollection<PurchaseOrder>('sikat-erp:purchase-orders:v15', SEED_PURCHASE_ORDERS, 'po');

export const listPurchaseOrders = orders.list;
export const getPurchaseOrder = orders.get;
export const resetPurchaseOrders = orders.reset;

export type PoInput = Omit<PurchaseOrder, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const TODAY = () => todayISO();

export const seriesOf = (id: string) => PO_SERIES.find((s) => s.id === id) ?? PO_SERIES[0];
/** "Primary 260012", or "Draft" before a number is assigned. */
export const poNumber = (po: Pick<PurchaseOrder, 'seriesId' | 'docNum'>) =>
  po.docNum ? `${seriesOf(po.seriesId).name} ${po.docNum}` : 'Draft';

// ── Line and document math ───────────────────────────────────────────────────

export const openQty = (l: PoLine) => Math.max(0, l.quantity - l.receivedQty);
/** Quantity × Items per Unit. */
export const inventoryQty = (l: PoLine) => l.quantity * (l.itemsPerUnit || 1);
export const priceAfterDiscount = (l: Pick<PoLine, 'unitPrice' | 'discountPct'>) => l.unitPrice * (1 - l.discountPct / 100);
export const lineNet = (l: Pick<PoLine, 'quantity' | 'unitPrice' | 'discountPct'>) => round2(l.quantity * priceAfterDiscount(l));
export const grossPrice = (l: PoLine, rate: number) => l.unitPrice * (1 + rate / 100);

export interface PoTotals {
  beforeDiscount: number;
  discount: number;
  freight: number;
  tax: number;
  /** Reverse-charge VAT: self-assessed and remitted by you, so not part of the amount due to the vendor. */
  reverseCharge: number;
  rounding: number;
  total: number;
}

/**
 * Footer totals in the document currency. The document discount reduces each
 * line's tax base proportionally; freight carries its own tax code.
 */
/** What the totals read from a line; goods receipt lines have the same fields. */
type PricedLine = Pick<PoLine, 'itemId' | 'quantity' | 'unitPrice' | 'discountPct' | 'taxCode'>;

export function poTotals(
  po: Pick<PurchaseOrder, 'discountPct' | 'freight' | 'freightTaxCode'> & { lines: PricedLine[] },
  rateOf: (taxCode: string) => number,
  rounding: RoundingRule = 'No rounding',
  isReverseCharge: (taxCode: string) => boolean = () => false,
): PoTotals {
  const beforeDiscount = round2(po.lines.reduce((n, l) => n + lineNet(l), 0));
  const factor = 1 - po.discountPct / 100;
  const discount = round2(beforeDiscount - beforeDiscount * factor);
  const freight = PURCHASING_SETTINGS.manageFreightInDocuments ? round2(po.freight) : 0;
  const taxOf = (l: PricedLine) => (lineNet(l) * factor * rateOf(l.taxCode)) / 100;
  const lineTax = po.lines.filter((l) => !isReverseCharge(l.taxCode)).reduce((n, l) => n + taxOf(l), 0);
  // Freight on an import carries import VAT, paid to the Bureau of Customs like the goods' own.
  const freightTax = (freight * rateOf(po.freightTaxCode)) / 100;
  const freightReverse = isReverseCharge(po.freightTaxCode);
  const reverseCharge = round2(
    po.lines.filter((l) => isReverseCharge(l.taxCode)).reduce((n, l) => n + taxOf(l), 0) + (freightReverse ? freightTax : 0),
  );
  const tax = round2(lineTax + (freightReverse ? 0 : freightTax));
  const raw = round2(beforeDiscount - discount + freight + tax);
  const step = PURCHASING_SETTINGS.roundingMethod === 'By Currency' ? ROUNDING_STEP[rounding] : 0;
  const total = step ? Math.round(raw / step) * step : raw;
  return { beforeDiscount, discount, freight, tax, reverseCharge, rounding: round2(total - raw), total: round2(total) };
}

/** A PO's document total, with tax rates from the tax codes as of its posting date. */
export const poTotal = (po: PurchaseOrder, codes: TaxCode[]) =>
  poTotals(
    po,
    (code) => {
      const c = codes.find((x) => x.code === code);
      return c ? (rateAt(c, po.postingDate) ?? 0) : 0;
    },
    undefined,
    (code) => vatNotPaidToVendor(codes.find((x) => x.code === code)),
  ).total;

export interface WithholdingLine {
  atc: string;
  description: string;
  rate: number;
  kind: string;
  amount: number;
  /**
   * Taken off the vendor's payment. False for the VAT you withhold on a non-resident's services
   * (reverse charge): the vendor never charged it, so you remit it on top instead.
   */
  deducted: boolean;
}

/** Withholding VAT on payments to non-residents: the reverse charge, remitted on 1600-VT. */
const REVERSE_CHARGE_ATCS: string[] = [
  SYSTEM_ATCS.NR_LEASE_VAT_GOV, SYSTEM_ATCS.NR_LEASE_VAT_PRIVATE, SYSTEM_ATCS.NR_VAT_GOV, SYSTEM_ATCS.NR_VAT_PRIVATE,
];

/**
 * Withholding taxes on paying the vendor — one entry per ATC, amounts summed
 * across all lines, in document currency.
 */
export function poWithholding(
  po: Pick<PurchaseOrder, 'discountPct'> & { lines: PricedLine[] },
  vendor: LineParty | undefined,
  items: Item[],
  tax: TaxMasterData,
  date: string,
): WithholdingLine[] {
  if (!vendor) return [];
  const factor = 1 - po.discountPct / 100;
  const totals = new Map<string, WithholdingLine>();
  for (const line of po.lines) {
    const item = items.find((i) => i.id === line.itemId);
    if (!item) continue;
    const { withholding } = determineWithholding(item, vendor, tax, date);
    const base = lineNet(line) * factor;
    for (const wt of withholding) {
      const amt = round2((base * wt.rate) / 100);
      const existing = totals.get(wt.atc);
      if (existing) {
        existing.amount = round2(existing.amount + amt);
      } else {
        totals.set(wt.atc, {
          atc: wt.atc, description: wt.description, rate: wt.rate, kind: wt.kind, amount: amt,
          deducted: !REVERSE_CHARGE_ATCS.includes(wt.atc),
        });
      }
    }
  }
  return [...totals.values()];
}

const ROUNDING_STEP: Record<RoundingRule, number> = {
  'No rounding': 0,
  'Round to 0.05': 0.05,
  'Round to 1': 1,
  'Round to 5': 5,
  'Round to 10': 10,
};

/**
 * Days until payment for a payment term, from Settings › Banking › Payment terms. A term not in
 * the list falls back to its name ("Net 30" → 30; COD and down-payment terms → 0).
 */
export const termDays = (terms: string) =>
  paymentTerms.snapshot().find((t) => t.name === terms)?.days ?? Number(/Net (\d+)/.exec(terms)?.[1] ?? 0);

/** Due date = posting date + the payment term's days. */
export function dueDateFor(postingDate: string, terms: string) {
  if (!postingDate) return '';
  const d = new Date(`${postingDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + termDays(terms));
  return d.toISOString().slice(0, 10);
}

// ── Saving ───────────────────────────────────────────────────────────────────

/** Another open PO from the same vendor with the same Vendor Ref. No., if any. */
export async function findDuplicateVendorRef(po: PoInput) {
  const ref = po.vendorRef.trim().toLowerCase();
  if (!ref) return undefined;
  return (await orders.list()).find(
    (o) => o.id !== po.id && o.vendorId === po.vendorId && o.status !== 'Cancelled' && o.vendorRef.trim().toLowerCase() === ref,
  );
}

export class PoSaveError extends Error {
  constructor(
    readonly field: 'docNum' | 'vendorRef',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Add or update a PO. `asDraft` keeps it a draft (no number yet). Adding assigns
 * the next number in the series (manual series keep the typed one, which must be
 * unique) and sets the status from Approved. With Split Purchase Order ticked, a
 * new PO whose lines go to several warehouses becomes one PO per warehouse.
 * Returns every PO written.
 */
export async function savePurchaseOrder(input: PoInput, { asDraft = false } = {}): Promise<PurchaseOrder[]> {
  const all = await orders.list();
  const series = seriesOf(input.seriesId);

  const before = input.id ? all.find((o) => o.id === input.id) : undefined;
  if (asDraft) {
    const draft = await orders.save({ ...input, status: 'Draft', docNum: 0 });
    await applyOrderedChange(before, draft);
    return [draft];
  }

  if (PURCHASING_SETTINGS.duplicateVendorRef === 'Block') {
    const dup = await findDuplicateVendorRef(input);
    if (dup) throw new PoSaveError('vendorRef', `Vendor Ref. No. ${input.vendorRef} is already on PO ${poNumber(dup)}.`);
  }

  const inSeries = all.filter((o) => o.seriesId === series.id && o.id !== input.id && o.docNum);
  if (series.manual && input.docNum && inSeries.some((o) => o.docNum === input.docNum)) {
    throw new PoSaveError('docNum', `${series.name} ${input.docNum} is already used.`);
  }
  let next = Math.max(series.firstNo - 1, ...inSeries.map((o) => o.docNum)) + 1;
  const number = (current: number) => (series.manual || current ? current : next++);

  // Adding or saving: Approved decides Open vs Not Confirmed; closed and cancelled POs keep their status.
  const withStatus = (po: PoInput): PoInput => ({
    ...po,
    status: po.status === 'Closed' || po.status === 'Cancelled' ? po.status : po.approved ? 'Open' : 'Not Confirmed',
  });

  const warehouses = [...new Set(input.lines.map((l) => l.warehouse).filter(Boolean))];
  const splitting = input.splitByWarehouse && input.status === 'Draft' && warehouses.length > 1;
  if (!splitting) {
    const saved = await orders.save(withStatus({ ...input, docNum: number(input.docNum) }));
    await applyOrderedChange(before, saved);
    return [saved];
  }

  // One PO per warehouse: the first keeps this record (and a manual number); the rest get new ones.
  const saved: PurchaseOrder[] = [];
  for (const [i, wh] of warehouses.entries()) {
    const part: PoInput = {
      ...input,
      id: i === 0 ? input.id : undefined,
      docNum: i === 0 ? number(input.docNum) : next++,
      lines: input.lines.filter((l) => l.warehouse === wh || (!l.warehouse && i === 0)),
      splitByWarehouse: false,
      splitFrom: i === 0 ? undefined : saved[0]?.id,
      remarks: [input.remarks, `Split by warehouse: ${wh}.`].filter(Boolean).join('\n'),
    };
    saved.push(await orders.save(withStatus(part)));
  }
  // The split parts together take over what the original had on order.
  await applyOrderedChange(before, undefined);
  for (const part of saved) await applyOrderedChange(undefined, part);
  return saved;
}

/** Write back received quantities and row/PO status after a goods receipt is added or cancelled. */
export const saveReceivedQuantities = (po: PurchaseOrder) => orders.save(po);

/** Close: the PO and its open rows stop expecting deliveries. */
export async function closePurchaseOrder(po: PurchaseOrder) {
  const closed = await orders.save({
    ...po,
    status: 'Closed',
    closeDate: TODAY(),
    lines: po.lines.map((l) => ({ ...l, status: 'Closed' as const })),
  });
  await applyOrderedChange(po, closed);
  return closed;
}

/** Cancel: only while nothing has been received. */
export async function cancelPurchaseOrder(po: PurchaseOrder) {
  if (po.lines.some((l) => l.receivedQty > 0)) throw new Error('Goods were already received on this PO — close it instead.');
  const cancelled = await orders.save({ ...po, status: 'Cancelled', closeDate: TODAY(), lines: po.lines.map((l) => ({ ...l, status: 'Closed' as const })) });
  await applyOrderedChange(po, cancelled);
  return cancelled;
}
