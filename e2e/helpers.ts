import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Ids are for linking, never for reading: a screen showing one means a lookup is missing. These
 * are the generated-id prefixes (seed ids are `prefix-001`, new ones `prefix-1a2b3c4d`). Codes that
 * double as ids (PH, pc, WH-MNL, 1310…) are meant to be read, so they're not listed. Item group seed
 * ids (ig-MAC) carry no digit, so they get a pattern of their own.
 */
const ID_PREFIXES = [
  'pt', 'prl', 'bpg', 'ind', 'emp', 'ter', 'chn', 'lds', 'emg', 'bpp', 'dun', 'hol', 'bnk', 'bcc', 'crd',
  'fac', 'tec', 'plg', 'prj', 'hba', 'cnt', 'bin', 'ig', 'va', 'vv',
];
const RAW_ID = new RegExp(`\\b(?:(${ID_PREFIXES.join('|')})-[A-Za-z0-9-]*\\d[A-Za-z0-9-]*|ig-[A-Z]{2,4})\\b`, 'g');

/**
 * Open a hash route and wait until the screen has settled: data loads through a fake API (~250 ms
 * per call) and line tables render after their header, so wait until the text stops changing.
 */
export async function open(page: Page, route: string) {
  await page.goto(`/#/${route.replace(/^\/+/, '')}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).not.toContainText('Loading…', { timeout: 10_000 });
  let last = '';
  await expect
    .poll(async () => {
      const now = await screenText(page);
      const same = now === last;
      last = now;
      return same;
    }, { intervals: [400], timeout: 10_000 })
    .toBe(true);
}

/**
 * Known noise, not app bugs. PanelHeader (design system) clones each `actions` child with
 * `size: "large"`; screens pass their buttons in a <>…</> fragment, so React warns about a Fragment
 * prop. Remove once PanelHeader skips fragments.
 */
const KNOWN = [/Invalid prop .* supplied to .React\.Fragment/];

/** Collect page errors and console errors while a test runs. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !KNOWN.some((re) => re.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Visible text of the page, including form control values (where pickers show their selection). */
export async function screenText(page: Page) {
  return page.evaluate(() => {
    const values = [...document.querySelectorAll('input, textarea')].map((el) => (el as HTMLInputElement).value);
    return `${document.body.innerText}\n${values.join('\n')}`;
  });
}

/** Raw ids visible on the screen — should always be empty. */
export async function rawIds(page: Page) {
  return [...new Set((await screenText(page)).match(RAW_ID) ?? [])];
}

/** What a field shows: an input's value, or the text of a button-style combobox (design system 0.34+ pickers). */
export const shown = (field: Locator) =>
  field.evaluate((el) => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : (el.textContent ?? '').trim()));
