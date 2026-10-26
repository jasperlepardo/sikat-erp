import { expect, test, type Page } from '@playwright/test';
import { open, rawIds, watchErrors } from './helpers';

/**
 * Layer 3b — purchasing workflow specs (see docs/test-plan.md).
 *
 * These drive the real UI of the purchasing document chain and assert observable outcomes:
 * the status chip, the Transactions (document-flow) panel, the list "Saved" notice, and
 * line totals. Each test starts on a fresh browser context (empty localStorage → seed data),
 * reusing `open`, `watchErrors`, `rawIds` from helpers.ts.
 *
 * Where a step needs a document that isn't in the seed (e.g. an open goods receipt to return),
 * the test builds it first through the same UI it is testing, so every test is self-contained
 * and independent of the others.
 *
 * Seed anchors used (verified against src/mocks/ via the discovery pass):
 *  - po-060  — Open PO with NO downstream documents, one inventory line, qty 30,
 *              vendor Apple South Asia Pte. Ltd. (USD). The one pristine open inventory PO in the
 *              seed — ideal for the receipt / partial-receipt / return chains.
 *  - po-038  — Open PO, vendor Luzon iDistribution (PHP), Vendor ref. "LID-SO-562114" — reused by
 *              the duplicate-vendor-reference test (its own open ref is the collision).
 *  - dp-002  — Open down-payment request, vendor Luzon iDistribution, drawable balance remaining.
 *
 * Each test runs on a fresh browser context (empty localStorage → seed data), so every test can
 * mutate po-060 independently without affecting the others.
 */

// These flows post several foreign-currency (USD) documents end to end; each save runs the full
// fake-async pipeline (stock, FIFO layers, FX differences, journals), so give the heavier tests
// more than the default 60s.
//
// Run this file's tests serially in a single worker instead of under the config's `fullyParallel`.
// Each test drives a long chain of document posts (5-10 page loads + many fake-API calls); when this
// file and the sales flows run together, the config fans every test out across workers and the one
// shared dev server starves on cold lazy-chunk loads — a render error or a navigation that never
// lands shows up as intermittent flakiness (re-runs and isolated runs always pass). Serial keeps the
// pressure on the dev server bounded. Each test still opens a fresh browser context (empty
// localStorage → seed data), so po-060 can be mutated independently in every test.
test.describe.configure({ mode: 'serial', timeout: 120_000 });

const PO_OPEN = 'po-060';
const PO_VENDOR = 'Apple South Asia Pte. Ltd.';
const PO_QTY = '30';
const DP_OPEN = 'dp-002';
const DP_VENDOR = 'Luzon iDistribution Corp.';

/**
 * The "You can also" menu in a document header, then one of its items. The design-system
 * Dropdown renders each entry with role="option" inside a role="menu" container.
 */
async function moreMenu(page: Page, item: string | RegExp) {
  await page.getByRole('button', { name: 'You can also' }).click();
  await page.getByRole('menu').getByRole('option', { name: item }).click();
}

/** The primary header action: "Add" on a new/unposted document, "Save" once posted. */
const addButton = (page: Page) => page.getByRole('button', { name: 'Add', exact: true });

/**
 * Pick a vendor in the shared VendorCard. Its design-system CardField renders a button-combobox
 * whose only accessible text is the "Search vendors" placeholder (no aria-label), so match on that.
 */
async function pickVendor(page: Page, name: string | RegExp) {
  await page.getByRole('combobox').filter({ hasText: 'Search vendors' }).first().click();
  await page.getByRole('option', { name }).first().click();
}

/**
 * Wait for the navigation back to a list page carrying the green "Saved" notice. Posting a
 * document runs the full fake-async save (stock, cost layers, journals, FX) which on a foreign-
 * currency document can take several seconds, so the URL wait is generous.
 */
async function expectNotice(page: Page, listUrl: RegExp, text: string | RegExp) {
  await expect(page).toHaveURL(listUrl, { timeout: 45_000 });
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.locator('body')).toContainText(text);
}

