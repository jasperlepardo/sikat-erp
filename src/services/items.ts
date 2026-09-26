import { SEED_ITEMS, type Item } from '../mocks/items';
import { createCollection } from './store';

const items = createCollection<Item>('sikat-erp:items', SEED_ITEMS, 'itm');

export const isLowStock = (item: Item) => item.onHand <= item.reorderLevel;

export const listItems = items.list;
export const getItem = items.get;
export const saveItem = items.save;
export const resetItems = items.reset;
