import { WITHHOLDING_PAYABLE } from '../mocks/apInvoices';
import { MEMO_SERIES, type ApCreditMemo, type CreditApplication, type MemoLine } from '../mocks/apCreditMemos';
import { memoSeries, seriesLookup, formatDocNum } from './allSeries';
import { FREIGHT_IN_ACCOUNT, GRNI_ACCOUNT } from '../mocks/goodsReceipts';
import type { ItemGroup } from '../mocks/itemMasters';
import type { Item } from '../mocks/items';
import { rateAt, vatNotPaidToVendor, type TaxCode } from '../mocks/taxes';
import { applyInvoiceReturns, applyPayments, listApInvoices, returnableQty } from './apInvoices';
import { todayISO } from './dates';
import { applyStock, expenseAccountFor, frozenLines, grInventoryQty, unitCostLc } from './goodsReceipts';
import { applyCreditedQty, listGoodsReturns, returnOpenQty } from './goodsReturns';
import { inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { listItems, saveItem } from './items';
import { lineNet, poTotals, type WithholdingLine } from './purchaseOrders';
import { createCollection } from './store';
import { PURCHASING_HISTORY } from './purchasingHistory';

const memos = createCollection<ApCreditMemo>('sikat-erp:ap-credit-memos:v5', PURCHASING_HISTORY.memos, 'cm');

export const listCreditMemos = memos.list;
export const getCreditMemo = memos.get;

export type MemoInput = Omit<ApCreditMemo, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "Primary 620004", or "Draft" before it's added. */
export const memoNumber = (m: Pick<ApCreditMemo, 'seriesId' | 'docNum'>) =>
  formatDocNum(seriesLookup(memoSeries, m.seriesId, MEMO_SERIES), m.docNum);

export const memoTotals = (
  m: Pick<ApCreditMemo, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode'>,
  rateOf: (taxCode: string) => number,
  isReverseCharge?: (taxCode: string) => boolean,
) => poTotals(m, rateOf, undefined, isReverseCharge);

/** Total credit less the withholding it reverses and down payments: what the vendor owes back. */
export const netCredit = (total: number, withholding: WithholdingLine[], downPayment: number) =>
  round2(total - withholding.filter((w) => w.deducted).reduce((n, w) => n + w.amount, 0) - downPayment);

export const memoTotal = (m: ApCreditMemo, codes: TaxCode[]) =>
  memoTotals(
    m,
    (code) => {
      const c = codes.find((x) => x.code === code);
      return c ? (rateAt(c, m.postingDate) ?? 0) : 0;
    },
    (code) => vatNotPaidToVendor(codes.find((x) => x.code === code)),
  ).total;

/** Lines that send stock back: returning goods on a stocked item, not already sent back on a goods return. */
export const sendsStock = (l: MemoLine, items: Item[]) => l.returnGoods && l.baseType !== 'GRET' && Boolean(items.find((i) => i.id === l.itemId)?.inventoryItem);

const valueLc = (l: MemoLine, m: Pick<ApCreditMemo, 'discountPct'>, fx: number) => round2(lineNet(l) * (1 - m.discountPct / 100) * fx);
const onHand = (item: Item) => item.warehouses.reduce((n, w) => n + w.inStock, 0);

/**
 * The entry adding the memo makes, in PHP:
 * - Cr Goods Received Not Invoiced for lines from a goods return (the return already took the stock out).
 * - Cr Inventory for lines that send goods back now.
 * - Price adjustments: Cr Inventory while the stock is on hand, else cost of sales; non-stock
 *   items, their cost account.
 * - Cr Freight-in and each tax code's input VAT. Dr the withholding taken on the invoice, reversed.
 * - Dr the vendor's control account for the rest — what the vendor owes back.
 */
export function memoJournal(
  m: Pick<ApCreditMemo, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'controlAccount'>,
  fx: number,
  ctx: { items: Item[]; groups: ItemGroup[]; codes: TaxCode[]; rateOf: (code: string) => number; withholding: WithholdingLine[] },
): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => {
    if (account && amount) totals.set(account, round2((totals.get(account) ?? 0) + amount));
  };
  const reverse = (code: string) => vatNotPaidToVendor(ctx.codes.find((c) => c.code === code));
  const vatAccount = (code: string) => ctx.codes.find((c) => c.code === code)?.glAccount || '1410';
  const factor = 1 - m.discountPct / 100;

  for (const l of m.lines) {
    const item = ctx.items.find((i) => i.id === l.itemId);
    if (!item) continue;
    const value = valueLc(l, m, fx);
    const own = item.inventoryItem ? inventoryAccountFor(item, l.warehouse, ctx.groups) : expenseAccountFor(item, ctx.groups);
    if (l.baseType === 'GRET') add(GRNI_ACCOUNT, -value);
    else if (sendsStock(l, ctx.items)) add(own, -value);
    else add(item.inventoryItem && onHand(item) <= 0 ? item.cogsAccount || expenseAccountFor(item, ctx.groups) : own, -value);
    if (!reverse(l.taxCode)) add(vatAccount(l.taxCode), -round2((lineNet(l) * factor * ctx.rateOf(l.taxCode) * fx) / 100));
  }
  const freight = round2(m.freight * fx);
  add(FREIGHT_IN_ACCOUNT, -freight);
  if (!reverse(m.freightTaxCode)) add(vatAccount(m.freightTaxCode), -round2((freight * ctx.rateOf(m.freightTaxCode)) / 100));

  const credits = -round2([...totals.values()].reduce((n, v) => n + v, 0));
  let withheld = 0;
  for (const w of ctx.withholding.filter((x) => x.deducted)) {
    const amt = round2(w.amount * fx);
    add(WITHHOLDING_PAYABLE[w.kind] ?? '2340', amt);
    withheld += amt;
  }
  if (credits) add(m.controlAccount || '2010', round2(credits - withheld));

  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit || a.credit - b.credit);
}

