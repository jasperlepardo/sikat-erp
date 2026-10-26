/**
 * FIFO cost layers under the operations posting uses (services/costLayers.ts), on the first seeded
 * item@warehouse keys with two or more open layers:
 *  - two sequential takes of 1 unit;
 *  - two concurrent takes (as a document's lines run in Promise.all): stock must drop by 2, and the
 *    second unit is costed off the next layer, not the same one;
 *  - a transfer of 1 unit, then removeLayersBySource;
 *  - updateFifoCosts on the items.
 *
 *   npx tsx scripts/fifo-check.ts [other checkout] [--skip-concurrent]
 *
 * Prints JSON; diff two checkouts. `concurrent.after` should equal `concurrent.expectedAfter`.
 */
import { flag, fromSrc, memoryStorage, stubLatency } from './lib/harness';

memoryStorage();
stubLatency({ realMs: 1 });

const L = await fromSrc('services/costLayers.ts');
const I = await fromSrc('services/items.ts');
type Layer = { id: string; itemId: string; warehouse: string; qty: number };

const open = new Map<string, Layer[]>();
for (const l of (await L.listCostLayers()) as Layer[]) {
  if (l.qty <= 0) continue;
  const k = `${l.itemId}@${l.warehouse}`;
  open.set(k, [...(open.get(k) ?? []), l]);
}
const [k1, k2, k3] = [...open].filter(([, ls]) => ls.length >= 2).map(([k]) => k).sort();
const onHand = async (key: string) => {
  const [item, wh] = key.split('@');
  return ((await L.listCostLayers()) as Layer[]).filter((l) => l.itemId === item && l.warehouse === wh).reduce((n, l) => n + l.qty, 0);
};
const out: Record<string, unknown> = {};

{
  const [item, wh] = k1.split('@');
  const before = await onHand(k1);
  const costs = [await L.consumeLayers(item, wh, 1), await L.consumeLayers(item, wh, 1)];
  out.sequential = { key: k1, before, after: await onHand(k1), costs };
}
if (!flag('skip-concurrent')) {
  const [item, wh] = k2.split('@');
  const before = await onHand(k2);
  const costs = await Promise.all([L.consumeLayers(item, wh, 1, []), L.consumeLayers(item, wh, 1, [])]);
  out.concurrent = { key: k2, before, after: await onHand(k2), expectedAfter: before - 2, costs };
}
{
  const [item, wh] = k3.split('@');
  const before = await onHand(k3);
  await L.transferLayers(item, wh, 'CHECK-WH', 1, '2026-10-09', 'check-transfer');
  out.transfer = { key: k3, before, after: await onHand(k3), arrived: await onHand(`${item}@CHECK-WH`) };
  await L.removeLayersBySource('check-transfer');
  out.removeBySource = { arrivedAfterRemove: await onHand(`${item}@CHECK-WH`) };
}
{
  const ids = [k1, k2, k3].map((k) => k.split('@')[0]);
  await L.updateFifoCosts(ids);
  const items: { id: string; itemCost: number }[] = await I.listItems();
  out.itemCosts = ids.map((id) => items.find((i) => i.id === id)?.itemCost);
}
console.log(JSON.stringify(out, null, 1));
