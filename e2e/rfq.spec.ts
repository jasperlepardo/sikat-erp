import { test, expect } from '@playwright/test';
import { open, rawIds, watchErrors } from './helpers';

test('RFQ list loads with seed data', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'purchasing/quotations');
  const text = await page.innerText('body');
  expect(text).toContain('RFQ-2026');
  expect(errors).toHaveLength(0);
  const ids = await rawIds(page);
  expect(ids).toHaveLength(0);
});

test('RFQ-2026-0001 detail loads without errors', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'purchasing/quotations/RFQ-2026-0001');
  const text = await page.innerText('body');
  expect(text).toContain('Luzon iDistribution');
  expect(text).toContain('Open');
  expect(errors).toHaveLength(0);
  const ids = await rawIds(page);
  expect(ids).toHaveLength(0);
});

test('RFQ-2026-0003 (Closed/Converted) loads', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'purchasing/quotations/RFQ-2026-0003');
  const text = await page.innerText('body');
  expect(text).toContain('Apple South Asia');
  expect(errors).toHaveLength(0);
});

test('New RFQ page loads', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'purchasing/quotations/new');
  const text = await page.innerText('body');
  expect(text).toContain('New purchase quotation');
  expect(errors).toHaveLength(0);
});
