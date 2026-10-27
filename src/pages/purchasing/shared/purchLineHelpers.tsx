import type { ReactNode } from 'react';
import { itemUnits, type Item } from '../../../mocks/items';
import { isValidToday } from '../../../services/items';
import type { PurchLine } from '../../../mocks/purchLine';
import type { ItemCellConfig } from '../../../components/form/docLines/DocLines';
import { fitsRole, type Account } from '../../../mocks/chartOfAccounts';
import type { Partner } from '../../../mocks/partners';
import type { ItemGroup } from '../../../mocks/itemMasters';
import { expenseAccountFor } from '../../../services/goodsReceipts';
import { inventoryAccountFor } from '../../../services/inventoryTransfers';
import { agreementsSnapshot, pbaNumber } from '../../../services/purchaseBlanketAgreements';

type Uom = { code: string; name: string; active: boolean };

interface LineDeps<T extends PurchLine> {
  items: Item[];
  lines: T[];
  update: (patch: { lines: T[] }) => void;
  errors: Record<string, string | undefined>;
  postingDate: string;
  uoms: Uom[];
}

/**
 * The line-plumbing every purchasing descriptor repeats — item lookup, patch, error
 * accessor, item-picker options, Item/Service kind, and UoM label/options. Extracted so
 * `prDoc`/`rfqDoc` (and future `poDoc`/`grDoc`) only hold their document-specific logic.
 */
export interface LineHelpers<T extends PurchLine> {
  itemOf: (l: T) => Item | undefined;
  patch: (id: string, p: Partial<T>) => void;
  err: (l: T, field: string) => string | undefined;
  itemOptions: (current: string) => { value: string; label: ReactNode; text: string }[];
  lineKind: (l: T) => string;
  uomLabel: (l: T) => string;
  uomOptions: (l: T) => { value: string; label: string }[];
  lines: T[];
  update: (patch: { lines: T[] }) => void;
}

export function lineHelpers<T extends PurchLine>(d: LineDeps<T>): LineHelpers<T> {
  const itemOf = (l: T) => d.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<T>) => d.update({ lines: d.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: T, field: string) => d.errors[`line:${l.id}:${field}`];

  const itemOptions = (current: string) =>
    d.items
      .filter((i) => i.id === current || (i.purchaseItem && isValidToday(i, d.postingDate)))
      .map((i) => ({
        value: i.id,
        label: (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-60">{i.itemNo}</span>
            <span>{i.description || i.name}</span>
          </div>
        ),
        text: `${i.itemNo} ${i.description}`,
      }));

  const lineKind = (l: T) => { const it = itemOf(l); return it ? (it.inventoryItem ? 'Item' : 'Service') : ''; };
  // The UoM is shown by its code (compact), not its name, across every document.
  const uomLabel = (l: T) => l.uomCode || l.uomName;
  const uomOptions = (l: T) => {
    const item = itemOf(l);
    if (!item) return [{ value: l.uomCode, label: l.uomCode || l.uomName }];
    // Purchase units only, as on a PO; the saved unit stays pickable.
    const codes = [item.inventoryUom, item.purchasingUom, ...itemUnits(item, 'purchase').map((u) => u.uom), l.uomCode].filter(Boolean);
    const opts = d.uoms.filter((u) => (u.active || u.code === l.uomCode) && codes.includes(u.code)).map((u) => ({ value: u.code, label: u.code }));
    return opts.length ? opts : [{ value: l.uomCode, label: l.uomCode || l.uomName }];
  };

  return { itemOf, patch, err, itemOptions, lineKind, uomLabel, uomOptions, lines: d.lines, update: d.update };
}

/**
 * The item cell config, minus the two doc-specific bits (`onPick`, `fromItem`). The
 * common methods — options, resolve, description edit, add/remove, validation — come
 * from the shared helpers; the document supplies only what differs.
 */
const accountRef = (code: string, accounts: Account[]) => {
  const a = accounts.find((x) => x.code === code);
  return { code, name: a ? `${a.name}${a.active ? '' : ' (inactive)'}` : 'Not in the chart of accounts' };
};

/**
 * A line's G/L account, for the `glAccount` column, as the posting uses it (`lineCostAccount`):
 * a stock item's inventory account (`editable: false`); for a non-stock item the line's own
 * account, else (`inherited`) the item's expense account.
 */
