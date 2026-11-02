/**
 * A/R Down Payment Invoices — the posted document for a customer's advance. Mirror of the A/P down
 * payment invoice, with A/R signs: adding one posts `Dr A/R / Cr Customer Down Payments (2150) +
 * Cr Output VAT`. No revenue is recognized (IFRS 15 contract liability); the final A/R invoice draws
 * the advance down.
 */
import { DI_SERIES, CUSTOMER_DOWN_PAYMENTS, SEED_AR_DOWN_PAYMENT_INVOICES, type ArDownPaymentInvoice } from '../mocks/arDownPaymentInvoices';
import { rateAt, type TaxCode } from '../mocks/taxes';
import { diSeries, seriesLookup, formatDocNum } from './allSeries';
import { todayISO } from './dates';
import { lineNet, soTotals } from './salesOrders';
import { createCollection } from './store';
import { round2 } from './num';
import type { JournalLine } from './inventoryTransfers';

const invoices = createCollection<ArDownPaymentInvoice>('sikat-erp:ar-down-payment-invoices', SEED_AR_DOWN_PAYMENT_INVOICES, 'ardi', { audit: 'ARDI' });

export const listArDownPaymentInvoices = invoices.list;
export async function getArDownPaymentInvoice(idOrNumber: string) {
  const direct = await invoices.get(idOrNumber);
  if (direct) return direct;
  const all = await invoices.list();
  return all.find((d) => diNumber(d) === idOrNumber) ?? null;
}

export type DiInput = Omit<ArDownPaymentInvoice, 'id'> & { id?: string };

export const diNumber = (d: Pick<ArDownPaymentInvoice, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(seriesLookup(diSeries, d.seriesId, DI_SERIES), d.docNum, d.postingDate);

export function diTotals(
  d: Pick<ArDownPaymentInvoice, 'lines' | 'discountPct' | 'freightTaxCode' | 'dpmPct'>,
  rateOf: (taxCode: string) => number,
) {
  // Billed-share per line (share folded into the factor) so dpm/tax match what diJournal posts line
  // by line — no sub-centavo drift from scaling an already-rounded full-order total.
  const full = soTotals({ ...d, freight: 0 } as never, rateOf);
  const factor = (1 - d.discountPct / 100) * (d.dpmPct / 100);
  const taxOf = (l: (typeof d.lines)[number]) => round2((lineNet(l as never) * factor * rateOf(l.taxCode)) / 100);
  const dpm = round2(d.lines.reduce((n, l) => n + round2(lineNet(l as never) * factor), 0));
  const tax = round2(d.lines.reduce((n, l) => n + taxOf(l), 0));
  return { beforeDiscount: full.beforeDiscount, discount: full.discount, dpm, tax, total: round2(dpm + tax) };
}

export const diTotal = (d: ArDownPaymentInvoice, codes: TaxCode[]) =>
  diTotals(d, (code) => { const c = codes.find((x) => x.code === code); return c ? (rateAt(c, d.postingDate) ?? 0) : 0; }).total;

/** Gross down payment (incl. VAT) a paid invoice can still draw on a final invoice: its total less what's drawn. */
export const diDrawable = (d: ArDownPaymentInvoice, codes: TaxCode[]) =>
  Math.max(0, round2((d.appliedAmount > 0 ? diTotal(d, codes) : 0) - d.drawnAmount));
export const paidRate = (d: ArDownPaymentInvoice) => (d.appliedAmount ? d.paidLc / d.appliedAmount : d.fxRate || 1);

/**
 * The GL journal for an A/R down payment invoice. It recognizes its billed share as a liability:
 * - Cr Customer Down Payments (2150) — the net (ex-VAT) advance, a contract liability (no revenue);
 * - Cr Output VAT — due now, since a tax invoice has been issued;
 * - Dr the creditable withholding the customer deducts;
 * - Dr A/R Control — what the customer owes on the advance.
 */
export function diJournal(
  inv: Pick<ArDownPaymentInvoice, 'dpmPct' | 'discountPct' | 'controlAccount' | 'downPaymentAccount'> & { lines: ArDownPaymentInvoice['lines'] },
  fx: number,
  ctx: { codes: TaxCode[]; rateOf: (code: string) => number; withholding: { account: string; amount: number }[] },
): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => {
    if (account && amount) totals.set(account, round2((totals.get(account) ?? 0) + amount));
  };
  const vatAccount = (code: string) => ctx.codes.find((c) => c.code === code)?.glAccount || '2310';
  const factor = (1 - inv.discountPct / 100) * (inv.dpmPct / 100);
  const advance = inv.downPaymentAccount || CUSTOMER_DOWN_PAYMENTS;
  for (const l of inv.lines) {
    add(advance, -round2(lineNet(l as never) * factor * fx));
    add(vatAccount(l.taxCode), -round2((lineNet(l as never) * factor * ctx.rateOf(l.taxCode) * fx) / 100));
  }
  for (const w of ctx.withholding) add(w.account, round2(w.amount * fx));
  const balance = round2([...totals.values()].reduce((n, v) => n + v, 0));
  if (balance) add(inv.controlAccount || '1120', -balance);

  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit || a.credit - b.credit);
}

