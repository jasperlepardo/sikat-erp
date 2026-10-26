/**
 * Interaction latency (Event Timing API: input to next paint, the slowest event of each interaction)
 * with 4× CPU throttling: typing in list searches and detail fields, and sorting a list. Counts
 * interactions of 16 ms or more; "good" INP is under 200 ms. Run it against the production build:
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/interaction-latency.mjs [base url]
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173';
const browser = await chromium.launch();

async function scenario(name, route, act) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.goto(`${base}/#/${route}`);
  await page.waitForSelector('main input, main textarea', { timeout: 30000 });
  await page.waitForTimeout(1200); // data in, idle
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => {
    window.__slowest = new Map();
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.interactionId) window.__slowest.set(e.interactionId, Math.max(window.__slowest.get(e.interactionId) ?? 0, e.duration));
    }).observe({ type: 'event', durationThreshold: 16 });
  });
  await act(page);
  await page.waitForTimeout(800);
  const d = (await page.evaluate(() => [...window.__slowest.values()])).sort((a, b) => a - b);
  const at = (q) => (d.length ? Math.round(d[Math.min(d.length - 1, Math.floor(d.length * q))]) : 0);
  console.log(`${name.padEnd(46)} ${String(d.length).padStart(3)} slow   p50 ${String(at(0.5)).padStart(4)} ms   max ${String(at(1)).padStart(4)} ms`);
  await context.close();
}
const type = async (field, text) => {
  await field.click();
  for (const ch of text) {
    await field.press(ch === ' ' ? 'Space' : ch);
    await field.page().waitForTimeout(60);
  }
};

await scenario('PO list: type "macbook" in search', 'purchasing/purchase-orders', (p) => type(p.getByPlaceholder('Search by PO no., vendor, vendor ref. or item'), 'macbook'));
await scenario('PO list: sort by Total ×3', 'purchasing/purchase-orders', async (p) => {
  for (let i = 0; i < 3; i++) {
    await p.getByRole('button', { name: 'Sort by Total' }).click();
    await p.waitForTimeout(300);
  }
});
await scenario('Items list: type "iphone 17" in search', 'inventory/items', (p) => type(p.locator('main input[type=search]').first(), 'iphone 17'));
await scenario('Item detail: type 20 chars in Description', 'inventory/items/apl-0361/general', (p) => type(p.locator('main input[type=text]').nth(1), 'abcdefghij klmnopqrs'));
await scenario('New PO: type 20 chars in Remarks', 'purchasing/purchase-orders/new', (p) => type(p.locator('main textarea').first(), 'abcdefghij klmnopqrs'));
await scenario('JE list: type "payroll" in search', 'accounting/journal-entries', (p) => type(p.locator('main input[type=search]').first(), 'payroll'));
await browser.close();
