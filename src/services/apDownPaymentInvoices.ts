/**
 * A/P Down Payment Invoices — the posted liability document for a vendor's advance.
 * Unlike the A/P Down Payment Request (which posts nothing), adding an invoice
 * creates a GL entry: Dr Advances to Suppliers / Cr A/P Control Account.
 */
import { DPI_SERIES, ADVANCES_TO_SUPPLIERS, type DownPaymentInvoice } from '../mocks/apDownPaymentInvoices';
import { WITHHOLDING_PAYABLE } from '../mocks/apInvoices';
import { rateAt, vatNotPaidToVendor, type TaxCode } from '../mocks/taxes';
import type { Item } from '../mocks/items';
import { dpiSeries, seriesLookup, formatDocNum } from './allSeries';
import { todayISO } from './dates';
import { lineNet, poTotals } from './purchaseOrders';
import { purchasingHistory } from './purchasingHistory';
import { poWithholding, type WithholdingLine } from './withholding';
import type { LineParty, TaxMasterData } from './taxDetermination';
import { createCollection } from './store';
import { round2 } from './num';
import type { JournalLine } from './inventoryTransfers';

const invoices = createCollection<DownPaymentInvoice>('sikat-erp:ap-down-payment-invoices', () => purchasingHistory().downPaymentInvoices, 'dpi', { audit: 'APDPI' });

export const listDownPaymentInvoices = invoices.list;
export async function getDownPaymentInvoice(idOrNumber: string) {
  const direct = await invoices.get(idOrNumber);
  if (direct) return direct;
  const all = await invoices.list();
  return all.find((d) => dpiNumber(d) === idOrNumber) ?? null;
}

export type DpiInput = Omit<DownPaymentInvoice, 'id'> & { id?: string };

export const dpiNumber = (d: Pick<DownPaymentInvoice, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(seriesLookup(dpiSeries, d.seriesId, DPI_SERIES), d.docNum, d.postingDate);

export function dpiTotals(
  d: Pick<DownPaymentInvoice, 'lines' | 'discountPct' | 'freightTaxCode' | 'dpmPct'>,
  rateOf: (taxCode: string) => number,
  isReverseCharge?: (taxCode: string) => boolean,
) {
  // No currency rounding on a partial (DPM-share) document — the final invoice rounds the whole order.
  const full = poTotals({ ...d, freight: 0 }, rateOf, undefined, isReverseCharge);
  // Compute the billed share per line (share folded into the factor) so dpm/tax match what dpiJournal
  // posts line by line — no sub-centavo drift from scaling an already-rounded full-order total.
  const factor = (1 - d.discountPct / 100) * (d.dpmPct / 100);
  const reverse = (c: string) => isReverseCharge?.(c) ?? false;
  const taxOf = (l: (typeof d.lines)[number]) => round2((lineNet(l) * factor * rateOf(l.taxCode)) / 100);
  const dpm = round2(d.lines.reduce((n, l) => n + round2(lineNet(l) * factor), 0));
  const tax = round2(d.lines.filter((l) => !reverse(l.taxCode)).reduce((n, l) => n + taxOf(l), 0));
  const reverseCharge = round2(d.lines.filter((l) => reverse(l.taxCode)).reduce((n, l) => n + taxOf(l), 0));
  return { beforeDiscount: full.beforeDiscount, discount: full.discount, dpm, tax, reverseCharge, total: round2(dpm + tax) };
}

export const dpiTotal = (d: DownPaymentInvoice, codes: TaxCode[]) =>
  dpiTotals(
    d,
    (code) => { const c = codes.find((x) => x.code === code); return c ? (rateAt(c, d.postingDate) ?? 0) : 0; },
    (code) => vatNotPaidToVendor(codes.find((x) => x.code === code)),
  ).total;

export const drawableAmount = (d: DownPaymentInvoice) => Math.max(0, round2(d.appliedAmount - d.drawnAmount));

/** Gross down payment (incl. VAT) a paid invoice can still draw on a final bill: its total less what's drawn. */
export const dpiDrawable = (d: DownPaymentInvoice, codes: TaxCode[]) =>
  Math.max(0, round2((d.appliedAmount > 0 ? dpiTotal(d, codes) : 0) - d.drawnAmount));
/** @public */
export const paidRate = (d: DownPaymentInvoice) => (d.appliedAmount ? d.paidLc / d.appliedAmount : d.fxRate || 1);

/**
 * Withholding on the invoiced down-payment portion. A down payment *invoice* is an issued invoice,
 * so BIR recognizes the EWT (and VAT) on the billed DPM share now — not deferred to the final bill
 * (RR 2-98 §2.57.4 as amended by RR 4-2024: withhold at issuance of the invoice). The share scales
 * each line's base to the DPM %.
 */
export const dpiWithholding = (
  d: Pick<DownPaymentInvoice, 'discountPct' | 'dpmPct' | 'lines'>,
  vendor: LineParty | undefined,
  items: readonly Item[],
  tax: TaxMasterData,
  date: string,
): WithholdingLine[] => poWithholding(d, vendor, items, tax, date, d.dpmPct / 100);

/** What the vendor is owed on the down payment invoice: its total less the EWT withheld on it. */
export const dpiNetDue = (total: number, withholding: WithholdingLine[]) =>
  round2(total - withholding.filter((w) => w.deducted).reduce((n, w) => n + w.amount, 0));

/**
 * The GL journal for a down payment invoice. The invoice recognizes its billed share:
 * - Dr Advances to Suppliers — the net (ex-VAT) advance;
 * - Dr Input VAT — creditable now, since an invoice has been issued (Sec. 110 NIRC / EOPT);
 * - Cr the withholding tax payable — EWT on the billed share;
 * - Cr A/P Control — what's left owed to the vendor.
 */
export function dpiJournal(
  inv: Pick<DownPaymentInvoice, 'dpmPct' | 'discountPct' | 'controlAccount' | 'downPaymentAccount'> & { lines: DownPaymentInvoice['lines'] },
  fx: number,
  ctx: { codes: TaxCode[]; rateOf: (code: string) => number; withholding: WithholdingLine[] },
): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => {
    if (account && amount) totals.set(account, round2((totals.get(account) ?? 0) + amount));
  };
  const reverse = (code: string) => vatNotPaidToVendor(ctx.codes.find((c) => c.code === code));
  const vatAccount = (code: string) => ctx.codes.find((c) => c.code === code)?.glAccount || '1410';
  const factor = (1 - inv.discountPct / 100) * (inv.dpmPct / 100);
  const advance = inv.downPaymentAccount || ADVANCES_TO_SUPPLIERS;
  for (const l of inv.lines) {
    add(advance, round2(lineNet(l) * factor * fx));
    if (!reverse(l.taxCode)) add(vatAccount(l.taxCode), round2((lineNet(l) * factor * ctx.rateOf(l.taxCode) * fx) / 100));
  }
  const debits = round2([...totals.values()].reduce((n, v) => n + v, 0));
  let withheld = 0;
  for (const w of ctx.withholding.filter((x) => x.deducted)) {
    const amt = round2(w.amount * fx);
    add(w.account || WITHHOLDING_PAYABLE[w.kind] || '2340', -amt);
    withheld += amt;
  }
  if (debits) add(inv.controlAccount || '2010', -round2(debits - withheld));

  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit || a.credit - b.credit);
}

