import { beforeEach, describe, expect, it } from 'vitest';

import { addRfq, addRfqs, cancelRfq, listRfqsForPr } from '../rfqs';
import { addPurchaseOrders, listPurchaseOrders, savePurchaseOrder } from '../purchaseOrders';
import { getPurchaseRequest, savePurchaseRequest } from '../purchaseRequests';
import { blankPurchaseRequest, newPrLine, type PurchaseRequest } from '../../mocks/purchaseRequests';
import { blankRfq, newRfqLine, type Rfq } from '../../mocks/rfqs';
import { awardedByPrLine, orderedByRfqLine, poDraftFromRfq, remainingToAward } from '../../pages/purchasing/shared/poFromRfq';

// Multi-vendor quotations: a request fanned out to several vendors isn't drawn down by their
// quotes, only by the purchase orders awarded from them — split across vendors if need be.

const BUYER = 'emp-buyer';
const TODAY = '2026-10-20';

/** A fresh Open request for 100 of one item. */
async function makeRequest(): Promise<PurchaseRequest> {
  return savePurchaseRequest({
    ...blankPurchaseRequest(TODAY, undefined, 'Tester'),
    requesterId: 'emp-1',
    lines: [newPrLine({ id: 'prl-mac', itemId: 'itm-mac', itemNo: 'MAC', quantity: 100, openQty: 100, warehouse: 'WH-002' })],
  });
}

/** One vendor's quotation for the request line, quoting `quotedQty` at `price`. */
const quote = (pr: PurchaseRequest, vendorId: string, quotedQty: number, price: number) => ({
  ...blankRfq(BUYER),
  vendorId,
  vendorName: vendorId.toUpperCase(),
  basePrId: pr.id,
  lines: [newRfqLine({ id: `rl-${vendorId}`, itemId: 'itm-mac', itemNo: 'MAC', quantity: 100, quotedQty, unitPrice: price, baseId: pr.id, baseLineId: 'prl-mac' })],
});

const prLine = async (id: string) => (await getPurchaseRequest(id))!.lines[0];

describe('multi-vendor RFQs', () => {
  beforeEach(() => localStorage.clear());

  it('addRfqs numbers each RFQ in sequence, past the series', async () => {
    const pr = await makeRequest();
    const before = await addRfq({ ...quote(pr, 'v-0', 0, 0), approved: true });
    const made = await addRfqs([quote(pr, 'v-a', 0, 0), quote(pr, 'v-b', 0, 0), { ...quote(pr, 'v-c', 0, 0), approved: false }]);
    expect(made.map((q) => q.docNum)).toEqual([before.docNum + 1, before.docNum + 2, before.docNum + 3]);
    expect(made.map((q) => q.status)).toEqual(['Open', 'Open', 'Not Confirmed']);
  });

  it("quotations don't draw the request down", async () => {
    const pr = await makeRequest();
    await addRfqs([quote(pr, 'v-a', 100, 1050), quote(pr, 'v-b', 50, 980), quote(pr, 'v-c', 75, 1010)]);
    expect((await prLine(pr.id)).openQty).toBe(100);
    expect((await getPurchaseRequest(pr.id))!.status).toBe('Open');
  });

  it('listRfqsForPr leaves out cancelled RFQs and other requests', async () => {
    const pr = await makeRequest();
    const other = await makeRequest();
    const [a, b] = await addRfqs([quote(pr, 'v-a', 1, 1), quote(pr, 'v-b', 1, 1), quote(other, 'v-c', 1, 1)]);
    await cancelRfq(b);
    expect((await listRfqsForPr(pr.id)).map((q) => q.id)).toEqual([a.id]);
  });

  it('a split award (50 from B + 50 from A) closes the line: 100 → 50 → 0', async () => {
    const pr = await makeRequest();
    const [a, b] = await addRfqs([quote(pr, 'v-a', 100, 1050), quote(pr, 'v-b', 50, 980), quote(pr, 'v-c', 75, 1010)]);
    const opts = { buyerId: BUYER, approved: true, today: TODAY, pr };

    const poB = poDraftFromRfq(b, { ...opts, lineQtys: { [b.lines[0].id]: 50 } });
    expect(poB.basePrId).toBe(pr.id);
    expect(poB.baseRfqId).toBe(b.id);
    expect(poB.lines).toHaveLength(1);
    expect(poB.lines[0]).toMatchObject({ quantity: 50, unitPrice: 980, baseLineId: 'prl-mac', warehouse: 'WH-002' });

    await savePurchaseOrder(poB);
    expect((await prLine(pr.id)).openQty).toBe(50);

    await savePurchaseOrder(poDraftFromRfq(a, { ...opts, lineQtys: { [a.lines[0].id]: 50 } }));
    const line = await prLine(pr.id);
    expect(line.openQty).toBe(0);
    expect(line.status).toBe('Closed');
    expect((await getPurchaseRequest(pr.id))!.status).toBe('Closed');
  });

  it("draft POs from a split award count against what's left, without drawing the request", async () => {
    const pr = await makeRequest();
    const [a, b] = (await addRfqs([quote(pr, 'v-a', 100, 1050), quote(pr, 'v-b', 50, 980)])) as [Rfq, Rfq];
    const opts = { buyerId: BUYER, approved: true, today: TODAY, pr };
    const drafts = await addPurchaseOrders([
      poDraftFromRfq(b, { ...opts, lineQtys: { [b.lines[0].id]: 50 } }),
      poDraftFromRfq(a, { ...opts, lineQtys: { [a.lines[0].id]: 30 } }),
    ]);
    expect(drafts.map((d) => [d.status, d.docNum])).toEqual([['Draft', 0], ['Draft', 0]]);

    const line = await prLine(pr.id);
    expect(line.openQty).toBe(100);
    const awarded = awardedByPrLine(await listPurchaseOrders(), pr.id);
    expect(awarded.get('prl-mac')).toBe(80);
    expect(remainingToAward(line, awarded)).toBe(20);
  });

  it('ordered qty: each quotation line shows what its added POs took; drafts and other quotes do not count', async () => {
    const pr = await makeRequest();
    const [a, b] = await addRfqs([quote(pr, 'v-a', 100, 1050), quote(pr, 'v-b', 50, 980)]);
    const opts = { buyerId: BUYER, approved: true, today: TODAY, pr };
    await savePurchaseOrder(poDraftFromRfq(b, { ...opts, lineQtys: { [b.lines[0].id]: 50 } }));
    await addPurchaseOrders([poDraftFromRfq(a, { ...opts, lineQtys: { [a.lines[0].id]: 30 } })]);

    const pos = await listPurchaseOrders();
    expect(orderedByRfqLine(pos, b).get(b.lines[0].id)).toBe(50);
    expect(orderedByRfqLine(pos, a).get(a.lines[0].id)).toBeUndefined();
    expect(orderedByRfqLine(pos, { lines: b.lines }).size).toBe(0);
  });

  it('without line quantities, the award takes what was quoted; a zero leaves the line out', () => {
    const rfq = { ...blankRfq(BUYER), lines: [newRfqLine({ id: 'x', itemId: 'i', quantity: 10, quotedQty: 7 }), newRfqLine({ id: 'y', itemId: 'j', quantity: 4 })] };
    expect(poDraftFromRfq(rfq, { buyerId: BUYER, approved: true, today: TODAY }).lines.map((l) => l.quantity)).toEqual([7, 4]);
    expect(poDraftFromRfq(rfq, { buyerId: BUYER, approved: true, today: TODAY, lineQtys: { x: 3, y: 0 } }).lines.map((l) => l.quantity)).toEqual([3]);
  });
});
