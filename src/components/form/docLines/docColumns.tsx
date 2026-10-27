import { useState } from 'react';
import { AffixSelect, Select, Text, TextField } from '@jasperlepardo/sikat-design-system';
import type { PrefColumn } from '../columnPrefs';
import { MasterLookup, type MasterDef, type MasterRow } from '../MasterLookup';
import { formatAmount } from '../../../services/format';
import { round4 } from '../../../services/num';
import type { DocLineBase } from './DocLines';

/**
 * Shared column builders for the contents tables (purchasing + sales). These cover the
 * few columns that are genuinely identical across documents (free text, references,
 * department / price list, a read-only amount); each document still writes its
 * own doc-specific columns (prices, tax, quantities, stock, delivery…).
 *
 * All builders return a `PrefColumn<T>` and work for any line type via accessor
 * functions, so `PoLine`, `GrLine`, `QuoteLine`, … share one implementation.
 */

type ColOpts = { optional?: boolean; defaultHidden?: boolean };

/** Every extracted column is an optional, default-hidden one unless told otherwise. */
const withOpts = (o: ColOpts) => ({ optional: o.optional ?? true, defaultHidden: o.defaultHidden ?? true });

/**
 * Editable single-field text cell — free text, requisition slip no., BP catalog
 * no., manufacturer no. Renders nothing until an item is picked, and a read-only
 * `Text` when the document is locked.
 */
export function textCol<T extends DocLineBase>(
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
export function masterCol<T extends DocLineBase, R extends MasterRow>(
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
export function amountCol<T extends DocLineBase>(
  cfg: { key: string; header: string; value: (l: T) => number; align?: 'start' | 'end' } & ColOpts,
): PrefColumn<T> {
  const { key, header, value, align } = cfg;
  return {
    key,
    header,
    ...withOpts(cfg),
    ...(align ? { align } : {}),
    cell: (l: T) => (l.itemId ? <span className="whitespace-nowrap text-sm tabular-nums">{formatAmount(value(l))}</span> : null),
  };
}

// ── Shared pricing-group cells (one rendering, used by every document) ──────────

const toNum = (v: string) => (v === '' ? 0 : Number(v));

/** Editable unit/info price — right-aligned number; the currency goes in the header. */
export function priceCol<T extends DocLineBase>(
  cfg: { key: string; header: string; get: (l: T) => number; onChange: (l: T, v: number) => void; readOnly?: boolean } & ColOpts,
): PrefColumn<T> {
  const { key, header, get, onChange, readOnly } = cfg;
  return {
    key,
    header,
    align: 'end',
    ...withOpts(cfg),
    cell: (l: T) => {
      if (!l.itemId) return null;
      if (readOnly) return <span className="whitespace-nowrap text-sm tabular-nums">{formatAmount(get(l))}</span>;
      return <TextField aria-label={header} type="number" min={0} className="ml-auto w-28 [&_input]:text-right" value={get(l) ? String(get(l)) : ''} placeholder="0.00" onChange={(e) => onChange(l, toNum(e.currentTarget.value))} />;
    },
  };
}

type DiscountMode = '%' | 'PHP';
/** The discount input with a %/PHP toggle; keeps its own mode per cell. */
function DiscountCell({ value, onChange, base, readOnly, label }: { value: number; onChange: (v: number) => void; base: number; readOnly?: boolean; label: string }) {
  const [mode, setMode] = useState<DiscountMode>('%');
  if (readOnly) return <span className="text-sm tabular-nums">{value ? `${round4(value)}%` : '—'}</span>;
  const shown = mode === '%' ? round4(value) : Math.round(base * value) / 100;
  return (
    <TextField
      aria-label={label}
      type="number"
      min={0}
      max={mode === '%' ? 100 : base}
      className="w-32 *:justify-end [&_input]:text-right"
      value={shown ? String(shown) : ''}
      placeholder={mode === '%' ? '0' : '0.00'}
      onChange={(e) => { const v = toNum(e.currentTarget.value); onChange(mode === '%' ? Math.min(100, v) : base ? Math.min(100, (v / base) * 100) : 0); }}
      suffix={<AffixSelect aria-label="Discount type" options={['%', 'PHP']} value={mode} onValueChange={(m) => setMode(m as DiscountMode)} />}
    />
  );
}

/** Line discount percent, entered as % or a PHP amount off the unit price. Stores the percent. */
export function discountCol<T extends DocLineBase>(
  cfg: { key: string; header: string; get: (l: T) => number; onChange: (l: T, v: number) => void; basePrice: (l: T) => number; readOnly?: boolean } & ColOpts,
): PrefColumn<T> {
  const { key, header, get, onChange, basePrice, readOnly } = cfg;
  return {
    key,
    header,
    align: 'end',
    ...withOpts(cfg),
    cell: (l: T) => (l.itemId ? <DiscountCell value={get(l)} onChange={(v) => onChange(l, v)} base={basePrice(l)} readOnly={readOnly} label={header} /> : null),
  };
}

/** Tax-code picker (Select); read-only shows the selected option's label. */
export function taxCol<T extends DocLineBase>(
  cfg: { key: string; header: string; options: (l: T) => { value: string; label: string }[]; get: (l: T) => string; onChange: (l: T, v: string) => void; readOnly?: boolean; clearable?: boolean; invalid?: (l: T) => boolean } & ColOpts,
): PrefColumn<T> {
  const { key, header, options, get, onChange, readOnly, clearable, invalid } = cfg;
  return {
    key,
    header,
    ...withOpts(cfg),
    cell: (l: T) => {
      if (!l.itemId) return null;
      if (readOnly) return <Text variant="small">{options(l).find((o) => o.value === get(l))?.label ?? get(l) ?? '—'}</Text>;
      return <Select aria-label={header} placeholder="None" clearable={clearable} options={options(l)} value={get(l)} onValueChange={(v) => onChange(l, v ?? '')} invalid={invalid?.(l)} />;
    },
  };
}