export function lineGlAccount(item: Item | undefined, l: { warehouse?: string; glAccount?: string }, inv: { groups: ItemGroup[]; accounts: Account[] }) {
  if (!item) return null;
  if (item.inventoryItem) {
    const code = inventoryAccountFor(item, l.warehouse ?? '', inv.groups);
    return code ? { ...accountRef(code, inv.accounts), editable: false, inherited: true } : null;
  }
  const code = l.glAccount || expenseAccountFor(item, inv.groups);
  return code ? { ...accountRef(code, inv.accounts), editable: true, inherited: !l.glAccount } : null;
}

/** Cost-of-sales and expense accounts a non-stock line can post to, code over name; the current one stays listed. */
export function costAccountOptions(accounts: readonly Account[], current = '') {
  return accounts
    .filter((a) => a.code === current || (!a.title && a.active && fitsRole(a, 'expense', [...accounts])))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => ({ value: a.code, label: a.name, subLabel: a.code, subLabelPlacement: 'top' as const, text: `${a.code} ${a.name}` }));
}

/**
 * Vendors that carry the item (its vendor list and default vendor) as line-vendor options,
 * code over name. Inactive vendors drop out unless the line already names one; `exclude`
 * leaves out the header vendor where an empty line vendor already means it.
 */
export function itemVendorOptions(item: Item | undefined, vendors: readonly Partner[], current = '', exclude = '') {
  if (!item) return [];
  const ids = new Set([item.defaultVendorId, ...item.vendors.map((v) => v.vendorId)].filter(Boolean));
  return vendors
    .filter((v) => v.id === current || (ids.has(v.id) && v.id !== exclude && v.status !== 'Inactive'))
    // Code over name in the dropdown, like the item picker; typing matches either.
    .map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }));
}

/**
 * Purchase blanket agreements a line can draw on, number over description: approved, with
 * the document's vendor, in force on its date, and covering the line's item (a money-based
 * agreement covers any). The agreement the line already names stays listed.
 */
export function blanketOptions(scope: { vendorId: string; date: string }, itemId: string, current = '') {
  return agreementsSnapshot()
    .filter((a) => a.id === current || (a.status === 'Approved' && a.vendorId === scope.vendorId && a.startDate <= scope.date && scope.date <= a.endDate && (a.agreementMethod === 'Money' || a.lines.some((x) => x.itemId === itemId))))
    .map((a) => ({ value: a.id, label: a.description, subLabel: pbaNumber(a), subLabelPlacement: 'top' as const, text: `${pbaNumber(a)} ${a.description}` }));
}

/** The agreement a line names, as number + description; undefined when none (or it's gone). */
export function blanketRef(agreementId: string | undefined) {
  const a = agreementId ? agreementsSnapshot().find((x) => x.id === agreementId) : undefined;
  return a ? { code: pbaNumber(a), name: a.description } : undefined;
}

/** The agreement and its line for the item, as the line stores them ('' = none). */
export function blanketLink(agreementId: string, itemId: string) {
  const a = agreementsSnapshot().find((x) => x.id === agreementId);
  return { agreementId, agreementLineId: a?.lines.find((x) => x.itemId === itemId)?.id ?? '' };
}

export function itemConfig<T extends PurchLine>(
  h: LineHelpers<T>,
  // `onPick`/`fromItem` are required; any other item-cell field (resolve, hint,
  // addDisabled, width…) can be overridden.
  doc: Pick<ItemCellConfig<T>, 'onPick' | 'fromItem'> & Partial<ItemCellConfig<T>>,
): ItemCellConfig<T> {
  return {
    options: h.itemOptions,
    resolve: (l) => { const it = h.itemOf(l); return it ? { itemNo: l.itemNo || it.itemNo, name: it.name } : null; },
    description: (l) => l.description,
    invalid: (l) => Boolean(h.err(l, 'item')),
    onDescription: (l, v) => h.patch(l.id, { description: v } as Partial<T>),
    onAdd: (line) => h.update({ lines: [...h.lines, line] }),
    onRemoveLine: (l) => h.update({ lines: h.lines.filter((x) => x.id !== l.id) }),
    ...doc,
  };
}
