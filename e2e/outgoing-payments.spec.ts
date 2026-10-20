import { expect, test } from '@playwright/test';
import { open, rawIds, watchErrors } from './helpers';

/** Banking › Outgoing Payments: tick a vendor's bills on Payables, pay them, post, then cancel. */
test('pay a vendor from Payables, post, cancel', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'banking/outgoing-payments');
  await expect(page.getByText('Luzon iDistribution Corp.').first()).toBeVisible();

  // Tick the vendor's row: all its open bills.
  const vendorRow = page.getByRole('row').filter({ hasText: 'Luzon iDistribution Corp.' }).first();
  await vendorRow.getByRole('checkbox').check();
  await expect(page.getByText(/bills · Luzon iDistribution Corp\. · PHP/)).toBeVisible();
  await page.getByRole('button', { name: 'Pay', exact: true }).click();

  await expect(page.getByText('Bills to Pay').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post Payment' })).toBeEnabled();
  expect(await rawIds(page)).toEqual([]);
  await page.getByRole('button', { name: 'Post Payment' }).click();

  await expect(page.getByText('Bills settled').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/posted —/)).toBeVisible();
  await page.screenshot({ path: 'test-results/op-posted.png', fullPage: true });

  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menu').getByText('Cancel payment').click();
  await page.getByRole('button', { name: 'Cancel payment' }).click();
  await expect(page.getByText('Say why it’s being cancelled.')).toBeVisible();
  await page.getByLabel('Reason').fill('Paid the wrong account');
  await page.getByRole('button', { name: 'Cancel payment' }).click();
  await expect(page.getByText('Reason: Paid the wrong account')).toBeVisible();
  expect(errors).toEqual([]);
});

test('blank new payment asks for a vendor and keeps Post disabled', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'banking/outgoing-payments/new');
  await expect(page.getByText('Select a vendor to see their open bills.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post Payment' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/op-blank.png', fullPage: true });
  expect(errors).toEqual([]);
});
