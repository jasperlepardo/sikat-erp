import { SEED_ITEMS, mergeVariant, toVariantRecord, newItemWarehouse, type Item } from '../mocks/items';
import { SEED_PURCHASE_ORDERS, openOrdered } from '../mocks/purchaseOrders';
import { SEED_SALES_ORDERS, openCommitted } from '../mocks/salesOrders';
import { itemGroups } from './inventoryMasters';
import { createCollection } from './store';
import { todayISO } from './dates';

/**
 * The seeded items with Ordered set from the seeded POs: what's still open on them, per warehouse.
 * The item catalog itself carries no Ordered figures of its own.
 */
function withOrdered(seed: Item[]): Item[] {
  const ordered = new Map<string, number>();
  for (const po of SEED_PURCHASE_ORDERS) for (const [key, qty] of openOrdered(po)) ordered.set(key, (ordered.get(key) ?? 0) + qty);
  return seed.map((item) => {
    const rows = item.warehouses.map((w) => ({ ...w, ordered: ordered.get(`${item.id}@${w.code}`) ?? 0 }));
    // A PO can order into a warehouse the item isn't stocked in yet.
    for (const [key, qty] of ordered) {
      const [itemId, code] = key.split('@');
      if (itemId === item.id && !rows.some((w) => w.code === code)) rows.push(newItemWarehouse(code, { ordered: qty }));
    }
    return { ...item, warehouses: rows };
  });
}

/**
 * Committed: what the seeded open sales orders still have to deliver, per warehouse — like Ordered,
 * it ties out to documents, so the catalog's own flat figures are replaced. After that the sales
 * order service moves it as orders change.
 */
function withCommitted(seed: Item[]): Item[] {
  const committed = new Map<string, number>();
  for (const so of SEED_SALES_ORDERS) for (const [key, qty] of openCommitted(so)) committed.set(key, (committed.get(key) ?? 0) + qty);
  return seed.map((item) => ({ ...item, warehouses: item.warehouses.map((w) => ({ ...w, committed: committed.get(`${item.id}@${w.code}`) ?? 0 })) }));
}

// v8: G/L accounts are stored as chart-of-accounts codes. v16: default bins are full bin codes (WH-MNL-A-01-01).
// v17: Ordered comes from the open POs. v18: Committed comes from the open sales orders. v19: backorder POs. v20: more seeded sales orders.
// v21: variant system — parentItemId, variantAttributes, variantAxes fields; parent (template) items added to seed.
// v22: merge-at-read — variant items inherit global fields from their parent at runtime.
// v23: uoms/purchasingUom/salesUom added to VARIANT_OWN_FIELDS — variants now carry their own unit data.
// v24: parent items now carry full PIECE UoM group (pc/pack/box/carton) with family weight.
// v25: uoms/purchasingUom/salesUom back to global — variants inherit from parent at read time.
const items = createCollection<Item>('sikat-erp:items:v25', withCommitted(withOrdered(SEED_ITEMS)), 'itm');

/** All items, with variant items' global fields merged from their parent. */
export async function listItems(): Promise<Item[]> {
  const all = await items.list();
  const byId = new Map(all.map((i) => [i.id, i]));
  return all.map((i) => {
    if (!i.parentItemId) return i;
    const parent = byId.get(i.parentItemId);
    return parent ? mergeVariant(i, parent) : i;
  });
}

/** Single item, with global fields merged from parent when it's a variant. */
export async function getItem(id: string): Promise<Item | undefined> {
  const item = await items.get(id);
  if (!item?.parentItemId) return item;
  const parent = await items.get(item.parentItemId);
  return parent ? mergeVariant(item, parent) : item;
}

export const resetItems = items.reset;

/**
 * Item No. is unique. Auto-numbered items get the next number in their group's
 * series (e.g. ACC-00012); barcodes must be unique across all items.
 * Variant items are stored lean — only VARIANT_OWN_FIELDS are persisted.
 */
