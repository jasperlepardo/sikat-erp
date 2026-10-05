import { AP_SERIES, SEED_AP_INVOICES, WITHHOLDING_PAYABLE, type ApInvoice, type ApLine } from '../mocks/apInvoices';
import { FREIGHT_IN_ACCOUNT, GRNI_ACCOUNT } from '../mocks/goodsReceipts';
import type { RoundingRule } from '../mocks/currencies';
import type { ItemGroup } from '../mocks/itemMasters';
import type { Item } from '../mocks/items';
import { rateAt, vatNotPaidToVendor, type TaxCode } from '../mocks/taxes';
import { todayISO } from './dates';
import {
  applyInvoicedQty,
  applyStock,
  applyToOrders,
  expenseAccountFor,
  frozenLines,
  grInventoryQty,
  grOpenQty,
  listGoodsReceipts,
  unitCostLc,
} from './goodsReceipts';
import { inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { listItems, saveItem } from './items';
import { lineNet, listPurchaseOrders, openQty, poTotals, saveReceivedQuantities, type WithholdingLine } from './purchaseOrders';
import { createCollection } from './store';

const invoices = createCollection<ApInvoice>('sikat-erp:ap-invoices:v1', SEED_AP_INVOICES, 'ap');

export const listApInvoices = invoices.list;
export const getApInvoice = invoices.get;
export const resetApInvoices = invoices.reset;

export type ApInput = Omit<ApInvoice, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const apSeriesOf = (id: string) => AP_SERIES.find((s) => s.id === id) ?? AP_SERIES[0];
/** "Primary 290004", or "Draft" before it's added. */
export const apNumber = (inv: Pick<ApInvoice, 'seriesId' | 'docNum'>) => (inv.docNum ? `${apSeriesOf(inv.seriesId).name} ${inv.docNum}` : 'Draft');

// ── Totals ───────────────────────────────────────────────────────────────────

/** Footer totals in the document currency — the same arithmetic as a purchase order's. */
export const apTotals = (
  inv: Pick<ApInvoice, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode'>,
  rateOf: (taxCode: string) => number,
  rounding?: RoundingRule,
  isReverseCharge?: (taxCode: string) => boolean,
) => poTotals(inv, rateOf, rounding, isReverseCharge);

/** Total payment due less withholding taken off and down payments: what the vendor is owed. */
export const netDue = (total: number, withholding: WithholdingLine[], downPayment: number) =>
  round2(total - withholding.filter((w) => w.deducted).reduce((n, w) => n + w.amount, 0) - downPayment);

/** A document's total payment due (before withholding), with tax rates as of its posting date. */
export const apTotal = (inv: ApInvoice, codes: TaxCode[]) =>
  apTotals(
    inv,
    (code) => {
      const c = codes.find((x) => x.code === code);
      return c ? (rateAt(c, inv.postingDate) ?? 0) : 0;
    },
    undefined,
    (code) => vatNotPaidToVendor(codes.find((x) => x.code === code)),
  ).total;

/** A line's value in PHP after the line and document discounts. */
export const lineValueLc = (l: ApLine, inv: Pick<ApInvoice, 'discountPct'>, fx: number) => round2(lineNet(l) * (1 - inv.discountPct / 100) * fx);

/** What a line from a receipt cleared out of Goods Received Not Invoiced, in PHP. */
export const receiptValueLc = (l: ApLine) => round2(l.receiptCostLc * grInventoryQty(l));

/** Lines that bring stock in: stocked items not already received on a goods receipt. */
export const movesStock = (l: ApLine, items: Item[]) => l.baseType !== 'GRPO' && Boolean(items.find((i) => i.id === l.itemId)?.inventoryItem);

const onHand = (item: Item) => item.warehouses.reduce((n, w) => n + w.inStock, 0);

// ── Accounting ───────────────────────────────────────────────────────────────

/**
 * The entry adding the invoice makes, in PHP:
 * - Lines from a receipt: Dr Goods Received Not Invoiced at the receipt's cost; any price or
 *   exchange-rate difference to inventory while the stock is on hand, else cost of sales.
 * - Other lines: Dr Inventory for stocked items (the stock comes in now), Dr the cost account
 *   for non-stock items.
 * - Freight: Dr Freight-in. VAT: Dr each tax code's input VAT account, except reverse-charge and
 *   import VAT, which aren't owed to the vendor (booked when remitted or paid to Customs).
 * - Withholding: Cr the withholding tax payable. The vendor's control account takes the rest.
 */
export function apJournal(
  inv: Pick<ApInvoice, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'controlAccount'>,
  fx: number,
  ctx: { items: Item[]; groups: ItemGroup[]; codes: TaxCode[]; rateOf: (code: string) => number; withholding: WithholdingLine[] },
): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => {
    if (account && amount) totals.set(account, round2((totals.get(account) ?? 0) + amount));
  };
  const reverse = (code: string) => vatNotPaidToVendor(ctx.codes.find((c) => c.code === code));
  const vatAccount = (code: string) => ctx.codes.find((c) => c.code === code)?.glAccount || '1410';
  const factor = 1 - inv.discountPct / 100;

  for (const l of inv.lines) {
    const item = ctx.items.find((i) => i.id === l.itemId);
    if (!item) continue;
    const value = lineValueLc(l as ApLine, inv, fx);
    const own = item.inventoryItem ? inventoryAccountFor(item, l.warehouse, ctx.groups) : expenseAccountFor(item, ctx.groups);
    if (l.baseType === 'GRPO') {
      const cleared = receiptValueLc(l);
      add(GRNI_ACCOUNT, cleared);
      // Price or rate difference: onto the stock while it's here, else it's already cost of sales.
      const diffAccount = item.inventoryItem && onHand(item) <= 0 ? item.cogsAccount || expenseAccountFor(item, ctx.groups) : own;
      add(diffAccount, round2(value - cleared));
    } else {
      add(own, value);
    }
    if (!reverse(l.taxCode)) add(vatAccount(l.taxCode), round2((lineNet(l) * factor * ctx.rateOf(l.taxCode) * fx) / 100));
  }
  const freight = round2(inv.freight * fx);
  add(FREIGHT_IN_ACCOUNT, freight);
  if (!reverse(inv.freightTaxCode)) add(vatAccount(inv.freightTaxCode), round2((freight * ctx.rateOf(inv.freightTaxCode)) / 100));

  const debits = round2([...totals.values()].reduce((n, v) => n + v, 0));
  let withheld = 0;
  for (const w of ctx.withholding.filter((x) => x.deducted)) {
    const amt = round2(w.amount * fx);
    add(WITHHOLDING_PAYABLE[w.kind] ?? '2340', -amt);
    withheld += amt;
  }
  if (debits) add(inv.controlAccount || '2010', -round2(debits - withheld));

  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit || a.credit - b.credit);
}

