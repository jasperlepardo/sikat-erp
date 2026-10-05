import { GRNI_ACCOUNT } from '../mocks/goodsReceipts';
import { RETURN_SERIES, needsCredit, type GoodsReturn, type ReturnLine } from '../mocks/goodsReturns';
import type { ItemGroup } from '../mocks/itemMasters';
import type { Item } from '../mocks/items';
import { rateAt, vatNotPaidToVendor, type TaxCode } from '../mocks/taxes';
import { applyInvoiceReturns, listApInvoices, returnableQty } from './apInvoices';
import { todayISO } from './dates';
import { applyReturnedQty, applyStock, expenseAccountFor, frozenLines, grInventoryQty, grOpenQty, listGoodsReceipts } from './goodsReceipts';
import { inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { listItems, saveItem } from './items';
import { poTotals } from './purchaseOrders';
import { createCollection } from './store';
import { PURCHASING_HISTORY } from './purchasingHistory';

const returns = createCollection<GoodsReturn>('sikat-erp:goods-returns:v2', PURCHASING_HISTORY.returns, 'rt');

export const listGoodsReturns = returns.list;
export const getGoodsReturn = returns.get;

export type ReturnInput = Omit<GoodsReturn, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** "Primary 610004", or "Draft" before it's added. */
export const returnNumber = (r: Pick<GoodsReturn, 'seriesId' | 'docNum'>) =>
  r.docNum ? `${(RETURN_SERIES.find((s) => s.id === r.seriesId) ?? RETURN_SERIES[0]).name} ${r.docNum}` : 'Draft';

/** Footer totals in the document currency; the total is the Total Credit the vendor owes back. */
export const returnTotals = (
  r: Pick<GoodsReturn, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode'>,
  rateOf: (taxCode: string) => number,
  isReverseCharge?: (taxCode: string) => boolean,
) => poTotals({ ...r, freight: 0 }, rateOf, undefined, isReverseCharge);

export const returnTotal = (r: GoodsReturn, codes: TaxCode[]) =>
  returnTotals(
    r,
    (code) => {
      const c = codes.find((x) => x.code === code);
      return c ? (rateAt(c, r.postingDate) ?? 0) : 0;
    },
    (code) => vatNotPaidToVendor(codes.find((x) => x.code === code)),
  ).total;

/** Left to credit on a return line: only lines of billed goods need a credit memo. */
export const returnOpenQty = (l: ReturnLine, r: Pick<GoodsReturn, 'status'>) =>
  r.status === 'Open' && needsCredit(l) ? Math.max(0, round4(l.quantity - l.creditedQty)) : 0;

/** Returns an A/P credit memo can copy from: the vendor's open returns with quantity left to credit. */
export const creditableReturns = (all: GoodsReturn[], vendorId: string) =>
  all.filter((r) => r.vendorId === vendorId && r.status === 'Open' && r.lines.some((l) => returnOpenQty(l, r) > 0));

/** The PHP value a line takes out of stock: its cost per inventory unit × inventory quantity. */
export const returnValueLc = (l: ReturnLine) => round2(l.unitCostLc * grInventoryQty(l));

/**
 * The entry adding the return makes, in PHP: Dr Goods Received Not Invoiced / Cr Inventory (or
 * the cost account for a non-stock item), at the cost the goods came in at. The credit memo that
 * follows clears Goods Received Not Invoiced against the vendor.
 */
export function returnJournal(r: Pick<GoodsReturn, 'lines'>, items: Item[], groups: ItemGroup[]): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => {
    if (account && amount) totals.set(account, round2((totals.get(account) ?? 0) + amount));
  };
  for (const l of r.lines) {
    const item = items.find((i) => i.id === l.itemId);
    if (!item) continue;
    const value = returnValueLc(l);
    add(GRNI_ACCOUNT, value);
    add(item.inventoryItem ? inventoryAccountFor(item, l.warehouse, groups) : expenseAccountFor(item, groups), -value);
  }
  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit);
}

// ── Saving and posting ───────────────────────────────────────────────────────

export class ReturnPostError extends Error {
  constructor(
    readonly lineIds: string[],
    message: string,
  ) {
    super(message);
  }
}

export const saveReturnDraft = (input: ReturnInput) => returns.save({ ...input, status: 'Draft', docNum: 0 });

export async function saveReturnRemarks(r: GoodsReturn, patch: Pick<GoodsReturn, 'remarks' | 'attachments'>) {
  const current = await returns.get(r.id);
  if (!current) throw new Error('This goods return no longer exists.');
  return returns.save({ ...current, ...patch });
}

/** Lines whose warehouse doesn't hold what they send back. */
function shortages(lines: ReturnLine[], items: Item[]) {
  const need = new Map<string, { line: ReturnLine; qty: number }>();
  for (const l of lines) {
    if (!items.find((i) => i.id === l.itemId)?.inventoryItem) continue;
    const key = `${l.itemId}@${l.warehouse}`;
    need.set(key, { line: l, qty: (need.get(key)?.qty ?? 0) + grInventoryQty(l) });
  }
  return [...need.values()].flatMap(({ line, qty }) => {
    const item = items.find((i) => i.id === line.itemId)!;
    const have = item.warehouses.find((w) => w.code === line.warehouse)?.inStock ?? 0;
    return have < qty ? [{ lineId: line.id, message: `${line.itemNo}: returning ${qty} ${item.inventoryUom} but ${line.warehouse} has ${have}.` }] : [];
  });
}

