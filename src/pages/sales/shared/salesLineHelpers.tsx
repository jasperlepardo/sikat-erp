import type { ReactNode } from 'react';
import { itemUnits, type Item } from '../../../mocks/items';
import { isValidToday } from '../../../services/items';
import type { ItemCellConfig } from '../../../components/form/docLines/DocLines';

/**
 * The structural slice of a sales line the shared helpers read. Every sales line
 * type (QuoteLine, SoLine, DnLine, ArLine, …) satisfies it; the helpers stay generic
 * so one implementation drives the item cell on every sales document.
 */
export type SalesLineLike = {
  id: string;
  itemId: string;
  itemNo: string;
  description: string;
  uomCode: string;
  uomName: string;
};

interface LineDeps<T extends SalesLineLike> {
  items: Item[];
  lines: T[];
  update: (patch: { lines: T[] }) => void;
  errors: Record<string, string | undefined>;
  postingDate: string;
  /** Extra per-item filter for the picker (e.g. deliveries/returns need inventory items). */
  itemWhere?: (i: Item) => boolean;
}

/**
 * The line-plumbing every sales descriptor repeats — item lookup, patch, error
 * accessor, item-picker options, and UoM options. Extracted so each `*Doc` descriptor
 * only holds its document-specific pricing/logic. Mirrors `purchLineHelpers`.
 */
export interface LineHelpers<T extends SalesLineLike> {
  itemOf: (l: T) => Item | undefined;
  patch: (id: string, p: Partial<T>) => void;
  err: (l: T, field: string) => string | undefined;
  itemOptions: (current: string) => { value: string; label: ReactNode; text: string }[];
  uomOptions: (l: T) => { value: string; label: string }[];
  lines: T[];
  update: (patch: { lines: T[] }) => void;
}

export function lineHelpers<T extends SalesLineLike>(d: LineDeps<T>): LineHelpers<T> {
  const itemOf = (l: T) => d.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<T>) => d.update({ lines: d.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: T, field: string) => d.errors[`line:${l.id}:${field}`];

  // Sales items valid on the posting date; an extra predicate can narrow it (e.g. inventory-only).
  const itemOptions = (current: string) =>
    d.items
      .filter((i) => i.id === current || (i.salesItem && isValidToday(i, d.postingDate) && (!d.itemWhere || d.itemWhere(i))))
      .map((i) => ({
        value: i.id,
        label: (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-60">{i.itemNo}</span>
            <span>{i.description || i.name}</span>
          </div>
        ),
        text: `${i.itemNo} ${i.name} ${i.description}`,
      }));

  // Sales units only; the saved unit stays pickable even if it leaves the sales set.
  const uomOptions = (l: T) => {
    const item = itemOf(l);
    if (!item) return [{ value: l.uomCode, label: l.uomCode || l.uomName }];
    const opts = itemUnits(item, 'sales').map((u) => ({ value: u.uom, label: u.uom }));
    return opts.some((o) => o.value === l.uomCode) || !l.uomCode ? opts : [...opts, { value: l.uomCode, label: l.uomCode }];
  };

  return { itemOf, patch, err, itemOptions, uomOptions, lines: d.lines, update: d.update };
}

/**
 * The item cell config, minus the two doc-specific bits (`onPick`, `fromItem`). The
 * common methods — options, resolve, description edit, add/remove, validation — come
 * from the shared helpers; the document supplies only what differs. Mirrors the
 * purchasing `itemConfig`.
 */
export function itemConfig<T extends SalesLineLike>(
  h: LineHelpers<T>,
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
