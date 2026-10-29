import { expect, test, type Page } from '@playwright/test';
import { open, rawIds, screenText, watchErrors } from './helpers';

/**
 * Layer 3b — multi-vendor RFQ workflow specs (docs/multi-vendor-rfq-plan.md).
 *
 * The three behaviours the feature added, which the smoke sweep (rfq.spec.ts) and the comparison
 * read-check (purchasing.flows.spec.ts US-PUR-025) don't drive:
 *   @fanout      — "Create purchase quotations…" fans one numbered quotation out to each candidate
 *                  vendor, routed the lines it carries, WITHOUT drawing the request down.
 *   @award-split — awarding part of a line from one vendor's quote draws the request down (only the
 *                  award — a PO — draws, never the quote), and caps what a later award can take.
 *   @award-panel — the single-vendor "Create purchase order from a quote" path opens one PO
 *                  pre-filled at the quoted quantities.
 *
 * Seed anchors (verified against src/mocks/, SEED_AS_OF 2026-10-09):
 *  - prq-001 — Open request, candidate vendors bp-016 (Luzon iDistribution, PHP) and bp-017 (Apple
 *              South Asia, USD). Three iPhone lines, each linked to BOTH vendors (items.ts:
 *              defaultVendorId bp-016 + vendors[bp-017]), needing 20 / 20 / 10:
 *                prq-001-1 IPH-18P-256-BLK  20
 *                prq-001-2 IPH-18P-256-SLV  20
 *                prq-001-3 IPH-18PM-512-GLC 10
 *  - RFQ-2026-0001 (rfq-001) — Luzon's Open quote on prq-001: 20 / 15 / 10.
 *  - RFQ-2026-0007 (rfq-008) — Apple's Open quote on prq-001: 12 / 20 / 0 (Pro Max still awaiting).
 *
 * Each test runs on a fresh browser context (empty localStorage → seed data), so prq-001 can be
 * mutated independently. Reuses open/watchErrors/rawIds/screenText from helpers.ts.
 */

// Trace capture races on artifact files under load and can fail teardown with ENOENT without a real
// assertion failure (same as sales.flows.spec.ts); turn it off for this file.
test.use({ trace: 'off' });

const PR = 'purchasing/purchase-requests/prq-001';
const LUZON = /Luzon iDistribution/;
const APPLE = /Apple South Asia/;

/**
 * Open the ⋯ ("More actions") header menu, then select one of its items. The DetailActions MoreMenu
 * renders each entry with role="option" inside a role="menu" container (as in purchasing.flows.spec.ts).
 */
async function moreMenu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menu').getByRole('option', { name: item }).click();
}

/** Pick a vendor's quotation in the Award panel's "Vendor quotation" combobox, by vendor name. */
async function pickQuotation(page: Page, name: RegExp) {
  await page.getByRole('combobox', { name: 'Vendor quotation' }).click();
  await page.getByRole('option', { name }).first().click();
}

/** The Award panel's per-item award-qty field (role spinbutton — it is a number input). */
const awardField = (page: Page, itemNo: string) =>
  page.getByRole('spinbutton', { name: `Award quantity of ${itemNo}` });

/** The request's quotations via the live service: id, number, status and vendor (excludes Cancelled). */
function rfqsForPr(page: Page, prId: string) {
  return page.evaluate(async (id) => {
    const { listRfqsForPr } = await import('/src/services/rfqs.ts');
    return (await listRfqsForPr(id)).map((q: { id: string; docNum: number; status: string; vendorName: string }) => ({
      id: q.id,
      docNum: q.docNum,
      status: q.status,
      vendorName: q.vendorName,
    }));
  }, prId);
}

/** The sum of the request's open quantities — the number a quote must NOT move, only an award. */
function prOpenTotal(page: Page, prId: string) {
  return page.evaluate(async (id) => {
    const { getPurchaseRequest } = await import('/src/services/purchaseRequests.ts');
    const pr = await getPurchaseRequest(id);
    return pr ? pr.lines.reduce((n: number, l: { openQty?: number; quantity: number }) => n + (l.openQty ?? l.quantity), 0) : -1;
  }, prId);
}

/** One request line's open quantity, by line id. */
function prLineOpen(page: Page, prId: string, lineId: string) {
  return page.evaluate(async ([id, lid]) => {
    const { getPurchaseRequest } = await import('/src/services/purchaseRequests.ts');
    const pr = await getPurchaseRequest(id);
    return pr?.lines.find((l: { id: string }) => l.id === lid)?.openQty ?? -1;
  }, [prId, lineId]);
}

/** The request's status via the live service (the chip can lag the store a tick). */
function prStatus(page: Page, prId: string) {
  return page.evaluate(async (id) => {
    const { getPurchaseRequest } = await import('/src/services/purchaseRequests.ts');
    return (await getPurchaseRequest(id))?.status;
  }, prId);
}

// Run serially in one worker (as the other flow files do): each test drives several page loads +
// fake-API calls, and fanning them across workers starves the single dev server on cold chunk loads.
test.describe.configure({ mode: 'serial', timeout: 120_000 });