// ── Saving ───────────────────────────────────────────────────────────────────

export const saveDpiDraft = (input: DpiInput) => invoices.save({ ...input, status: 'Draft', docNum: 0 });

export async function saveDpiRemarks(d: DownPaymentInvoice, patch: Pick<DownPaymentInvoice, 'remarks' | 'paymentBlock' | 'paymentOrderRun'>) {
  const current = await invoices.get(d.id);
  if (!current) throw new Error('This down payment invoice no longer exists.');
  return invoices.save({ ...current, ...patch });
}

/** Add the invoice: numbered, open, and the GL entry is posted externally. */
export async function addDownPaymentInvoice(input: DpiInput, fx: number) {
  const all = await invoices.list();
  const series = seriesLookup(dpiSeries, input.seriesId, DPI_SERIES);
  const docNum = Math.max(series.firstNo - 1, ...all.filter((d) => d.seriesId === series.id).map((d) => d.docNum)) + 1;
  return invoices.save({ ...input, docNum, status: input.approved ? 'Open' : 'Not Confirmed', fxRate: fx });
}

export const closeDownPaymentInvoice = (d: DownPaymentInvoice) => invoices.save({ ...d, status: 'Closed', closeDate: todayISO() });

export async function cancelDownPaymentInvoice(d: DownPaymentInvoice) {
  if (d.appliedAmount > 0) throw new Error('Payments are applied to this invoice — cancel them first.');
  return invoices.save({ ...d, status: 'Cancelled', closeDate: todayISO() });
}

/** Payments applied to invoices (or taken back on cancel). */
export async function applyDownPaymentInvoicePayments(rows: { requestId: string; amount: number; amountLc: number }[], sign: 1 | -1) {
  for (const r of rows) {
    const d = await invoices.get(r.requestId);
    if (!d) continue;
    await invoices.save({ ...d, appliedAmount: Math.max(0, round2(d.appliedAmount + r.amount * sign)), paidLc: Math.max(0, round2(d.paidLc + r.amountLc * sign)) });
  }
}

/** Amounts drawn on A/P invoices (or given back when cancelled). */
export async function drawDownPaymentInvoices(draws: { requestId: string; amount: number }[], total: (d: DownPaymentInvoice) => number, sign: 1 | -1) {
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

export async function recallDownPaymentInvoice(d: DownPaymentInvoice): Promise<DownPaymentInvoice> {
  return invoices.save({ ...d, status: 'Draft', approved: false });
}
