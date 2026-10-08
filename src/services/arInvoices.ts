import { AR_SERIES, CREDITABLE_VAT_ACCOUNT, CWT_ACCOUNT, FREIGHT_INCOME_ACCOUNT, SEED_AR_INVOICES, type ArInvoice, type ArLine } from '../mocks/arInvoices';
import { arSeries, seriesLookup, formatDocNum } from './allSeries';
import { SHIPPED_GOODS_ACCOUNT } from '../mocks/deliveries';
import type { ItemGroup } from '../mocks/itemMasters';
import type { Item } from '../mocks/items';
import type { Partner } from '../mocks/partners';
import { rateAt, type TaxCode } from '../mocks/taxes';
import { todayISO } from './dates';
import { applyInvoiced, deliveryProblems, dnInventoryQty, listDeliveries } from './deliveries';
import { frozenStock } from './inventoryCountings';
import { itemGroups } from './inventoryMasters';
import { inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { listItems, saveItem } from './items';
import { consumeLayers, logConsumption, restoreLayer, updateFifoCosts, type Taken } from './costLayers';
import { postDocumentEntry, reverseDocumentEntry } from './journalEntries';
import { applyDelivered, lineNet, soTotals } from './salesOrders';
import { createCollection } from './store';

const invoices = createCollection<ArInvoice>('sikat-erp:ar-invoices:v6', SEED_AR_INVOICES, 'ar');

export const listArInvoices = invoices.list;
export const getArInvoice = invoices.get;

export type ArInput = Omit<ArInvoice, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const arSeriesOf = (id: string) => seriesLookup(arSeries, id, AR_SERIES);
export const arNumber = (a: Pick<ArInvoice, 'seriesId' | 'docNum'>) => formatDocNum(arSeriesOf(a.seriesId), a.docNum);

/** Lines that take stock out when the invoice is added: stocked items not already shipped by a delivery. */
export const shipsStock = (l: ArLine, items: readonly Item[]) => l.baseType !== 'DN' && Boolean(items.find((i) => i.id === l.itemId)?.inventoryItem);

export const arTotals = (a: Pick<ArInvoice, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'rounding'>, rateOf: (code: string) => number, rule?: Parameters<typeof soTotals>[2]) =>
  soTotals(a as unknown as Parameters<typeof soTotals>[0], rateOf, rule);

const rateFrom = (codes: readonly TaxCode[], date: string) => (code: string) => {
  const c = codes.find((x) => x.code === code);
  return c ? (rateAt(c, date) ?? 0) : 0;
};

export interface ArWithholding {
  kind: 'Expanded (EWT)' | 'Withholding VAT';
  label: string;
  rate: number;
  base: number;
  amount: number;
  account: string;
}

/** Whether the customer withholds on what it pays us: a top withholding agent, or government. */
export const customerWithholds = (c: Pick<Partner, 'businessType' | 'topWithholdingAgent'> | undefined) => Boolean(c && (c.businessType === 'Government' || c.topWithholdingAgent));

/**
 * The WTax Amount (document currency) on WTax Liable lines: EWT at 1% on goods and 2% on services
 * from a top withholding agent or government office, plus 5% VAT from government (on VATable
 * lines). The base is net of VAT, after the document discount.
 */
export function arWithholding(a: Pick<ArInvoice, 'lines' | 'discountPct' | 'docType'>, customer: Pick<Partner, 'businessType' | 'topWithholdingAgent'> | undefined, items: readonly Item[], rateOf: (code: string) => number): ArWithholding[] {
  if (!customerWithholds(customer)) return [];
  const gov = customer!.businessType === 'Government';
  const factor = 1 - a.discountPct / 100;
  let goods = 0;
  let services = 0;
  let vatable = 0;
  for (const l of a.lines.filter((x) => x.wtaxLiable)) {
    const net = lineNet(l as never) * factor;
    const item = items.find((i) => i.id === l.itemId);
    if (a.docType === 'Service' || (item && !item.inventoryItem)) services += net;
    else goods += net;
    if (rateOf(l.taxCode) > 0) vatable += net;
  }
  const out: ArWithholding[] = [];
  if (goods) out.push({ kind: 'Expanded (EWT)', label: 'Creditable withholding tax — goods (1%)', rate: 1, base: round2(goods), amount: round2(goods * 0.01), account: CWT_ACCOUNT });
  if (services) out.push({ kind: 'Expanded (EWT)', label: 'Creditable withholding tax — services (2%)', rate: 2, base: round2(services), amount: round2(services * 0.02), account: CWT_ACCOUNT });
  if (gov && vatable) out.push({ kind: 'Withholding VAT', label: 'VAT withheld by government (5%)', rate: 5, base: round2(vatable), amount: round2(vatable * 0.05), account: CREDITABLE_VAT_ACCOUNT });
  return out;
}

/** What the customer still owes: total − withholding − payments applied. */
export const balanceDue = (total: number, withheld: number, applied: number) => round2(total - withheld - applied);

const groupOf = (item: Item, groups: readonly ItemGroup[]) => groups.find((g) => g.id === item.itemGroupId);
const revenueAccountFor = (item: Item, groups: readonly ItemGroup[]) => (item.glBy === 'Item Level' ? item.revenueAccount : groupOf(item, groups)?.revenueAccount || item.revenueAccount) || '4010';
const cogsAccountFor = (item: Item, groups: readonly ItemGroup[]) => (item.glBy === 'Item Level' ? item.cogsAccount : groupOf(item, groups)?.cogsAccount || item.cogsAccount) || '5010';

/**
 * The entry adding the invoice makes, in PHP:
 * - Cr revenue per line (net, after the document discount), Cr each tax code's output VAT account.
 * - Cr other income for freight (and its VAT to the freight tax code's account) and rounding.
 * - Stock it ships: Dr COGS (or Shipped Goods, with the box ticked) / Cr Inventory at item cost. Lines from a delivery that used the
 *   shipped goods account: Dr COGS / Cr Shipped Goods at the delivery's cost.
 * - Dr creditable withholding for what the customer withholds; Dr A/R for the rest.
 * `fixed` uses the costs saved on the lines (an added invoice) instead of today's item cost.
 */
export function arJournal(
  a: Pick<ArInvoice, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'rounding' | 'controlAccount' | 'docType' | 'useShippedGoodsAccount'>,
  fx: number,
  ctx: { items: readonly Item[]; groups: readonly ItemGroup[]; codes: readonly TaxCode[]; rateOf: (code: string) => number; withholding: ArWithholding[]; roundingRule?: Parameters<typeof soTotals>[2] },
  fixed = false,
): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => {
    if (account && amount) totals.set(account, round2((totals.get(account) ?? 0) + amount));
  };
  const vatAccount = (code: string) => ctx.codes.find((c) => c.code === code)?.glAccount || '2310';
  const factor = 1 - a.discountPct / 100;
  for (const l of a.lines) {
    const item = ctx.items.find((i) => i.id === l.itemId);
    const net = round2(lineNet(l as never) * factor * fx);
    add(a.docType === 'Service' ? l.glAccount || '4030' : item ? revenueAccountFor(item, ctx.groups) : '4010', -net);
    add(vatAccount(l.taxCode), -round2((net * ctx.rateOf(l.taxCode)) / 100));
    if (!item?.inventoryItem || a.docType === 'Service') continue;
    const cost = round2(dnInventoryQty(l) * (fixed || l.shippedGoods ? l.unitCostLc : item.itemCost));
    if (l.baseType !== 'DN') {
      add(a.useShippedGoodsAccount ? SHIPPED_GOODS_ACCOUNT : cogsAccountFor(item, ctx.groups), cost);
      add(inventoryAccountFor(item, l.warehouse, [...ctx.groups]), -cost);
    } else if (l.shippedGoods) {
      add(cogsAccountFor(item, ctx.groups), cost);
      add(SHIPPED_GOODS_ACCOUNT, -cost);
    }
  }
  const totalsDoc = soTotals(a as never, ctx.rateOf, ctx.roundingRule);
  const freight = round2(a.freight * fx);
  add(FREIGHT_INCOME_ACCOUNT, -freight);
  add(vatAccount(a.freightTaxCode), -round2((freight * ctx.rateOf(a.freightTaxCode)) / 100));
  add(FREIGHT_INCOME_ACCOUNT, -round2(totalsDoc.rounding * fx));


  for (const w of ctx.withholding) {
    const amt = round2(w.amount * fx);
    add(w.account, amt);

  }
  // A/R takes whatever balances the entry: the total less what the customer withholds.
  const balance = round2([...totals.values()].reduce((n, v) => n + v, 0));
  if (balance) add(a.controlAccount || '1120', -balance);

  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((x, y) => y.debit - x.debit || x.credit - y.credit);
}

