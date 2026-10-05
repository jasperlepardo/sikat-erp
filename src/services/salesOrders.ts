import { SALES_SETTINGS, SEED_SALES_ORDERS, SO_SERIES, openCommitted, type SalesOrder, type SoLine } from '../mocks/salesOrders';
import type { RoundingRule } from '../mocks/currencies';
import type { Item } from '../mocks/items';
import { rateAt, type TaxCode } from '../mocks/taxes';
import { todayISO } from './dates';
import { listItems, saveItem } from './items';
import { createCollection } from './store';

const orders = createCollection<SalesOrder>('sikat-erp:sales-orders:v3', SEED_SALES_ORDERS, 'so');

export const listSalesOrders = orders.list;
export const getSalesOrder = orders.get;

export type SoInput = Omit<SalesOrder, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const seriesOf = (id: string) => SO_SERIES.find((s) => s.id === id) ?? SO_SERIES[0];
/** "Primary 410004", or "Draft" before a number is assigned. */
export const soNumber = (so: Pick<SalesOrder, 'seriesId' | 'docNum'>) => (so.docNum ? `${seriesOf(so.seriesId).name} ${so.docNum}` : 'Draft');

// ── Line and document math ───────────────────────────────────────────────────

export const openQty = (l: SoLine) => (l.status === 'Closed' ? 0 : Math.max(0, l.quantity - l.deliveredQty));
/** Quantity × Items per Unit. */
export const inventoryQty = (l: SoLine, qty = l.quantity) => qty * (l.itemsPerUnit || 1);
export const priceAfterDiscount = (l: SoLine) => l.unitPrice * (1 - l.discountPct / 100);
/** Total (LC basis): quantity × price after discount, in the document currency. */
export const lineNet = (l: SoLine) => round2(l.quantity * priceAfterDiscount(l));

const ROUNDING_STEP: Record<RoundingRule, number> = { 'No rounding': 0, 'Round to 0.05': 0.05, 'Round to 1': 1, 'Round to 5': 5, 'Round to 10': 10 };

export interface SoTotals {
  beforeDiscount: number;
  discount: number;
  freight: number;
  tax: number;
  rounding: number;
  total: number;
}

/** Tax on a line after the document discount, document currency. */
export const lineTax = (l: SoLine, rate: number, discountPct: number) => round2((lineNet(l) * (1 - discountPct / 100) * rate) / 100);

/** Footer totals in the document currency. The document discount reduces each line's tax base. */
export function soTotals(
  so: Pick<SalesOrder, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'rounding'>,
  rateOf: (taxCode: string) => number,
  rule: RoundingRule = 'No rounding',
): SoTotals {
  const beforeDiscount = round2(so.lines.reduce((n, l) => n + lineNet(l), 0));
  const discount = round2((beforeDiscount * so.discountPct) / 100);
  const freight = SALES_SETTINGS.manageFreightInDocuments ? round2(so.freight) : 0;
  const tax = round2(so.lines.reduce((n, l) => n + lineTax(l, rateOf(l.taxCode), so.discountPct), 0) + (freight * rateOf(so.freightTaxCode)) / 100);
  const raw = round2(beforeDiscount - discount + freight + tax);
  const step = so.rounding ? ROUNDING_STEP[rule] : 0;
  const total = step ? Math.round(raw / step) * step : raw;
  return { beforeDiscount, discount, freight, tax, rounding: round2(total - raw), total: round2(total) };
}

export const soTotal = (so: SalesOrder, codes: TaxCode[]) =>
  soTotals(so, (code) => {
    const c = codes.find((x) => x.code === code);
    return c ? (rateAt(c, so.postingDate) ?? 0) : 0;
  }).total;

/** Due date: posting date + the manual months/days when set, else + the payment term's days. */
export function soDueDate(postingDate: string, termDays: number, months = 0, days = 0) {
  if (!postingDate) return '';
  const d = new Date(`${postingDate}T00:00:00Z`);
  if (months || days) {
    d.setUTCMonth(d.getUTCMonth() + months);
    d.setUTCDate(d.getUTCDate() + days);
  } else d.setUTCDate(d.getUTCDate() + termDays);
  return d.toISOString().slice(0, 10);
}

// ── Stock commitment ─────────────────────────────────────────────────────────

/** Open inventory quantity per "itemId@warehouse" that an order commits (none while draft, closed or cancelled). */
const commitments = (so: Pick<SalesOrder, 'status' | 'docType' | 'lines'> | undefined) => (so ? openCommitted(so) : new Map<string, number>());

/** Move each item's Committed by the change in what the order commits (it starts as the seeded open orders'). */
async function recommit(before: SalesOrder | undefined, after: SalesOrder) {
  const was = commitments(before);
  const now = commitments(after);
  const deltas = [...new Set([...was.keys(), ...now.keys()])].map((k) => [k, (now.get(k) ?? 0) - (was.get(k) ?? 0)] as const).filter(([, d]) => d);
  await applyCommitDeltas(deltas);
}

