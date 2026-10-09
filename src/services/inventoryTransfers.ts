import {
  SEED_TRANSFERS,
  TRANSFER_SERIES,
  type InventoryTransfer,
  type TransferLine,
} from '../mocks/inventoryTransfers';
import { transferSeries, seriesLookup, formatDocNum } from './allSeries';
import { withTransferBinCodes } from './inventoryMasters';
import type { ItemGroup } from '../mocks/itemMasters';
import { newItemWarehouse, type Item } from '../mocks/items';
import { listItems, saveItem } from './items';
import { transferLayers, updateFifoCosts } from './costLayers';
import { createCollection } from './store';

const transfers = createCollection<InventoryTransfer>('sikat-erp:inventory-transfers:v5', SEED_TRANSFERS, 'it');

export const listTransfers = transfers.list;
export const getTransfer = transfers.get;
export const resetTransfers = transfers.reset;

export type TransferInput = Omit<InventoryTransfer, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const seriesOf = (id: string) => seriesLookup(transferSeries, id, TRANSFER_SERIES);
/** "Primary 270004", or "Draft" before posting. */
export const transferNumber = (t: Pick<InventoryTransfer, 'seriesId' | 'docNum'>) =>
  formatDocNum(seriesOf(t.seriesId), t.docNum);

export const lineValue = (l: TransferLine) => round2(l.quantity * l.unitCost);
export const transferValue = (t: Pick<InventoryTransfer, 'lines'>) => round2(t.lines.reduce((n, l) => n + lineValue(l), 0));
export const transferQty = (t: Pick<InventoryTransfer, 'lines'>) => t.lines.reduce((n, l) => n + l.quantity, 0);
/** Every destination on the transfer: the header's, plus any a line overrides it with. */
export const destinations = (t: Pick<InventoryTransfer, 'lines' | 'toWarehouse'>) =>
  [...new Set([t.toWarehouse, ...t.lines.map((l) => l.toWarehouse)].filter(Boolean))];

export const inStockAt = (item: Pick<Item, 'warehouses'>, warehouse: string) =>
  item.warehouses.find((w) => w.code === warehouse)?.inStock ?? 0;

/** Quantity each item leaves the source with, summed over its lines. */
export function qtyByItem(lines: TransferLine[]) {
  const out = new Map<string, number>();
  for (const l of lines) if (l.itemId) out.set(l.itemId, (out.get(l.itemId) ?? 0) + l.quantity);
  return out;
}

/**
 * Lines asking for more than the source warehouse holds, one message per item.
 * Negative inventory isn't allowed, so these block posting.
 */
export function shortages(t: Pick<InventoryTransfer, 'lines' | 'fromWarehouse'>, items: Item[]) {
  const out: { itemId: string; message: string }[] = [];
  for (const [itemId, qty] of qtyByItem(t.lines)) {
    const item = items.find((i) => i.id === itemId);
    if (!item) continue;
    const have = inStockAt(item, t.fromWarehouse);
    if (qty > have) {
      out.push({ itemId, message: `${item.itemNo}: transferring ${qty} ${item.inventoryUom} but ${t.fromWarehouse} has ${have} in stock.` });
    }
  }
  return out;
}

// ── Accounting ───────────────────────────────────────────────────────────────

/**
 * The inventory G/L account an item posts to in a warehouse, per its "Set G/L accounts by".
 * Warehouses don't carry their own accounts yet, so "Warehouse" falls back to the item group's.
 */
export function inventoryAccountFor(item: Item, _warehouse: string, groups: ItemGroup[]) {
  if (item.glBy === 'Item Level') return item.inventoryAccount;
  return groups.find((g) => g.id === item.itemGroupId)?.inventoryAccount || item.inventoryAccount;
}

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}

/**
 * The entry posting would make: Dr destination inventory / Cr source inventory at item cost,
 * only for lines whose two warehouses use different accounts. Empty when every line stays in
 * the same account — the value moves between warehouse records with no G/L impact.
 */
export function transferJournal(t: Pick<InventoryTransfer, 'lines' | 'fromWarehouse' | 'toWarehouse'>, items: Item[], groups: ItemGroup[]) {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => totals.set(account, round2((totals.get(account) ?? 0) + amount));
  for (const l of t.lines) {
    const item = items.find((i) => i.id === l.itemId);
    if (!item) continue;
    const from = inventoryAccountFor(item, t.fromWarehouse, groups);
    const to = inventoryAccountFor(item, l.toWarehouse || t.toWarehouse, groups);
    if (from === to) continue;
    const value = round2(l.quantity * (l.unitCost || item.itemCost));
    add(to, value);
    add(from, -value);
  }
  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit);
}

