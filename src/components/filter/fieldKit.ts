import type { MasterDef } from '../form/MasterLookup';
import type { FilterField } from './engine';

/** Shorthands for declaring a list's filter fields. */

export const textField = <T>(key: string, label: string, get: (row: T) => unknown): FilterField<T> => ({ key, label, type: 'text', get });

export const numberField = <T>(key: string, label: string, get: (row: T) => unknown): FilterField<T> => ({ key, label, type: 'number', get });

export const dateField = <T>(key: string, label: string, get: (row: T) => unknown): FilterField<T> => ({ key, label, type: 'date', get });

export const boolField = <T>(key: string, label: string, get: (row: T) => unknown): FilterField<T> => ({ key, label, type: 'boolean', get });

export const choiceField = <T>(
  key: string,
  label: string,
  values: readonly string[] | Record<string, string>,
  get: (row: T) => unknown,
): FilterField<T> => ({
  key,
  label,
  type: 'choice',
  options: Array.isArray(values)
    ? values.map((v) => ({ value: v, label: v }))
    : Object.entries(values).map(([value, label]) => ({ value, label })),
  get,
});

export const masterField = <T>(
  key: string,
  label: string,
  def: MasterDef<any>,
  get: (row: T) => unknown,
): FilterField<T> => ({ key, label, type: 'master', def, get });

/** Document status, matching the list's built-in status presets. */
export const statusField = <T extends { status: string }>(statuses: readonly string[]): FilterField<T> =>
  choiceField('status', 'Status', statuses, (row) => row.status);

/** Any line's item number or description — "Item contains iPhone". */
export const linesField = <T extends { lines: { itemNo: string; description?: string }[] }>(): FilterField<T> =>
  textField('item', 'Item', (row) => row.lines.flatMap((l) => [l.itemNo, l.description ?? '']));
