import { test, expect } from '@playwright/test';
import { open } from './helpers';

// Pages load on first visit. A page whose code can't be fetched (a newer build was deployed while
// the tab was open, or the network dropped) shows an error with a reload inside the shell.
test('a page that fails to load keeps the shell and offers a reload', async ({ page }) => {
  await open(page, '');
  await page.route('**/PurchaseQuotationDetail.tsx*', (route) => route.abort());
  await page.goto('/#/purchasing/purchase-quotations/RFQ-2026-0001');
  await expect(page.getByText("This page couldn't load")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  await expect(page.locator('body')).toContainText('Purchase Orders');
});
