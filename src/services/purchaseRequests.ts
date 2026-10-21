import {
  PR_SERIES,
  SEED_PURCHASE_REQUESTS,
  type PrLine,
  type PurchaseRequest,
} from '../mocks/purchaseRequests';
import { createCollection } from './store';
import { prSeries, seriesLookup, formatDocNum } from './allSeries';
import { todayISO } from './dates';
import { snapshotItems } from './items';
import { LAST_PURCHASE_PRICE_LIST_ID, listPrice } from './priceLists';

/**
 * Seeded lines take their info price from the last-purchase list, as a new line does: item
 * cost comes from the replayed purchase history, so it can't be typed into the seed.
 */
const seedRequests = () => {
  const items = new Map(snapshotItems().map((i) => [i.id, i]));
  return SEED_PURCHASE_REQUESTS.map((pr) => ({
    ...pr,
    lines: pr.lines.map((l) => {
      const item = items.get(l.itemId);
      return item ? { ...l, unitPrice: listPrice(item, LAST_PURCHASE_PRICE_LIST_ID, l.uomCode) } : l;
    }),
  }));
};

const requests = createCollection<PurchaseRequest>('sikat-erp:purchase-requests', seedRequests, 'prq', { audit: 'PR' });

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
/** Quantity already copied to an RFQ or PO. A copied line keeps its item, UoM and warehouse. */
export const copiedQty = (l: Pick<PrLine, 'quantity' | 'openQty'>) => Math.max(0, l.quantity - l.openQty);
export const priceAfterDiscount = (l: Pick<PrLine, 'unitPrice' | 'discountPct'>) =>
  l.unitPrice * (1 - l.discountPct / 100);
export const lineNet = (l: Pick<PrLine, 'quantity' | 'unitPrice' | 'discountPct'>) =>
  Math.round(l.quantity * priceAfterDiscount(l) * 100) / 100;
export const inventoryQty = (l: PrLine) => l.quantity * (l.itemsPerUnit || 1);

/**
 * Display-only: collapse the Contents grid to one row per item, summing quantities
 * and nets. Grouped rows carry a synthetic `sum-…` id and an averaged `unitPrice`
 * so `lineNet` still ties to the summed net. The footer totals keep using the real
 * lines, so this never affects amounts — only how the grid is shown.
 */
export function summarizeLines(lines: PrLine[]): PrLine[] {
  const groups = new Map<string, PrLine[]>();
  for (const l of lines) {
    const key = l.itemId || l.id; // un-itemed rows stay separate
    const g = groups.get(key);
    if (g) g.push(l);
    else groups.set(key, [l]);
  }
  return [...groups.values()].map((g) => {
    if (g.length === 1) return g[0];
    const quantity = g.reduce((s, l) => s + l.quantity, 0);
    const openQty = g.reduce((s, l) => s + Math.max(0, l.openQty), 0);
    const net = g.reduce((s, l) => s + lineNet(l), 0);
    const first = g[0];
    return {
      ...first,
      id: `sum-${first.itemId || first.id}`,
      quantity,
      openQty,
      discountPct: 0,
      unitPrice: quantity ? net / quantity : 0,
    };
  });
}

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
  const beforeDiscount = round2(pr.lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0));
  const discount = round2(pr.lines.reduce((n, l) => n + l.quantity * l.unitPrice * (l.discountPct / 100), 0));
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
