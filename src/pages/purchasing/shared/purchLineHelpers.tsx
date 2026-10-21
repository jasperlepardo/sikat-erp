import type { ReactNode } from 'react';
import { itemUnits, type Item } from '../../../mocks/items';
import { isValidToday } from '../../../services/items';
import type { PurchLine } from '../../../mocks/purchLine';
import type { ItemCellConfig } from './PurchDoc';

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
  const uomLabel = (l: T) => d.uoms.find((u) => u.code === l.uomCode)?.name ?? (l.uomName || l.uomCode);
  const uomOptions = (l: T) => {
    const item = itemOf(l);
    if (!item) return [{ value: l.uomCode, label: l.uomName || l.uomCode }];
    // Purchase units only, as on a PO; the saved unit stays pickable.
    const codes = [item.inventoryUom, item.purchasingUom, ...itemUnits(item, 'purchase').map((u) => u.uom), l.uomCode].filter(Boolean);
    const opts = d.uoms.filter((u) => (u.active || u.code === l.uomCode) && codes.includes(u.code)).map((u) => ({ value: u.code, label: u.name }));
    return opts.length ? opts : [{ value: l.uomCode, label: l.uomName || l.uomCode }];
  };

  return { itemOf, patch, err, itemOptions, lineKind, uomLabel, uomOptions, lines: d.lines, update: d.update };
}

/**
 * The item cell config, minus the two doc-specific bits (`onPick`, `fromItem`). The
 * common methods — options, resolve, description edit, add/remove, validation — come
 * from the shared helpers; the document supplies only what differs.
 */
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
