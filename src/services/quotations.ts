import { QT_SERIES, SEED_QUOTATIONS, type Quotation, type QuotationStatus } from '../mocks/quotations';
import { qtSeries, seriesLookup, formatDocNum } from './allSeries';
import { createCollection } from './store';
import { todayISO } from './dates';
import { soTotals } from './salesOrders';
import type { RoundingRule } from '../mocks/currencies';
import type { TaxCode } from '../mocks/taxes';
import { rateAt } from '../mocks/taxes';
import { lineNet } from './lineMath';

const quotations = createCollection<Quotation>('sikat-erp:quotations', SEED_QUOTATIONS, 'qt', { audit: 'QT' });

// ── Expiry ───────────────────────────────────────────────────────────────────
// An Open quotation past its valid-until date is Expired: it can't become a sales order until the
// customer is re-quoted and the date moves on (which reopens it).

/** The status an added quotation should have on `today`: Open ↔ Expired by its valid-until date. */
export const qtStatusOn = (q: Pick<Quotation, 'status' | 'validUntil'>, today: string): QuotationStatus =>
  q.status === 'Open' && q.validUntil && q.validUntil < today ? 'Expired'
  : q.status === 'Expired' && (!q.validUntil || q.validUntil >= today) ? 'Open'
  : q.status;

/**
 * The expiry run a server would do overnight: Open quotations past their date turn Expired, in one
 * write (logged in each one's Activity). Runs before every read, so a quotation lapses the day after.
 */
export async function expireQuotations(today = todayISO()): Promise<void> {
  const due = quotations.snapshot().filter((q) => q.status === 'Open' && qtStatusOn(q, today) === 'Expired');
  if (due.length) await quotations.saveMany(due.map((q) => ({ ...q, status: 'Expired' as const })));
}

export async function listQuotations(): Promise<Quotation[]> {
  await expireQuotations();
  return quotations.list();
}

export async function getQuotation(idOrNumber: string) {
  await expireQuotations();
  const direct = await quotations.get(idOrNumber);
  if (direct) return direct;
  const all = await quotations.list();
  return all.find((q) => qtNumber(q) === idOrNumber) ?? null;
}

export type QtInput = Omit<Quotation, 'id'> & { id?: string };

const seriesOf = (id: string) => seriesLookup(qtSeries, id, QT_SERIES);
export const qtNumber = (q: Pick<Quotation, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(seriesOf(q.seriesId), q.docNum, q.postingDate);

// ── Line and document math ───────────────────────────────────────────────────

/** Re-export the shared line-net so quotation lines foot out exactly like orders. */
export { lineNet };

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
  // One waiting for approval keeps the number it was given.
  const docNum = input.docNum || Math.max(series.firstNo - 1, ...all.filter((q) => q.seriesId === series.id).map((q) => q.docNum)) + 1;
  const status = input.approved ? qtStatusOn({ status: 'Open', validUntil: input.validUntil }, todayISO()) : 'Not Confirmed';
  return quotations.save({ ...input, docNum, status });
}

/**
 * Save the fields an added quotation can still change. A new valid-until date moves it between
 * Open and Expired, so extending an expired quotation reopens it.
 */
export async function saveQuotationRemarks(q: Quotation, patch: Pick<Quotation, 'remarks' | 'attachments'> & Partial<Pick<Quotation, 'documentDate' | 'validUntil'>>): Promise<Quotation> {
  const current = await quotations.get(q.id);
  if (!current) throw new Error('This quotation no longer exists.');
  const next = { ...current, ...patch };
  return quotations.save({ ...next, status: qtStatusOn(next, todayISO()) });
}

export async function closeQuotation(q: Quotation): Promise<Quotation> {
  return quotations.save({ ...q, status: 'Closed', closeDate: todayISO() });
}

export async function cancelQuotation(q: Quotation): Promise<Quotation> {
  return quotations.save({ ...q, status: 'Cancelled', closeDate: todayISO() });
}

export async function recallQuotation(q: Quotation): Promise<Quotation> {
  return quotations.save({ ...q, status: 'Draft', approved: false });
}