// ── Saving and posting ───────────────────────────────────────────────────────

/** A post rejected against current stock; the form shows it on the item's line. */
export class TransferPostError extends Error {
  constructor(
    readonly itemIds: string[],
    message: string,
  ) {
    super(message);
  }
}

export const saveTransferDraft = (input: TransferInput) => transfers.save({ ...input, status: 'Draft', docNum: 0 });

/** Posted transfers keep everything but their remarks. */
export async function saveTransferRemarks(t: InventoryTransfer, patch: Pick<InventoryTransfer, 'remarks' | 'journalRemark'>) {
  const current = await transfers.get(t.id);
  if (!current) throw new Error('This transfer no longer exists.');
  return transfers.save({ ...current, ...patch });
}

/**
 * Post the transfer. All lines go together or none do: stock is re-checked against the items
 * as they are now, then each source warehouse row loses the quantity and each destination row
 * gains it (added to the item when it's never been stocked there). Company-wide In Stock doesn't
 * change. Item cost is item-level here, so it doesn't move either.
 */
export async function postTransfer(input: TransferInput): Promise<InventoryTransfer> {
  const items = await listItems();
  // Items frozen by an open inventory count can't move in or out of that warehouse.
  const { frozenStock } = await import('./inventoryCountings');
  const frozen = await frozenStock();
  const blocked = input.lines.flatMap((l) =>
    [input.fromWarehouse, l.toWarehouse || input.toWarehouse].flatMap((wh) => {
      const count = frozen.get(`${l.itemId}@${wh}`);
      return count ? [{ itemId: l.itemId, message: `${l.itemNo} is frozen in ${wh} by inventory count ${count}. Post or close the count first.` }] : [];
    }),
  );
  if (blocked.length) throw new TransferPostError(blocked.map((b) => b.itemId), blocked.map((b) => b.message).join(' '));
  const short = shortages(input, items);
  if (short.length) throw new TransferPostError(short.map((s) => s.itemId), short.map((s) => s.message).join(' '));

  const lines = input.lines.map((l) => {
    const item = items.find((i) => i.id === l.itemId)!;
    return { ...l, toWarehouse: l.toWarehouse || input.toWarehouse, unitCost: item.itemCost };
  });

  const touched = new Map<string, Item>();
  for (const l of lines) {
    const item = touched.get(l.itemId) ?? structuredClone(items.find((i) => i.id === l.itemId)!);
    const row = (code: string, bin = '') => {
      let w = item.warehouses.find((x) => x.code === code);
      if (!w) item.warehouses.push((w = newItemWarehouse(code, { defaultBinId: bin })));
      return w;
    };
    row(input.fromWarehouse).inStock -= l.quantity;
    row(l.toWarehouse, l.toBinId).inStock += l.quantity;
    touched.set(l.itemId, { ...item, hasTransactions: true });
  }
  for (const item of touched.values()) await saveItem(item);

  const series = seriesOf(input.seriesId);
  const all = await transfers.list();
  const docNum = Math.max(series.firstNo - 1, ...all.filter((t) => t.seriesId === series.id).map((t) => t.docNum)) + 1;
  const posted = await transfers.save({ ...input, lines: withTransferBinCodes(lines), docNum, status: 'Posted' });

  // FIFO: move layers from the source warehouse to each line's destination, preserving FIFO order.
  const fifoItemIds = new Set<string>();
  for (const l of lines) {
    const item = items.find((i) => i.id === l.itemId);
    if (item?.valuationMethod === 'FIFO' && item.inventoryItem) {
      await transferLayers(l.itemId, input.fromWarehouse, l.toWarehouse, l.quantity, posted.postingDate, `tr-${posted.id}`);
      fifoItemIds.add(l.itemId);
    }
  }
  await updateFifoCosts([...fifoItemIds]);

  // A journal entry only when the two warehouses use different inventory accounts.
  const { itemGroups } = await import('./inventoryMasters');
  const { postDocumentEntry } = await import('./journalEntries');
  await postDocumentEntry({
    origin: 'IM',
    originNo: docNum,
    originId: posted.id,
    postingDate: input.postingDate,
    remarks: input.journalRemark,
    lines: transferJournal(posted, items, await itemGroups.list()),
  });
  return posted;
}
