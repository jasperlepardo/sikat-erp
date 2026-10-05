import {
  COUNT_SERIES,
  COUNT_VARIANCE_ACCOUNT,
  SEED_COUNTINGS,
  type CountLine,
  type InventoryCounting,
} from '../mocks/inventoryCountings';
import type { ItemGroup } from '../mocks/itemMasters';
import { newItemWarehouse, type Item } from '../mocks/items';
import { inStockAt, inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { listItems, saveItem } from './items';
import { createCollection } from './store';

const countings = createCollection<InventoryCounting>('sikat-erp:inventory-countings', SEED_COUNTINGS, 'ic');

export const listCountings = countings.list;
export const getCounting = countings.get;
export const resetCountings = countings.reset;

export type CountingInput = Omit<InventoryCounting, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const seriesOf = (id: string) => COUNT_SERIES.find((s) => s.id === id) ?? COUNT_SERIES[0];
/** "Primary 310002", or "New" before it's added. */
export const countNumber = (c: Pick<InventoryCounting, 'seriesId' | 'docNum'>) => (c.docNum ? `${seriesOf(c.seriesId).name} ${c.docNum}` : 'New');

/** In Stock the line is compared with: the snapshot once posted, the item's live figure while open. */
export const systemQty = (l: CountLine, items: readonly Item[], posted: boolean) => {
  if (posted) return l.inWhseQty;
  const item = items.find((i) => i.id === l.itemId);
  return item ? inStockAt(item, l.warehouse) : 0;
};

const costOf = (l: CountLine, items: readonly Item[], posted: boolean) => (posted ? l.unitCost : (items.find((i) => i.id === l.itemId)?.itemCost ?? 0));

/** Counted − In Stock; 0 for a line not counted yet. */
export const lineVariance = (l: CountLine, items: readonly Item[], posted: boolean) => (l.counted ? l.countedQty - systemQty(l, items, posted) : 0);

export const lineVarianceValue = (l: CountLine, items: readonly Item[], posted: boolean) => round2(lineVariance(l, items, posted) * costOf(l, items, posted));

export function countSummary(c: Pick<InventoryCounting, 'lines' | 'status'>, items: readonly Item[]) {
  const posted = c.status === 'Posted';
  const counted = c.lines.filter((l) => l.counted);
  const off = counted.filter((l) => lineVariance(l, items, posted) !== 0);
  const value = round2(c.lines.reduce((n, l) => n + lineVarianceValue(l, items, posted), 0));
  return { lines: c.lines.length, counted: counted.length, withVariance: off.length, value };
}

/** Warehouses on the count, for the list. */
export const countWarehouses = (c: Pick<InventoryCounting, 'lines'>) => [...new Set(c.lines.map((l) => l.warehouse).filter(Boolean))];

/**
 * The entry posting makes, at item cost: a loss is Dr Inventory Adjustments and Shrinkage /
 * Cr Inventory, a gain the reverse. Nets per account.
 */
export function countJournal(c: Pick<InventoryCounting, 'lines' | 'status'>, items: readonly Item[], groups: readonly ItemGroup[]): JournalLine[] {
  const posted = c.status === 'Posted';
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => totals.set(account, round2((totals.get(account) ?? 0) + amount));
  for (const l of c.lines) {
    const item = items.find((i) => i.id === l.itemId);
    const value = lineVarianceValue(l, items, posted);
    if (!item || !value) continue;
    add(inventoryAccountFor(item, l.warehouse, [...groups]), value);
    add(COUNT_VARIANCE_ACCOUNT, -value);
  }
  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]) => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit);
}

async function nextNumber(seriesId: string) {
  const series = seriesOf(seriesId);
  const all = await countings.list();
  return Math.max(series.firstNo - 1, ...all.filter((c) => c.seriesId === series.id).map((c) => c.docNum)) + 1;
}

/** Add (numbering it) or update an open count. */
export async function saveCounting(input: CountingInput) {
  const docNum = input.docNum || (await nextNumber(input.seriesId));
  return countings.save({ ...input, docNum, status: 'Open' });
}

/** Posted and closed counts keep everything but their remarks. */
export async function saveCountingRemarks(c: InventoryCounting, patch: Pick<InventoryCounting, 'remarks' | 'journalRemark'>) {
  const current = await countings.get(c.id);
  if (!current) throw new Error('This count no longer exists.');
  return countings.save({ ...current, ...patch });
}

/** Close without posting: the count is kept for reference and stock isn't touched. */
export async function closeCounting(input: CountingInput) {
  const docNum = input.docNum || (await nextNumber(input.seriesId));
  return countings.save({ ...input, docNum, status: 'Closed' });
}

/**
 * Post the variances: every counted line sets the item's In Stock in that warehouse to the
 * counted quantity, against In Stock as it is now. In Stock and cost are snapshotted on the
 * lines so the posted count keeps showing the variance it made.
 */
export async function postCounting(input: CountingInput, postingDate: string): Promise<InventoryCounting> {
  const items = await listItems();
  const lines = input.lines.map((l) => {
    const item = items.find((i) => i.id === l.itemId);
    return item ? { ...l, inWhseQty: inStockAt(item, l.warehouse), unitCost: item.itemCost } : l;
  });

  const touched = new Map<string, Item>();
  for (const l of lines) {
    if (!l.counted || l.countedQty === l.inWhseQty) continue;
    const item = touched.get(l.itemId) ?? structuredClone(items.find((i) => i.id === l.itemId)!);
    // Found stock in a warehouse the item was never stocked in: add the warehouse row.
    let row = item.warehouses.find((w) => w.code === l.warehouse);
    if (!row) item.warehouses.push((row = newItemWarehouse(l.warehouse, { defaultBin: l.bin })));
    row.inStock = l.countedQty;
    touched.set(l.itemId, { ...item, hasTransactions: true });
  }
  for (const item of touched.values()) await saveItem(item);

  const docNum = input.docNum || (await nextNumber(input.seriesId));
  return countings.save({ ...input, lines, docNum, postingDate, status: 'Posted' });
}