export class ArPostError extends Error {
  constructor(
    readonly lineIds: string[],
    message: string,
  ) {
    super(message);
  }
}

/** Why lines can't be billed as things are now: delivery lines over their open qty, stock lines as a delivery would check them. */
export async function invoiceProblems(input: ArInput, items: readonly Item[]) {
  const out: { lineId: string; message: string }[] = [];
  const dns = await listDeliveries();
  const byBase = new Map<string, { line: ArLine; qty: number }>();
  for (const l of input.lines.filter((x) => x.baseType === 'DN')) byBase.set(l.baseLineId, { line: l, qty: (byBase.get(l.baseLineId)?.qty ?? 0) + l.quantity });
  for (const [baseLineId, { line, qty }] of byBase) {
    const d = dns.find((x) => x.id === line.baseId);
    const dl = d?.lines.find((x) => x.id === baseLineId);
    const open = d?.status === 'Open' && dl ? dl.quantity - dl.invoicedQty : 0;
    if (!d || !dl) out.push({ lineId: line.id, message: `${line.itemNo}: delivery ${line.baseDocNo} or its line no longer exists.` });
    else if (qty > open) out.push({ lineId: line.id, message: `${line.itemNo}: billing ${qty} ${line.uomCode} but delivery ${line.baseDocNo} has ${open} left to invoice.` });
  }
  // Lines that ship stock get the delivery checks (freeze, stock on hand, order open qty).
  const shipping = input.lines.filter((l) => shipsStock(l, items));
  if (shipping.length) {
    const asDelivery = { ...input, lines: shipping.map((l) => ({ ...l, baseType: l.baseType === 'SO' ? ('SO' as const) : ('' as const), invoicedQty: 0 })) };
    out.push(...(await deliveryProblems(asDelivery as never, items)));
  }
  return out;
}

