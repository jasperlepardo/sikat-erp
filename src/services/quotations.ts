import { QT_SERIES, SEED_QUOTATIONS, type Quotation, type QuoteLine } from '../mocks/quotations';
import { qtSeries, seriesLookup, formatDocNum } from './allSeries';
import { createCollection } from './store';
import { todayISO } from './dates';
import { soTotals } from './salesOrders';
import type { RoundingRule } from '../mocks/currencies';
import type { TaxCode } from '../mocks/taxes';
import { rateAt } from '../mocks/taxes';

const quotations = createCollection<Quotation>('sikat-erp:quotations', SEED_QUOTATIONS, 'qt');

export const listQuotations = quotations.list;
export async function getQuotation(idOrNumber: string) {
  const direct = await quotations.get(idOrNumber);
  if (direct) return direct;
  const all = await quotations.list();
  return all.find((q) => qtNumber(q) === idOrNumber) ?? null;
}

export type QtInput = Omit<Quotation, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const seriesOf = (id: string) => seriesLookup(qtSeries, id, QT_SERIES);
export const qtNumber = (q: Pick<Quotation, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(seriesOf(q.seriesId), q.docNum, q.postingDate);

// ── Line and document math ───────────────────────────────────────────────────

export const lineNet = (l: QuoteLine) => round2(l.quantity * l.unitPrice * (1 - l.discountPct / 100));

export const qtTotals = (
  q: Pick<Quotation, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'rounding'>,
  rateOf: (taxCode: string) => number,
  rule: RoundingRule = 'No rounding',
) =>
  soTotals(
    q as Parameters<typeof soTotals>[0],
    rateOf,
    rule,
  );

export const qtTotal = (q: Quotation, codes: TaxCode[]) =>
  qtTotals(q, (code) => {
    const c = codes.find((x) => x.code === code);
    return c ? (rateAt(c, q.postingDate) ?? 0) : 0;
  }).total;

// ── Saving ───────────────────────────────────────────────────────────────────

export async function saveQuotationDraft(input: QtInput): Promise<Quotation> {
  return quotations.save({ ...input, status: 'Draft', docNum: 0 });
}

export async function addQuotation(input: QtInput): Promise<Quotation> {
  const all = await quotations.list();
  const series = seriesOf(input.seriesId);
  const docNum = Math.max(series.firstNo - 1, ...all.filter((q) => q.seriesId === series.id).map((q) => q.docNum)) + 1;
  return quotations.save({ ...input, docNum, status: 'Open' });
}

export async function saveQuotationRemarks(q: Quotation, patch: Pick<Quotation, 'remarks' | 'attachments'>): Promise<Quotation> {
  const current = await quotations.get(q.id);
  if (!current) throw new Error('This quotation no longer exists.');
  return quotations.save({ ...current, ...patch });
}

export async function closeQuotation(q: Quotation): Promise<Quotation> {
  return quotations.save({ ...q, status: 'Closed', closeDate: todayISO() });
}

export async function cancelQuotation(q: Quotation): Promise<Quotation> {
  return quotations.save({ ...q, status: 'Cancelled', closeDate: todayISO() });
}

export async function markConverted(q: Quotation, orderId: string): Promise<Quotation> {
  return quotations.save({ ...q, convertedToOrderId: orderId, status: 'Closed', closeDate: todayISO() });
}