// ── Saving and posting ───────────────────────────────────────────────────────

/** A post rejected against current receipts, POs or stock; the form shows it on the lines. */
export class ApPostError extends Error {
  constructor(
    readonly lineIds: string[],
    message: string,
  ) {
    super(message);
  }
}

/** Another invoice from the same vendor with the same Vendor Ref. No. — likely billed twice. */
export async function findDuplicateInvoice(inv: ApInput) {
  const ref = inv.vendorRef.trim().toLowerCase();
  if (!ref) return undefined;
  return (await invoices.list()).find(
    (o) => o.id !== inv.id && o.vendorId === inv.vendorId && o.status !== 'Cancelled' && o.status !== 'Draft' && o.vendorRef.trim().toLowerCase() === ref,
  );
}

export const saveApDraft = (input: ApInput) => invoices.save({ ...input, status: 'Draft', docNum: 0 });

/** Added invoices keep everything but their remarks and payment block. */
export async function saveApRemarks(inv: ApInvoice, patch: Pick<ApInvoice, 'remarks' | 'paymentBlock' | 'paymentOrderRun'>) {
  const current = await invoices.get(inv.id);
  if (!current) throw new Error('This A/P invoice no longer exists.');
  return invoices.save({ ...current, ...patch });
}

/** Sum each base line's quantity on the invoice. */
function qtyByBase(lines: ApLine[], type: 'GRPO' | 'PO') {
  const out = new Map<string, { line: ApLine; qty: number }>();
  for (const l of lines.filter((x) => x.baseType === type)) out.set(l.baseLineId, { line: l, qty: (out.get(l.baseLineId)?.qty ?? 0) + l.quantity });
  return out;
}

