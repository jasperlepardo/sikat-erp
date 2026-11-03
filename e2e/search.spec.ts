import { expect, test, type Page } from '@playwright/test';
import { open, rawIds, watchErrors } from './helpers';

/** Navbar search: results drop down under the field; finds records, pages and settings, and opens them. The + button lists create commands. */

const palette = (page: Page) => page.getByRole('listbox', { name: 'Search results' });
const input = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('combobox', { name: 'Search' });

async function openPalette(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await open(page, 'inventory/items');
});

test('⌘K focuses the navbar field and opens results below it; Esc closes them', async ({ page }) => {
  const errors = watchErrors(page);
  await openPalette(page);
  // The results sit under the field, not in a modal, and stay light in dark mode.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const field = await input(page).boundingBox();
  const results = await palette(page).boundingBox();
  expect(results!.y).toBeGreaterThanOrEqual(field!.y + field!.height);
  await expect(page.locator('[data-theme="light"]:has([role="listbox"])')).toHaveCount(1);
  await expect(palette(page)).toContainText('Type to search');
  await expect(palette(page).getByText('New sales order')).toHaveCount(0); // create lives on the + button
  await page.keyboard.press('Escape');
  await expect(palette(page)).toHaveCount(0);
  // `/` opens it too, when not typing in a field.
  await page.keyboard.press('/');
  await expect(palette(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
  // Clicking outside closes them.
  await page.mouse.click(5, 400);
  await expect(palette(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('finds a purchase order by its short number and opens it', async ({ page }) => {
  await openPalette(page);
  await input(page).fill('po1');
  const hit = palette(page).getByRole('option', { name: /PO-2026-0001/ });
  await expect(hit).toBeVisible({ timeout: 15_000 });
  await expect(palette(page).getByRole('option').first()).toContainText('PO-2026-0001');
  await page.keyboard.press('Enter');
  await expect(palette(page)).toHaveCount(0);
  await expect(page.locator('.sikat-navbar__search input')).toHaveValue(''); // back to a plain search box
  await expect(page).toHaveURL(/#\/purchasing\/purchase-orders\/po-[^/]+(\/|$)/);
  await expect(page.getByText('PO-2026-0001').first()).toBeVisible();
});

test('finds partners and items and shows no raw ids', async ({ page }) => {
  await openPalette(page);
  await input(page).fill('bp-0004');
  await expect(palette(page).getByRole('group', { name: 'Partners' }).getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await input(page).fill('iphone');
  await expect(palette(page).getByRole('group', { name: 'Items' }).getByRole('option').first()).toBeVisible();
  await input(page).fill('po');
  await expect(palette(page).getByRole('group', { name: 'Documents' })).toBeVisible();
  expect(await rawIds(page)).toEqual([]);
});

test('the + button lists create commands, current app first, and opens a blank form', async ({ page }) => {
  const errors = watchErrors(page);
  const plus = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Create' });
  const menu = page.getByRole('listbox', { name: 'Create' });
  await plus.click();
  await expect(menu).toBeVisible();
  // On an inventory page, Inventory's commands come first.
  await expect(menu.getByRole('group').first()).toContainText('Inventory');
  await expect(menu.getByRole('option', { name: 'New item' })).toBeVisible();
  // The + button toggles it closed.
  await plus.click();
  await expect(menu).toHaveCount(0);
  // Type to narrow, Enter to open.
  await plus.click();
  await page.keyboard.type('purchase order');
  await expect(menu.getByRole('option').first()).toContainText('New purchase order');
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(page).toHaveURL(/#\/purchasing\/purchase-orders\/new(\/|$)/);
  // Esc closes it and returns focus to the + button.
  await plus.click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(plus).toBeFocused();
  expect(errors).toEqual([]);
});

test('pages and settings are searchable', async ({ page }) => {
  await openPalette(page);
  await input(page).fill('payment terms');
  await expect(palette(page).getByRole('group', { name: 'Settings' }).getByRole('option').first()).toContainText('Payment terms');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/settings\/.*payment-terms/);
});
