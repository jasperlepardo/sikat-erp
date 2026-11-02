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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a filter field can be over any master
  def: MasterDef<any>,
  get: (row: T) => unknown,
): FilterField<T> => ({ key, label, type: 'master', def, get });

/**
 * Multi-select over a partner column (Customer / Vendor). Matched by id, labelled by name —
 * the options are the partners that actually appear in `rows`, so the picker lists only partners
 * with documents on this list rather than the whole address book. A stale saved id with no row
 * still filters; its chip just falls back to the raw id (the partner was deleted).
 */
export const partnerField = <T>(
  key: string,
  label: string,
  idOf: (row: T) => string,
  nameOf: (row: T) => string,
  rows: readonly T[] | undefined,
): FilterField<T> => {
  const seen = new Map<string, string>();
  for (const row of rows ?? []) {
    const id = idOf(row);
    if (id && !seen.has(id)) seen.set(id, nameOf(row) || id);
  }
  const options = [...seen]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { key, label, type: 'choice', options, get: idOf };
};

/** Document status, matching the list's built-in status presets. */
export const statusField = <T extends { status: string }>(statuses: readonly string[]): FilterField<T> =>
  choiceField('status', 'Status', statuses, (row) => row.status);

/** Any line's item number or description — "Item contains iPhone". */
export const linesField = <T extends { lines: { itemNo: string; description?: string }[] }>(): FilterField<T> =>
  textField('item', 'Item', (row) => row.lines.flatMap((l) => [l.itemNo, l.description ?? '']));