/**
 * Re-cost stocked items for receipt lines billed at a different price or rate: the difference
 * spreads over the stock on hand. With no stock left it went to cost of sales instead.
 */
function applyCostDifferences(lines: ApLine[], inv: Pick<ApInvoice, 'discountPct'>, fx: number, items: Map<string, Item>, sign: 1 | -1) {
  for (const l of lines.filter((x) => x.baseType === 'GRPO')) {
    const item = items.get(l.itemId);
    if (!item?.inventoryItem || item.valuationMethod === 'Standard Price') continue;
    const diff = round2(lineValueLc(l, inv, fx) - receiptValueLc(l)) * sign;
    const qty = onHand(item);
    if (diff && qty > 0) items.set(item.id, { ...item, itemCost: round2(item.itemCost + diff / qty) });
  }
}

/**
 * Add the invoice. All lines go together or none do: receipt and PO open quantities and count
 * freezes are re-checked as they are now. Then lines from receipts bill them (closing receipts
 * billed in full), and other stocked lines receive the stock as a receipt would.
 */
export async function addApInvoice(input: ApInput, fx: number): Promise<ApInvoice> {
  const [items, pos, receipts] = await Promise.all([listItems(), listPurchaseOrders(), listGoodsReceipts()]);
  const stockLines = input.lines.filter((l) => movesStock(l, items));

  const blocked = await frozenLines(stockLines);
  if (blocked.length) throw new ApPostError(blocked.map((b) => b.lineId), blocked.map((b) => b.message).join(' '));

  const over: { lineId: string; message: string }[] = [];
  for (const { line, qty } of qtyByBase(input.lines, 'GRPO').values()) {
    const gr = receipts.find((r) => r.id === line.baseId);
    const gl = gr?.lines.find((x) => x.id === line.baseLineId);
    const open = gr && gl ? grOpenQty(gl, gr) : 0;
    if (qty > open) over.push({ lineId: line.id, message: `${line.itemNo}: billing ${qty} ${line.uomCode} but receipt ${line.baseDocNo} has ${open} left to invoice.` });
  }
  for (const { line, qty } of qtyByBase(input.lines, 'PO').values()) {
    const po = pos.find((p) => p.id === line.baseId);
    const pl = po?.lines.find((x) => x.id === line.baseLineId);
    const open = po?.status === 'Open' && pl?.status === 'Open' ? openQty(pl) : 0;
    if (qty > open) over.push({ lineId: line.id, message: `${line.itemNo}: billing ${qty} ${line.uomCode} but PO ${line.baseDocNo} has ${open} open.` });
  }
  if (over.length) throw new ApPostError(over.map((o) => o.lineId), over.map((o) => o.message).join(' '));

  const lines = input.lines.map((l) => ({ ...l, unitCostLc: unitCostLc(l, input, fx) }));
  const touched = new Map(applyStock(lines.filter((l) => movesStock(l, items)), items, 1).map((i) => [i.id, i]));
  const costing = new Map(items.map((i) => [i.id, touched.get(i.id) ?? i]));
  applyCostDifferences(lines, input, fx, costing, 1);
  for (const [id, item] of costing) if (item !== items.find((i) => i.id === id)) await saveItem(item);

  for (const po of applyToOrders(lines.filter((l) => l.baseType === 'PO'), pos, 1)) await saveReceivedQuantities(po);
  await applyInvoicedQty(lines.filter((l) => l.baseType === 'GRPO'), 1);

  const series = apSeriesOf(input.seriesId);
  const all = await invoices.list();
  const docNum = Math.max(series.firstNo - 1, ...all.filter((r) => r.seriesId === series.id).map((r) => r.docNum)) + 1;
  return invoices.save({ ...input, lines, docNum, status: 'Open', fxRate: fx });
}

