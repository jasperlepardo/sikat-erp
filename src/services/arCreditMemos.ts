import { AR_CREDIT_SERIES, SEED_AR_CREDIT_MEMOS, newArCmLine, type ArCmLine, type ArCreditMemo, type CreditApplication } from '../mocks/arCreditMemos';
import { FREIGHT_INCOME_ACCOUNT, type ArInvoice } from '../mocks/arInvoices';
import type { SalesReturn } from '../mocks/salesReturns';
import type { ItemGroup } from '../mocks/itemMasters';
import type { Item } from '../mocks/items';
import { rateAt, type TaxCode } from '../mocks/taxes';
import { applyArPayments, arNumber, arTotals } from './arInvoices';
import { arCreditSeries, seriesLookup, formatDocNum } from './allSeries';
import { todayISO } from './dates';
import { dnInventoryQty } from './deliveries';
import { frozenStock } from './inventoryCountings';
import { inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { listItems, saveItem } from './items';
import { soTotals } from './salesOrders';
import { createCollection } from './store';

const creditMemos = createCollection<ArCreditMemo>('sikat-erp:ar-credit-memos', SEED_AR_CREDIT_MEMOS, 'acm');

export const listArCreditMemos = creditMemos.list;
export async function getArCreditMemo(idOrNumber: string) {
  const direct = await creditMemos.get(idOrNumber);
  if (direct) return direct;
  const all = await creditMemos.list();
  return all.find((m) => arCmNumber(m) === idOrNumber) ?? null;
}

export type ArCmInput = Omit<ArCreditMemo, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const arCreditSeriesOf = (id: string) => seriesLookup(arCreditSeries, id, AR_CREDIT_SERIES);
export const arCmNumber = (m: Pick<ArCreditMemo, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(arCreditSeriesOf(m.seriesId), m.docNum, m.postingDate);

export const arCmTotals = (
  m: Pick<ArCreditMemo, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'rounding'>,
  rateOf: (code: string) => number,
  rule?: Parameters<typeof soTotals>[2],
) => arTotals(m as unknown as Parameters<typeof arTotals>[0], rateOf, rule);

/** Total credit less withholding and applied amounts: what the customer gets back. */
export const netArCredit = (total: number, appliedAmount: number) => round2(total - appliedAmount);

export const arCmTotal = (m: ArCreditMemo, codes: TaxCode[]) =>
  arCmTotals(m, (code) => {
    const c = codes.find((x) => x.code === code);
    return c ? (rateAt(c, m.postingDate) ?? 0) : 0;
  }).total;

/** Lines that put stock back in: stocked items with returnGoods=true. */
export const receivesStock = (l: ArCmLine, items: readonly Item[]) =>
  l.returnGoods && Boolean(items.find((i) => i.id === l.itemId)?.inventoryItem);

const groupOf = (item: Item, groups: readonly ItemGroup[]) => groups.find((g) => g.id === item.itemGroupId);
const revenueAccountFor = (item: Item, groups: readonly ItemGroup[]) =>
  (item.glBy === 'Item Level' ? item.revenueAccount : groupOf(item, groups)?.revenueAccount || item.revenueAccount) || '4010';
const cogsAccountFor = (item: Item, groups: readonly ItemGroup[]) =>
  (item.glBy === 'Item Level' ? item.cogsAccount : groupOf(item, groups)?.cogsAccount || item.cogsAccount) || '5010';

/**
 * The entry adding the credit memo makes, in PHP — a reversal of arJournal:
 * - Dr Revenue accounts per line (reversing what the original invoice credited)
 * - Dr Output VAT per tax code
 * - Cr Customer A/R control account (customer's receivable is reduced)
 * - For returnGoods=true stocked lines: Dr Inventory / Cr COGS (stock comes back)
 * - Dr Freight income (reversing freight charged on the invoice)
 */
export function arCmJournal(
  m: Pick<ArCreditMemo, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'controlAccount' | 'docType'>,
  fx: number,
  ctx: { items: readonly Item[]; groups: readonly ItemGroup[]; codes: readonly TaxCode[]; rateOf: (code: string) => number },
): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => {
    if (account && amount) totals.set(account, round2((totals.get(account) ?? 0) + amount));
  };
  const vatAccount = (code: string) => ctx.codes.find((c) => c.code === code)?.glAccount || '2310';
  const factor = 1 - m.discountPct / 100;

  for (const l of m.lines) {
    const item = ctx.items.find((i) => i.id === l.itemId);
    const net = round2(l.quantity * (l.itemsPerUnit || 1) * l.unitPrice * (1 - l.discountPct / 100) * factor * fx);
    // Dr revenue (reverse the credit the invoice made)
    add(m.docType === 'Service' ? l.glAccount || '4030' : item ? revenueAccountFor(item, ctx.groups) : '4010', net);
    // Dr output VAT (reverse)
    add(vatAccount(l.taxCode), round2((net * ctx.rateOf(l.taxCode)) / 100));
    // Stock coming back: Dr Inventory / Cr COGS
    if (item?.inventoryItem && receivesStock(l, ctx.items)) {
      const cost = round2(dnInventoryQty(l) * l.unitCostLc);
      add(inventoryAccountFor(item, l.warehouse, [...ctx.groups]), cost);
      add(cogsAccountFor(item, ctx.groups), -cost);
    }
  }
  const freight = round2(m.freight * fx);
  add(FREIGHT_INCOME_ACCOUNT, freight);
  add(vatAccount(m.freightTaxCode), round2((freight * ctx.rateOf(m.freightTaxCode)) / 100));

  // A/R takes whatever balances the entry: Cr A/R (negative = credit)
  const balance = round2([...totals.values()].reduce((n, v) => n + v, 0));
  if (balance) add(m.controlAccount || '1120', -balance);

  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((x, y) => y.debit - x.debit || x.credit - y.credit);
}

/** The invoices a credit memo's lines credit: those the lines came from. */
export const baseArInvoiceIds = (m: Pick<ArCreditMemo, 'lines'>) =>
  [...new Set(m.lines.map((l) => l.invoiceId).filter(Boolean))];

// ── Saving and posting ───────────────────────────────────────────────────────

export class ArCmPostError extends Error {
  constructor(
    readonly lineIds: string[],
    message: string,
  ) {
    super(message);
  }
}

export const saveArCmDraft = (input: ArCmInput) => creditMemos.save({ ...input, status: 'Draft', docNum: 0 });

export async function saveArCmRemarks(m: ArCreditMemo, patch: Pick<ArCreditMemo, 'remarks'>) {
  const current = await creditMemos.get(m.id);
  if (!current) throw new Error('This A/R credit memo no longer exists.');
  return creditMemos.save({ ...current, ...patch });
}

/** An invoice's balance info passed in by the form (to avoid re-computing). */
export type ArInvoiceBalances = Map<string, { docNo: string; balance: number; total: number }>;

/** Move stock: sign +1 = back in (credit memo), -1 = out (cancel). */
async function moveArStock(lines: ArCmLine[], items: readonly Item[], sign: 1 | -1) {
  const touched = new Map<string, Item>();
  for (const l of lines) {
    if (!receivesStock(l, items)) continue;
    const item = touched.get(l.itemId) ?? structuredClone(items.find((i) => i.id === l.itemId)!);
    const row = item.warehouses.find((w) => w.code === l.warehouse);
    if (!row) continue;
    row.inStock = round4(row.inStock + sign * dnInventoryQty(l));
    touched.set(item.id, { ...item, hasTransactions: true });
  }
  for (const item of touched.values()) await saveItem(item);
}

/**
 * Add the credit memo. Stock is re-checked (frozen check), then goods come back in
 * for returnGoods=true stocked lines, and the credit goes to the base invoices first.
 * If any lines came from a sales return (baseType='SRT'), those return lines are credited.
 */
export async function addArCreditMemo(input: ArCmInput, fx: number, credit: number, balances: ArInvoiceBalances): Promise<ArCreditMemo> {
  const items = await listItems();
  const frozen = await frozenStock();
  const inbound = input.lines.filter((l) => receivesStock(l, items));
  const problems: { lineId: string; message: string }[] = [];
  for (const l of inbound) {
    const key = `${l.itemId}@${l.warehouse}`;
    if (frozen.has(key)) {
      problems.push({ lineId: l.id, message: `${l.itemNo} is frozen in ${l.warehouse} by inventory count ${frozen.get(key)}.` });
    }
  }
  if (problems.length) throw new ArCmPostError(problems.map((p) => p.lineId), problems.map((p) => p.message).join(' '));

  const lines = input.lines.map((l) => ({ ...l, unitCostLc: l.unitCostLc || 0 }));
  await moveArStock(lines, items, 1);

  let left = credit;
  const applications: CreditApplication[] = [];
  for (const invoiceId of baseArInvoiceIds(input)) {
    const b = balances.get(invoiceId);
    const amount = round2(Math.min(left, b?.balance ?? 0));
    if (!b || amount <= 0) continue;
    await applyArPayments([{ invoiceId, amount, due: b.total }], 1);
    applications.push({ invoiceId, docNo: b.docNo, amount, date: input.postingDate });
    left = round2(left - amount);
  }

  const all = await creditMemos.list();
  const series = arCreditSeriesOf(input.seriesId);
  const docNum = Math.max(series.firstNo - 1, ...all.filter((m) => m.seriesId === series.id).map((m) => m.docNum)) + 1;
  const appliedAmount = round2(credit - left);
  const saved = await creditMemos.save({
    ...input,
    lines,
    docNum,
    fxRate: fx,
    applications,
    appliedAmount,
    status: left <= 0.005 ? 'Closed' : 'Open',
    closeDate: left <= 0.005 ? todayISO() : '',
  });

  // If any lines came from a sales return, credit those return lines now.
  const srLines = lines.filter((l) => l.baseType === 'SRT' && l.baseId && l.baseLineId);
  if (srLines.length) {
    const { applySrCreditedQty } = await import('./salesReturns');
    await applySrCreditedQty(srLines.map((l) => ({ baseId: l.baseId, baseLineId: l.baseLineId, quantity: l.quantity })), 1);
  }

  return saved;
}

/** Apply credit left on a memo to other open invoices of the customer. */
export async function applyArCredit(m: ArCreditMemo, credit: number, picks: { invoiceId: string; docNo: string; amount: number; total: number }[]) {
  const open = round2(credit - m.appliedAmount);
  const total = round2(picks.reduce((n, p) => n + p.amount, 0));
  if (total > open + 0.005) throw new Error(`Applying ${total} but only ${open} of the credit is left.`);
  await applyArPayments(picks.map((p) => ({ invoiceId: p.invoiceId, amount: p.amount, due: p.total })), 1);
  const appliedAmount = round2(m.appliedAmount + total);
  const done = appliedAmount >= credit - 0.005;
  return creditMemos.save({
    ...m,
    appliedAmount,
    applications: [...m.applications, ...picks.map((p) => ({ invoiceId: p.invoiceId, docNo: p.docNo, amount: p.amount, date: todayISO() }))],
    status: done ? 'Closed' : 'Open',
    closeDate: done ? todayISO() : '',
  });
}

/** Cancel: all applications come off their invoices, goods returned go back out, the entry is reversed. */
export async function cancelArCreditMemo(m: ArCreditMemo, totals: Map<string, number>) {
  const items = await listItems();
  const outbound = m.lines.filter((l) => receivesStock(l, items));
  const frozen = await frozenStock();
  const blocked = outbound.filter((l) => frozen.has(`${l.itemId}@${l.warehouse}`));
  if (blocked.length) throw new ArCmPostError(blocked.map((l) => l.id), blocked.map((l) => `${l.itemNo} is frozen in ${l.warehouse} by inventory count ${frozen.get(`${l.itemId}@${l.warehouse}`)}.`).join(' '));
  for (const a of m.applications) {
    await applyArPayments([{ invoiceId: a.invoiceId, amount: a.amount, due: totals.get(a.invoiceId) ?? Infinity }], -1);
  }
  await moveArStock(m.lines, items, -1);
  const saved = await creditMemos.save({ ...m, status: 'Cancelled', closeDate: todayISO(), appliedAmount: 0, applications: [] });

  // Reverse sales return credited quantities
  const srLines = m.lines.filter((l) => l.baseType === 'SRT' && l.baseId && l.baseLineId);
  if (srLines.length) {
    const { applySrCreditedQty } = await import('./salesReturns');
    await applySrCreditedQty(srLines.map((l) => ({ baseId: l.baseId, baseLineId: l.baseLineId, quantity: l.quantity })), -1);
  }

  return saved;
}

/**
 * Build A/R credit memo lines from an AR invoice (Copy To › A/R Credit Memo).
 * stocked items default to returning their goods.
 */
export function arCreditMemoFromInvoice(inv: ArInvoice, picks: { lineId: string; qty: number }[], items: readonly Item[]) {
  return picks.flatMap(({ lineId, qty }) => {
    const il = inv.lines.find((l) => l.id === lineId);
    if (!il) return [];
    const stocked = Boolean(items.find((i) => i.id === il.itemId)?.inventoryItem);
    return [
      newArCmLine({
        itemId: il.itemId,
        itemNo: il.itemNo,
        description: il.description,
        quantity: Math.min(qty, il.quantity),
        uomCode: il.uomCode,
        uomName: il.uomName,
        itemsPerUnit: il.itemsPerUnit,
        warehouse: il.warehouse,
        priceListId: il.priceListId,
        unitPrice: il.unitPrice,
        discountPct: il.discountPct,
        priceSource: il.priceSource,
        taxCode: il.taxCode,
        glAccount: il.glAccount,
        commissionPct: il.commissionPct ?? 0,
        baseType: 'ARIN' as const,
        baseId: inv.id,
        baseLineId: il.id,
        baseDocNo: arNumber(inv),
        baseRow: inv.lines.indexOf(il) + 1,
        unitCostLc: il.unitCostLc,
        returnGoods: stocked,
        invoiceId: inv.id,
      }),
    ];
  });
}

/**
 * Build A/R credit memo lines from a sales return (Copy To › A/R Credit Memo from return).
 * Stock already came back in when the return was posted, so returnGoods=false.
 * `srNumberFn` and `openQtyFn` are passed in to avoid a circular import.
 */
export function arCreditMemoFromReturn(
  r: SalesReturn,
  picks: { lineId: string; qty: number }[],
  items: readonly Item[],
  srNumberFn: (r: SalesReturn) => string,
  openQtyFn: (l: SalesReturn['lines'][number], r: Pick<SalesReturn, 'status'>) => number,
) {
  return picks.flatMap(({ lineId, qty }) => {
    const rl = r.lines.find((l) => l.id === lineId);
    if (!rl) return [];
    const open = openQtyFn(rl, r);
    const item = items.find((i) => i.id === rl.itemId);
    return [
      newArCmLine({
        itemId: rl.itemId,
        itemNo: rl.itemNo,
        description: rl.description,
        quantity: Math.min(qty, open),
        uomCode: rl.uomCode,
        uomName: rl.uomName,
        itemsPerUnit: rl.itemsPerUnit,
        warehouse: rl.warehouse,
        priceListId: rl.priceListId,
        unitPrice: rl.unitPrice,
        discountPct: rl.discountPct,
        priceSource: rl.priceSource,
        taxCode: rl.taxCode,
        glAccount: item?.revenueAccount || '4010',
        commissionPct: 0,
        baseType: 'SRT' as const,
        baseId: r.id,
        baseLineId: rl.id,
        baseDocNo: srNumberFn(r),
        baseRow: r.lines.indexOf(rl) + 1,
        unitCostLc: rl.unitCostLc,
        // Stock already returned — credit is price-only
        returnGoods: false,
        invoiceId: '',
        returnReason: rl.returnReason,
      }),
    ];
  });
}
