import type { Item } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import type { Errors } from '../../../../components/form/fields';

export type Draft = Omit<Item, 'id'> & { id?: string };

export interface TabProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  errors: Errors;
  /** Vendors (partners with the vendor role), for default / preferred vendor pickers. */
  vendors: Partner[];
}

export const vendorOptions = (vendors: Partner[]) => [
  { value: '', label: '— None —' },
  ...vendors.map((v) => ({ value: v.id, label: `${v.code} · ${v.name}` })),
];

/** Pickers over plain strings. */
export const asOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

/** Locked once documents post against the item (SAP: can't change after the first transaction). */
export const LOCKED_HINT = 'Locked: documents have been posted for this item.';
