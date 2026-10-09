import { expect, test, type Page } from '@playwright/test';
import { open, rawIds, screenText, watchErrors } from './helpers';

/**
 * Records link by id and show names by lookup, so a rename in Settings shows everywhere, while
 * posted documents keep the bin codes they were posted with.
 */

/** A collection's saved rows, found by key prefix (keys carry a version, e.g. sikat-erp:partners:v26). Empty until its first save. */
const stored = (page: Page, prefix: string) =>
  page.evaluate((p) => {
    const key = Object.keys(localStorage).find((k) => k === p || k.startsWith(`${p}:`));
    return JSON.parse((key && localStorage.getItem(key)) || '[]') as Record<string, unknown>[];
  }, prefix);

test('renaming a payment term shows the new name on the partner, which still stores the id', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'settings/banking/payment-terms/pt-004');
  const name = page.getByLabel('Name');
  await expect(name).toHaveValue('Net 30');
  await name.fill('Net 30 days');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/payment-terms$/);
  await expect(page.locator('body')).toContainText('Net 30 days');

  await open(page, 'sales/customers/bp-003');
  await expect(page.getByLabel('Payment terms')).toHaveValue('Net 30 days');
  expect(await rawIds(page)).toEqual([]);

  // Saving the partner writes it to storage: the link is the id, never the name.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await stored(page, 'sikat-erp:partners')).find((p) => p.id === 'bp-003')?.customerPaymentTermId).toBe('pt-004');
  expect(errors).toEqual([]);
});

test('renaming a bin: drafts show the new code, posted documents keep the code they posted with', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'inventory/warehouses-and-bins');
  // Rename WH-MNL-A-01-01 → WH-MNL-A-01-09 through the app's own rename service (what Modify bin codes calls).
  const result = await page.evaluate(async () => {
    const svc = await import('/src/services/binLocations.ts');
    const { binLocations } = await import('/src/services/inventoryMasters.ts');
    const rows = svc.planRename(
      {
        warehouse: 'WH-MNL',
        ranges: { aisle: { from: 'A', to: 'A' }, shelf: { from: '01', to: '01' }, level: { from: '01', to: '01' } },
        changes: { level: '09' },
        reason: 'e2e',
      },
      await binLocations.list(),
    );
    return svc.renameBins(rows, 'e2e');
  });
  expect(result.bins).toBe(1);

  // Posted: the snapshot taken when they posted. (Line tables render after the header, so poll.)
  await open(page, 'purchasing/goods-receipts/gr-001');
  await expect.poll(() => screenText(page)).toContain('WH-MNL-A-01-01');
  await open(page, 'inventory/stock-movements/it-001');
  await expect.poll(() => screenText(page)).toContain('WH-MNL-A-01-01');

  // Draft: the bin's current code, with nothing to fix.
  await open(page, 'inventory/stock-movements/it-004');
  await expect.poll(() => screenText(page)).toContain('WH-MNL-A-01-09');
  const draft = await screenText(page);
  expect(draft).not.toContain('WH-MNL-A-01-01');
  expect(draft).not.toContain('no longer exists');
  expect(await rawIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a stock count with two counters shows each by name and flags the line they disagree on', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'inventory/stock-counts/ic-003');
  await expect(page.getByLabel('Counter', { exact: true })).toHaveCount(2);
  await expect(page.getByLabel('Counter', { exact: true }).nth(0)).toHaveValue('Ben Salazar');
  await expect(page.getByLabel('Counter', { exact: true }).nth(1)).toHaveValue('Carla Uy');
  await expect(page.getByLabel("Ben Salazar's count")).toHaveCount(3);
  await expect(page.getByLabel("Carla Uy's count")).toHaveCount(3);
  await expect(page.locator('body')).toContainText('Differ — recount');
  expect(errors).toEqual([]);
});

test('house bank accounts list the four bank accounts by bank name', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'settings/banking/house-bank-accounts');
  const text = await screenText(page);
  for (const accountNo of ['0012-3456-7890', '3021-0456-77', '0001-2233-4455', '1012-3456-7891']) expect(text).toContain(accountNo);
  for (const bank of ['BDO Unibank', 'BPI', 'UnionBank']) expect(text).toContain(bank);
  expect(await rawIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});
