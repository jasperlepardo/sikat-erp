/**
 * Goods return requests: numbering on save, totals, close, and how goods returns drawn from a
 * request lower (and on cancel, release) its open quantities.
 */
import { describe, expect, it } from 'vitest';
import { SEED_GOODS_RETURN_REQUESTS, type GoodsReturnRequest } from '../../mocks/goodsReturnRequests';
import {
  applyGrrConsumption, closeGoodsReturnRequest, drawnQty, getGoodsReturnRequest, grrNumber, grrTotals, listGoodsReturnRequests,
  openQty, saveGoodsReturnRequest,
} from '../goodsReturnRequests';

const seed = { ...SEED_GOODS_RETURN_REQUESTS[0], id: 'grr-001' } as GoodsReturnRequest;
const line = seed.lines[0];

/** A two-line request: 5 and 3 units open. */
const twoLines = (): Omit<GoodsReturnRequest, 'id'> => {
  const { id: _id, ...rest } = seed;
  return {
    ...rest,
    docNum: 0,
    lines: [
      { ...line, id: 'l1', quantity: 5, openQty: 5, status: 'Open' },
      { ...line, id: 'l2', quantity: 3, openQty: 3, status: 'Open' },
    ],
  };
};

const gr = (baseGrrId: string, status: string, lines: { grrLineId?: string; quantity: number }[]) => ({ baseGrrId, status, lines });

describe('goods return request line math and totals', () => {
  it('open and drawn quantities never go below zero', () => {
    expect(openQty({ ...line, openQty: -2 })).toBe(0);
    expect(openQty({ ...line, openQty: 2 })).toBe(2);
    expect(drawnQty({ quantity: 5, openQty: 2 })).toBe(3);
    expect(drawnQty({ quantity: 1, openQty: 4 })).toBe(0);
  });

  it('totals goods less the discount plus VAT, with no freight', () => {
    const t = grrTotals({ lines: [{ ...line, quantity: 2, unitPrice: 1000, discountPct: 0, taxCode: 'IVAT' }], discountPct: 10 }, () => 12);
    expect(t.beforeDiscount).toBe(2000);
    expect(t.total).toBe(2016); // 1,800 + 12%
    const reverse = grrTotals({ lines: [{ ...line, quantity: 2, unitPrice: 1000, discountPct: 0, taxCode: 'IMVAT' }], discountPct: 0 }, () => 12, () => true);
    expect(reverse.total).toBe(2000);
  });

  it('numbers from its series', () => {
    expect(grrNumber(seed)).toBe('GRR-2026-0001');
  });
});

describe('goods return request lifecycle', () => {
  it('lists the seed and finds by id or number', async () => {
    expect((await listGoodsReturnRequests()).map((r) => r.id)).toContain('grr-001');
    expect((await getGoodsReturnRequest('grr-001'))?.id).toBe('grr-001');
    expect((await getGoodsReturnRequest('GRR-2026-0001'))?.id).toBe('grr-001');
    expect(await getGoodsReturnRequest('nope')).toBeNull();
  });

  it('numbers a new request with the first free number, keeps a given one, and keeps edits unnumbered', async () => {
    const a = await saveGoodsReturnRequest(twoLines());
    expect(a.docNum).toBe(2);
    const b = await saveGoodsReturnRequest({ ...twoLines(), docNum: 40 });
    expect(b.docNum).toBe(40);
    const edited = await saveGoodsReturnRequest({ ...a, docNum: 0 });
    expect(edited.docNum).toBe(0);
  });

  it('closes every line', async () => {
    const r = await saveGoodsReturnRequest(twoLines());
    const closed = await closeGoodsReturnRequest(r);
    expect(closed.status).toBe('Closed');
    expect(closed.closeDate).toBe('2026-06-15');
    expect(closed.lines.every((l) => l.status === 'Closed' && l.openQty === 0)).toBe(true);
  });
});

describe('goods returns drawn from a request', () => {
  it('lowers open quantities, closes lines and the request when all are drawn, and releases them on cancel', async () => {
    const r = await saveGoodsReturnRequest(twoLines());

    const partial = gr(r.id, 'Open', [{ grrLineId: 'l1', quantity: 5 }, { grrLineId: 'l2', quantity: 1 }, { quantity: 9 }]);
    await applyGrrConsumption(undefined, partial);
    let now = (await getGoodsReturnRequest(r.id))!;
    expect(now.lines.map((l) => [l.openQty, l.status])).toEqual([[0, 'Closed'], [2, 'Open']]);
    expect(now.status).toBe('Open');

    const full = gr(r.id, 'Open', [{ grrLineId: 'l1', quantity: 5 }, { grrLineId: 'l2', quantity: 3 }]);
    await applyGrrConsumption(partial, full);
    now = (await getGoodsReturnRequest(r.id))!;
    expect(now.status).toBe('Closed');
    expect(now.closeDate).toBe('2026-06-15');

    // Cancelling the goods return gives everything back.
    await applyGrrConsumption(full, { ...full, status: 'Cancelled' });
    now = (await getGoodsReturnRequest(r.id))!;
    expect(now.lines.map((l) => l.openQty)).toEqual([5, 3]);
    expect([now.status, now.closeDate]).toEqual(['Open', '']);
  });

  it('ignores drafts, no-op changes, unknown requests and unknown lines', async () => {
    const r = await saveGoodsReturnRequest(twoLines());
    await applyGrrConsumption(undefined, undefined);
    await applyGrrConsumption(undefined, gr(r.id, 'Draft', [{ grrLineId: 'l1', quantity: 1 }]));
    const same = gr(r.id, 'Open', [{ grrLineId: 'l1', quantity: 1 }]);
    await applyGrrConsumption(same, same);
    await applyGrrConsumption(undefined, gr('grr-gone', 'Open', [{ grrLineId: 'l1', quantity: 1 }]));
    await applyGrrConsumption(undefined, gr(r.id, 'Open', [{ grrLineId: 'nope', quantity: 1 }]));
    const now = (await getGoodsReturnRequest(r.id))!;
    expect(now.lines.map((l) => l.openQty)).toEqual([5, 3]);
  });
});
