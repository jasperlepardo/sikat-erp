/**
 * A/P Down Payment Invoices — the posted liability document for a vendor's advance.
 * Unlike the A/P Down Payment Request (which posts nothing), adding an invoice
 * creates a GL entry: Dr Advances to Suppliers / Cr A/P Control Account.
 */
import { DPI_SERIES, ADVANCES_TO_SUPPLIERS, type DownPaymentInvoice } from '../mocks/apDownPaymentInvoices';
import { rateAt, vatNotPaidToVendor, type TaxCode } from '../mocks/taxes';
import { dpiSeries, seriesLookup, formatDocNum } from './allSeries';
import { todayISO } from './dates';
import { poTotals } from './purchaseOrders';
import { createCollection } from './store';
import { round2 } from './num';
import type { JournalLine } from './inventoryTransfers';

const invoices = createCollection<DownPaymentInvoice>('sikat-erp:ap-down-payment-invoices', () => [], 'dpi', { audit: 'APDPI' });

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
  const full = poTotals({ ...d, freight: 0 }, rateOf, undefined, isReverseCharge);
  const share = d.dpmPct / 100;
  const base = round2((full.beforeDiscount - full.discount) * share);
  const tax = round2(full.tax * share);
  return { beforeDiscount: full.beforeDiscount, discount: full.discount, dpm: base, tax, reverseCharge: round2(full.reverseCharge * share), total: round2(base + tax) };
}

export const dpiTotal = (d: DownPaymentInvoice, codes: TaxCode[]) =>
  dpiTotals(
    d,
    (code) => { const c = codes.find((x) => x.code === code); return c ? (rateAt(c, d.postingDate) ?? 0) : 0; },
    (code) => vatNotPaidToVendor(codes.find((x) => x.code === code)),
  ).total;

export const drawableAmount = (d: DownPaymentInvoice) => Math.max(0, round2(d.appliedAmount - d.drawnAmount));
/** @public */
export const paidRate = (d: DownPaymentInvoice) => (d.appliedAmount ? d.paidLc / d.appliedAmount : d.fxRate || 1);

/**
 * The GL journal for a down payment invoice: Dr Advances to Suppliers / Cr A/P Control.
 * Withholding (if any) reduces what's owed to the vendor.
 */
export function dpiJournal(
  inv: Pick<DownPaymentInvoice, 'dpmPct' | 'discountPct' | 'freightTaxCode' | 'controlAccount' | 'downPaymentAccount'> & { lines: DownPaymentInvoice['lines'] },
  fx: number,
  rateOf: (code: string) => number,
): JournalLine[] {
  const totals = dpiTotals(inv, rateOf);
  const totalLc = round2(totals.total * fx);
  const account = inv.downPaymentAccount || ADVANCES_TO_SUPPLIERS;
  const control = inv.controlAccount || '2010';
  return [
    { account, debit: totalLc, credit: 0 },
    { account: control, debit: 0, credit: totalLc },
  ].filter((l) => l.debit !== 0 || l.credit !== 0);
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
