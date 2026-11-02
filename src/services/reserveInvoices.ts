import { RI_SERIES, SEED_RESERVE_INVOICES, type ReserveInvoice, type RiLine } from '../mocks/reserveInvoices';
import { FREIGHT_INCOME_ACCOUNT } from '../mocks/arInvoices';
import { riSeries, seriesLookup, formatDocNum } from './allSeries';
import type { ItemGroup } from '../mocks/itemMasters';
import type { Item } from '../mocks/items';
import type { Partner } from '../mocks/partners';
import { rateFrom, type TaxCode } from '../mocks/taxes';
import { todayISO } from './dates';
import { itemGroups } from './inventoryMasters';
import { type JournalLine } from './inventoryTransfers';
import { postDocumentEntry, reverseDocumentEntry } from './journalEntries';
import { lineNet, soTotals } from './salesOrders';
import { createCollection } from './store';
import { customerWithholding, type CustomerWithholding } from './withholding';
import { round2, round4 } from './num';

/** IFRS 15 contract liability: net of reserve invoices billed before delivery, awaiting recognition. */
export const DEFERRED_REVENUE_ACCOUNT = '2165';

const reserveInvoices = createCollection<ReserveInvoice>('sikat-erp:reserve-invoices', SEED_RESERVE_INVOICES, 'ri', { audit: 'RI' });

export const listReserveInvoices = reserveInvoices.list;
export async function getReserveInvoice(idOrNumber: string) {
  const direct = await reserveInvoices.get(idOrNumber);
  if (direct) return direct;
  const all = await reserveInvoices.list();
  return all.find((r) => riNumber(r) === idOrNumber) ?? null;
}

export type RiInput = Omit<ReserveInvoice, 'id'> & { id?: string };

const riSeriesOf = (id: string) => seriesLookup(riSeries, id, RI_SERIES);
export const riNumber = (r: Pick<ReserveInvoice, 'seriesId' | 'docNum' | 'postingDate'>) => formatDocNum(riSeriesOf(r.seriesId), r.docNum, r.postingDate);

export const riTotals = (
  r: Pick<ReserveInvoice, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'rounding'>,
  rateOf: (code: string) => number,
  rule?: Parameters<typeof soTotals>[2],
) => soTotals(r as unknown as Parameters<typeof soTotals>[0], rateOf, rule);


export type RiWithholding = CustomerWithholding;

/**
 * The WTax Amount (document currency) on WTax Liable lines — the same resolution as A/R invoices
 * (see customerWithholding).
 */
export function riWithholding(
  r: Pick<ReserveInvoice, 'lines' | 'discountPct' | 'docType' | 'postingDate'>,
  customer: Pick<Partner, 'businessType' | 'topWithholdingAgent'> | undefined,
  items: readonly Item[],
  rateOf: (code: string) => number,
): RiWithholding[] {
  return customerWithholding(r, customer, items, rateOf);
}

/** What the customer still owes: total − withholding − payments applied. */
export const riBalanceDue = (total: number, withheld: number, applied: number) => round2(total - withheld - applied);


/**
 * The journal entry for a Reserve Invoice: Dr A/R / Cr Revenue / Cr Output VAT.
 * NO inventory movement (no COGS or Inventory lines).
 * `fixed` uses the rates saved on the doc instead of today's.
 * @public
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
    const net = round2(lineNet(l as never) * factor * fx);
    // IFRS 15: billing before delivery recognizes no revenue yet — park the net in Unearned revenue
    // (a contract liability). The delivery recognizes it (Dr 2165 / Cr Revenue). VAT is a tax-point
    // event at invoice, so it still posts here.
    add(DEFERRED_REVENUE_ACCOUNT, -net);
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

/**
 * A delivery fulfils a reserve invoice: move each line's `openQtyForIt` by `sign` (back on a
 * cancelled delivery). The invoice closes when every line is fully delivered, and reopens below it.
 */
export async function applyDeliveredToRi(lines: { riId: string; riLineId: string; quantity: number }[], sign: 1 | -1) {
  const ids = [...new Set(lines.map((l) => l.riId))];
  for (const id of ids) {
    const ri = await reserveInvoices.get(id);
    if (!ri) continue;
    const next = ri.lines.map((rl) => {
      const qty = lines.filter((l) => l.riId === id && l.riLineId === rl.id).reduce((n, l) => n + l.quantity, 0);
      return qty ? { ...rl, openQtyForIt: Math.max(0, round4(rl.openQtyForIt - qty * sign)) } : rl;
    });
    const delivered = next.every((rl) => rl.openQtyForIt <= 0);
    const status = ri.status === 'Cancelled' ? ri.status : delivered && ri.status === 'Open' ? 'Closed' : ri.status;
    await reserveInvoices.save({ ...ri, lines: next, status, closeDate: status === 'Closed' ? ri.closeDate || todayISO() : ri.closeDate });
  }
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