// ── Saving ───────────────────────────────────────────────────────────────────

export const saveDiDraft = (input: DiInput) => invoices.save({ ...input, status: 'Draft', docNum: 0 });

export async function saveDiRemarks(d: ArDownPaymentInvoice, patch: Pick<ArDownPaymentInvoice, 'remarks'>) {
  const current = await invoices.get(d.id);
  if (!current) throw new Error('This down payment invoice no longer exists.');
  return invoices.save({ ...current, ...patch });
}

/** Add the invoice: numbered, open, and the GL entry is posted externally. */
export async function addArDownPaymentInvoice(input: DiInput, fx: number) {
  const all = await invoices.list();
  const series = seriesLookup(diSeries, input.seriesId, DI_SERIES);
  const docNum = Math.max(series.firstNo - 1, ...all.filter((d) => d.seriesId === series.id).map((d) => d.docNum)) + 1;
  return invoices.save({ ...input, docNum, status: input.approved ? 'Open' : 'Not Confirmed', fxRate: fx });
}

export const closeArDownPaymentInvoice = (d: ArDownPaymentInvoice) => invoices.save({ ...d, status: 'Closed', closeDate: todayISO() });

export async function cancelArDownPaymentInvoice(d: ArDownPaymentInvoice) {
  if (d.appliedAmount > 0) throw new Error('Payments are applied to this invoice — cancel them first.');
  return invoices.save({ ...d, status: 'Cancelled', closeDate: todayISO() });
}

/** Payments applied to invoices (or taken back on cancel). */
export async function applyDiPayments(rows: { requestId: string; amount: number; amountLc: number }[], sign: 1 | -1) {
  for (const r of rows) {
    const d = await invoices.get(r.requestId);
    if (!d) continue;
    await invoices.save({ ...d, appliedAmount: Math.max(0, round2(d.appliedAmount + r.amount * sign)), paidLc: Math.max(0, round2(d.paidLc + r.amountLc * sign)) });
  }
}

/** Amounts drawn on A/R invoices (or given back when cancelled). Closes the invoice once fully drawn. */
export async function drawArDownPaymentInvoices(draws: { requestId: string; amount: number }[], total: (d: ArDownPaymentInvoice) => number, sign: 1 | -1) {
  for (const r of draws) {
    const d = await invoices.get(r.requestId);
    if (!d) continue;
    const drawnAmount = Math.max(0, round2(d.drawnAmount + r.amount * sign));
    const done = drawnAmount >= total(d) - 0.005;
    await invoices.save({
      ...d, drawnAmount,
      status: done && d.status === 'Open' ? 'Closed' : !done && d.status === 'Closed' ? 'Open' : d.status,
      closeDate: done && d.status === 'Open' ? todayISO() : !done && d.status === 'Closed' ? '' : d.closeDate,
    });
  }
}

export async function recallArDownPaymentInvoice(d: ArDownPaymentInvoice): Promise<ArDownPaymentInvoice> {
  return invoices.save({ ...d, status: 'Draft', approved: false });
}
