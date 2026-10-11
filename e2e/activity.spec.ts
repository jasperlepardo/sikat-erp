import { expect, test, type Page } from '@playwright/test';
import { open, rawIds, screenText, watchErrors } from './helpers';

/**
 * Activity tabs: each record's timeline of the documents it's part of, the changes saved to it,
 * and the calls, meetings, tasks, notes and emails logged against it.
 */

/** Open a record and switch to its Activity tab. */
async function openActivity(page: Page, route: string) {
  await open(page, route);
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('list', { name: 'Activity timeline' }).or(page.getByText('No activity yet.'))).toBeVisible({ timeout: 15_000 });
}

/** One record of each kind with an Activity tab. */
const ROUTES = [
  'inventory/items/apl-fam-002',
  'inventory/items/apl-0001',
  'crm/business-partners/bp-004',
  'purchasing/vendors/bp-016',
  'purchasing/requests/prq-001',
  'purchasing/quotations/rfq-001',
  'purchasing/purchase-orders/po-001',
  'purchasing/bills/down-payment-requests/dp-001',
  'purchasing/goods-receipts/gr-001',
  'purchasing/bills/ap-001',
  'purchasing/payments-made/op-g001',
  'purchasing/returns-and-debits/returns/rt-001',
  'purchasing/returns-and-debits/credit-memos/cm-001',
  'sales/quotations/qt-001',
  'sales/sales-orders/so-c01',
  'sales/deliveries/dn-001',
  'sales/invoices/ar-004',
  'sales/payments-received/rc-001',
  'sales/returns-and-credits/returns/sr-001',
  'sales/returns-and-credits/credit-memos/acm-001',
];

for (const route of ROUTES) {
  test(`/${route} Activity tab loads and shows no raw ids`, async ({ page }) => {
    const errors = watchErrors(page);
    await openActivity(page, route);
    expect(await rawIds(page), 'ids visible on screen').toEqual([]);
    expect(errors, 'page or console errors').toEqual([]);
  });
}

test("a sales order's timeline shows the flow it's part of, from quotation to payment", async ({ page }) => {
  const errors = watchErrors(page);
  await openActivity(page, 'sales/sales-orders/so-c01');
  const text = await screenText(page);
  expect(text).toContain('Quoted: Quotation');
  expect(text).toContain('Ordered: Sales order');
  expect(text).toContain('Delivered: Delivery');
  expect(text).toContain('Invoiced:');
  expect(text).toContain('Payment received: Incoming payment');
  // And the meeting logged against it.
  expect(text).toContain('Delivery and asset-tagging walkthrough');
  expect(errors).toEqual([]);
});

test('a call logged on a document shows there, on its partner and in CRM › Activities', async ({ page }) => {
  const errors = watchErrors(page);
  await openActivity(page, 'sales/sales-orders/so-c01');
  await page.getByRole('button', { name: 'Log activity' }).click();
  await page.getByRole('option', { name: 'Call' }).click();
  await page.getByLabel('Subject').fill('E2E: check on second delivery drop');
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  const timeline = page.getByRole('list', { name: 'Activity timeline' });
  await expect(timeline).toContainText('E2E: check on second delivery drop');

  await openActivity(page, 'sales/customers/bp-004');
  await expect(page.getByRole('list', { name: 'Activity timeline' })).toContainText('E2E: check on second delivery drop');

  await open(page, 'crm/activities');
  await expect(page.locator('body')).toContainText('E2E: check on second delivery drop');
  expect(await rawIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('ticking an open task marks it done', async ({ page }) => {
  const errors = watchErrors(page);
  await openActivity(page, 'sales/sales-orders/so-001');
  await page.getByRole('tab', { name: /Open tasks/ }).click();
  const timeline = page.getByRole('list', { name: 'Activity timeline' });
  await expect(timeline).toContainText('Confirm delivery dates for remaining branches');
  await expect(timeline).toContainText('Overdue');
  await page.getByRole('checkbox', { name: 'Mark as done' }).click();
  await expect(page.getByText('No open tasks.')).toBeVisible();
  await page.getByRole('tab', { name: /^All/ }).click();
  await expect(page.getByRole('list', { name: 'Activity timeline' })).toContainText('Done');
  expect(errors).toEqual([]);
});

test('a change saved to a partner shows on its timeline, by the user', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'sales/customers/bp-005');
  await page.getByRole('textbox', { name: 'Name *', exact: true }).fill('Mactan Pixel Animation Studio, Inc.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/sales\/customers$/);

  await openActivity(page, 'sales/customers/bp-005');
  const timeline = page.getByRole('list', { name: 'Activity timeline' });
  await expect(timeline).toContainText('Changed name');
  await expect(timeline).toContainText('Jasper L.');
  expect(errors).toEqual([]);
});

test('an item timeline lists what was received and sold', async ({ page }) => {
  const errors = watchErrors(page);
  await openActivity(page, 'inventory/items/apl-0001');
  const text = await screenText(page);
  expect(text).toMatch(/Received: Goods receipt PO|Ordered: Purchase order/);
  expect(text).toMatch(/Invoiced:|Delivered:/);
  expect(errors).toEqual([]);
});
