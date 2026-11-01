import type { Item } from '../../../mocks/items';
import { isValidToday } from '../../../services/items';
import { itemGroups } from '../../../services/inventoryMasters';
import { EMPTY_FILTER, oneRule, type FilterField } from '../../../components/filter/engine';
import { boolField, choiceField, numberField, textField } from '../../../components/filter/fieldKit';
import type { BuiltInView } from '../../../components/filter/useListViews';

/**
 * Filter fields for searching the item catalog, shared by the Items list and the
 * item-search modal. A lightweight subset of what `ItemList` shows — the stock-aggregation
 * fields (in stock / available / low stock) are omitted here because they need the
 * parent→variant roll-up `ItemList` builds locally; they can be added later if the modal
 * grows stock columns.
 */
export function itemSearchFields(): FilterField<Item>[] {
  // Item groups as a choice field so the filter offers "is any of" — a multi-select of groups.
  const groupOptions = Object.fromEntries(itemGroups.snapshot().map((g) => [g.id, g.name]));
  return [
    textField<Item>('itemNo', 'Item no.', (i) => i.itemNo),
    textField<Item>('description', 'Description', (i) => i.description),
    textField<Item>('foreignName', 'Foreign name', (i) => i.foreignName),
    // Open these straight into multi-select ("is any of") — picking several groups/types is the
    // common case, and it avoids an operator switch (which collapses the chip editor popover).
    { ...choiceField<Item>('itemGroup', 'Item group', groupOptions, (i) => i.itemGroupId), defaultOp: 'in' },
    { ...choiceField<Item>('itemType', 'Item type', ['Items', 'Labor', 'Travel'], (i) => i.itemType), defaultOp: 'in' },
    textField<Item>('barcode', 'Barcode', (i) => [i.gtin, ...i.barcodes.map((b) => b.barcode)]),
    boolField<Item>('inventoryItem', 'Inventory item', (i) => (i.variantAxes.length > 0 ? true : i.inventoryItem)),
    boolField<Item>('valid', 'Valid today', (i) => isValidToday(i)),
    numberField<Item>('basePrice', 'Base price', (i) => i.basePrice),
  ];
}

/** Built-in preset views for the item-search modal. */
export const ITEM_SEARCH_VIEWS: BuiltInView[] = [
  { id: 'all', name: 'All items', filter: EMPTY_FILTER },
  { id: 'stocked', name: 'Inventory items', filter: oneRule('inventoryItem', 'isTrue') },
  { id: 'services', name: 'Non-stock items', filter: oneRule('inventoryItem', 'isFalse') },
  { id: 'inactive', name: 'Items not valid today', filter: oneRule('valid', 'isFalse') },
];
