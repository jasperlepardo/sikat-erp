import { itemGroups } from './inventoryMasters';
import { listItems } from './items';
import { taxCodes } from './masterData';
import { listPartners } from './partners';

/** Records that use one G/L account, by kind. */
export interface AccountUsage {
  itemGroups: string[];
  items: number;
  partners: string[];
  taxCodes: string[];
}

const empty = (): AccountUsage => ({ itemGroups: [], items: 0, partners: [], taxCodes: [] });
export const usageCount = (u?: AccountUsage) => (u ? u.itemGroups.length + u.items + u.partners.length + u.taxCodes.length : 0);

/** Every account code in use, and by what — for the chart of accounts. */
export async function loadAccountUsage(): Promise<Map<string, AccountUsage>> {
  const [groups, items, partners, codes] = await Promise.all([itemGroups.list(), listItems(), listPartners(), taxCodes.list()]);
  const map = new Map<string, AccountUsage>();
  const at = (code: string) => {
    if (!map.has(code)) map.set(code, empty());
    return map.get(code)!;
  };
  for (const g of groups) {
    for (const code of new Set([g.inventoryAccount, g.cogsAccount, g.revenueAccount].filter(Boolean))) at(code).itemGroups.push(g.name);
  }
  for (const i of items) {
    for (const code of new Set([i.inventoryAccount, i.cogsAccount, i.revenueAccount].filter(Boolean))) at(code).items++;
  }
  for (const p of partners) {
    const codes = [p.receivableAccount, p.payableAccount, p.downPaymentClearingAccount, p.downPaymentInterimAccount];
    for (const code of new Set(codes.filter(Boolean))) at(code).partners.push(`${p.code} ${p.name}`);
  }
  for (const t of codes) if (t.glAccount) at(t.glAccount).taxCodes.push(t.code);
  return map;
}

/** "3 item groups (iPhone, iPad, Mac), 404 items, 16 business partners". */
export function describeUsage(u?: AccountUsage) {
  if (!u) return '';
  const list = (names: string[], noun: string) =>
    names.length ? `${names.length} ${noun}${names.length === 1 ? '' : 's'} (${names.slice(0, 4).join(', ')}${names.length > 4 ? ', …' : ''})` : '';
  return [
    list(u.itemGroups, 'item group'),
    u.items ? `${u.items} item${u.items === 1 ? '' : 's'}` : '',
    list(u.partners, 'business partner'),
    list(u.taxCodes, 'tax code'),
  ]
    .filter(Boolean)
    .join(' · ');
}
