/**
 * What a cold load of each route downloads, from a production build: the entry chunk, plus every
 * chunk the route's own chunk statically imports (minified sizes). Shows when a page starts
 * pulling other pages or seed data into its chunk.
 *
 *   npm run build && node scripts/bundle-sizes.mjs [dist dir] [Route,Route,…]
 *
 * Routes are named by their chunk (Vite names a lazy page's chunk after its module), e.g.
 * PurchaseOrderDetail. A route with "no own chunk" was merged into a shared chunk.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const assets = join(dist, 'assets');
const routes = (process.argv[3] ?? 'Home,ItemList,ItemDetail,PurchaseOrderList,PurchaseOrderDetail,GoodsReceiptDetail,ApInvoiceDetail,SalesOrderDetail,ArInvoiceDetail,JournalEntryDetail,PartnerDetail').split(',');

const files = readdirSync(assets).filter((f) => f.endsWith('.js'));
const imports = {};
for (const f of files) {
  const src = readFileSync(join(assets, f), 'utf8');
  // static imports only (`import{…}from"./x.js"`, `import"./x.js"`), not `import("./x.js")`
  imports[f] = new Set([...src.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map((m) => m[1]));
}
const size = (f) => statSync(join(assets, f)).size;
const closure = (f, seen = new Set()) => {
  if (seen.has(f)) return seen;
  seen.add(f);
  imports[f]?.forEach((d) => closure(d, seen));
  return seen;
};
const kb = (n) => `${Math.round(n / 1024)} KB`;
const sum = (set) => [...set].reduce((n, f) => n + size(f), 0);

const entry = readFileSync(join(dist, 'index.html'), 'utf8').match(/assets\/([^"]+\.js)/)[1];
const entrySet = closure(entry);
console.log(`entry ${entry}: ${kb(sum(entrySet))}`);
for (const route of routes) {
  const own = files.find((f) => f.startsWith(`${route}-`));
  if (!own) {
    console.log(`${route.padEnd(24)} no own chunk`);
    continue;
  }
  const extra = new Set([...closure(own)].filter((f) => !entrySet.has(f)));
  console.log(`${route.padEnd(24)} +${kb(sum(extra)).padStart(7)} beyond the entry (${extra.size} chunks), cold total ${kb(sum(entrySet) + sum(extra))}`);
}
