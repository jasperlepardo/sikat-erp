import { expect, test, type Page } from '@playwright/test';
import { open, rawIds, screenText, watchErrors } from './helpers';

/**
 * Layer 3b — sales workflow specs (docs/test-plan.md).
 *
 * Each test drives a real sales chain through the UI and asserts an observable outcome: a status
 * chip, the success notice on the list it lands on, the document-flow panel, or a balance total.
 * Every test starts on a fresh app (a new browser context, so localStorage is empty and the seed
 * loads), reusing `open`, `watchErrors` and `rawIds` from helpers.
 *
 * Seed ids used as entry points are verified by grepping src/mocks: qt-007 is the one clean Open
 * quotation; so-006 is an Open order whose open line WH-001 can partly ship; dn-c05 is the one Open
 * delivery; ar-c03 is a clean Open PHP item invoice (appliedAmount 0). Approvals are all off in
 * SEED_SALES_SETTINGS, so a posted document goes straight to Open. Actions live in the "You can
 * also" header menu (MoreMenu).
 */

// These flows post several documents per test; trace capture races on artifact files under load and
// can fail teardown with ENOENT without reflecting a real assertion failure. Turn it off for this file.
test.use({ trace: 'off' });

/**
 * Open the "You can also" header menu, then select one of its items by label. The design system's
 * DropdownItem is a plain row (no `menuitem` role) that fires `onSelect` on `mousedown` with
 * `preventDefault`, which makes Playwright's full `.click()` sequence hang intermittently (the menu
 * unmounts mid-click). Dispatch `mousedown` directly instead — that is what triggers the action.
 */
async function pickAction(page: Page, label: string) {
  await page.getByRole('button', { name: 'You can also' }).click();
  const menu = page.locator('[role="menu"]');
  await expect(menu).toBeVisible();
  const item = menu.getByText(label, { exact: true });
  await expect(item).toBeVisible();
  await item.dispatchEvent('mousedown');
}

/**
 * Click the "Add" button to post a new document. Some forms show a "Check before saving" warning on
 * the first Add (duplicate customer ref, over credit limit) and stay on /new; a second Add saves
 * anyway. `leaves` is the list-URL pattern the save navigates to. Waits for either outcome rather
 * than reading the URL synchronously (hash navigation isn't instant after the click).
 */
async function postNew(page: Page, leaves: RegExp) {
  const add = page.getByRole('button', { name: 'Add', exact: true });
  const warning = page.getByText('Check before saving');
  await add.click();
  // Wait until the form either navigates away (saved) or raises the warning (still on /new). Posting
  // runs several sequential fake-API calls (journal, apply-to-invoice), so allow a generous window.
  await expect
    .poll(async () => !/\/new/.test(page.url()) || (await warning.isVisible()), { timeout: 20_000 })
    .toBe(true);
  if (/\/new/.test(page.url())) await add.click(); // dismiss the warning: save anyway
  await expect(page).toHaveURL(leaves, { timeout: 20_000 });
}

/** Wait for a freshly navigated detail form to finish loading its data (the "Loading…" clears). */
async function waitLoaded(page: Page) {
  await expect(page.getByText(/Loading[^\n…]*…/)).toHaveCount(0, { timeout: 15_000 });
}

/** The success Alert shown on a list page after an action navigates to it. */
const notice = (page: Page) => page.getByText('Saved', { exact: true }).locator('..');

/** Open a detail route and assert its status chip (chip renders after the async data load). */
async function openStatus(page: Page, route: string, status: string) {
  await open(page, route);
  await expectStatus(page, status);
}

/** Assert the already-open document's status chip, with a generous timeout (async data load). */
const expectStatus = (page: Page, status: string) =>
  expect(page.getByText(status, { exact: true }).first()).toBeVisible({ timeout: 10_000 });

