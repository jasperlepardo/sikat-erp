import { RFQ_SERIES, SEED_RFQS, type Rfq, type RfqLine, type RfqStatus } from '../mocks/rfqs';
import { rfqSeries, seriesLookup, formatDocNum } from './allSeries';
import { createCollection } from './store';
import { poTotals, type PoTotals } from './purchaseOrders';
import { applyRequestDraw } from './purchaseRequests';
import type { RoundingRule } from '../mocks/currencies';
import type { TaxCode } from '../mocks/taxes';
import { rateAt, vatNotPaidToVendor } from '../mocks/taxes';
import { round2 } from './num';

const rfqs = createCollection<Rfq>('sikat-erp:rfqs:v1', SEED_RFQS, 'rfq', { audit: 'RFQ' });

export { rfqSeries };
export const listRfqs = rfqs.list;
export async function getRfq(idOrNumber: string) {
  const direct = await rfqs.get(idOrNumber);
  if (direct) return direct;
  const all = await rfqs.list();
  return all.find((q) => rfqNumber(q) === idOrNumber) ?? null;
}

export type RfqInput = Omit<Rfq, 'id'> & { id?: string };

export const seriesOf = (id: string) => seriesLookup(rfqSeries, id, RFQ_SERIES);
export const rfqNumber = (q: Pick<Rfq, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(seriesOf(q.seriesId), q.docNum, q.postingDate);

// ── Line and document math ───────────────────────────────────────────────────

export const lineNet = (l: Pick<RfqLine, 'quantity' | 'unitPrice' | 'discountPct'>) =>
  round2(l.quantity * l.unitPrice * (1 - l.discountPct / 100));

/** Footer totals in the document currency, using quantity as the volume basis. */
export function rfqTotals(
  q: Pick<Rfq, 'discountPct' | 'freight' | 'freightTaxCode'> & { lines: RfqLine[] },
  rateOf: (taxCode: string) => number,
  rounding: RoundingRule = 'No rounding',
  isReverseCharge: (taxCode: string) => boolean = () => false,
): PoTotals {
  // Map RfqLine → the shape poTotals expects, using quantity as quantity.
  const mapped = q.lines.map((l) => ({
    itemId: l.itemId,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    taxCode: l.taxCode,
  }));
  return poTotals({ ...q, lines: mapped }, rateOf, rounding, isReverseCharge);
}

export const rfqTotal = (q: Rfq, codes: TaxCode[]) =>
  rfqTotals(
    q,
    (code) => {
      const c = codes.find((x) => x.code === code);
      return c ? (rateAt(c, q.postingDate) ?? 0) : 0;
    },
    undefined,
    (code) => vatNotPaidToVendor(codes.find((x) => x.code === code)),
  ).total;

// ── Saving ───────────────────────────────────────────────────────────────────

export async function saveRfqDraft(input: RfqInput): Promise<Rfq> {
  const before = input.id ? (await rfqs.list()).find((q) => q.id === input.id) : undefined;
  const draft = await rfqs.save({ ...input, status: 'Draft', docNum: 0 });
  await applyRequestDraw(before, draft);
  return draft;
}

export async function addRfq(input: RfqInput): Promise<Rfq> {
  const all = await rfqs.list();
  const before = input.id ? all.find((q) => q.id === input.id) : undefined;
  const series = seriesOf(input.seriesId);
  const docNum =
    Math.max(series.firstNo - 1, ...all.filter((q) => q.seriesId === series.id && q.docNum).map((q) => q.docNum)) + 1;
  const saved = await rfqs.save({ ...input, docNum, status: input.approved ? 'Open' : 'Not Confirmed' });
  await applyRequestDraw(before, saved);
  return saved;
}

export async function closeRfq(q: Rfq): Promise<Rfq> {
  const closed = await rfqs.save({ ...q, status: 'Closed' as RfqStatus });
  await applyRequestDraw(q, closed);
  return closed;
}

export async function cancelRfq(q: Rfq): Promise<Rfq> {
  const cancelled = await rfqs.save({ ...q, status: 'Cancelled' as RfqStatus });
  // No longer a live quotation, so it releases its source request's open quantities.
  await applyRequestDraw(q, cancelled);
  return cancelled;
}

export async function recallRfq(q: Rfq): Promise<Rfq> {
  const recalled = await rfqs.save({ ...q, status: 'Draft', approved: false });
  await applyRequestDraw(q, recalled);
  return recalled;
}