export const saveArDraft = (input: ArInput) => invoices.save({ ...input, status: 'Draft', docNum: 0 });

export async function saveArNotes(id: string, patch: Pick<ArInvoice, 'remarks' | 'attachments'>) {
  const cur = await invoices.get(id);
  if (!cur) throw new Error('This invoice no longer exists.');
  return invoices.save({ ...cur, ...patch });
}

/** Apply stock movements for lines that ship stock: `sign` −1 out (add), +1 back (cancel). */
async function moveStock(lines: ArLine[], items: readonly Item[], sign: 1 | -1) {
  const touched = new Map<string, Item>();
  for (const l of lines) {
    if (!shipsStock(l, items)) continue;
    const item = touched.get(l.itemId) ?? structuredClone(items.find((i) => i.id === l.itemId)!);
    const row = item.warehouses.find((w) => w.code === l.warehouse);
    if (!row) continue;
    row.inStock = round4(row.inStock + sign * dnInventoryQty(l));
    touched.set(item.id, { ...item, hasTransactions: true });
  }
  for (const item of touched.values()) await saveItem(item);
}

/**
 * Add the invoice. Everything is re-checked as it is now, then: stock goes out for lines that
 * ship it, sales order lines count it as delivered, delivery lines count it as invoiced (closing
 * deliveries billed in full), and the journal entry posts. `fx` is the rate on the posting date.
 */
export async function addArInvoice(input: ArInput, fx: number, ctx: { codes: readonly TaxCode[]; withholding: ArWithholding[]; roundingRule?: Parameters<typeof soTotals>[2] }): Promise<ArInvoice> {
  const items = await listItems();
  const problems = await invoiceProblems(input, items);
  if (problems.length) throw new ArPostError(problems.map((p) => p.lineId), problems.map((p) => p.message).join(' '));

  // Lines from a delivery keep its cost; the rest go out at today's item cost (FIFO: consume layers).
  const fifoItemIds = new Set<string>();
  const taken: Taken[] = [];
  const lines = await Promise.all(input.lines.map(async (l) => {
    if (l.baseType === 'DN') return l;
    const item = items.find((i) => i.id === l.itemId);
    if (item?.valuationMethod === 'FIFO' && item.inventoryItem && l.warehouse) {
      fifoItemIds.add(l.itemId);
      return { ...l, unitCostLc: await consumeLayers(l.itemId, l.warehouse, dnInventoryQty(l), taken) };
    }
    return { ...l, unitCostLc: item?.itemCost ?? 0 };
  }));
  await moveStock(lines, items, -1);
  await applyDelivered(lines.filter((l) => l.baseType === 'SO' && shipsStock(l, items)), 1);
  await applyInvoiced(lines.filter((l) => l.baseType === 'DN'), 1);

  const series = arSeriesOf(input.seriesId);
  const all = await invoices.list();
  const docNum = Math.max(series.firstNo - 1, ...all.filter((a) => a.seriesId === series.id).map((a) => a.docNum)) + 1;
  await updateFifoCosts([...fifoItemIds]);
  const saved = await invoices.save({ ...input, lines, docNum, status: 'Open', fxRate: fx });
  await logConsumption(saved.id, saved.postingDate, taken);
  await postDocumentEntry({
    origin: 'IN',
    originNo: docNum,
    originId: saved.id,
    postingDate: saved.postingDate,
    dueDate: saved.dueDate,
    remarks: saved.journalRemark,
    partnerId: saved.customerId,
    controlAccount: saved.controlAccount,
    lines: arJournal(saved, fx, { items, groups: await itemGroups.list(), codes: ctx.codes, rateOf: rateFrom(ctx.codes, saved.postingDate), withholding: ctx.withholding, roundingRule: ctx.roundingRule }, true),
  });
  return saved;
}

