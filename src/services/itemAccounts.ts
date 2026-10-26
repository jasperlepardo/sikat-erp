import type { ItemGroup } from '../mocks/itemMasters';
import type { Item } from '../mocks/items';

const groupOf = (item: Item, groups: readonly ItemGroup[]) => groups.find((g) => g.id === item.itemGroupId);

/** Where a sale of `item` credits revenue: its own account at item level, else its group's; 4010 if neither has one. */
export const revenueAccountFor = (item: Item, groups: readonly ItemGroup[]) =>
  (item.glBy === 'Item Level' ? item.revenueAccount : groupOf(item, groups)?.revenueAccount || item.revenueAccount) || '4010';

/** Where `item`'s cost of sales goes: its own account at item level, else its group's; 5010 if neither has one. */
export const cogsAccountFor = (item: Item, groups: readonly ItemGroup[]) =>
  (item.glBy === 'Item Level' ? item.cogsAccount : groupOf(item, groups)?.cogsAccount || item.cogsAccount) || '5010';