test.describe('sales workflows', () => {
  // Run these flows serially in one worker instead of under the config's `fullyParallel`. Each test
  // drives a long chain of document posts (5-10 page loads + many fake-API calls); several running at
  // once overwhelm the single dev server, starving cold lazy-chunk loads until a page render errors or
  // a navigation never lands (intermittent flakiness that always clears on re-run). `serial` pins this
  // describe to one worker in order, which keeps the dev-server pressure bounded. Each test still opens
  // a fresh browser context (empty localStorage → seed data), so the seed anchors stay independent.
  test.describe.configure({ mode: 'serial' });

  // US-SAL-021 / US-SAL-032: a "Copy to Sales Order" (here "Create sales order") on an Open quotation
  // pre-fills a new order from the quotation; closing the quotation then closes it.
  //
  // REAL UI BUG (reported, not worked around) — SKIPPED until it's fixed. The sales quotation detail
  // page currently crashes to the app error boundary ("This page couldn't load") for every quotation:
  //   TypeError: Cannot read properties of undefined (reading 'header')
  //     at warehouseCol (src/pages/sales/shared/salesCols.tsx:208 — `const w = b.warehouse!`)
  //     at salesCols  (src/pages/sales/shared/salesCols.tsx:352 — builds `warehouse: warehouseCol(b)` unconditionally)
  //     at qtDoc      (src/pages/sales/quotations/detail/qtDoc.tsx — passes no `warehouse` binding)
  // `salesCols` always calls `warehouseCol`, which reads `b.warehouse!.header`; a quotation has no
  // warehouse column, so `b.warehouse` is undefined and the render throws. Both files are new/untracked
  // (the in-progress purchasing-lines-table-unification refactor). Reproduces for qt-001/007/008.
  // Fix: `salesCols` should only build the warehouse column when `b.warehouse` is provided (or
  // `warehouseCol` should no-op when it's undefined). Un-skip and drive the flow once fixed.
  test('quotation → sales order (pre-fill); quotation closes @US-SAL-021', async ({ page }) => {
    const errors = watchErrors(page);

    // qt-007 is Open. Convert it: lands on a new SO pre-filled with the customer and lines.
    await openStatus(page, 'sales/quotations/qt-007', 'Open');
    await pickAction(page, 'Create sales order');

    await expect(page).toHaveURL(/sales\/sales-orders\/new/);
    await waitLoaded(page);
    // The order carries the quotation's "Based on quotation" remark and the customer's name. (The SO
    // post is shallow: a quotation line has no warehouse to copy, so the inventory-line SO post would
    // need per-line warehouse entry; the "quotation closes" step below is the full outcome.)
    await expect.poll(() => screenText(page), { timeout: 10_000 }).toContain('Based on quotation');
    await expect.poll(() => screenText(page), { timeout: 10_000 }).toContain('Northgate Prime Malls');
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();

    // Close the quotation from its own menu; it lands on the quotations list with a "closed" notice.
    await open(page, 'sales/quotations/qt-007');
    await pickAction(page, 'Close quotation');
    await expect(page).toHaveURL(/sales\/quotations$/);
    await expect(notice(page)).toContainText('closed');

    // Re-open the quotation detail: the status chip is now Closed.
    await openStatus(page, 'sales/quotations/qt-007', 'Closed');
    expect(await rawIds(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  // US-SAL-032 / US-SAL-050: "Copy to delivery" from an Open order ships its open lines; posting the
  // delivery moves the delivered qty on the order. We ship a partial 1 unit (runtime stock in WH-001
  // is limited), so the order stays Open with its delivered qty raised and the new delivery linked.
  // The "fully delivered → order closes" branch depends on having full stock on hand, which isn't
  // guaranteed from the UI for any one seed line; it is covered at the service level (test plan).
  test('sales order → delivery; delivered qty moves @US-SAL-050', async ({ page }) => {
    const errors = watchErrors(page);

    await openStatus(page, 'sales/sales-orders/so-006', 'Open');
    await pickAction(page, 'Copy to delivery');

    await expect(page).toHaveURL(/sales\/deliveries\/new/);
    await waitLoaded(page);
    // The delivery is pre-filled from the order: the order's line item is copied onto it.
    await expect.poll(() => screenText(page), { timeout: 15_000 }).toContain('IPH-18PM-256-SLV');
    // Ship a partial 1 unit from stock on hand, then post.
    await page.getByRole('spinbutton', { name: 'Quantity' }).first().fill('1');
    await postNew(page, /sales\/deliveries$/);

    await expect(notice(page)).toContainText('stock is out and the sales order lines are updated');

    // The order is still Open (partly delivered) and now shows the delivery in its flow.
    await openStatus(page, 'sales/sales-orders/so-006', 'Open');
    await open(page, 'sales/sales-orders/so-006/transactions');
    await expect.poll(() => screenText(page), { timeout: 15_000 }).toContain('DN-2026');
    expect(await rawIds(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  // US-SAL-060: "Copy to A/R invoice" from an Open delivery lands on the A/R invoice form, pre-filled.
  // (Was a dead route: the delivery/SO copy actions navigated to the unregistered /sales/invoices/new;
  // fixed to /sales/customer-invoices/new, which the ArInvoiceDetail resolves with the fromDelivery state.)
  test('delivery → A/R invoice opens the pre-filled form @US-SAL-060', async ({ page }) => {
    await openStatus(page, 'sales/deliveries/dn-c05', 'Open');
    await pickAction(page, 'Copy to A/R invoice');
    await expect(page).toHaveURL(/sales\/customer-invoices\/new/);
    await expect(page.getByText('Coming soon')).toHaveCount(0);
  });

  // US-SAL-110 / US-SAL-111: record a payment, apply it to an invoice in full — the invoice closes
  // at zero; cancelling the payment reopens the invoice. ar-c03 is a clean Open PHP item invoice
  // (appliedAmount 0), so the full balance can be received in cash and then reversed.
  test('incoming payment closes an invoice; cancel reopens it @US-SAL-110', async ({ page }) => {
    const errors = watchErrors(page);

    await openStatus(page, 'sales/customer-invoices/ar-c03', 'Open');
    await pickAction(page, 'Receive payment');

    await expect(page).toHaveURL(/sales\/incoming-payments\/new/);
    await waitLoaded(page);
    // The prefill (customer + ticked invoice) is applied asynchronously after masters load; wait for
    // the source invoice row to be ticked before adding the means, so the amount due is non-zero.
    await expect(page.getByRole('checkbox', { name: /^Pay / })).toBeChecked({ timeout: 15_000 });
    // "Add cash" pre-fills the amount to the balance left (the amount due), then point it at a cash
    // account. The means table overflows, so scroll the field shell into view before clicking.
    await page.getByRole('button', { name: 'Add cash' }).click();
    // The combobox button renders 0px tall inside the table cell (design-system quirk); click its
    // visible field shell instead, after scrolling it into view.
    const cashField = page.locator('.sikat-field', { has: page.getByRole('combobox', { name: 'Cash account' }) });
    await cashField.scrollIntoViewIfNeeded();
    await cashField.click();
    await page.getByRole('option', { name: /Cash on Hand – Store Collections/ }).click();
    // The means footer shows "Balance" (PHP 0.00 difference) once the cash covers the amount due.
    await expect(page.getByText('Balance', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page).toHaveURL(/sales\/incoming-payments$/);
    await expect(notice(page)).toContainText('added');

    // Paid in full → the invoice is Closed.
    await openStatus(page, 'sales/customer-invoices/ar-c03', 'Closed');

    // Open the payment from the invoice's own document-flow panel (the only payment linked to it),
    // then cancel it dated today — the invoice it paid is open again.
    await open(page, 'sales/customer-invoices/ar-c03/transactions');
    await page.getByRole('link', { name: /RCV-2026/ }).first().click();
    // The flow link opens the payment by its id (e.g. /incoming-payments/rc-xxxx).
    await expect(page).toHaveURL(/sales\/incoming-payments\/(rc-|RCV-2026)/);
    await waitLoaded(page);
    await pickAction(page, 'Cancel — date it today');
    await expect(page).toHaveURL(/sales\/incoming-payments$/);
    await expect(notice(page)).toContainText('the invoices it paid are open again');

    // The invoice is Open again.
    await openStatus(page, 'sales/customer-invoices/ar-c03', 'Open');
    expect(await rawIds(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  // US-SAL-081: an A/R credit memo referencing an Open invoice defaults to its lines and, posted,
  // reduces the invoice's open amount — crediting it in full closes the invoice. ar-c03 is a clean
  // Open PHP item invoice (6× MacBook, appliedAmount 0).
  test('credit memo reduces the invoice open amount @US-SAL-081', async ({ page }) => {
    const errors = watchErrors(page);

    await openStatus(page, 'sales/customer-invoices/ar-c03', 'Open');
    await pickAction(page, 'Copy to A/R credit memo');

    await expect(page).toHaveURL(/sales\/credit-memos\/new/);
    await waitLoaded(page);
    // Lines default to the source invoice: the invoice's item line carries over.
    await expect.poll(() => screenText(page), { timeout: 15_000 }).toContain('Copy from invoice');
    await expect.poll(() => screenText(page), { timeout: 15_000 }).toContain('MAC-MBA13-M5-8G-16-512-SKB');
    await postNew(page, /sales\/credit-memos$/);

    // The notice confirms the credit was applied to the source invoice.
    await expect(notice(page)).toContainText('applied to');

    // Credited in full → the invoice is Closed (its open amount is gone).
    await openStatus(page, 'sales/customer-invoices/ar-c03', 'Closed');
    // The credit memo shows in the invoice's document-flow panel.
    await open(page, 'sales/customer-invoices/ar-c03/transactions');
    await expect.poll(() => screenText(page), { timeout: 15_000 }).toContain('ACM-2026');
    expect(await rawIds(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  // US-SAL-080: a sales return copied from a delivery receives goods back; copied on to a credit
  // memo, it reduces the customer's balance. Driven delivery → sales return → credit memo.
  test('sales return → credit memo @US-SAL-080', async ({ page }) => {
    const errors = watchErrors(page);

    // dn-c05 is the Open seed delivery. Copy it to a sales return.
    await open(page, 'sales/deliveries/dn-c05');
    await pickAction(page, 'Copy to sales return');
    await expect(page).toHaveURL(/sales\/sales-returns\/new/);
    await waitLoaded(page);
    // The return is pre-filled from the delivery: the delivery's line item is copied onto it.
    await expect.poll(() => screenText(page), { timeout: 15_000 }).toContain('IPH-17-256-LAV');
    await postNew(page, /sales\/sales-returns$/);
    await expect(notice(page)).toBeVisible();

    // Open the return just created and copy it on to a credit memo.
    await page.getByRole('link', { name: /SRT-2026/ }).first().click();
    await expect(page).toHaveURL(/sales\/sales-returns\/(sr-|SRT-2026)/);
    await waitLoaded(page);
    await pickAction(page, 'Copy to A/R credit memo');
    await expect(page).toHaveURL(/sales\/credit-memos\/new/);
    await waitLoaded(page);
    // The credit memo's line is copied from the return (the returned item carries over).
    await expect.poll(() => screenText(page), { timeout: 15_000 }).toContain('IPH-17-256-LAV');
    await postNew(page, /sales\/credit-memos$/);
    await expect(notice(page)).toBeVisible();

    expect(await rawIds(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
