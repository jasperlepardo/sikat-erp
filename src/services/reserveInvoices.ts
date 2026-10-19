import { RI_SERIES, SEED_RESERVE_INVOICES, type ReserveInvoice, type RiLine } from '../mocks/reserveInvoices';
import { CREDITABLE_VAT_ACCOUNT, CWT_ACCOUNT, FREIGHT_INCOME_ACCOUNT } from '../mocks/arInvoices';
import { riSeries, seriesLookup, formatDocNum } from './allSeries';
import type { ItemGroup } from '../mocks/itemMasters';
import type { Item } from '../mocks/items';
import type { Partner } from '../mocks/partners';
import { rateAt, type TaxCode } from '../mocks/taxes';
import { todayISO } from './dates';
import { itemGroups } from './inventoryMasters';
import { inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { postDocumentEntry, reverseDocumentEntry } from './journalEntries';
import { lineNet, soTotals } from './salesOrders';
import { createCollection } from './store';

const reserveInvoices = createCollection<ReserveInvoice>('sikat-erp:reserve-invoices', SEED_RESERVE_INVOICES, 'ri', { audit: 'RI' });

export const listReserveInvoices = reserveInvoices.list;
export async function getReserveInvoice(idOrNumber: string) {
  const direct = await reserveInvoices.get(idOrNumber);
  if (direct) return direct;
  const all = await reserveInvoices.list();
  return all.find((r) => riNumber(r) === idOrNumber) ?? null;
}

export type RiInput = Omit<ReserveInvoice, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const riSeriesOf = (id: string) => seriesLookup(riSeries, id, RI_SERIES);
export const riNumber = (r: Pick<ReserveInvoice, 'seriesId' | 'docNum' | 'postingDate'>) => formatDocNum(riSeriesOf(r.seriesId), r.docNum, r.postingDate);

export const riTotals = (
  r: Pick<ReserveInvoice, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'rounding'>,
  rateOf: (code: string) => number,
  rule?: Parameters<typeof soTotals>[2],
) => soTotals(r as unknown as Parameters<typeof soTotals>[0], rateOf, rule);

const rateFrom = (codes: readonly TaxCode[], date: string) => (code: string) => {
  const c = codes.find((x) => x.code === code);
  return c ? (rateAt(c, date) ?? 0) : 0;
};

export interface RiWithholding {
  kind: 'Expanded (EWT)' | 'Withholding VAT';
  atc: string;
  label: string;
  rate: number;
  base: number;
  amount: number;
  account: string;
}

/** Whether the customer withholds on what it pays us: a top withholding agent, or government. */
export const customerWithholdsRi = (c: Pick<Partner, 'businessType' | 'topWithholdingAgent'> | undefined) =>
  Boolean(c && (c.businessType === 'Government' || c.topWithholdingAgent));

/**
 * The WTax Amount (document currency) on WTax Liable lines: EWT at 1% on goods and 2% on services
 * from a top withholding agent or government office, plus 5% VAT from government (on VATable lines).
 */
export function riWithholding(
  r: Pick<ReserveInvoice, 'lines' | 'discountPct' | 'docType'>,
  customer: Pick<Partner, 'businessType' | 'topWithholdingAgent'> | undefined,
  items: readonly Item[],
  rateOf: (code: string) => number,
): RiWithholding[] {
  if (!customerWithholdsRi(customer)) return [];
  const gov = customer!.businessType === 'Government';
  const factor = 1 - r.discountPct / 100;
  let goods = 0;
  let services = 0;
  let vatable = 0;
  for (const l of r.lines.filter((x) => x.wtaxLiable)) {
    const net = lineNet(l as never) * factor;
    const item = items.find((i) => i.id === l.itemId);
    if (r.docType === 'Service' || (item && !item.inventoryItem)) services += net;
    else goods += net;
    if (rateOf(l.taxCode) > 0) vatable += net;
  }
  const out: RiWithholding[] = [];
  if (goods) out.push({ kind: 'Expanded (EWT)', atc: 'WC158', label: 'Creditable withholding tax — goods (1%)', rate: 1, base: round2(goods), amount: round2(goods * 0.01), account: CWT_ACCOUNT });
  if (services) out.push({ kind: 'Expanded (EWT)', atc: 'WC159', label: 'Creditable withholding tax — services (2%)', rate: 2, base: round2(services), amount: round2(services * 0.02), account: CWT_ACCOUNT });
  if (gov && vatable) out.push({ kind: 'Withholding VAT', atc: 'WVO10', label: 'VAT withheld by government (5%)', rate: 5, base: round2(vatable), amount: round2(vatable * 0.05), account: CREDITABLE_VAT_ACCOUNT });
  return out;
}

/** What the customer still owes: total − withholding − payments applied. */
export const riBalanceDue = (total: number, withheld: number, applied: number) => round2(total - withheld - applied);

const groupOf = (item: Item, groups: readonly ItemGroup[]) => groups.find((g) => g.id === item.itemGroupId);
const revenueAccountFor = (item: Item, groups: readonly ItemGroup[]) =>
  (item.glBy === 'Item Level' ? item.revenueAccount : groupOf(item, groups)?.revenueAccount || item.revenueAccount) || '4010';

/**
 * The journal entry for a Reserve Invoice: Dr A/R / Cr Revenue / Cr Output VAT.
 * NO inventory movement (no COGS or Inventory lines).
 * `fixed` uses the rates saved on the doc instead of today's.
 */
export function riJournal(
  r: Pick<ReserveInvoice, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'rounding' | 'controlAccount' | 'docType'>,
  fx: number,
  ctx: { items: readonly Item[]; groups: readonly ItemGroup[]; codes: readonly TaxCode[]; rateOf: (code: string) => number; withholding: RiWithholding[]; roundingRule?: Parameters<typeof soTotals>[2] },
): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => {
    if (account && amount) totals.set(account, round2((totals.get(account) ?? 0) + amount));
  };
  const vatAccount = (code: string) => ctx.codes.find((c) => c.code === code)?.glAccount || '2310';
  const factor = 1 - r.discountPct / 100;
  for (const l of r.lines) {
    const item = ctx.items.find((i) => i.id === l.itemId);
    const net = round2(lineNet(l as never) * factor * fx);
    add(r.docType === 'Service' ? l.glAccount || '4030' : item ? revenueAccountFor(item, ctx.groups) : '4010', -net);
    add(vatAccount(l.taxCode), -round2((net * ctx.rateOf(l.taxCode)) / 100));
    // No stock movement for Reserve Invoices — inventory is relieved when a Delivery is created.
  }
  const freight = round2(r.freight * fx);
  add(FREIGHT_INCOME_ACCOUNT, -freight);
  add(vatAccount(r.freightTaxCode), -round2((freight * ctx.rateOf(r.freightTaxCode)) / 100));
  const totalsDoc = soTotals(r as never, ctx.rateOf, ctx.roundingRule);
  add(FREIGHT_INCOME_ACCOUNT, -round2(totalsDoc.rounding * fx));

  for (const w of ctx.withholding) {
    const amt = round2(w.amount * fx);
    add(w.account, amt);
  }
  // A/R takes whatever balances the entry: the total less what the customer withholds.
  const balance = round2([...totals.values()].reduce((n, v) => n + v, 0));
  if (balance) add(r.controlAccount || '1120', -balance);

  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((x, y) => y.debit - x.debit || x.credit - y.credit);
}

