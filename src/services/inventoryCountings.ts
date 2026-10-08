import {
  COUNT_SERIES,
  COUNT_VARIANCE_ACCOUNT,
  POSTING_SERIES,
  SEED_COUNTINGS,
  SEED_POSTINGS,
  countedQty,
  newPostingLine,
  type CountLine,
  type InventoryCounting,
  type InventoryPosting,
  type PostingLine,
} from '../mocks/inventoryCountings';
import type { DocumentSeries } from '../mocks/common';
import { countSeries, postingSeries, seriesLookup, formatDocNum } from './allSeries';
import type { ItemGroup } from '../mocks/itemMasters';
import { newItemWarehouse, type Item } from '../mocks/items';
import { inStockAt, inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { listItems, saveItem } from './items';
import { addLayer, consumeLayers, logConsumption, updateFifoCosts, type Taken } from './costLayers';
import { itemGroups } from './inventoryMasters';
import { postDocumentEntry } from './journalEntries';
import { listPrice } from './priceLists';
import { createCollection } from './store';

const countings = createCollection<InventoryCounting>('sikat-erp:inventory-countings:v2', SEED_COUNTINGS, 'ic');
const postings = createCollection<InventoryPosting>('sikat-erp:inventory-postings:v2', SEED_POSTINGS, 'ip');

export const listCountings = countings.list;
export const getCounting = countings.get;
export const listPostings = postings.list;
export const getPosting = postings.get;

export type CountingInput = Omit<InventoryCounting, 'id'> & { id?: string };
export type PostingInput = Omit<InventoryPosting, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

const makeNumberFn = (
  col: { snapshot: () => readonly DocumentSeries[] },
  fallback: readonly DocumentSeries[],
) => (d: { seriesId: string; docNum: number }) =>
  formatDocNum(seriesLookup(col, d.seriesId, fallback), d.docNum, 'New');

/** "Primary 310002", or "New" before it's added. */
export const countNumber = makeNumberFn(countSeries, COUNT_SERIES);
export const postingNumber = makeNumberFn(postingSeries, POSTING_SERIES);

async function nextNumber<T extends { seriesId: string; docNum: number }>(
  col: { snapshot: () => readonly DocumentSeries[] },
  fallback: readonly DocumentSeries[],
  seriesId: string,
  list: () => Promise<T[]>,
) {
  const s = seriesLookup(col, seriesId, fallback);
  const all = await list();
  return Math.max(s.firstNo - 1, ...all.filter((d) => d.seriesId === s.id).map((d) => d.docNum)) + 1;
}

// ── Counting ─────────────────────────────────────────────────────────────────

/** Counted − In-Whse Qty, inventory UoM; 0 for a line not counted yet. */
export const countVariance = (l: CountLine) => (l.counted ? round2(countedQty(l) - l.inWhseQty) : 0);

/** Multiple counters: whether everyone has counted the line, and whether they agree. */
export function counterStatus(l: CountLine, names: string[]) {
  const qtys = names.map((n) => l.counterQtys[n]);
  const all = qtys.every((q) => q !== undefined);
  const agree = all && qtys.every((q) => q === qtys[0]);
  return { all, agree, agreed: agree ? qtys[0] : undefined };
}

export function countSummary(c: Pick<InventoryCounting, 'lines' | 'countingType' | 'counters'>) {
  const counted = c.lines.filter((l) => l.counted);
  const names = c.counters.map((x) => x.name);
  return {
    lines: c.lines.length,
    counted: counted.length,
    withVariance: counted.filter((l) => countVariance(l) !== 0).length,
    disagreements: c.countingType === 'multiple' ? c.lines.filter((l) => counterStatus(l, names).all && !counterStatus(l, names).agree).length : 0,
  };
}

export const countWarehouses = (c: Pick<InventoryCounting | InventoryPosting, 'lines'>) => [...new Set(c.lines.map((l) => l.warehouse).filter(Boolean))];

/**
 * Lines frozen by open counts, as "itemId@warehouse" → count number. Stock movements of a
 * frozen item in that warehouse are blocked until the count is closed.
 */
export async function frozenStock() {
  const out = new Map<string, string>();
  for (const c of await countings.list()) {
    if (c.status !== 'Open') continue;
    for (const l of c.lines) if (l.freeze && l.itemId) out.set(`${l.itemId}@${l.warehouse}`, countNumber(c));
  }
  return out;
}

/** Add (numbering it) or update an open count. */
export async function saveCounting(input: CountingInput) {
  const docNum = input.docNum || (await nextNumber(countSeries, COUNT_SERIES, input.seriesId, countings.list));
  return countings.save({ ...input, docNum });
}

/** Closed counts keep everything but their remarks and attachments. */
export async function saveCountingRemarks(id: string, patch: Pick<InventoryCounting, 'remarks' | 'attachments'>) {
  const current = await countings.get(id);
  if (!current) throw new Error('This count no longer exists.');
  return countings.save({ ...current, ...patch });
}

/** Close without a posting: kept for reference, stock untouched, items unfrozen. */
export async function closeCounting(input: CountingInput) {
  const saved = await saveCounting(input);
  return countings.save({ ...saved, status: 'Closed' });
}

// ── Posting ──────────────────────────────────────────────────────────────────

/** Counted − In-Whse Qty on Count Date: what posting adjusts stock by. */
export const postingVariance = (l: PostingLine) => round2(countedQty(l) - l.inWhseQty);
/** Variance as % of In-Whse Qty; undefined when there was none in the books. */
export const variancePct = (l: PostingLine) => (l.inWhseQty ? round2((postingVariance(l) / l.inWhseQty) * 100) : undefined);
export const lineTotal = (l: PostingLine) => round2(postingVariance(l) * l.price);
export const postingTotal = (p: Pick<InventoryPosting, 'lines'>) => round2(p.lines.reduce((n, l) => n + lineTotal(l), 0));

/** The price source's price for an item, PHP per inventory unit. */
export const sourcePrice = (item: Item, p: Pick<InventoryPosting, 'priceSource' | 'priceList'>) =>
  p.priceSource === 'price-list' && p.priceList ? listPrice(item, p.priceList, item.inventoryUom) : item.itemCost;

/** Copy from Inventory Counting: its counted lines, priced from the posting's price source. */
export function postingFromCount(c: InventoryCounting, base: PostingInput, items: readonly Item[]): PostingInput {
  return {
    ...base,
    countDate: c.countDate,
    countTime: c.countTime,
    reference: c.reference,
    endOfFiscalYear: c.endOfFiscalYear,
    countingId: c.id ?? '',
    lines: c.lines
      .filter((l) => l.counted)
      .map((l) => {
        const item = items.find((i) => i.id === l.itemId);
        return newPostingLine({
          baseLineId: l.id,
          itemId: l.itemId,
          itemNo: l.itemNo,
          description: l.description,
          warehouse: l.warehouse,
          bin: l.bin,
          inWhseQty: l.inWhseQty,
          uomCode: l.uomCode,
          itemsPerUnit: l.itemsPerUnit,
          uomCountedQty: l.uomCountedQty,
          price: item ? sourcePrice(item, base) : 0,
        });
      }),
  };
}

/**
 * The entry posting makes, at each line's price: a loss is Dr Inventory Adjustments and
 * Shrinkage / Cr Inventory, a gain the reverse. Nets per account.
 */
export function postingJournal(p: Pick<InventoryPosting, 'lines'>, items: readonly Item[], groups: readonly ItemGroup[]): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => totals.set(account, round2((totals.get(account) ?? 0) + amount));
  for (const l of p.lines) {
    const item = items.find((i) => i.id === l.itemId);
    const value = lineTotal(l);
    if (!item || !value) continue;
    add(inventoryAccountFor(item, l.warehouse, [...groups]), value);
    add(COUNT_VARIANCE_ACCOUNT, -value);
  }
  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]) => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit);
}