/**
 * Cancel an unpaid invoice: receipts it billed are open to invoice again, POs it received on
 * reopen, and stock it brought in goes back out — blocked if that stock has already left.
 */
export async function cancelApInvoice(inv: ApInvoice) {
  if (inv.appliedAmount > 0) throw new ApPostError([], 'Payments or credit memos are applied to this invoice — cancel them first.');
  const returned = inv.lines.filter((l) => (l.returnedQty ?? 0) > 0);
  if (returned.length) throw new ApPostError(returned.map((l) => l.id), 'Goods on this invoice were returned — cancel the goods return or credit memo first.');
  const [items, pos] = await Promise.all([listItems(), listPurchaseOrders()]);
  const stockLines = inv.lines.filter((l) => movesStock(l, items));
  const blocked = await frozenLines(stockLines);
  if (blocked.length) throw new ApPostError(blocked.map((b) => b.lineId), blocked.map((b) => b.message).join(' '));
  const short = stockLines.flatMap((l) => {
    const item = items.find((i) => i.id === l.itemId)!;
    const have = item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0;
    return have < grInventoryQty(l) ? [{ lineId: l.id, message: `${l.itemNo}: ${l.warehouse} has ${have} ${item.inventoryUom} left of the ${grInventoryQty(l)} brought in — it's already been moved or sold.` }] : [];
  });
  if (short.length) throw new ApPostError(short.map((s) => s.lineId), short.map((s) => s.message).join(' '));

  const touched = new Map(applyStock(stockLines, items, -1).map((i) => [i.id, i]));
  const costing = new Map(items.map((i) => [i.id, touched.get(i.id) ?? i]));
  applyCostDifferences(inv.lines, inv, inv.fxRate, costing, -1);
  for (const [id, item] of costing) if (item !== items.find((i) => i.id === id)) await saveItem(item);

  for (const po of applyToOrders(inv.lines.filter((l) => l.baseType === 'PO'), pos, -1)) await saveReceivedQuantities(po);
  await applyInvoicedQty(inv.lines.filter((l) => l.baseType === 'GRPO'), -1);
  return invoices.save({ ...inv, status: 'Cancelled', closeDate: todayISO() });
}

/**
 * Payments applied to invoices (or taken back when a payment is cancelled). `total` is the
 * invoice's net payment due: it closes when the applied amount reaches it, and reopens below it.
 */
export async function applyPayments(rows: { invoiceId: string; amount: number; total: number }[], sign: 1 | -1) {
  for (const r of rows) {
    const inv = await invoices.get(r.invoiceId);
    if (!inv) continue;
    const appliedAmount = Math.max(0, round2(inv.appliedAmount + r.amount * sign));
    const paid = appliedAmount >= r.total - 0.005;
    await invoices.save({
      ...inv,
      appliedAmount,
      status: paid && inv.status === 'Open' ? 'Closed' : !paid && inv.status === 'Closed' ? 'Open' : inv.status,
      closeDate: paid && inv.status === 'Open' ? todayISO() : !paid && inv.status === 'Closed' ? '' : inv.closeDate,
    });
  }
}

/** Move returned quantities on invoice lines by `sign` (goods returns, and credit memos that return goods). */
export async function applyInvoiceReturns(lines: { baseId: string; baseLineId: string; quantity: number }[], sign: 1 | -1) {
  const touched = new Map<string, ApInvoice>();
  for (const l of lines) {
    const inv = touched.get(l.baseId) ?? (await invoices.get(l.baseId));
    const il = inv?.lines.find((x) => x.id === l.baseLineId);
    if (!inv || !il) continue;
    il.returnedQty = Math.max(0, round2((il.returnedQty ?? 0) + l.quantity * sign));
    touched.set(inv.id, inv);
  }
  for (const inv of touched.values()) await invoices.save(inv);
}

/** What's left to send back on an invoice line: billed less already returned. */
export const returnableQty = (l: ApLine) => Math.max(0, round2(l.quantity - (l.returnedQty ?? 0)));