export async function saveItem(input: Omit<Item, 'id'> & { id?: string }): Promise<Item> {
  const all = await items.list();
  const others = all.filter((i) => i.id !== input.id);

  const clash = input.barcodes.find((b) => others.some((o) => o.barcodes.some((ob) => ob.barcode === b.barcode)));
  if (clash) {
    const owner = others.find((o) => o.barcodes.some((ob) => ob.barcode === clash.barcode))!;
    throw new ItemSaveError('barcodes', `Barcode ${clash.barcode} is already used by ${owner.itemNo}.`);
  }

  const itemNo = input.itemNo.trim();
  const store = (withItemNo: string) => {
    const record = { ...input, itemNo: withItemNo };
    // Strip global fields for variants — they come from the parent at read time.
    return items.save(input.parentItemId ? toVariantRecord(record as Item) : record);
  };

  if (itemNo) {
    if (others.some((o) => o.itemNo.toLowerCase() === itemNo.toLowerCase())) {
      throw new ItemSaveError('itemNo', `Item No. ${itemNo} is already used by another item.`);
    }
    return store(itemNo);
  }

  // Auto-number: for variants, look up the parent's item group for the prefix.
  const groupName = input.parentItemId
    ? (await items.get(input.parentItemId))?.itemGroup ?? ''
    : input.itemGroup;
  const prefix = (await itemGroups.list()).find((g) => g.name === groupName)?.prefix ?? 'ITM';
  const next =
    Math.max(
      0,
      ...all.filter((i) => i.itemNo.startsWith(`${prefix}-`)).map((i) => Number(i.itemNo.slice(prefix.length + 1)) || 0),
    ) + 1;
  return store(`${prefix}-${String(next).padStart(5, '0')}`);
}

/** All variant items of a parent, with global fields merged from the parent. */
export async function listVariants(parentId: string): Promise<Item[]> {
  return (await listItems()).filter((i) => i.parentItemId === parentId);
}

/** A save rejected by a uniqueness rule; `field` says which one. */
export class ItemSaveError extends Error {
  constructor(
    readonly field: 'itemNo' | 'barcodes',
    message: string,
  ) {
    super(message);
  }
}

/** Totals over all warehouses. Available = In stock − Committed + Ordered. */
export function stockTotals(item: Pick<Item, 'warehouses'>) {
  const sum = (k: 'inStock' | 'committed' | 'ordered') => item.warehouses.reduce((n, w) => n + w[k], 0);
  const inStock = sum('inStock');
  const committed = sum('committed');
  const ordered = sum('ordered');
  return { inStock, committed, ordered, available: inStock - committed + ordered };
}

export const isLowStock = (item: Item) => item.inventoryItem && stockTotals(item).inStock <= item.minStock;

/** Usable on documents today: inside Valid From / Valid To (either may be blank). */
export function isValidToday(item: Pick<Item, 'validFrom' | 'validTo'>, today = todayISO()) {
  return (!item.validFrom || item.validFrom <= today) && (!item.validTo || today <= item.validTo);
}

/**
 * Move items' Ordered by what a PO change did to its open quantities: `before` and `after` are the
 * PO as it was and as it is now (undefined for a new or deleted PO).
 */
export async function applyOrderedChange(
  before: Parameters<typeof openOrdered>[0],
  after: Parameters<typeof openOrdered>[0],
) {
  const delta = new Map(openOrdered(after));
  for (const [key, qty] of openOrdered(before)) delta.set(key, (delta.get(key) ?? 0) - qty);
  const changes = [...delta].filter(([, d]) => Math.abs(d) > 0.0001);
  if (!changes.length) return;
  const all = await items.list();
  const touched = new Map<string, Item>();
  for (const [key, d] of changes) {
    const [itemId, code] = key.split('@');
    const item = touched.get(itemId) ?? structuredClone(all.find((i) => i.id === itemId));
    if (!item) continue;
    let row = item.warehouses.find((w) => w.code === code);
    if (!row) item.warehouses.push((row = newItemWarehouse(code)));
    row.ordered = Math.max(0, Math.round((row.ordered + d) * 10000) / 10000);
    touched.set(itemId, item);
  }
  for (const item of touched.values()) await items.save(item);
}
