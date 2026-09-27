import { SEED_ITEMS, type Item } from '../mocks/items';
import { itemGroups } from './inventoryMasters';
import { createCollection } from './store';

// v6: Apple Premium Reseller catalog (mocks/appleCatalog.ts).
const items = createCollection<Item>('sikat-erp:items:v6', SEED_ITEMS, 'itm');

export const listItems = items.list;
export const getItem = items.get;
export const resetItems = items.reset;

/**
 * Item No. is unique. Auto-numbered items get the next number in their group's
 * series (e.g. ACC-00012); barcodes must be unique across all items.
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
  if (itemNo) {
    if (others.some((o) => o.itemNo.toLowerCase() === itemNo.toLowerCase())) {
      throw new ItemSaveError('itemNo', `Item No. ${itemNo} is already used by another item.`);
    }
    return items.save({ ...input, itemNo });
  }
  const prefix = (await itemGroups.list()).find((g) => g.name === input.itemGroup)?.prefix ?? 'ITM';
  const next =
    Math.max(
      0,
      ...all.filter((i) => i.itemNo.startsWith(`${prefix}-`)).map((i) => Number(i.itemNo.slice(prefix.length + 1)) || 0),
    ) + 1;
  return items.save({ ...input, itemNo: `${prefix}-${String(next).padStart(5, '0')}` });
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
export function isValidToday(item: Pick<Item, 'validFrom' | 'validTo'>, today = new Date().toISOString().slice(0, 10)) {
  return (!item.validFrom || item.validFrom <= today) && (!item.validTo || today <= item.validTo);
}
