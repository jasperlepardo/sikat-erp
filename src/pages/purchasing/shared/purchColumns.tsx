import { Text, TextField } from '@jasperlepardo/sikat-design-system';
import type { PrefColumn } from '../../../components/form/columnPrefs';
import { MasterLookup, type MasterDef, type MasterRow } from '../../../components/form/MasterLookup';
import { formatAmount } from '../../../services/format';

/**
 * Shared column builders for the purchasing contents tables. These cover the few
 * columns that are genuinely identical across documents (free text, references,
 * department / price list, a read-only amount); each document still writes its
 * own doc-specific columns (prices, tax, quantities, stock, delivery…).
 *
 * All builders return a `PrefColumn<T>` and work for any line type via accessor
 * functions, so `PoLine`, `PrLine`, `GrLine`, … share one implementation.
 */

type Base = { id: string; itemId: string };
type ColOpts = { optional?: boolean; defaultHidden?: boolean };

/** Every extracted column is an optional, default-hidden one unless told otherwise. */
const withOpts = (o: ColOpts) => ({ optional: o.optional ?? true, defaultHidden: o.defaultHidden ?? true });

/**
 * Editable single-field text cell — free text, requisition slip no., BP catalog
 * no., manufacturer no. Renders nothing until an item is picked, and a read-only
 * `Text` when the document is locked.
 */
export function textCol<T extends Base>(
  cfg: { key: string; header: string; width?: string; readOnly?: boolean; get: (l: T) => string; onChange: (l: T, v: string) => void } & ColOpts,
): PrefColumn<T> {
  const { key, header, width = 'w-44', readOnly, get, onChange } = cfg;
  return {
    key,
    header,
    ...withOpts(cfg),
    cell: (l: T) => {
      if (!l.itemId) return null;
      if (readOnly) return <Text variant="small">{get(l) || '—'}</Text>;
      return <TextField aria-label={header} className={width} value={get(l)} onChange={(e) => onChange(l, e.currentTarget.value)} />;
    },
  };
}

/**
 * Master-data lookup cell — department, price list. Stores the row's id and
 * shows its label at render; read-only renders the label as plain `Text`.
 */
export function masterCol<T extends Base, R extends MasterRow>(
  cfg: {
    key: string;
    header: string;
    def: MasterDef<R>;
    get: (l: T) => string;
    onChange: (l: T, v: string) => void;
    where?: (r: R) => boolean;
    readOnly?: boolean;
    clearable?: boolean;
    placeholder?: string;
    width?: string;
  } & ColOpts,
): PrefColumn<T> {
  const { key, header, def, get, onChange, where, readOnly, clearable, placeholder, width = 'w-40' } = cfg;
  return {
    key,
    header,
    ...withOpts(cfg),
    cell: (l: T) => {
      if (!l.itemId) return null;
      if (readOnly) {
        const row = def.collection.snapshot().find((r) => def.value(r) === get(l));
        return <Text variant="small">{row ? def.label(row) : '—'}</Text>;
      }
      return (
        <MasterLookup
          def={def}
          value={get(l)}
          onChange={(v) => onChange(l, v)}
          where={where}
          clearable={clearable}
          placeholder={placeholder}
          fieldProps={{ 'aria-label': header, className: width }}
        />
      );
    },
  };
}

/** Read-only formatted amount — price after discount, gross after discount. */
export function amountCol<T extends Base>(
  cfg: { key: string; header: string; value: (l: T) => number; align?: 'start' | 'end' } & ColOpts,
): PrefColumn<T> {
  const { key, header, value, align } = cfg;
  return {
    key,
    header,
    ...withOpts(cfg),
    ...(align ? { align } : {}),
    cell: (l: T) => (l.itemId ? <span className="text-sm tabular-nums">{formatAmount(value(l))}</span> : null),
  };
}