/** The invoices a memo's credit goes to first: those its lines came from, directly or through a return. */
export const baseInvoiceIds = (m: Pick<ApCreditMemo, 'lines'>) => [
  ...new Set(m.lines.map((l) => (l.baseType === 'APINV' ? l.baseId : l.invoiceId)).filter(Boolean)),
];

// ── Saving and posting ───────────────────────────────────────────────────────

export class MemoPostError extends Error {
  constructor(
    readonly lineIds: string[],
    message: string,
  ) {
    super(message);
  }
}

export const saveMemoDraft = (input: MemoInput) => memos.save({ ...input, status: 'Draft', docNum: 0 });

export async function saveMemoRemarks(m: ApCreditMemo, patch: Pick<ApCreditMemo, 'remarks' | 'paymentBlock' | 'paymentOrderRun'>) {
  const current = await memos.get(m.id);
  if (!current) throw new Error('This A/P credit memo no longer exists.');
  return memos.save({ ...current, ...patch });
}

/** An invoice's balance and its net payment due, as the form worked them out (they need the tax masters). */
export type InvoiceBalances = Map<string, { docNo: string; balance: number; total: number }>;

/**
 * Add the memo. Quantities, stock and freezes are re-checked as they are now. Then goods sent back
 * leave stock, price adjustments re-cost what's on hand, invoice and return lines count what was
 * returned or credited, and the credit goes to the invoices it came from, up to their balances.
 */
export async function addCreditMemo(input: MemoInput, fx: number, credit: number, balances: InvoiceBalances): Promise<ApCreditMemo> {
  const [items, invoices, returns] = await Promise.all([listItems(), listApInvoices(), listGoodsReturns()]);
  const out = input.lines.filter((l) => sendsStock(l, items));
  const problems = [...(await frozenLines(out))];
  for (const l of out) {
    const item = items.find((i) => i.id === l.itemId)!;
    const have = item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0;
    if (have < grInventoryQty(l)) problems.push({ lineId: l.id, message: `${l.itemNo}: sending back ${grInventoryQty(l)} ${item.inventoryUom} but ${l.warehouse} has ${have}.` });
  }
  for (const l of input.lines) {
    if (l.baseType === 'APINV' && l.returnGoods) {
      const il = invoices.find((i) => i.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId);
      const open = il ? returnableQty(il) : 0;
      if (l.quantity > open) problems.push({ lineId: l.id, message: `${l.itemNo}: returning ${l.quantity} but invoice ${l.baseDocNo} has ${open} left to return.` });
    }
    if (l.baseType === 'GRET') {
      const r = returns.find((x) => x.id === l.baseId);
      const rl = r?.lines.find((x) => x.id === l.baseLineId);
      const open = r && rl ? returnOpenQty(rl, r) : 0;
      if (l.quantity > open) problems.push({ lineId: l.id, message: `${l.itemNo}: crediting ${l.quantity} but return ${l.baseDocNo} has ${open} left to credit.` });
    }
  }
  if (problems.length) throw new MemoPostError(problems.map((p) => p.lineId), problems.map((p) => p.message).join(' '));

  const lines = input.lines.map((l) => ({ ...l, unitCostLc: unitCostLc(l, input, fx) }));
  const moved = new Map(applyStock(lines.filter((l) => sendsStock(l, items)).map((l) => ({ ...l, baseLineId: '' })), items, -1).map((i) => [i.id, i]));
  const costing = new Map(items.map((i) => [i.id, moved.get(i.id) ?? i]));
  // Price adjustments on stock still on hand lower its cost.
  for (const l of lines.filter((x) => !sendsStock(x, items) && x.baseType !== 'GRET')) {
    const item = costing.get(l.itemId);
    if (!item?.inventoryItem || item.valuationMethod === 'Standard Price' || onHand(item) <= 0) continue;
    costing.set(item.id, { ...item, itemCost: round2(item.itemCost - valueLc(l, input, fx) / onHand(item)) });
  }
  for (const [id, item] of costing) if (item !== items.find((i) => i.id === id)) await saveItem(item);
  await applyInvoiceReturns(lines.filter((l) => l.baseType === 'APINV' && l.returnGoods), 1);
  await applyCreditedQty(lines.filter((l) => l.baseType === 'GRET'), 1);

  // The credit goes to the base invoices first, oldest first, up to what each still owes.
  let left = credit;
  const applications: CreditApplication[] = [];
  for (const invoiceId of baseInvoiceIds(input)) {
    const b = balances.get(invoiceId);
    const amount = round2(Math.min(left, b?.balance ?? 0));
    if (!b || amount <= 0) continue;
    await applyPayments([{ invoiceId, amount, total: b.total }], 1);
    applications.push({ invoiceId, docNo: b.docNo, amount, date: input.postingDate });
    left = round2(left - amount);
  }

  const all = await memos.list();
  const series = seriesLookup(memoSeries, input.seriesId, MEMO_SERIES);
  const docNum = Math.max(series.firstNo - 1, ...all.filter((m) => m.seriesId === series.id).map((m) => m.docNum)) + 1;
  const appliedAmount = round2(credit - left);
  return memos.save({
    ...input,
    lines,
    docNum,
    fxRate: fx,
    applications,
    appliedAmount,
    status: left <= 0.005 ? 'Closed' : 'Open',
    closeDate: left <= 0.005 ? todayISO() : '',
  });
}