async function applyCommitDeltas(deltas: (readonly [string, number])[]) {
  if (!deltas.length) return;
  const items = await listItems();
  const touched = new Map<string, Item>();
  for (const [key, delta] of deltas) {
    const [itemId, wh] = key.split('@');
    const item = touched.get(itemId) ?? structuredClone(items.find((i) => i.id === itemId));
    const row = item?.warehouses.find((w) => w.code === wh);
    if (!item || !row) continue;
    row.committed = Math.max(0, round2(row.committed + delta));
    touched.set(itemId, item);
  }
  for (const item of touched.values()) await saveItem(item);
}


// ── Saving ───────────────────────────────────────────────────────────────────

/** Another open order from the same customer with the same Customer Ref. No., if any. */
export async function findDuplicateCustomerRef(so: SoInput) {
  const ref = so.customerRef.trim().toLowerCase();
  if (!ref) return undefined;
  return (await orders.list()).find((o) => o.id !== so.id && o.customerId === so.customerId && o.status !== 'Cancelled' && o.customerRef.trim().toLowerCase() === ref);
}

/** The customer's other open orders, net of tax, in PHP-equivalent document totals — for the credit check. */
export async function openOrdersTotal(customerId: string, exceptId: string | undefined, codes: TaxCode[]) {
  return round2((await orders.list()).filter((o) => o.customerId === customerId && o.id !== exceptId && o.status === 'Open').reduce((n, o) => n + soTotal(o, codes), 0));
}

/**
 * Add or update an order. `asDraft` keeps it a draft (no number, no stock committed). Adding
 * assigns the next number in the series and opens the order, committing its open lines' stock.
 */
export async function saveSalesOrder(input: SoInput, { asDraft = false } = {}): Promise<SalesOrder> {
  const before = input.id ? await orders.get(input.id) : undefined;
  if (asDraft) return orders.save({ ...input, status: 'Draft', docNum: 0 });
  const series = seriesOf(input.seriesId);
  const all = await orders.list();
  const docNum = input.docNum || Math.max(series.firstNo - 1, ...all.filter((o) => o.seriesId === series.id).map((o) => o.docNum)) + 1;
  // Fully delivered lines close; an order with every line closed is closed.
  const lines = input.lines.map((l) => (l.deliveredQty >= l.quantity && l.quantity > 0 ? { ...l, status: 'Closed' as const } : l));
  const status = input.status === 'Closed' || input.status === 'Cancelled' ? input.status : 'Open';
  const saved = await orders.save({ ...input, lines, docNum, status });
  await recommit(before, saved);
  return saved;
}

/**
 * Deliveries copied from order lines: move each line's Delivered Qty by `sign` (back on a
 * cancelled delivery). A line delivered in full closes, and the order closes when every line
 * has; a cancellation reopens them. Committed stock follows the open quantities.
 */
export async function applyDelivered(lines: { baseId: string; baseLineId: string; quantity: number }[], sign: 1 | -1) {
  const byOrder = new Map<string, typeof lines>();
  for (const l of lines) if (l.baseId) byOrder.set(l.baseId, [...(byOrder.get(l.baseId) ?? []), l]);
  for (const [orderId, rows] of byOrder) {
    const before = await orders.get(orderId);
    if (!before) continue;
    const linesNow = before.lines.map((ol) => {
      const qty = rows.filter((r) => r.baseLineId === ol.id).reduce((n, r) => n + r.quantity, 0);
      if (!qty) return ol;
      const deliveredQty = Math.max(0, round2(ol.deliveredQty + qty * sign));
      return { ...ol, deliveredQty, status: deliveredQty >= ol.quantity ? ('Closed' as const) : ('Open' as const) };
    });
    const allClosed = linesNow.every((l) => l.status === 'Closed');
    const status = before.status === 'Cancelled' ? before.status : allClosed ? 'Closed' : 'Open';
    const saved = await orders.save({ ...before, lines: linesNow, status, closeDate: status === 'Closed' ? before.closeDate || todayISO() : '' });
    await recommit(before, saved);
  }
}

/** Close: open rows stop expecting deliveries and their stock is released. */
export async function closeSalesOrder(so: SalesOrder) {
  const saved = await orders.save({ ...so, status: 'Closed', closeDate: todayISO(), lines: so.lines.map((l) => ({ ...l, status: 'Closed' as const })) });
  await recommit(so, saved);
  return saved;
}

/** Cancel: only while nothing has been delivered. Releases committed stock. */
export async function cancelSalesOrder(so: SalesOrder) {
  if (so.lines.some((l) => l.deliveredQty > 0)) throw new Error('Items were already delivered on this order — close it instead.');
  const saved = await orders.save({
    ...so,
    status: 'Cancelled',
    closeDate: todayISO(),
    cancellationDate: so.cancellationDate || todayISO(),
    lines: so.lines.map((l) => ({ ...l, status: 'Closed' as const })),
  });
  await recommit(so, saved);
  return saved;
}
