/**
 * Data-layer benchmark: CPU time and store round trips for the operations posting and the screens
 * lean on. In the app each round trip is a 250 ms fake wait (services/store.ts), so `waits` is
 * what a user sits through when they run one after another.
 *
 *   npx tsx scripts/bench-data-layer.ts [other checkout]
 */
import { fromSrc, memoryStorage, stubLatency } from './lib/harness';

const storage = memoryStorage();
const latency = stubLatency();

const rows: [string, string, string][] = [];
async function measure(name: string, run: () => unknown) {
  const w0 = latency.waits;
  const t0 = performance.now();
  await run();
  rows.push([name, `${(performance.now() - t0).toFixed(0)} ms cpu`, `${latency.waits - w0} waits`]);
}

const { listItems, saveItem, saveItems } = await fromSrc('services/items.ts');
const { listCostLayers, consumeLayers, updateFifoCosts } = await fromSrc('services/costLayers.ts');
const { exchangeRates, rateOn } = await fromSrc('services/masterData.ts');
const { purchaseDocNodes, linkedDocuments } = await fromSrc('pages/purchasing/shared/documentLinks.ts');

await measure('cold: first listItems (seed + stock history)', () => listItems());
let layers: { itemId: string; warehouse: string; qty: number }[] = [];
await measure('cold: first listCostLayers', async () => {
  layers = await listCostLayers();
});

const open = new Map<string, number>();
for (const l of layers) if (l.qty > 0) open.set(`${l.itemId}@${l.warehouse}`, (open.get(`${l.itemId}@${l.warehouse}`) ?? 0) + 1);
const [busiest, count] = [...open].sort((a, b) => b[1] - a[1])[0];
const [itemId, wh] = busiest.split('@');
const onHand = layers.filter((l) => l.itemId === itemId && l.warehouse === wh).reduce((n, l) => n + l.qty, 0);
await measure(`consumeLayers: ${count} open layers, take all ${onHand}`, () => consumeLayers(itemId, wh, onHand));

const items: { id: string; remarks: string }[] = await listItems();
const ids = [...new Set(layers.map((l) => l.itemId))].slice(0, 40);
await measure(`updateFifoCosts: ${ids.length} items`, () => updateFifoCosts(ids));
await measure('saveItem ×20, one by one', async () => {
  for (let i = 0; i < 20; i++) await saveItem({ ...items[i], remarks: `bench ${i}` });
});
if (saveItems) await measure('saveItems ×20, one batch', () => saveItems(items.slice(0, 20).map((it) => ({ ...it, remarks: 'bench batch' }))));
rows.push(['audit log in storage', `${((storage.get('sikat-erp:audit')?.length ?? 0) / 1024).toFixed(0)} KB`, '']);

const days = exchangeRates.snapshot();
await measure(`rateOn ×5000 (${days.length} daily rates)`, () => {
  for (let i = 0; i < 5000; i++) rateOn(days, 'USD', '2026-06-15');
});
await measure('purchaseDocNodes: first build', () => purchaseDocNodes());
await measure('purchaseDocNodes: cached', () => purchaseDocNodes());
const nodes: { kind: string; id: string }[] = await purchaseDocNodes();
const ap = nodes.find((n) => n.kind === 'APINV')!;
await measure('linkedDocuments ×50 on the cached graph', async () => {
  for (let i = 0; i < 50; i++) await linkedDocuments('APINV', ap.id);
});

const w = Math.max(...rows.map((r) => r[0].length));
for (const [a, b, c] of rows) console.log(`${a.padEnd(w)}  ${b.padStart(12)}  ${c}`);
