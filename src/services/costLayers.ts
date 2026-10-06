/**
 * FIFO cost layers. Each goods receipt for a FIFO-valued item creates one layer per line
 * (item + warehouse + cost + qty). Deliveries consume the oldest layers first; the weighted
 * average of consumed units becomes the line's unitCostLc (and the journal's COGS value).
 *
 * Non-FIFO items (Moving Average, Standard Price, Serial/Batch) don't use this service.
 */
import { createCollection } from './store';
import { listItems, saveItem } from './items';

export interface CostLayer {
  id: string;
  /** Item this layer belongs to. */
  itemId: string;
  /** Warehouse where the stock sits. */
  warehouse: string;
  /** Posting date of the receipt — FIFO sort key. */
  receivedOn: string;
  /** Remaining inventory units in this layer (reduced on each consumption). */
  qty: number;
  /** PHP cost per inventory unit — never changes after creation. */
  unitCost: number;
  /** GR (or adjustment) document id that created this layer. */
  sourceId: string;
}

const layers = createCollection<CostLayer>('sikat-erp:cost-layers:v1', [], 'cl');

export const listCostLayers = layers.list;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** All remaining layers for one item across all warehouses, oldest first. */
export async function layersFor(itemId: string): Promise<CostLayer[]> {
  return (await layers.list())
    .filter((l) => l.itemId === itemId && l.qty > 0)
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.id.localeCompare(b.id));
}

/** Create a new layer when a FIFO item is received. */
export async function addLayer(params: Omit<CostLayer, 'id'>): Promise<CostLayer> {
  return layers.save(params);
}

/**
 * Consume `qty` inventory units FIFO from `itemId` in `warehouse`.
 * Returns the PHP weighted-average unit cost of the consumed units — use as `unitCostLc` on the
 * delivery line. If no layers exist (opening stock without layers), falls back to the item's
 * current `itemCost` so the journal still posts.
 */
export async function consumeLayers(itemId: string, warehouse: string, qty: number): Promise<number> {
  if (qty <= 0) return 0;
  const all = (await layers.list())
    .filter((l) => l.itemId === itemId && l.warehouse === warehouse && l.qty > 0)
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.id.localeCompare(b.id));

  // No layers — fall back to item's stored average cost (opening balance scenario).
  if (all.length === 0) {
    const item = (await listItems()).find((i) => i.id === itemId);
    return item?.itemCost ?? 0;
  }

  let remaining = qty;
  let totalCost = 0;

  for (const layer of all) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, layer.qty);
    totalCost += take * layer.unitCost;
    remaining -= take;
    await layers.save({ ...layer, qty: round4(layer.qty - take) });
  }

  // Stock exceeds known layers (e.g., opening balance topped up with FIFO later).
  // Use last layer's cost for the overage.
  if (remaining > 0) {
    const last = all[all.length - 1];
    totalCost += remaining * last.unitCost;
  }

  return round2(totalCost / qty);
}

/**
 * Restore stock to a layer on delivery cancellation — adds it back at the cost it was taken out
 * at (frozen `unitCostLc` on the delivery line).
 */
export async function restoreLayer(params: Omit<CostLayer, 'id'>): Promise<void> {
  await layers.save(params);
}

/** Remove all layers created by a specific source document (GR cancellation). */
export async function removeLayersBySource(sourceId: string): Promise<void> {
  const all = await layers.list();
  for (const l of all.filter((x) => x.sourceId === sourceId)) {
    await layers.save({ ...l, qty: 0 });
  }
}

/**
 * Move layers from `fromWarehouse` to `toWarehouse` for an inventory transfer, preserving FIFO
 * order. Each source layer is split by the quantity taken; the destination gets new layers with the
 * same `receivedOn` and `unitCost` so the FIFO ordering carries over.
 */
export async function transferLayers(
  itemId: string,
  fromWarehouse: string,
  toWarehouse: string,
  qty: number,
  postingDate: string,
  sourceId: string,
): Promise<void> {
  if (qty <= 0) return;
  const all = (await layers.list())
    .filter((l) => l.itemId === itemId && l.warehouse === fromWarehouse && l.qty > 0)
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.id.localeCompare(b.id));

  let remaining = qty;
  for (const layer of all) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, layer.qty);
    remaining -= take;
    await layers.save({ ...layer, qty: round4(layer.qty - take) });
    await addLayer({ itemId, warehouse: toWarehouse, receivedOn: layer.receivedOn, qty: take, unitCost: layer.unitCost, sourceId });
  }
  if (remaining > 0) {
    const item = (await listItems()).find((i) => i.id === itemId);
    await addLayer({ itemId, warehouse: toWarehouse, receivedOn: postingDate, qty: remaining, unitCost: item?.itemCost ?? 0, sourceId });
  }
}

/**
 * Recompute `itemCost` for each listed item from the weighted average of its remaining FIFO
 * layers. If no layers remain, `itemCost` stays as-is (avoids zeroing out the display cost
 * when all stock has been consumed).
 */
export async function updateFifoCosts(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const allLayers = await layers.list();
  const allItems = await listItems();

  for (const itemId of itemIds) {
    const itemLayers = allLayers.filter((l) => l.itemId === itemId && l.qty > 0);
    if (itemLayers.length === 0) continue;
    const totalQty = itemLayers.reduce((n, l) => n + l.qty, 0);
    const totalValue = itemLayers.reduce((n, l) => n + l.qty * l.unitCost, 0);
    const cost = totalQty > 0 ? round2(totalValue / totalQty) : 0;
    const item = allItems.find((i) => i.id === itemId);
    if (item && cost > 0 && cost !== item.itemCost) await saveItem({ ...item, itemCost: cost });
  }
}
