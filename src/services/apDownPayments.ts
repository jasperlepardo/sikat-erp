import { DPR_SERIES, type DownPaymentRequest } from '../mocks/apDownPayments';
import { rateAt, vatNotPaidToVendor, type TaxCode } from '../mocks/taxes';
import { dprSeries, seriesLookup, formatDocNum } from './allSeries';
import { todayISO } from './dates';
import { poTotals } from './purchaseOrders';
import { createCollection } from './store';
import { PURCHASING_HISTORY } from './purchasingHistory';

const requests = createCollection<DownPaymentRequest>('sikat-erp:ap-down-payments:v4', PURCHASING_HISTORY.downPayments, 'dp');

export const listDownPayments = requests.list;
export const getDownPayment = requests.get;

export type DprInput = Omit<DownPaymentRequest, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "Primary 630004", or "Draft" before it's added. */
export const dprNumber = (d: Pick<DownPaymentRequest, 'seriesId' | 'docNum'>) =>
  formatDocNum(seriesLookup(dprSeries, d.seriesId, DPR_SERIES), d.docNum);

/**
 * Footer totals in the document currency. Total Payment Due = (Total Before Discount less the
 * document discount) × DPM % + the tax on that share.
 */
export function dprTotals(
  d: Pick<DownPaymentRequest, 'lines' | 'discountPct' | 'freightTaxCode' | 'dpmPct'>,
  rateOf: (taxCode: string) => number,
  isReverseCharge?: (taxCode: string) => boolean,
) {
  const full = poTotals({ ...d, freight: 0 }, rateOf, undefined, isReverseCharge);
  const share = d.dpmPct / 100;
  const base = round2((full.beforeDiscount - full.discount) * share);
  const tax = round2(full.tax * share);
  return { beforeDiscount: full.beforeDiscount, discount: full.discount, dpm: base, tax, reverseCharge: round2(full.reverseCharge * share), total: round2(base + tax) };
}

export const dprTotal = (d: DownPaymentRequest, codes: TaxCode[]) =>
  dprTotals(
    d,
    (code) => {
      const c = codes.find((x) => x.code === code);
      return c ? (rateAt(c, d.postingDate) ?? 0) : 0;
    },
    (code) => vatNotPaidToVendor(codes.find((x) => x.code === code)),
  ).total;

/** Paid but not yet drawn on an A/P invoice, in the document currency. */
export const drawableAmount = (d: DownPaymentRequest) => Math.max(0, round2(d.appliedAmount - d.drawnAmount));

/** PHP per unit of currency the advance was paid at, on average (for drawing it at the same rate). */
export const paidRate = (d: DownPaymentRequest) => (d.appliedAmount ? d.paidLc / d.appliedAmount : d.fxRate || 1);

// ── Saving ───────────────────────────────────────────────────────────────────

export const saveDprDraft = (input: DprInput) => requests.save({ ...input, status: 'Draft', docNum: 0 });

export async function saveDprRemarks(d: DownPaymentRequest, patch: Pick<DownPaymentRequest, 'remarks' | 'paymentBlock' | 'paymentOrderRun'>) {
  const current = await requests.get(d.id);
  if (!current) throw new Error('This down payment request no longer exists.');
  return requests.save({ ...current, ...patch });
}

/** Add the request: numbered and open. Nothing posts until it's paid. */
export async function addDownPayment(input: DprInput, fx: number) {
  const all = await requests.list();
  const series = seriesLookup(dprSeries, input.seriesId, DPR_SERIES);
  const docNum = Math.max(series.firstNo - 1, ...all.filter((d) => d.seriesId === series.id).map((d) => d.docNum)) + 1;
  return requests.save({ ...input, docNum, status: 'Open', fxRate: fx });
}

/** Close by hand: nothing more will be paid or drawn on it. */
export const closeDownPayment = (d: DownPaymentRequest) => requests.save({ ...d, status: 'Closed', closeDate: todayISO() });

/** Cancel an unpaid request. */
export async function cancelDownPayment(d: DownPaymentRequest) {
  if (d.appliedAmount > 0) throw new Error('Payments are applied to this request — cancel them first.');
  return requests.save({ ...d, status: 'Cancelled', closeDate: todayISO() });
}

/** Payments applied to requests (or taken back on cancel), with the PHP they were paid at. */
export async function applyDownPaymentPayments(rows: { requestId: string; amount: number; amountLc: number }[], sign: 1 | -1) {
  for (const r of rows) {
    const d = await requests.get(r.requestId);
    if (!d) continue;
    await requests.save({ ...d, appliedAmount: Math.max(0, round2(d.appliedAmount + r.amount * sign)), paidLc: Math.max(0, round2(d.paidLc + r.amountLc * sign)) });
  }
}

/** Amounts drawn on A/P invoices (or given back when an invoice is cancelled). Fully drawn requests close. */
export async function drawDownPayments(draws: { requestId: string; amount: number }[], total: (d: DownPaymentRequest) => number, sign: 1 | -1) {
  for (const r of draws) {
    const d = await requests.get(r.requestId);
    if (!d) continue;
    const drawnAmount = Math.max(0, round2(d.drawnAmount + r.amount * sign));
    const done = drawnAmount >= total(d) - 0.005;
    await requests.save({
      ...d,
      drawnAmount,
      status: done && d.status === 'Open' ? 'Closed' : !done && d.status === 'Closed' ? 'Open' : d.status,
      closeDate: done && d.status === 'Open' ? todayISO() : !done && d.status === 'Closed' ? '' : d.closeDate,
    });
  }
}
