/**
 * Cold-load time per route in Chromium: when the first table row is added to the page
 * (performance.now() from navigation start, via a MutationObserver), median of N fresh browser
 * contexts. Run it against the production build:
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/cold-load.mjs [base url] [runs]
 *
 * Most of what's left after the code loads is the store's deliberate 250 ms fake latency.
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173';
const runs = Number(process.argv[3] ?? 7);
const routes = ['purchasing/purchase-orders', 'inventory/items', 'accounting/journal-entries', 'sales/sales-orders', 'purchasing/purchase-orders/po-001/contents'];

const browser = await chromium.launch();
const times = {};
for (let run = 0; run < runs; run++) {
  for (const route of routes) {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('tbody tr')) return;
        window.__firstRow = Math.round(performance.now());
        observer.disconnect();
      });
      document.addEventListener('DOMContentLoaded', () => observer.observe(document.body, { childList: true, subtree: true }));
    });
    const page = await context.newPage();
    await page.goto(`${base}/#/${route}`);
    await page.waitForFunction(() => window.__firstRow, null, { timeout: 30000 });
    (times[route] ??= []).push(await page.evaluate(() => window.__firstRow));
    await context.close();
  }
}
await browser.close();
for (const [route, t] of Object.entries(times)) {
  t.sort((a, b) => a - b);
  console.log(`${route.padEnd(44)} first row at ${String(t[t.length >> 1]).padStart(5)} ms (min ${t[0]}, max ${t.at(-1)})`);
}
