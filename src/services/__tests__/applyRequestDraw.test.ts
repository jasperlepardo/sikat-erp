import { describe, it, expect } from 'vitest';

import { applyRequestDraw, getPurchaseRequest, savePurchaseRequest } from '../purchaseRequests';
import { blankPurchaseRequest, newPrLine, type PurchaseRequest } from '../../mocks/purchaseRequests';

// applyRequestDraw writes back how much of a purchase request a purchase order has drawn,
// from the PO's before/after states. These tests drive it with plain PO-shaped objects — the
// function reads only basePrId, status and each line's baseLineId/quantity — and assert the
// request's stored open quantities and statuses.

/** A fresh Open request with two lines: A1 qty 10 and B1 qty 5, both fully open. */
async function makeRequest(): Promise<PurchaseRequest> {
  return savePurchaseRequest({
    ...blankPurchaseRequest('2026-06-01', undefined, 'Tester'),
    requesterId: 'emp-1',
    lines: [
      newPrLine({ id: 'prl-1', itemId: 'itm-1', itemNo: 'A1', quantity: 10, openQty: 10 }),
      newPrLine({ id: 'prl-2', itemId: 'itm-2', itemNo: 'B1', quantity: 5, openQty: 5 }),
    ],
  });
}

/** A purchase-order-shaped consumption source referencing `prId`. */
const po = (prId: string, status: string, picks: [string, number][]) => ({
  basePrId: prId,
  status,
  lines: picks.map(([baseLineId, quantity]) => ({ baseLineId, quantity })),
});

const lineOf = (pr: PurchaseRequest, id: string) => pr.lines.find((l) => l.id === id)!;

describe('applyRequestDraw', () => {
  it('decrements the matched request line and closes it once fully ordered', async () => {
    const pr = await makeRequest();
    await applyRequestDraw(undefined, po(pr.id, 'Open', [['prl-1', 10]]));

    const r = (await getPurchaseRequest(pr.id))!;
    expect(lineOf(r, 'prl-1').openQty).toBe(0);
    expect(lineOf(r, 'prl-1').status).toBe('Closed');
    // Untouched line is left exactly as it was.
    expect(lineOf(r, 'prl-2').openQty).toBe(5);
    expect(lineOf(r, 'prl-2').status).toBe('Open');
    // One line still open, so the request stays open.
    expect(r.status).toBe('Open');
  });

  it('leaves the line open on a partial order', async () => {
    const pr = await makeRequest();
    await applyRequestDraw(undefined, po(pr.id, 'Open', [['prl-1', 4]]));

    const r = (await getPurchaseRequest(pr.id))!;
    expect(lineOf(r, 'prl-1').openQty).toBe(6);
    expect(lineOf(r, 'prl-1').status).toBe('Open');
    expect(r.status).toBe('Open');
  });

  it('closes the whole request when every line is fully ordered', async () => {
    const pr = await makeRequest();
    await applyRequestDraw(undefined, po(pr.id, 'Open', [['prl-1', 10], ['prl-2', 5]]));

    const r = (await getPurchaseRequest(pr.id))!;
    expect(lineOf(r, 'prl-1').status).toBe('Closed');
    expect(lineOf(r, 'prl-2').status).toBe('Closed');
    expect(r.status).toBe('Closed');
    expect(r.closeDate).toBeTruthy();
  });

  it('restores open quantities and reopens the request when the PO is cancelled', async () => {
    const pr = await makeRequest();
    const ordered = po(pr.id, 'Open', [['prl-1', 10], ['prl-2', 5]]);
    await applyRequestDraw(undefined, ordered);
    // Same lines, now Cancelled: the before/after diff releases everything.
    await applyRequestDraw(ordered, po(pr.id, 'Cancelled', [['prl-1', 10], ['prl-2', 5]]));

    const r = (await getPurchaseRequest(pr.id))!;
    expect(lineOf(r, 'prl-1').openQty).toBe(10);
    expect(lineOf(r, 'prl-1').status).toBe('Open');
    expect(lineOf(r, 'prl-2').openQty).toBe(5);
    expect(r.status).toBe('Open');
    expect(r.closeDate).toBe('');
  });

  it('releases the quantity when the PO is recalled to Draft', async () => {
    const pr = await makeRequest();
    const ordered = po(pr.id, 'Open', [['prl-1', 6]]);
    await applyRequestDraw(undefined, ordered);
    await applyRequestDraw(ordered, po(pr.id, 'Draft', [['prl-1', 6]]));

    const r = (await getPurchaseRequest(pr.id))!;
    expect(lineOf(r, 'prl-1').openQty).toBe(10);
    expect(lineOf(r, 'prl-1').status).toBe('Open');
  });

  it('never drives an over-ordered line below zero', async () => {
    const pr = await makeRequest();
    // More than the 10 open: clamps at 0 and closes the line.
    await applyRequestDraw(undefined, po(pr.id, 'Open', [['prl-1', 99]]));

    const r = (await getPurchaseRequest(pr.id))!;
    expect(lineOf(r, 'prl-1').openQty).toBe(0);
    expect(lineOf(r, 'prl-1').status).toBe('Closed');
  });

  it('does nothing when the order has no basePrId', async () => {
    const pr = await makeRequest();
    await applyRequestDraw(undefined, { status: 'Open', lines: [{ baseLineId: 'prl-1', quantity: 10 }] });

    const r = (await getPurchaseRequest(pr.id))!;
    expect(lineOf(r, 'prl-1').openQty).toBe(10);
    expect(r.status).toBe('Open');
  });

  it('does not draw while the document is still a draft', async () => {
    const pr = await makeRequest();
    await applyRequestDraw(undefined, po(pr.id, 'Draft', [['prl-1', 10]]));

    const r = (await getPurchaseRequest(pr.id))!;
    expect(lineOf(r, 'prl-1').openQty).toBe(10);
    expect(lineOf(r, 'prl-1').status).toBe('Open');
  });

  it('draws while a quotation is Not Confirmed (pending approval)', async () => {
    const pr = await makeRequest();
    await applyRequestDraw(undefined, po(pr.id, 'Not Confirmed', [['prl-1', 10]]));

    const r = (await getPurchaseRequest(pr.id))!;
    expect(lineOf(r, 'prl-1').openQty).toBe(0);
    expect(lineOf(r, 'prl-1').status).toBe('Closed');
  });
});
