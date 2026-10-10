import {
  PR_SERIES,
  SEED_PURCHASE_REQUESTS,
  type PrLine,
  type PurchaseRequest,
} from '../mocks/purchaseRequests';
import { createCollection } from './store';
import { prSeries, seriesLookup, formatDocNum } from './allSeries';
import { todayISO } from './dates';

const requests = createCollection<PurchaseRequest>('sikat-erp:purchase-requests', SEED_PURCHASE_REQUESTS, 'prq');

export { prSeries };

export const listPurchaseRequests = requests.list;
export async function getPurchaseRequest(idOrNumber: string) {
  const direct = await requests.get(idOrNumber);
  if (direct) return direct;
  const all = await requests.list();
  return all.find((r) => prNumber(r) === idOrNumber) ?? null;
}
export const resetPurchaseRequests = requests.reset;

export type PrInput = Omit<PurchaseRequest, 'id'> & { id?: string };

export const seriesOf = (id: string) => seriesLookup(prSeries, id, PR_SERIES);

export const prNumber = (pr: Pick<PurchaseRequest, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(seriesOf(pr.seriesId), pr.docNum, pr.postingDate);

// ── Line math ────────────────────────────────────────────────────────────────

export const openQty = (l: PrLine) => Math.max(0, l.openQty);
export const priceAfterDiscount = (l: Pick<PrLine, 'infoPrice' | 'discountPct'>) =>
  l.infoPrice * (1 - l.discountPct / 100);
export const lineNet = (l: Pick<PrLine, 'requiredQty' | 'infoPrice' | 'discountPct'>) =>
  Math.round(l.requiredQty * priceAfterDiscount(l) * 100) / 100;
export const inventoryQty = (l: PrLine) => l.requiredQty * (l.itemsPerUnit || 1);

// ── Totals ────────────────────────────────────────────────────────────────────

export interface PrTotals {
  beforeDiscount: number;
  discount: number;
  freight: number;
  tax: number;
  total: number;
}

export function prTotals(
  pr: Pick<PurchaseRequest, 'freight' | 'lines'>,
  rateOf: (taxCode: string) => number,
): PrTotals {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const beforeDiscount = round2(pr.lines.reduce((n, l) => n + l.requiredQty * l.infoPrice, 0));
  const discount = round2(pr.lines.reduce((n, l) => n + l.requiredQty * l.infoPrice * (l.discountPct / 100), 0));
  const net = round2(beforeDiscount - discount);
  const tax = round2(
    pr.lines.reduce((n, l) => {
      const rate = rateOf(l.taxCode);
      return n + round2(lineNet(l) * (rate / 100));
    }, 0),
  );
  const freight = pr.freight ?? 0;
  return {
    beforeDiscount,
    discount,
    freight,
    tax,
    total: round2(net + freight + tax),
  };
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function savePurchaseRequest(input: PrInput): Promise<PurchaseRequest> {
  const isNew = !input.id;
  if (isNew && !input.docNum) {
    const series = seriesOf(input.seriesId);
    if (!series.manual) {
      const all = await requests.list();
      const used = new Set(
        all.filter((r) => r.seriesId === input.seriesId).map((r) => r.docNum),
      );
      let next = series.firstNo ?? 1;
      while (used.has(next)) next++;
      input = { ...input, docNum: next };
    }
  }
  return requests.save(input);
}

export async function closePurchaseRequest(pr: PurchaseRequest): Promise<PurchaseRequest> {
  return requests.save({
    ...pr,
    status: 'Closed',
    closeDate: todayISO(),
    lines: pr.lines.map((l) => ({ ...l, status: 'Closed' as const, openQty: 0 })),
  });
}
