import {
  PO_SERIES,
  SEED_PURCHASE_ORDERS,
  SEED_PURCHASING_SETTINGS,
  type PoLine,
  type PurchaseOrder,
  type PurchasingSettings,
} from '../mocks/purchaseOrders';
import type { RoundingRule } from '../mocks/currencies';
import { rateAt, vatNotPaidToVendor, type TaxCode } from '../mocks/taxes';
import { paymentTerms } from './partnerMasters';
import { createCollection } from './store';
import { addDays, todayISO } from './dates';
import { applyOrderedChange } from './items';
import { applyRequestDraw } from './purchaseRequests';

import { poSeries, seriesLookup, formatDocNum } from './allSeries';
import { round2 } from './num';
import { inventoryQty, lineNet, priceAfterDiscount } from './lineMath';
import { recalculatePBACommitments } from './purchaseBlanketAgreements';

const orders = createCollection<PurchaseOrder>('sikat-erp:purchase-orders:v21', SEED_PURCHASE_ORDERS, 'po', { audit: 'PO' });
export { poSeries };
export const purchasingSettings = createCollection<PurchasingSettings>('sikat-erp:purchasing-settings', SEED_PURCHASING_SETTINGS, 'ps');

export const listPurchaseOrders = orders.list;
export async function getPurchaseOrder(idOrNumber: string) {
  const direct = await orders.get(idOrNumber);
  if (direct) return direct;
  const all = await orders.list();
  return all.find((o) => poNumber(o) === idOrNumber) ?? null;
}

export type PoInput = Omit<PurchaseOrder, 'id'> & { id?: string };
const TODAY = () => todayISO();

export const seriesOf = (id: string) => seriesLookup(poSeries, id, PO_SERIES);

/** The active purchasing settings; falls back to seed defaults if the collection is empty. */
export const getPurchasingSettings = (): PurchasingSettings =>
  purchasingSettings.snapshot()[0] ?? SEED_PURCHASING_SETTINGS[0];
/** "PO-260012", or "Draft" before a number is assigned. */
export const poNumber = (po: Pick<PurchaseOrder, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(seriesOf(po.seriesId), po.docNum, po.postingDate);

// ── Line and document math ───────────────────────────────────────────────────

export const openQty = (l: PoLine) => Math.max(0, l.quantity - l.receivedQty);
/** Quantity × Items per Unit. */
export { inventoryQty, lineNet, priceAfterDiscount };
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
export type PricedLine = Pick<PoLine, 'itemId' | 'quantity' | 'unitPrice' | 'discountPct' | 'taxCode'>;

export function poTotals(
  po: Pick<PurchaseOrder, 'discountPct' | 'freight' | 'freightTaxCode'> & { lines: PricedLine[] },
  rateOf: (taxCode: string) => number,
  rounding: RoundingRule = 'No rounding',
  isReverseCharge: (taxCode: string) => boolean = () => false,
): PoTotals {
  const beforeDiscount = round2(po.lines.reduce((n, l) => n + lineNet(l), 0));
  const factor = 1 - po.discountPct / 100;
  const discount = round2(beforeDiscount - beforeDiscount * factor);
  const freight = getPurchasingSettings().manageFreightInDocuments ? round2(po.freight) : 0;
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
  const step = getPurchasingSettings().roundingMethod === 'By Currency' ? ROUNDING_STEP[rounding] : 0;
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

const ROUNDING_STEP: Record<RoundingRule, number> = {
  'No rounding': 0,
  'Round to 0.05': 0.05,
  'Round to 1': 1,
  'Round to 5': 5,
  'Round to 10': 10,
};

/** Days until payment for a payment term (by id), from Settings › Banking › Payment terms; 0 when unset. */
export const termDays = (termId: string) => paymentTerms.snapshot().find((t) => t.id === termId)?.days ?? 0;

/** A payment term's name for display — the id itself if the term is gone. */
export const paymentTermName = (termId: string) => paymentTerms.snapshot().find((t) => t.id === termId)?.name ?? termId;

/** Due date = posting date + the payment term's days. */
export function dueDateFor(postingDate: string, termId: string) {
  return postingDate ? addDays(postingDate, termDays(termId)) : '';
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
    await applyRequestDraw(before, draft);
    await recalculatePBACommitments(agreementsOf(before, draft));
    return [draft];
  }

  if (getPurchasingSettings().duplicateVendorRef === 'Block') {
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
    await applyRequestDraw(before, saved);
    await recalculatePBACommitments(agreementsOf(before, saved));
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
  // The split parts together take over what the original had on order, and what it drew from a request.
  await applyOrderedChange(before, undefined);
  await applyRequestDraw(before, undefined);
  for (const part of saved) {
    await applyOrderedChange(undefined, part);
    await applyRequestDraw(undefined, part);
  }
  await recalculatePBACommitments(agreementsOf(before, ...saved));
  return saved;
}

/**
 * Save several new POs as drafts in one write — the split award of a quote comparison, one PO per
 * vendor. Drafts have no number, nothing on order and draw nothing from their request until added.
 */
export async function addPurchaseOrders(inputs: PoInput[]): Promise<PurchaseOrder[]> {
  return orders.saveMany(inputs.map((po) => ({ ...po, status: 'Draft' as const, docNum: 0 })));
}

/** The blanket agreements some line of these POs draws on. */
const agreementsOf = (...pos: (Pick<PurchaseOrder, 'lines'> | undefined)[]) =>
  [...new Set(pos.flatMap((po) => po?.lines.map((l) => l.agreementId) ?? []).filter(Boolean))];

/** Write back received quantities and row/PO status after a goods receipt is added or cancelled. */
export async function saveReceivedQuantities(po: PurchaseOrder) {
  const saved = await orders.save(po);
  // A line received in full closes, which moves it from committed to fulfilled on its agreement.
  await recalculatePBACommitments(agreementsOf(saved));
  return saved;
}

/** Close: the PO and its open rows stop expecting deliveries. */
export async function closePurchaseOrder(po: PurchaseOrder) {
  const closed = await orders.save({
    ...po,
    status: 'Closed',
    closeDate: TODAY(),
    lines: po.lines.map((l) => ({ ...l, status: 'Closed' as const })),
  });
  await applyOrderedChange(po, closed);
  await applyRequestDraw(po, closed);
  await recalculatePBACommitments(agreementsOf(closed));
  return closed;
}

/** Cancel: only while nothing has been received. */
export async function cancelPurchaseOrder(po: PurchaseOrder) {
  if (po.lines.some((l) => l.receivedQty > 0)) throw new Error('Goods were already received on this PO — close it instead.');
  const cancelled = await orders.save({ ...po, status: 'Cancelled', closeDate: TODAY(), lines: po.lines.map((l) => ({ ...l, status: 'Closed' as const })) });
  await applyOrderedChange(po, cancelled);
  await applyRequestDraw(po, cancelled);
  await recalculatePBACommitments(agreementsOf(cancelled));
  return cancelled;
}

/** Recall: move Not Confirmed back to Draft without clearing the document number. */
export async function recallPurchaseOrder(po: PurchaseOrder) {
  const recalled = await orders.save({ ...po, status: 'Draft', approved: false });
  // Back to Draft, so it no longer consumes its source request's open quantities.
  await applyRequestDraw(po, recalled);
  await recalculatePBACommitments(agreementsOf(recalled));
  return recalled;
}