/**
 * Add the return. All lines go together or none do: base quantities, stock on hand and count
 * freezes are re-checked as they are now. Then the stock goes out at its cost, receipts lower
 * what's left to bill, and invoice lines count the goods as returned.
 */
export async function addGoodsReturn(input: ReturnInput): Promise<GoodsReturn> {
  const [items, receipts, invoices] = await Promise.all([listItems(), listGoodsReceipts(), listApInvoices()]);
  const problems = [...(await frozenLines(input.lines)), ...shortages(input.lines, items)];

  const byBase = new Map<string, { line: ReturnLine; qty: number }>();
  for (const l of input.lines.filter((x) => x.baseType)) {
    byBase.set(l.baseLineId, { line: l, qty: (byBase.get(l.baseLineId)?.qty ?? 0) + l.quantity });
  }
  for (const { line, qty } of byBase.values()) {
    let open = 0;
    if (line.baseType === 'GRPO') {
      const gr = receipts.find((r) => r.id === line.baseId);
      const gl = gr?.lines.find((x) => x.id === line.baseLineId);
      open = gr && gl ? grOpenQty(gl, gr) : 0;
    } else {
      const il = invoices.find((i) => i.id === line.baseId && i.status !== 'Cancelled')?.lines.find((x) => x.id === line.baseLineId);
      open = il ? returnableQty(il) : 0;
    }
    if (qty > open) problems.push({ lineId: line.id, message: `${line.itemNo}: returning ${qty} ${line.uomCode} but ${line.baseDocNo} has ${open} left to return.` });
  }
  if (problems.length) throw new ReturnPostError(problems.map((p) => p.lineId), problems.map((p) => p.message).join(' '));

  // Lines entered by hand go out at the item's cost now.
  const lines = input.lines.map((l) => (l.unitCostLc ? l : { ...l, unitCostLc: items.find((i) => i.id === l.itemId)?.itemCost ?? 0 }));
  // baseLineId is cleared for the stock move: a return doesn't put the quantity back on order.
  for (const item of applyStock(lines.map((l) => ({ ...l, baseLineId: '' })), items, -1)) await saveItem(item);
  await applyReturnedQty(lines.filter((l) => l.baseType === 'GRPO'), 1);
  await applyInvoiceReturns(lines.filter((l) => l.baseType === 'APINV'), 1);

  const all = await returns.list();
  const series = RETURN_SERIES.find((s) => s.id === input.seriesId) ?? RETURN_SERIES[0];
  const docNum = Math.max(series.firstNo - 1, ...all.filter((r) => r.seriesId === series.id).map((r) => r.docNum)) + 1;
  const status = lines.some(needsCredit) ? 'Open' : 'Closed';
  return returns.save({ ...input, lines, docNum, status, closeDate: status === 'Closed' ? todayISO() : '' });
}

/** Cancel: the stock comes back in at the cost it went out at, and the base lines are open again. */
export async function cancelGoodsReturn(r: GoodsReturn) {
  if (r.lines.some((l) => l.creditedQty > 0)) throw new ReturnPostError([], 'Already credited on an A/P credit memo — cancel the credit memo first.');
  const items = await listItems();
  const blocked = await frozenLines(r.lines);
  if (blocked.length) throw new ReturnPostError(blocked.map((b) => b.lineId), blocked.map((b) => b.message).join(' '));
  for (const item of applyStock(r.lines.map((l) => ({ ...l, baseLineId: '' })), items, 1)) await saveItem(item);
  await applyReturnedQty(r.lines.filter((l) => l.baseType === 'GRPO'), -1);
  await applyInvoiceReturns(r.lines.filter((l) => l.baseType === 'APINV'), -1);
  return returns.save({ ...r, status: 'Cancelled', closeDate: todayISO() });
}

/** Credited quantities on return lines, from credit memos copied from them. A return closes when fully credited. */
export async function applyCreditedQty(lines: { baseId: string; baseLineId: string; quantity: number }[], sign: 1 | -1) {
  const all = await returns.list();
  const touched = new Map<string, GoodsReturn>();
  for (const l of lines) {
    const r = touched.get(l.baseId) ?? all.find((x) => x.id === l.baseId);
    const rl = r?.lines.find((x) => x.id === l.baseLineId);
    if (!r || !rl) continue;
    rl.creditedQty = Math.max(0, round4(rl.creditedQty + l.quantity * sign));
    touched.set(r.id, r);
  }
  for (const r of touched.values()) {
    const done = r.lines.filter(needsCredit).every((x) => x.creditedQty >= x.quantity);
    if (done && r.status === 'Open') Object.assign(r, { status: 'Closed', closeDate: todayISO() });
    if (!done && r.status === 'Closed') Object.assign(r, { status: 'Open', closeDate: '' });
    await returns.save(r);
  }
}