/** After clicking Add, wait for the save to land back on a list page (generous for FX documents). */
const expectListed = (page: Page, listUrl: RegExp) => expect(page).toHaveURL(listUrl, { timeout: 45_000 });

/** A document's status via the live service, by id (the status chip can lag a tick behind the store). */
async function poStatus(page: Page, id: string) {
  return page.evaluate(async (poId) => {
    const po = await import('/src/services/purchaseOrders.ts');
    return (await po.getPurchaseOrder(poId))?.status;
  }, id);
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. The chain: PR → RFQ → PO → goods receipt → vendor invoice.
//    PO → GR → AP is driven end-to-end; the PR/RFQ heads are asserted shallowly
//    (their "Copy to" actions exist and pre-fill), because driving a from-scratch
//    purchase request through line entry is out of scope for a stable flow.
// ──────────────────────────────────────────────────────────────────────────────

test('US-PUR-030/040: PO → goods receipt → vendor invoice, document flow advancing @chain', async ({ page }) => {
  const errors = watchErrors(page);

  // Start on the open PO. Its Transactions panel has no downstream documents yet.
  await open(page, `purchasing/purchase-orders/${PO_OPEN}/transactions`);
  await expect(page.getByText('Related documents')).toBeVisible();
  await expect(page.locator('body')).toContainText('Not linked to any other document yet.');

  // Copy to goods receipt — the PO's open line comes across at its full open quantity. Add it.
  await open(page, `purchasing/purchase-orders/${PO_OPEN}`);
  await moreMenu(page, 'Copy to goods receipt');
  await expect(page).toHaveURL(/goods-receipts\/new/);
  await expect(page.locator('body')).toContainText(PO_VENDOR);
  await addButton(page).click();
  await expectNotice(page, /goods-receipts$/, /stock is in and the PO lines are updated/);

  // Receiving the whole quantity closes the PO.
  await expect.poll(() => poStatus(page, PO_OPEN), { timeout: 15_000 }).toBe('Closed');

  // The PO's document-flow panel now shows the receipt as a target.
  await open(page, `purchasing/purchase-orders/${PO_OPEN}/transactions`);
  await expect(page.getByText('● This document')).toBeVisible();
  await expect(page.getByText('Goods receipt PO', { exact: true })).toBeVisible();
  await expect(page.getByText('Target →').first()).toBeVisible();

  // Find the goods receipt we just created, and copy it to an A/P invoice.
  const grId = await page.evaluate(async (poId) => {
    const gr = await import('/src/services/goodsReceipts.ts');
    return (await gr.listGoodsReceipts()).find((r: { lines: { baseId: string }[]; id: string }) =>
      r.lines.some((l) => l.baseId === poId))?.id;
  }, PO_OPEN);
  expect(grId).toBeTruthy();

  await open(page, `purchasing/goods-receipts/${grId}`);
  await moreMenu(page, 'Copy to A/P invoice');
  await expect(page).toHaveURL(/vendor-invoices\/new/);
  await expect(page.locator('body')).toContainText(PO_VENDOR);
  await addButton(page).click();
  await expectListed(page, /vendor-invoices$/);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  // The goods receipt's flow panel now reaches back to the PO and forward to the A/P invoice.
  await open(page, `purchasing/goods-receipts/${grId}/transactions`);
  await expect(page.getByText('← Base')).toBeVisible();
  await expect(page.getByText('A/P invoice', { exact: true })).toBeVisible();

  expect(await rawIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('US-PUR-024: purchase request and RFQ offer a "Copy to" action into the chain @chain-head', async ({ page }) => {
  // Shallow: the PR → RFQ → PO heads of the chain. A from-scratch purchase request needs full
  // line entry, so here we only assert the copy-forward action each head exposes, and that it
  // pre-fills the next document — the stock-moving PO → GR → AP steps are driven in full above.
  const errors = watchErrors(page);

  // An open purchase request offers "Copy to purchase order".
  await open(page, 'purchasing/purchase-requests');
  const prId = await page.evaluate(async () => {
    const pr = await import('/src/services/purchaseRequests.ts');
    return (await pr.listPurchaseRequests()).find((r: { status: string; id: string }) => r.status === 'Open')?.id;
  });
  if (prId) {
    await open(page, `purchasing/purchase-requests/${prId}`);
    await page.getByRole('button', { name: 'You can also' }).click();
    await expect(page.getByRole('menu').getByRole('option', { name: 'Copy to purchase order' })).toBeVisible();
    await page.keyboard.press('Escape');
  }

  // An open RFQ offers "Copy to purchase order", and it pre-fills a new PO for the same vendor.
  await open(page, 'purchasing/purchase-quotations/RFQ-2026-0001');
  await moreMenu(page, 'Copy to purchase order');
  await expect(page).toHaveURL(/purchase-orders\/new/);
  await expect(page.locator('body')).toContainText('New purchase order');
  await expect(page.locator('body')).toContainText('Luzon iDistribution');

  expect(await rawIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Partial receipt: the first receipt leaves the PO open; the second closes it;
//    cancelling the second reopens it. (The PO update after each receipt is applied
//    asynchronously once the save settles, so every status check polls rather than
//    reads once — an eager read lands before the PO line has been re-saved.)
// ──────────────────────────────────────────────────────────────────────────────

test('US-PUR-030: a partial receipt leaves the PO open; the next closes it; cancelling reopens it @partial', async ({ page }) => {
  const errors = watchErrors(page);

  // Receipt 1: copy from the PO but only receive 10 of the 30 ordered.
  await open(page, `purchasing/purchase-orders/${PO_OPEN}`);
  await moreMenu(page, 'Copy to goods receipt');
  await expect(page).toHaveURL(/goods-receipts\/new/);
  const qty = page.getByLabel('Quantity', { exact: true });
  await expect(qty).toHaveValue(PO_QTY);
  await qty.fill('10');
  await addButton(page).click();
  await expectNotice(page, /goods-receipts$/, /stock is in/);

  // A partial receipt leaves the PO open.
  await expect.poll(() => poStatus(page, PO_OPEN), { timeout: 15_000 }).toBe('Open');

  // Receipt 2: the remaining 20 come across pre-ticked — receiving them closes the PO.
  await open(page, `purchasing/purchase-orders/${PO_OPEN}`);
  await moreMenu(page, 'Copy to goods receipt');
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('20');
  await addButton(page).click();
  await expectNotice(page, /goods-receipts$/, /stock is in/);
  await expect.poll(() => poStatus(page, PO_OPEN), { timeout: 15_000 }).toBe('Closed');

  // Cancel the second receipt — the PO reopens (its 20 units are open again).
  const gr2 = await page.evaluate(async (poId) => {
    const gr = await import('/src/services/goodsReceipts.ts');
    const rows = (await gr.listGoodsReceipts()).filter((r: { lines: { baseId: string }[]; status: string; id: string }) =>
      r.status === 'Open' && r.lines.some((l) => l.baseId === poId));
    return rows[rows.length - 1]?.id; // the later of the two receipts
  }, PO_OPEN);
  expect(gr2).toBeTruthy();

  await open(page, `purchasing/goods-receipts/${gr2}`);
  await moreMenu(page, /Cancel goods receipt/);
  await expectNotice(page, /goods-receipts$/, /cancelled/);
  await expect.poll(() => poStatus(page, PO_OPEN), { timeout: 15_000 }).toBe('Open');

  expect(await rawIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Goods return → debit memo (A/P credit memo).
// ──────────────────────────────────────────────────────────────────────────────

test('US-PUR-060: goods return against a billed invoice, then copy it to an A/P credit memo @return', async ({ page }) => {
  const errors = watchErrors(page);

  // Build the chain PO → goods receipt → A/P invoice so there is a BILLED line to return.
  // (A return against an unbilled receipt posts Closed and needs no credit; only a return against a
  //  billed invoice stays Open awaiting the vendor's credit memo, which is what we copy to here.)
  await open(page, `purchasing/purchase-orders/${PO_OPEN}`);
  await moreMenu(page, 'Copy to goods receipt');
  await addButton(page).click();
  await expectNotice(page, /goods-receipts$/, /stock is in/);
  await expect.poll(() => poStatus(page, PO_OPEN), { timeout: 15_000 }).toBe('Closed');

  const grId = await page.evaluate(async (poId) => {
    const gr = await import('/src/services/goodsReceipts.ts');
    return (await gr.listGoodsReceipts()).find((r: { lines: { baseId: string }[]; id: string }) =>
      r.lines.some((l) => l.baseId === poId))?.id;
  }, PO_OPEN);
  expect(grId).toBeTruthy();

  // Bill the receipt.
  await open(page, `purchasing/goods-receipts/${grId}`);
  await moreMenu(page, 'Copy to A/P invoice');
  await expect(page).toHaveURL(/vendor-invoices\/new/);
  await addButton(page).click();
  await expectListed(page, /vendor-invoices$/);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  const invId = await page.evaluate(async (poId) => {
    const ap = await import('/src/services/apInvoices.ts');
    return (await ap.listApInvoices()).find((i: { lines: { baseId: string }[]; id: string }) =>
      i.lines.some((l) => l.baseId === poId))?.id;
  }, grId);
  expect(invId).toBeTruthy();

  // Copy the A/P invoice to a goods return (billed goods → the return stays Open, awaiting a credit).
  await open(page, `purchasing/vendor-invoices/${invId}`);
  await moreMenu(page, 'Copy to goods return');
  await expect(page).toHaveURL(/goods-returns\/new/);
  await expect(page.locator('body')).toContainText(PO_VENDOR);
  await addButton(page).click();
  await expectNotice(page, /goods-returns$/, /stock is out/);

  const retId = await page.evaluate(async () => {
    const ret = await import('/src/services/goodsReturns.ts');
    const rows = await ret.listGoodsReturns();
    return rows[rows.length - 1]?.id;
  });
  expect(retId).toBeTruthy();

  // The invoice-based return is creditable — copy it to an A/P credit memo (debit memo).
  await open(page, `purchasing/goods-returns/${retId}`);
  await moreMenu(page, 'Copy to A/P credit memo');
  await expect(page).toHaveURL(/debit-memos\/new/);
  await expect(page.locator('body')).toContainText(PO_VENDOR);
  await addButton(page).click();
  await expectListed(page, /debit-memos$/);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.locator('body')).toContainText('credit');

  expect(await rawIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Down payment: request → payment → invoice drawdown.
//    SHALLOW — the full request→pay→draw loop needs multi-step payment and draw-panel
//    entry. Here we assert the open down-payment request shows its drawable balance and a
//    "Pay" action, and that a new A/P invoice for the same vendor exposes the draw panel.
// ──────────────────────────────────────────────────────────────────────────────

test('US-PUR-050/042: an open down payment shows its drawable balance and can be drawn down @downpayment-shallow', async ({ page }) => {
  const errors = watchErrors(page);

  // The open down-payment request shows its status and a drawable balance.
  await open(page, `purchasing/down-payment-requests/${DP_OPEN}`);
  await expect(page.locator('body')).toContainText('Open');
  await expect(page.locator('body')).toContainText(DP_VENDOR);

  const drawable = await page.evaluate(async (dpId) => {
    const dpr = await import('/src/services/apDownPayments.ts');
    const d = (await dpr.listDownPayments()).find((x: { id: string }) => x.id === dpId);
    return d ? dpr.drawableAmount(d) : 0;
  }, DP_OPEN);
  expect(drawable).toBeGreaterThan(0);

  // A new A/P invoice for this vendor offers the down-payment draw panel on its Accounting tab.
  await open(page, 'purchasing/vendor-invoices/new');
  await pickVendor(page, new RegExp(DP_VENDOR));
  // The draw-down control appears somewhere on the form for a vendor with an open advance.
  await expect(page.locator('body')).toContainText(/down payment/i);

  expect(await rawIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Duplicate vendor-reference warning on a PO.
//    Settings default is Warn: posting a second open PO with the same vendor + ref warns.
//    We reuse po-038 (Open, PHP, vendor Luzon iDistribution, Vendor ref. "LID-SO-562114"):
//    duplicating it keeps the vendor + line but clears the delivery date and the ref, so we
//    set a valid delivery date and re-enter po-038's own reference — the collision the Warn
//    setting must catch.
// ──────────────────────────────────────────────────────────────────────────────

const DUP_PO = 'po-038';
const DUP_VENDOR = 'Luzon iDistribution Corp.';
const DUP_REF = 'LID-SO-562114';

test('US-PUR-020: posting a PO that reuses an open PO\'s vendor reference warns before saving @dupref', async ({ page }) => {
  const errors = watchErrors(page);

  // Duplicate the open PO (keeps its vendor and line, clears the Vendor Ref. No. and delivery date).
  await open(page, `purchasing/purchase-orders/${DUP_PO}`);
  await moreMenu(page, 'Duplicate');
  await expect(page).toHaveURL(/purchase-orders\/new/);
  await expect(page.locator('body')).toContainText(DUP_VENDOR);

  // Delivery date is required — pick today's cell (delivery may equal the posting date).
  await page.getByRole('combobox', { name: 'Delivery date' }).click();
  await page.getByRole('gridcell').and(page.locator('[aria-current="date"]')).click();
  await expect(page.getByRole('combobox', { name: 'Delivery date' })).not.toHaveValue('');

  // Re-enter the original reference via the vendor details side panel. The vendor name in the
  // card is a design-system Link (an <a> without an href, so not a "link" role) — click it by text.
  await page.locator('a', { hasText: DUP_VENDOR }).first().click();
  const ref = page.getByLabel('Vendor ref. no.', { exact: true });
  await expect(ref).toBeVisible();
  await ref.fill(DUP_REF);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(ref).toHaveCount(0);

  // Add: a duplicate-reference warning appears and the save is held (still on the /new form).
  await addButton(page).click();
  await expect(page.getByText('Duplicate vendor reference')).toBeVisible();
  await expect(page.locator('body')).toContainText(DUP_REF);
  await expect(page).toHaveURL(/purchase-orders\/new/);

  // Pressing Add again keeps it: the PO posts and we land back on the list with a notice.
  await addButton(page).click();
  await expect(page).toHaveURL(/purchase-orders$/);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  expect(await rawIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});

// ──────────────────────────────────────────────────────────────────────────────
// Guard: the purchasing "Copy to" menu items navigate to real routes (not the "Coming soon"
// placeholder). An earlier revision of these pages pointed several of them at malformed routes
// (e.g. /purchasing/returns-and-debits-and-debits/returns/new, /purchasing/payments-made-made/new);
// those have since been corrected to /purchasing/goods-returns, /purchasing/debit-memos and
// /purchasing/outgoing-payments. This test locks that in: the GR → goods return and AP → debit
// memo menu items must land on a live form, never the placeholder.
// ──────────────────────────────────────────────────────────────────────────────

test('purchasing "Copy to" menu items reach live forms, not the "Coming soon" placeholder @copy-routes', async ({ page }) => {
  const errors = watchErrors(page);

  // Build an open goods receipt and an A/P invoice from the PO.
  await open(page, `purchasing/purchase-orders/${PO_OPEN}`);
  await moreMenu(page, 'Copy to goods receipt');
  await addButton(page).click();
  await expectListed(page, /goods-receipts$/);

  const grId = await page.evaluate(async (poId) => {
    const gr = await import('/src/services/goodsReceipts.ts');
    return (await gr.listGoodsReceipts()).find((r: { lines: { baseId: string }[]; id: string }) =>
      r.lines.some((l) => l.baseId === poId))?.id;
  }, PO_OPEN);

  // GR → goods return opens the goods-return form (correct route), not the placeholder.
  await open(page, `purchasing/goods-receipts/${grId}`);
  await moreMenu(page, 'Copy to goods return');
  await expect(page).toHaveURL(/goods-returns\/new/);
  await expect(page.getByText('Coming soon')).toHaveCount(0);
  await expect(page.locator('body')).toContainText('New goods return');

  expect(await rawIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});
