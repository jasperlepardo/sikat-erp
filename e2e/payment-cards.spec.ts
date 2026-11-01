import { expect, test } from '@playwright/test';
import { open, rawIds, watchErrors } from './helpers';

/**
 * The shared payment component (src/components/form/PaymentCard.tsx) renders every document's
 * Payment + Journal-entry/Accounting cards. The screens sweep only proves a page renders without
 * errors or raw ids; these specs lock what it can't see — that the right fields are present, inline
 * in the form (not behind a drawer), that posting documents merge their Dr/Cr entry into the card,
 * and that an edited payment field saves and survives a reload.
 */

test('A/P invoice: Payment card + merged Journal entry card (fields above the Dr/Cr posting)', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'purchasing/vendor-invoices/ap-001/details');

  // Payment card.
  await expect(page.getByText('Payment terms', { exact: true })).toBeVisible();
  await expect(page.getByText('Payment method', { exact: true })).toBeVisible();
  await expect(page.getByText('Cash discount date offset', { exact: true })).toBeVisible();

  // Journal entry card: editable fields merged with the posting.
  await expect(page.getByText('Journal entry', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Control account', { exact: true })).toBeVisible();
  await expect(page.getByText('Journal remark', { exact: true })).toBeVisible();
  // The Dr/Cr posting is in the same card.
  await expect(page.getByText(/Goods Received Not Invoiced|Accounts Payable/).first()).toBeVisible();

  expect(await rawIds(page), 'ids visible on screen').toEqual([]);
  expect(errors, 'page or console errors').toEqual([]);
});

test('A/R invoice: payment is inline in the form, not behind the customer drawer', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'sales/customer-invoices/ar-004/details');

  // These are visible on the page itself — no "Details" drawer opened — proving the drawer→form move.
  await expect(page.getByText('Payment terms', { exact: true })).toBeVisible();
  await expect(page.getByText('Payment method', { exact: true })).toBeVisible();
  await expect(page.getByText('Control account', { exact: true })).toBeVisible();
  await expect(page.getByText('Journal remark', { exact: true })).toBeVisible();

  expect(await rawIds(page), 'ids visible on screen').toEqual([]);
  expect(errors, 'page or console errors').toEqual([]);
});

test('editing a payment-card field (journal remark) on an open PO saves and survives a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'purchasing/purchase-orders/po-060/details');

  const marker = 'E2E payment-card check';
  await page.getByLabel('Journal remark').fill(marker);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(/purchase-orders$/);

  await open(page, 'purchasing/purchase-orders/po-060/details');
  await expect(page.getByLabel('Journal remark')).toHaveValue(marker);
  expect(errors, 'page or console errors').toEqual([]);
});