export class RiPostError extends Error {
  constructor(
    readonly lineIds: string[],
    message: string,
  ) {
    super(message);
  }
}

export const saveRiDraft = (input: RiInput) => reserveInvoices.save({ ...input, status: 'Draft', docNum: 0 });

export async function saveRiRemarks(id: string, patch: Pick<ReserveInvoice, 'remarks' | 'attachments'>) {
  const cur = await reserveInvoices.get(id);
  if (!cur) throw new Error('This reserve invoice no longer exists.');
  return reserveInvoices.save({ ...cur, ...patch });
}

/**
 * Add the Reserve Invoice. Posts A/R + revenue journal entries, but does NOT move stock.
 * openQtyForIt on each line = quantity (all quantity still open for delivery).
 */
export async function addReserveInvoice(
  input: RiInput,
  fx: number,
  ctx: { codes: readonly TaxCode[]; withholding: RiWithholding[]; roundingRule?: Parameters<typeof soTotals>[2]; items: readonly Item[] },
): Promise<ReserveInvoice> {
  const series = riSeriesOf(input.seriesId);
  const allInv = await reserveInvoices.list();
  const docNum = input.docNum || Math.max(series.firstNo - 1, ...allInv.filter((r) => r.seriesId === series.id).map((r) => r.docNum)) + 1;

  if (!input.approved) {
    return reserveInvoices.save({ ...input, docNum, status: 'Not Confirmed', fxRate: fx });
  }

  // Set openQtyForIt = quantity on all lines (nothing delivered yet).
  const lines: RiLine[] = input.lines.map((l) => ({ ...l, openQtyForIt: l.quantity }));

  const saved = await reserveInvoices.save({ ...input, lines, docNum, status: 'Open', fxRate: fx });
  await postDocumentEntry({
    origin: 'RI',
    originNo: docNum,
    originId: saved.id,
    postingDate: saved.postingDate,
    dueDate: saved.dueDate,
    remarks: saved.journalRemark,
    partnerId: saved.customerId,
    controlAccount: saved.controlAccount,
    lines: riJournal(saved, fx, {
      items: ctx.items,
      groups: await itemGroups.list(),
      codes: ctx.codes,
      rateOf: rateFrom(ctx.codes, saved.postingDate),
      withholding: ctx.withholding,
      roundingRule: ctx.roundingRule,
    }),
  });
  return saved;
}

/** Close: nothing more is expected on it. */
export async function closeReserveInvoice(r: ReserveInvoice) {
  return reserveInvoices.save({ ...r, status: 'Closed', closeDate: todayISO() });
}

/** Cancel a Reserve Invoice: reverses the journal entry. No stock to restore. */
export async function cancelReserveInvoice(r: ReserveInvoice) {
  if (r.appliedAmount > 0) throw new RiPostError([], 'Payments are applied to this invoice — cancel them first.');
  const saved = await reserveInvoices.save({ ...r, status: 'Cancelled', closeDate: todayISO() });
  await reverseDocumentEntry(r.id);
  return saved;
}

export async function recallReserveInvoice(ri: ReserveInvoice): Promise<ReserveInvoice> {
  return reserveInvoices.save({ ...ri, status: 'Draft', approved: false });
}

/** An invoice's total, the customer's withholding, and what's still unpaid (document currency). */
export function netDueRi(r: ReserveInvoice, customer: Pick<Partner, 'businessType' | 'topWithholdingAgent'> | undefined, items: readonly Item[], codes: readonly TaxCode[]) {
  const rateOf = rateFrom(codes, r.postingDate);
  const total = riTotals(r, rateOf).total;
  const wtAmount = round2(riWithholding(r, customer, items, rateOf).reduce((n, w) => n + w.amount, 0));
  const due = round2(total - wtAmount);
  return { total, wtAmount, due, balanceDue: round2(due - r.appliedAmount) };
}

/** What to display for the inventory account of a line (used in journal preview). */
export const riInventoryAccount = (item: Item, warehouse: string, groups: readonly ItemGroup[]) =>
  inventoryAccountFor(item, warehouse, [...groups]);