/** Close: nothing more is expected on it (e.g. a balance written off elsewhere). */
export async function closeArInvoice(a: ArInvoice) {
  return invoices.save({ ...a, status: 'Closed', closeDate: todayISO() });
}

/** Cancel an unpaid invoice: stock it shipped comes back, order and delivery lines reopen, the entry is reversed. */
export async function cancelArInvoice(a: ArInvoice) {
  if (a.appliedAmount > 0) throw new ArPostError([], 'Payments are applied to this invoice — cancel them first.');
  const items = await listItems();
  const frozen = await frozenStock();
  const blocked = a.lines.filter((l) => shipsStock(l, items) && frozen.has(`${l.itemId}@${l.warehouse}`));
  if (blocked.length) throw new ArPostError(blocked.map((l) => l.id), blocked.map((l) => `${l.itemNo} is frozen in ${l.warehouse} by inventory count ${frozen.get(`${l.itemId}@${l.warehouse}`)}.`).join(' '));
  await moveStock(a.lines, items, 1);
  await applyDelivered(a.lines.filter((l) => l.baseType === 'SO' && shipsStock(l, items)), -1);
  await applyInvoiced(a.lines.filter((l) => l.baseType === 'DN'), -1);

  // FIFO: restore layers for non-DN lines that shipped stock (DN lines were handled by the delivery).
  const cancelFifoIds = new Set<string>();
  for (const l of a.lines) {
    if (!shipsStock(l, items)) continue;
    const item = items.find((i) => i.id === l.itemId);
    if (item?.valuationMethod === 'FIFO' && l.unitCostLc > 0) {
      await restoreLayer({ itemId: l.itemId, warehouse: l.warehouse, receivedOn: a.postingDate, qty: dnInventoryQty(l), unitCost: l.unitCostLc, sourceId: `in-restore-${a.id}` });
      cancelFifoIds.add(l.itemId);
    }
  }
  await updateFifoCosts([...cancelFifoIds]);

  const saved = await invoices.save({ ...a, status: 'Cancelled', closeDate: todayISO() });
  await reverseDocumentEntry(a.id);
  return saved;
}

/**
 * The installment schedule: the balance split into equal parts (the last takes the cents), the
 * first due on the due date and each next one a payment-term period later (30 days for COD).
 */
export function installmentSchedule(dueDate: string, count: number, balance: number, termDays: number) {
  const n = Math.max(1, Math.floor(count) || 1);
  const step = termDays || 30;
  const part = Math.floor((balance / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(`${dueDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + step * i);
    return { no: i + 1, dueDate: dueDate ? d.toISOString().slice(0, 10) : '', amount: i === n - 1 ? round2(balance - part * (n - 1)) : part };
  });
}

/** An invoice's total, the customer's withholding, and what's still unpaid (document currency). */
export function arAmounts(a: ArInvoice, customer: Pick<Partner, 'businessType' | 'topWithholdingAgent'> | undefined, items: readonly Item[], codes: readonly TaxCode[]) {
  const rateOf = rateFrom(codes, a.postingDate);
  const total = arTotals(a, rateOf).total;
  const wtAmount = round2(arWithholding(a, customer, items, rateOf).reduce((n, w) => n + w.amount, 0));
  const due = round2(total - wtAmount);
  return { total, wtAmount, due, balanceDue: round2(due - a.appliedAmount) };
}

/**
 * Incoming payments settling invoices: move each invoice's Applied Amount by `sign` (back on a
 * cancelled payment). An invoice closes when nothing is left to pay, and reopens when it is.
 */
export async function applyArPayments(rows: { invoiceId: string; amount: number; due: number }[], sign: 1 | -1) {
  const byInvoice = new Map<string, { amount: number; due: number }>();
  for (const r of rows) byInvoice.set(r.invoiceId, { amount: (byInvoice.get(r.invoiceId)?.amount ?? 0) + r.amount, due: r.due });
  for (const [id, { amount, due }] of byInvoice) {
    const inv = await invoices.get(id);
    if (!inv) continue;
    const appliedAmount = Math.max(0, round2(inv.appliedAmount + amount * sign));
    const paid = appliedAmount >= due - 0.005;
    const status = inv.status === 'Cancelled' ? inv.status : paid ? 'Closed' : 'Open';
    await invoices.save({ ...inv, appliedAmount, status, closeDate: status === 'Closed' ? inv.closeDate || todayISO() : '' });
  }
}

export const arTotal = (a: ArInvoice, codes: TaxCode[]) => arTotals(a, rateFrom(codes, a.postingDate)).total;