test('@fanout: "Create purchase quotations" fans one numbered quote out to each vendor, without drawing the request', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, PR);

  // Baseline: the two seeded quotes (Luzon + Apple), and the request's open quantities (20+20+10).
  const before = await rfqsForPr(page, 'prq-001');
  const openBefore = await prOpenTotal(page, 'prq-001');
  expect(before).toHaveLength(2);
  expect(openBefore).toBe(50);

  // Open the fan-out panel. Both candidate vendors come pre-ticked, each routed the iPhone lines it
  // carries, with the "quotes don't draw" promise spelled out.
  await moreMenu(page, /Create purchase quotations/);
  await expect(page.locator('body')).toContainText(/Quotes.*reduce the request.*open quantities/);
  await expect(page.locator('body')).toContainText('Luzon iDistribution Corp.');
  await expect(page.locator('body')).toContainText('Apple South Asia Pte. Ltd.');

  // The primary names how many it will create — both vendors carry all three lines, so two.
  const create = page.getByRole('button', { name: /Create \d+ purchase quotation/ });
  const count = Number((await create.textContent())!.match(/\d+/)![0]);
  expect(count).toBe(2);
  await create.click();

  // The success notice shows and the view switches to Comparison — no navigation away from the
  // request. The notice reflects the quotations actually created (the batch service's return): one
  // per vendor, named.
  await expect(page.getByText('Sent', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('body')).toContainText(`${count} purchase quotations created`);
  await expect(page.locator('body')).toContainText('Luzon iDistribution Corp.');
  await expect(page.locator('body')).toContainText('Apple South Asia Pte. Ltd.');

  // The crux of the design: a quote never draws the request down — only an award (a PO) does. The
  // open quantities are untouched after fanning out.
  expect(await prOpenTotal(page, 'prq-001')).toBe(openBefore);

  // The two new quotations are persisted, numbered, and Open (approvals off) or Not Confirmed.
  await expect.poll(() => rfqsForPr(page, 'prq-001').then((r) => r.length), { timeout: 30_000 }).toBe(before.length + count);
  const created = (await rfqsForPr(page, 'prq-001')).filter((q) => !before.some((b) => b.id === q.id));
  for (const q of created) {
    expect(q.docNum).toBeGreaterThan(0);
    expect(['Open', 'Not Confirmed']).toContain(q.status);
  }
  expect(new Set(created.map((q) => q.docNum)).size).toBe(created.length); // distinct numbers

  expect(await rawIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('@award-split: awarding part of a line draws the request down and caps a later award at what is left', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, PR);

  // Award 15 of the 20 Black iPhones from Luzon's quote; drop the other two lines (set them to 0).
  await moreMenu(page, /Create purchase order from a quote/);
  await pickQuotation(page, LUZON);
  await awardField(page, 'IPH-18P-256-BLK').fill('15');
  await awardField(page, 'IPH-18P-256-SLV').fill('0');
  await awardField(page, 'IPH-18PM-512-GLC').fill('0');
  await page.getByRole('button', { name: 'Create purchase order', exact: true }).click();

  // Lands on a PO pre-filled for Luzon (PHP, warehouse carried from the request). Set the delivery
  // date — required to post — to today, then create it.
  await expect(page).toHaveURL(/purchase-orders\/new/);
  await expect.poll(() => screenText(page), { timeout: 15_000 }).toContain('Luzon iDistribution');
  await page.getByRole('combobox', { name: 'Delivery date' }).click();
  await page.getByRole('gridcell').and(page.locator('[aria-current="date"]')).click();
  await page.getByRole('button', { name: /^Create purchase order$/ }).click();
  await expect(page).toHaveURL(/purchase-orders$/, { timeout: 45_000 });
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  // The award — and only the award — drew the Black-iPhone line down: 20 needed, 15 ordered, 5 open.
  await expect.poll(() => prLineOpen(page, 'prq-001', 'prq-001-1'), { timeout: 15_000 }).toBe(5);
  await expect.poll(() => prStatus(page, 'prq-001'), { timeout: 15_000 }).toBe('Open'); // partly awarded

  // Re-open the award panel: Luzon's Black line now defaults to — and is capped at — the 5 left,
  // not its 20 quoted (remainingToAward counts the PO already raised).
  await open(page, PR);
  await moreMenu(page, /Create purchase order from a quote/);
  await pickQuotation(page, LUZON);
  await expect(awardField(page, 'IPH-18P-256-BLK')).toHaveValue('5');
  await expect(page.locator('body')).toContainText('/ 5');

  // A second vendor can cover the remainder: Apple quoted 12 Black, but is likewise capped to the 5
  // left on the request — the split and the draw-down are cross-vendor.
  await pickQuotation(page, APPLE);
  await expect(awardField(page, 'IPH-18P-256-BLK')).toHaveValue('5');

  expect(errors).toEqual([]);
});

test('@award-panel: a single-vendor award opens one PO pre-filled at the quoted quantities', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, PR);

  await moreMenu(page, /Create purchase order from a quote/);
  await pickQuotation(page, LUZON);

  // Luzon's three quoted lines, each award defaulting to the quoted qty (capped by what's left —
  // the full need here): Black 20, Silver 15, Pro Max 10.
  await expect(awardField(page, 'IPH-18P-256-BLK')).toHaveValue('20');
  await expect(awardField(page, 'IPH-18P-256-SLV')).toHaveValue('15');
  await expect(awardField(page, 'IPH-18PM-512-GLC')).toHaveValue('10');

  await page.getByRole('button', { name: 'Create purchase order', exact: true }).click();

  // One PO, pre-filled from the quotation: the vendor and its quoted lines carry across.
  await expect(page).toHaveURL(/purchase-orders\/new/);
  await expect(page.getByText('Coming soon')).toHaveCount(0);
  await expect.poll(() => screenText(page), { timeout: 15_000 }).toContain('Luzon iDistribution');
  await expect.poll(() => screenText(page), { timeout: 15_000 }).toContain('IPH-18P-256-BLK');

  expect(await rawIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});