/** Apply credit left on a memo to other open invoices of the vendor (Copy To › A/P Invoice). */
export async function applyCredit(m: ApCreditMemo, credit: number, picks: { invoiceId: string; docNo: string; amount: number; total: number }[]) {
  const open = round2(credit - m.appliedAmount);
  const total = round2(picks.reduce((n, p) => n + p.amount, 0));
  if (total > open + 0.005) throw new Error(`Applying ${total} but only ${open} of the credit is left.`);
  await applyPayments(picks.map((p) => ({ invoiceId: p.invoiceId, amount: p.amount, total: p.total })), 1);
  const appliedAmount = round2(m.appliedAmount + total);
  const done = appliedAmount >= credit - 0.005;
  return memos.save({
    ...m,
    appliedAmount,
    applications: [...m.applications, ...picks.map((p) => ({ invoiceId: p.invoiceId, docNo: p.docNo, amount: p.amount, date: todayISO() }))],
    status: done ? 'Closed' : 'Open',
    closeDate: done ? todayISO() : '',
  });
}

/**
 * Cancel: every application comes off its invoice, goods sent back come back in at the cost
 * they left at, and invoice and return lines are open again.
 */
export async function cancelCreditMemo(m: ApCreditMemo, totals: Map<string, number>) {
  const items = await listItems();
  const back = m.lines.filter((l) => sendsStock(l, items));
  const blocked = await frozenLines(back);
  if (blocked.length) throw new MemoPostError(blocked.map((b) => b.lineId), blocked.map((b) => b.message).join(' '));
  for (const a of m.applications) await applyPayments([{ invoiceId: a.invoiceId, amount: a.amount, total: totals.get(a.invoiceId) ?? Infinity }], -1);
  const moved = new Map(applyStock(back.map((l) => ({ ...l, baseLineId: '' })), items, 1).map((i) => [i.id, i]));
  const costing = new Map(items.map((i) => [i.id, moved.get(i.id) ?? i]));
  for (const l of m.lines.filter((x) => !sendsStock(x, items) && x.baseType !== 'GRET')) {
    const item = costing.get(l.itemId);
    if (!item?.inventoryItem || item.valuationMethod === 'Standard Price' || onHand(item) <= 0) continue;
    costing.set(item.id, { ...item, itemCost: round2(item.itemCost + valueLc(l, m, m.fxRate) / onHand(item)) });
  }
  for (const [id, item] of costing) if (item !== items.find((i) => i.id === id)) await saveItem(item);
  await applyInvoiceReturns(m.lines.filter((l) => l.baseType === 'APINV' && l.returnGoods), -1);
  await applyCreditedQty(m.lines.filter((l) => l.baseType === 'GRET'), -1);
  return memos.save({ ...m, status: 'Cancelled', closeDate: todayISO(), appliedAmount: 0, applications: [] });
}
