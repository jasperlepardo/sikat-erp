import { RFQ_SERIES, SEED_RFQS, type Rfq, type RfqLine, type RfqStatus } from '../mocks/rfqs';
import { rfqSeries, seriesLookup, formatDocNum } from './allSeries';
import { createCollection } from './store';
import { poTotals, type PoTotals } from './purchaseOrders';
import type { RoundingRule } from '../mocks/currencies';
import type { TaxCode } from '../mocks/taxes';
import { rateAt, vatNotPaidToVendor } from '../mocks/taxes';

const rfqs = createCollection<Rfq>('sikat-erp:rfqs:v1', SEED_RFQS, 'rfq');

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

const round2 = (n: number) => Math.round(n * 100) / 100;

export const lineNet = (l: Pick<RfqLine, 'requiredQty' | 'unitPrice' | 'discountPct'>) =>
  round2(l.requiredQty * l.unitPrice * (1 - l.discountPct / 100));

/** Footer totals in the document currency, using requiredQty as the volume basis. */
export function rfqTotals(
  q: Pick<Rfq, 'discountPct' | 'freight' | 'freightTaxCode'> & { lines: RfqLine[] },
  rateOf: (taxCode: string) => number,
  rounding: RoundingRule = 'No rounding',
  isReverseCharge: (taxCode: string) => boolean = () => false,
): PoTotals {
  // Map RfqLine → the shape poTotals expects, using requiredQty as quantity.
  const mapped = q.lines.map((l) => ({
    itemId: l.itemId,
    quantity: l.requiredQty,
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
  return rfqs.save({ ...input, status: 'Draft', docNum: 0 });
}

export async function addRfq(input: RfqInput): Promise<Rfq> {
  const all = await rfqs.list();
  const series = seriesOf(input.seriesId);
  const docNum =
    Math.max(series.firstNo - 1, ...all.filter((q) => q.seriesId === series.id && q.docNum).map((q) => q.docNum)) + 1;
  return rfqs.save({ ...input, docNum, status: 'Open' });
}

export async function saveRfq(input: RfqInput): Promise<Rfq> {
  return rfqs.save(input as Rfq);
}

export async function closeRfq(q: Rfq): Promise<Rfq> {
  return rfqs.save({ ...q, status: 'Closed' as RfqStatus });
}

export async function cancelRfq(q: Rfq): Promise<Rfq> {
  return rfqs.save({ ...q, status: 'Cancelled' as RfqStatus });
}

export async function markConvertedToPo(q: Rfq, poId: string): Promise<Rfq> {
  return rfqs.save({ ...q, convertedToPoId: poId, status: 'Closed' as RfqStatus });
}