/** Stock after posting each line: today's In Stock plus the variance. */
export const stockAfter = (l: PostingLine, items: readonly Item[]) => {
  const item = items.find((i) => i.id === l.itemId);
  return round2((item ? inStockAt(item, l.warehouse) : 0) + postingVariance(l));
};

export class PostingError extends Error {}

/**
 * Add the posting: each line moves the item's In Stock in its warehouse by the variance (against
 * stock now, so later movements stand), all together or not at all. The count it came from closes.
 */
export async function addPosting(input: PostingInput): Promise<InventoryPosting> {
  const items = await listItems();
  const negative = input.lines.filter((l) => stockAfter(l, items) < 0);
  if (negative.length) {
    throw new PostingError(
      negative.map((l) => `${l.itemNo} in ${l.warehouse} would go below zero — stock moved out after the count. Recount it.`).join(' '),
    );
  }

  const touched = new Map<string, Item>();
  for (const l of input.lines) {
    const v = postingVariance(l);
    if (!v) continue;
    const item = touched.get(l.itemId) ?? structuredClone(items.find((i) => i.id === l.itemId)!);
    // Found stock in a warehouse the item was never stocked in: add the warehouse row.
    let row = item.warehouses.find((w) => w.code === l.warehouse);
    if (!row) item.warehouses.push((row = newItemWarehouse(l.warehouse, { defaultBin: l.bin })));
    row.inStock = round2(row.inStock + v);
    touched.set(l.itemId, { ...item, hasTransactions: true });
  }
  for (const item of touched.values()) await saveItem(item);

  const docNum = await nextNumber(postingSeries, POSTING_SERIES, input.seriesId, postings.list);
  const posted = await postings.save({ ...input, docNum });

  // FIFO: adjust layers for variance. Surplus → new opening layer; shortage → consume oldest first.
  const fifoItemIds = new Set<string>();
  for (const l of input.lines) {
    const v = postingVariance(l);
    if (!v) continue;
    const item = items.find((i) => i.id === l.itemId);
    if (item?.valuationMethod !== 'FIFO' || !item.inventoryItem) continue;
    fifoItemIds.add(l.itemId);
    if (v > 0) {
      await addLayer({ itemId: l.itemId, warehouse: l.warehouse, receivedOn: posted.postingDate, qty: v, receivedQty: v, unitCost: item.itemCost, sourceId: `iq-${posted.id}`, receiptId: posted.id });
    } else {
      const taken: Taken[] = [];
      await consumeLayers(l.itemId, l.warehouse, -v, taken);
      await logConsumption(posted.id, posted.postingDate, taken);
    }
  }
  await updateFifoCosts([...fifoItemIds]);
  await postDocumentEntry({
    origin: 'IQ',
    originNo: docNum,
    originId: posted.id,
    postingDate: input.postingDate,
    remarks: input.journalRemark,
    ref2: input.reference,
    lines: postingJournal(input, items, await itemGroups.list()),
  });
  if (input.countingId) {
    const count = await countings.get(input.countingId);
    if (count) await countings.save({ ...count, status: 'Closed', postingId: posted.id });
  }
  return posted;
}

/** Added postings keep everything but their remarks and attachments. */
export async function savePostingRemarks(id: string, patch: Pick<InventoryPosting, 'remarks' | 'journalRemark' | 'attachments'>) {
  const current = await postings.get(id);
  if (!current) throw new Error('This posting no longer exists.');
  return postings.save({ ...current, ...patch });
}
