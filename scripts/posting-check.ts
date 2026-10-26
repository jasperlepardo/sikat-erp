/**
 * Posts a standalone goods receipt and a standalone delivery (copies of the largest seeded ones,
 * 1 unit per line, no base document) and prints what they leave behind for the items touched:
 * item costs, stock, open FIFO layers and how many consumptions are logged. Also how many store
 * round trips (250 ms each in the app) each posting waited on.
 *
 *   npx tsx scripts/posting-check.ts [other checkout]
 *
 * Diff the output of two checkouts to check a change to the posting services keeps their results.
 * The `waits` lines are expected to differ when a change batches writes.
 */
import { fromSrc, memoryStorage, stubLatency } from './lib/harness';

memoryStorage();
const latency = stubLatency({ realMs: 2 });

const GR = await fromSrc('services/goodsReceipts.ts');
const DN = await fromSrc('services/deliveries.ts');
const I = await fromSrc('services/items.ts');
const L = await fromSrc('services/costLayers.ts');

type Line = { id: string; itemId: string; warehouse: string; quantity: number; baseType: string; baseId: string; baseLineId: string; baseDocNo?: string };
type Doc = { id: string; docNum: number; status: string; fxRate: number; lines: Line[] };

/** A copy of `doc` as a new, approved document of 1 unit on each of its first `n` lines, with no base document. */
const standalone = (doc: Doc, n: number) => {
  const { id: _id, ...rest } = doc;
  return {
    ...rest,
    docNum: 0,
    approved: true,
    lines: doc.lines.slice(0, n).map((l, i) => ({ ...l, id: `check-${i}`, quantity: 1, baseType: '', baseId: '', baseLineId: '', baseDocNo: '' })),
  };
};
const largest = (docs: Doc[]) => docs.filter((d) => d.status !== 'Cancelled').sort((a, b) => b.lines.length - a.lines.length)[0];

const out: Record<string, unknown> = {};
const touched = new Set<string>();

const gr = largest(await GR.listGoodsReceipts());
const grIn = standalone(gr, 6);
grIn.lines.forEach((l) => touched.add(l.itemId));
let w0 = latency.waits;
await GR.addGoodsReceipt(grIn, gr.fxRate || 1);
out.grWaits = latency.waits - w0;

const dn = largest(await DN.listDeliveries());
const dnIn = standalone(dn, 6);
dnIn.lines.forEach((l) => touched.add(l.itemId));
w0 = latency.waits;
await DN.addDelivery(dnIn, dn.fxRate || 1);
out.dnWaits = latency.waits - w0;

type Item = { id: string; itemCost: number; warehouses: { code: string; inStock: number }[] };
type Layer = { itemId: string; warehouse: string; qty: number; unitCost: number; receivedOn: string };
const items: Item[] = await I.listItems();
const ids = [...touched].sort();
out.items = ids.map((id) => {
  const it = items.find((i) => i.id === id)!;
  return { id, itemCost: it.itemCost, stock: it.warehouses.filter((w) => w.inStock).map((w) => `${w.code}:${w.inStock}`).join(' ') };
});
const layers: Layer[] = await L.listCostLayers();
out.openLayers = layers.filter((l) => touched.has(l.itemId) && l.qty > 0).map((l) => `${l.itemId}@${l.warehouse} ${l.qty}×${l.unitCost} ${l.receivedOn}`).sort();
const consumed = await Promise.all(ids.flatMap((id) => items.find((i) => i.id === id)!.warehouses.map((w) => L.consumptionsAt(id, w.code))));
out.consumptions = consumed.flat().length;
console.log(JSON.stringify(out, null, 1));
