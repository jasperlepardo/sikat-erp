import { RFQ_SERIES, SEED_RFQS, type Rfq, type RfqLine, type RfqStatus } from '../mocks/rfqs';
import { rfqSeries, seriesLookup, formatDocNum } from './allSeries';
import { createCollection } from './store';
import { poTotals, type PoTotals } from './purchaseOrders';
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
// A quotation never draws down its source request's open quantities: several vendors can quote
// the same need, so only the award (a purchase order) does. Lines keep `baseLineId` for lineage.

export async function saveRfqDraft(input: RfqInput): Promise<Rfq> {
  return rfqs.save({ ...input, status: 'Draft', docNum: 0 });
}

/** The next number in a series, past the RFQs already numbered in it. */
const nextDocNum = (all: readonly Rfq[], seriesId: string) => {
  const series = seriesOf(seriesId);
  return Math.max(series.firstNo - 1, ...all.filter((q) => q.seriesId === series.id && q.docNum).map((q) => q.docNum)) + 1;
};

export async function addRfq(input: RfqInput): Promise<Rfq> {
  const docNum = nextDocNum(await rfqs.list(), input.seriesId);
  return rfqs.save({ ...input, docNum, status: input.approved ? 'Open' : 'Not Confirmed' });
}

/**
 * Add several RFQs at once (one per vendor when a request is sent out for quotes): numbered in
 * sequence from one read of the series, and written in one round trip.
 */
export async function addRfqs(inputs: RfqInput[]): Promise<Rfq[]> {
  const all = rfqs.snapshot();
  const next = new Map<string, number>();
  const numbered = inputs.map((input) => {
    const docNum = next.get(input.seriesId) ?? nextDocNum(all, input.seriesId);
    next.set(input.seriesId, docNum + 1);
    return { ...input, docNum, status: (input.approved ? 'Open' : 'Not Confirmed') as RfqStatus };
  });
  return rfqs.saveMany(numbered);
}

/** The live (not cancelled) RFQs raised from a purchase request. */
export async function listRfqsForPr(prId: string): Promise<Rfq[]> {
  return (await rfqs.list()).filter((q) => q.basePrId === prId && q.status !== 'Cancelled');
}

export async function closeRfq(q: Rfq): Promise<Rfq> {
  return rfqs.save({ ...q, status: 'Closed' as RfqStatus });
}

export async function cancelRfq(q: Rfq): Promise<Rfq> {
  return rfqs.save({ ...q, status: 'Cancelled' as RfqStatus });
}

export async function recallRfq(q: Rfq): Promise<Rfq> {
  return rfqs.save({ ...q, status: 'Draft', approved: false });
}
