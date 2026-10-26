import {
  GRR_SERIES,
  SEED_GOODS_RETURN_REQUESTS,
  type GoodsReturnRequest,
  type GrrLine,
} from '../mocks/goodsReturnRequests';
import { createCollection } from './store';
import { grrSeries, seriesLookup, formatDocNum } from './allSeries';
import { todayISO } from './dates';
import { round4 } from './num';

const seedGrrs = (): GoodsReturnRequest[] =>
  SEED_GOODS_RETURN_REQUESTS.map((r, i) => ({ ...r, id: `grr-${String(i + 1).padStart(3, '0')}` }));

const requests = createCollection<GoodsReturnRequest>(
  'sikat-erp:goods-return-requests',
  seedGrrs,
  'grr',
  { audit: 'GRR' },
);

export const listGoodsReturnRequests = requests.list;
export async function getGoodsReturnRequest(idOrNumber: string) {
  const direct = await requests.get(idOrNumber);
  if (direct) return direct;
  const all = await requests.list();
  return all.find((r) => grrNumber(r) === idOrNumber) ?? null;
}

export type GrrInput = Omit<GoodsReturnRequest, 'id'> & { id?: string };

const seriesOf = (id: string) => seriesLookup(grrSeries, id, GRR_SERIES);

export const grrNumber = (r: Pick<GoodsReturnRequest, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(seriesOf(r.seriesId), r.docNum, r.postingDate);

// ── Line math ─────────────────────────────────────────────────────────────────

/** @public */
export const openQty = (l: GrrLine) => Math.max(0, l.openQty);
/** @public */
export const drawnQty = (l: Pick<GrrLine, 'quantity' | 'openQty'>) => Math.max(0, l.quantity - l.openQty);

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveGoodsReturnRequest(input: GrrInput): Promise<GoodsReturnRequest> {
  const isNew = !input.id;
  if (isNew && !input.docNum) {
    const series = seriesOf(input.seriesId);
    if (!series.manual) {
      const all = await requests.list();
      const used = new Set(all.filter((r) => r.seriesId === input.seriesId).map((r) => r.docNum));
      let next = series.firstNo ?? 1;
      while (used.has(next)) next++;
      input = { ...input, docNum: next };
    }
  }
  return requests.save(input);
}

export async function closeGoodsReturnRequest(grr: GoodsReturnRequest): Promise<GoodsReturnRequest> {
  return requests.save({
    ...grr,
    status: 'Closed',
    closeDate: todayISO(),
    lines: grr.lines.map((l) => ({ ...l, status: 'Closed' as const, openQty: 0 })),
  });
}

// ── Consumption by Goods Returns ────────────────────────────────────────────────

interface GrConsumptionSource {
  baseGrrId?: string;
  status: string;
  lines: { grrLineId?: string; quantity: number }[];
}

function drawnByGr(gr: GrConsumptionSource | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!gr || gr.status === 'Draft' || gr.status === 'Cancelled') return out;
  for (const l of gr.lines) if (l.grrLineId) out.set(l.grrLineId, (out.get(l.grrLineId) ?? 0) + l.quantity);
  return out;
}

/**
 * Write back how much of a Goods Return Request an actual Goods Return has drawn —
 * mirrors `applyRequestDraw`. Adding a GR from a request lowers its open quantities;
 * cancelling or recalling releases them.
 */
export async function applyGrrConsumption(
  before: GrConsumptionSource | undefined,
  after: GrConsumptionSource | undefined,
): Promise<void> {
  const grrId = after?.baseGrrId || before?.baseGrrId;
  if (!grrId) return;

  const delta = new Map(drawnByGr(after));
  for (const [lineId, qty] of drawnByGr(before)) delta.set(lineId, (delta.get(lineId) ?? 0) - qty);
  const changes = [...delta].filter(([, d]) => Math.abs(d) > 0.0001);
  if (!changes.length) return;

  const grr = await requests.get(grrId);
  if (!grr) return;
  const lines = grr.lines.map((l) => ({ ...l }));
  for (const [lineId, d] of changes) {
    const pl = lines.find((x) => x.id === lineId);
    if (!pl) continue;
    pl.openQty = Math.max(0, round4(pl.openQty - d));
    pl.status = pl.openQty <= 0 ? 'Closed' : 'Open';
  }
  const allClosed = lines.every((l) => l.status === 'Closed');
  const status = allClosed ? 'Closed' : 'Open';
  const closeDate = allClosed ? grr.closeDate || todayISO() : '';
  await requests.save({ ...grr, status, closeDate, lines });
}
