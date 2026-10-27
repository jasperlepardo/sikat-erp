import type { ReactNode } from 'react';
import { Checkbox, Combobox, Link, Select, TableStatus, Text, TextField } from '@jasperlepardo/sikat-design-system';
import type { PrefColumn } from '../../../components/form/columnPrefs';
import { masterCol } from '../../../components/form/docLines/docColumns';
import { MasterLookup } from '../../../components/form/MasterLookup';
import { formatAmount } from '../../../services/format';
import { priceListName } from '../../../services/priceLists';
import { countryDef, priceListDef } from '../../settings/masterDefs';
import { RETURN_REASONS } from '../../../mocks/goodsReturns';
import type { PriceList } from '../../../mocks/partnerMasters';
import type { SalesLineLike } from './salesLineHelpers';

const num = (v: string) => (v === '' ? 0 : Number(v));
type Opt = { value: string; label: string };

/** Whether a line renders its cells — an item is picked, or the doc overrides the gate (service lines). */
function vis<T extends SalesLineLike>(b: ColBindings<T>, l: T): boolean {
  return b.rendered ? b.rendered(l) : Boolean(l.itemId);
}

/**
 * Per-document bindings for the shared sales column registry. The columns in
 * `salesCols` render identically across documents; each document supplies its own
 * data/services here (how to read/compute a value, option lists, pricing callbacks),
 * so the rendering is unified while the logic stays with the doc. Mirrors
 * `purchCols`'s `ColBindings`. Optional groups drive the columns only some docs pick.
 */
export interface ColBindings<T extends SalesLineLike> {
  readOnly: boolean;
  /** Document currency, named in each amount column's header. */
  currency: string;
  /** PHP per unit of document currency, for the Total (PHP) column. */
  fx: number;
  invalid: (l: T, field: string) => boolean;
  /** Overrides the "render only when an item is picked" gate — service lines have no item. */
  rendered?: (l: T) => boolean;
  // shared info/catalog columns (hidden by default, available in the Columns menu)
  /** 'Item' or 'Service' per line, for the Type column. */
  lineKind?: (l: T) => string;
  /** The line's tax in PHP, for the Tax amount / Gross total columns. */
  taxAmount?: (l: T) => number;
  // service-line columns (invoices in Service mode)
  serviceDescription?: { value: (l: T) => string; onChange: (l: T, v: string) => void; invalid?: (l: T) => boolean };
  glAccount?: { options: (current: string) => Opt[]; value: (l: T) => string; onChange: (l: T, v: string) => void; text: (l: T) => string; invalid?: (l: T) => boolean };
  serviceAmount?: { value: (l: T) => number; onChange: (l: T, v: number) => void; invalid?: (l: T) => boolean };
  // invoice-only item columns
  gross?: { get: (l: T) => number; onChange: (l: T, v: number) => void };
  wtax?: { checked: (l: T) => boolean; disabled: boolean; onChange: (l: T, on: boolean) => void };
  commission?: { value: (l: T) => number; onChange: (l: T, v: number) => void };
  openForDelivery?: (l: T) => ReactNode;
  /** "Delivered / Open" cell with a status badge (sales orders) — the doc builds the full node. */
  deliveredOpen?: (l: T) => ReactNode;
  // quantity
  /** Header for the qty column (e.g. "Shipped" on deliveries). Defaults to "Qty / UoM". */
  qtyHeader?: string;
  qty: (l: T) => number;
  onQty: (l: T, qty: number) => void;
  uomValue: (l: T) => string;
  uomOptions: (l: T) => Opt[];
  changeUom: (l: T, uom: string) => void;
  uomDisabled?: (l: T) => boolean;
  /** Muted note under the qty cell (e.g. "· inventory UoM", "3 open on DN"). */
  qtyNote?: (l: T) => ReactNode;
  /** Trailing control next to the qty field (e.g. a shortage tooltip). */
  qtyTrailing?: (l: T) => ReactNode;
  // pricing
  unitPrice: (l: T) => number;
  onUnitPrice: (l: T, v: number) => void;
  discountPct: (l: T) => number;
  onDiscount: (l: T, v: number) => void;
  priceAfterDisc: (l: T) => number;
  /** Muted "price source" label under the combined pricing cell. */
  priceSourceLabel?: (l: T) => ReactNode;
  /** The "Reprice" link shown when the price was typed over (includes its own separator). */
  repriceLink?: (l: T) => ReactNode;
  // price list
  priceListValue: (l: T) => string;
  changePriceList: (l: T, id: string) => void;
  priceListWhere?: (r: PriceList) => boolean;
  /** Per-line lock (shows the label, not the picker) — e.g. a line copied from an order. */
  priceListLocked?: (l: T) => boolean;
  // total
  lineNet: (l: T) => number;
  /** Read-only "Ordered" column (deliveries): the base order quantity. */
  ordered?: (l: T) => ReactNode;
  /** Read-only "Outstanding" column (deliveries): what's left to ship. */
  outstanding?: (l: T) => ReactNode;
  // optional columns (bound only by docs that pick them)
  warehouse?: {
    header?: string;
    /** When it returns a node, render that instead of the picker (e.g. "Not stocked", "—"). */
    blank?: (l: T) => ReactNode;
    options: (l: T) => Opt[];
    value: (l: T) => string;
    onChange: (l: T, v: string) => void;
    invalid?: (l: T) => boolean;
    note?: (l: T) => ReactNode;
  };
  /** "Stock" put-back toggle (credit memos): "Put back" vs "Price only". */
  stockPutBack?: {
    show: (l: T) => boolean;
    notStocked: (l: T) => boolean;
    checked: (l: T) => boolean;
    onChange: (l: T, on: boolean) => void;
  };
  tax?: {
    options: (l: T) => Opt[];
    value: (l: T) => string;
    onChange: (l: T, v: string) => void;
    invalid?: (l: T) => boolean;
    note?: (l: T) => ReactNode;
    /** Read-only main line (e.g. "VATABLE (12%)"); defaults to the stored code. */
    roText?: (l: T) => ReactNode;
  };
  returnReason?: { value: (l: T) => string; onChange: (l: T, v: string) => void };
  returnCost?: {
    show: (l: T) => boolean;
    manual: (l: T) => boolean;
    value: (l: T) => number;
    /** The derived item cost shown read-only when no manual cost is set. */
    auto: (l: T) => number;
    onToggle: (l: T, on: boolean) => void;
    onChange: (l: T, v: number) => void;
  };
  country?: { value: (l: T) => string; onChange: (l: T, v: string) => void };
  baseDoc?: (l: T) => { href: string; label: string; sub: string } | null;
  credited?: (l: T) => ReactNode;
}

/** Qty + UoM, with an optional muted note and a trailing control (shortage warning). */
function qtyCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  return {
    key: 'qty',
    header: b.qtyHeader ?? 'Qty / UoM',
    align: 'end',
    cell: (l) => {
      if (!l.itemId) return null;
      if (b.readOnly)
        return (
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1">
              <Text variant="small" className="whitespace-nowrap tabular-nums">
                {b.qty(l).toLocaleString('en-PH')} {b.uomValue(l)}
              </Text>
              {b.qtyTrailing?.(l)}
            </div>
            {b.qtyNote?.(l) ?? null}
          </div>
        );
      return (
        <div className="ml-auto flex w-40 flex-col gap-1 whitespace-normal">
          <div className="flex items-center gap-1">
            <TextField aria-label="Quantity" type="number" min={0} invalid={b.invalid(l, 'quantity')} value={String(b.qty(l))} className="[&_input]:text-right" onChange={(e) => b.onQty(l, num(e.currentTarget.value))} />
            {b.qtyTrailing?.(l)}
          </div>
          {b.uomDisabled?.(l) ? null : (
            <Select aria-label="UoM" options={b.uomOptions(l)} value={b.uomValue(l)} onValueChange={(v) => v && b.changeUom(l, v)} />
          )}
          {b.qtyNote?.(l) ?? null}
        </div>
      );
    },
  };
}

/** The read-only unit-price display: price after discount, with the pre-discount price struck through. */
function priceReadOnly<T extends SalesLineLike>(b: ColBindings<T>, l: T) {
  return (
    <div className="flex flex-col whitespace-nowrap tabular-nums">
      <Text variant="small">{formatAmount(b.discountPct(l) ? b.priceAfterDisc(l) : b.unitPrice(l))}</Text>
      {b.discountPct(l) ? <Text variant="small" tone="muted" className="line-through">{formatAmount(b.unitPrice(l))}</Text> : null}
    </div>
  );
}

/** Editable unit price (separate column; pairs with `discount`). */
function unitPriceCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  return {
    key: 'unitPrice',
    header: `Unit price (${b.currency})`,
    align: 'end',
    cell: (l) => {
      if (!l.itemId) return null;
      if (b.readOnly) return priceReadOnly(b, l);
      return <TextField aria-label="Unit price" type="number" min={0} invalid={b.invalid(l, 'unitPrice')} value={String(b.unitPrice(l))} className="ml-auto w-28 [&_input]:text-right" onChange={(e) => b.onUnitPrice(l, num(e.currentTarget.value))} />;
    },
  };
}

/** Line discount percent (separate column; pairs with `unitPrice`), with an optional "Reprice" link. */
function discountCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  return {
    key: 'discount',
    header: 'Discount',
    align: 'end',
    cell: (l) => {
      if (!l.itemId) return null;
      if (b.readOnly) return b.discountPct(l) ? <Text variant="small" className="whitespace-nowrap tabular-nums">{b.discountPct(l)}%</Text> : null;
      return (
        <div className="ml-auto">
          <TextField aria-label="Discount %" type="number" min={0} suffix="%" value={String(b.discountPct(l))} className="ml-auto w-20 [&_input]:text-right" onChange={(e) => b.onDiscount(l, Math.min(100, num(e.currentTarget.value)))} />
          {b.repriceLink?.(l) ?? null}
        </div>
      );
    },
  };
}

/** Combined "Unit price / Discount" cell (price field + discount field + price-source note). */
function pricingCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  return {
    key: 'pricing',
    header: `Unit price (${b.currency}) / Discount`,
    align: 'end',
    cell: (l) => {
      if (!l.itemId) return null;
      if (b.readOnly) return priceReadOnly(b, l);
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Unit price" type="number" min={0} invalid={b.invalid(l, 'unitPrice')} value={String(b.unitPrice(l))} onChange={(e) => b.onUnitPrice(l, num(e.currentTarget.value))} />
          <TextField aria-label="Discount %" type="number" min={0} suffix="%" value={String(b.discountPct(l))} onChange={(e) => b.onDiscount(l, Math.min(100, num(e.currentTarget.value)))} />
          <Text variant="small" tone="muted">{b.priceSourceLabel?.(l) ?? '—'}{b.repriceLink?.(l) ?? null}</Text>
        </div>
      );
    },
  };
}

/** Price-list lookup — shows the label when the doc is locked or the line is copied from a base. */
function priceListCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  return {
    key: 'priceList',
    header: 'Price list',
    cell: (l) => {
      if (!l.itemId) return null;
      if (b.readOnly || b.priceListLocked?.(l)) return <Text variant="small">{priceListName(b.priceListValue(l)) || '—'}</Text>;
      return <MasterLookup def={priceListDef} fieldProps={{ 'aria-label': 'Price list', className: 'w-40' }} where={b.priceListWhere} value={b.priceListValue(l)} onChange={(v) => b.changePriceList(l, v)} />;
    },
  };
}

/** A read-only accessor column (deliveries' Ordered / Outstanding). */
function roCol<T extends SalesLineLike>(key: string, header: string, get: (l: T) => ReactNode): PrefColumn<T> {
  return {
    key,
    header,
    align: 'end',
    cell: (l) => (l.itemId ? <Text variant="small" className="whitespace-nowrap tabular-nums">{get(l)}</Text> : null),
  };
}

/** Read-only line total in local currency (PHP), from the document net × fx. */
function totalCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  return {
    key: 'total',
    header: 'Total (PHP)',
    align: 'end',
    cell: (l) => (vis(b, l) ? <Text variant="small" className="block whitespace-nowrap tabular-nums">{formatAmount(b.lineNet(l) * b.fx)}</Text> : null),
  };
}

/** Warehouse picker — a `blank` slot covers "Not stocked"/"—" lines; optional stock/available note. */
function warehouseCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  if (!b.warehouse) return { key: 'warehouse', header: 'Whse', cell: () => null };
  return {
    key: 'warehouse',
    header: b.warehouse.header ?? 'Whse',
    cell: (l) => {
      const w = b.warehouse!;
      if (!l.itemId) return null;
      const blank = w.blank?.(l);
      if (blank) return blank;
      if (b.readOnly) return <Text variant="small">{w.value(l) || '—'}</Text>;
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <Combobox aria-label="Warehouse" invalid={w.invalid?.(l)} options={w.options(l)} value={w.value(l) || null} onValueChange={(v) => w.onChange(l, v ?? '')} />
          {w.note?.(l) ?? null}
        </div>
      );
    },
  };
}

/** "Stock" column (credit memos): "Not stocked", or a "Put back" / "Price only" toggle. */
function stockPutBackCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const s = b.stockPutBack!;
  return {
    key: 'stockPutBack',
    header: 'Stock',
    cell: (l) => {
      if (!l.itemId || !s.show(l)) return null;
      if (s.notStocked(l)) return <Text variant="small" tone="muted">Not stocked</Text>;
      return (
        <Checkbox aria-label="Return goods" checked={s.checked(l)} disabled={b.readOnly} onChange={(e) => s.onChange(l, e.currentTarget.checked)}>
          {s.checked(l) ? 'Put back' : 'Price only'}
        </Checkbox>
      );
    },
  };
}

/** Tax-code picker (Combobox) with a muted "Tax PHP …" note under it. */
function taxColSales<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const t = b.tax!;
  return {
    key: 'tax',
    header: 'Tax code',
    align: 'end',
    cell: (l) => {
      if (!vis(b, l)) return null;
      if (b.readOnly)
        return (
          <div className="flex flex-col gap-0.5">
            <Text variant="small">{t.roText?.(l) ?? t.value(l)}</Text>
            {t.note?.(l) ?? null}
          </div>
        );
      return (
        <div className="flex w-32 flex-col gap-1">
          <Combobox aria-label="Tax code" invalid={t.invalid?.(l)} options={t.options(l)} value={t.value(l) || null} onValueChange={(v) => t.onChange(l, v ?? '')} />
          {t.note?.(l) ?? null}
        </div>
      );
    },
  };
}

/** Return-reason picker over the shared RETURN_REASONS list. */
function returnReasonCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const r = b.returnReason!;
  return {
    key: 'returnReason',
    header: 'Reason',
    cell: (l) => {
      if (!l.itemId) return null;
      if (b.readOnly) return <Text variant="small" tone={r.value(l) ? undefined : 'muted'}>{r.value(l) || '—'}</Text>;
      return <Select clearable placeholder="None" aria-label="Return reason" className="w-32" options={RETURN_REASONS.map((x) => ({ value: x, label: x }))} value={r.value(l)} onValueChange={(v) => r.onChange(l, v ?? '')} />;
    },
  };
}

/** Return-cost cell — "Set manually" checkbox + a cost field, else "Auto (item cost)". */
function returnCostCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const c = b.returnCost!;
  return {
    key: 'returnCost',
    header: 'Return cost (PHP)',
    align: 'end',
    cell: (l) => {
      if (!l.itemId || !c.show(l)) return null;
      const manual = c.manual(l);
      if (b.readOnly) return <Text variant="small" className="whitespace-nowrap tabular-nums">{formatAmount(c.value(l) || c.auto(l))}</Text>;
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <Checkbox checked={manual} onChange={(e) => c.onToggle(l, e.currentTarget.checked)}>Set manually</Checkbox>
          {manual ? (
            <TextField aria-label="Return cost" type="number" min={0} value={String(c.value(l))} onChange={(e) => c.onChange(l, num(e.currentTarget.value))} />
          ) : (
            <Text variant="small" tone="muted">Auto (item cost)</Text>
          )}
        </div>
      );
    },
  };
}

/** Base-document link (delivery / invoice / SO) with a muted "row N" sub-line. */
function baseDocCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const base = b.baseDoc!;
  return {
    key: 'baseDoc',
    header: 'Base document',
    cell: (l) => {
      const d = base(l);
      if (!d) return <Text variant="small" tone="muted">—</Text>;
      return (
        <div className="flex flex-col whitespace-nowrap">
          <Link intent="primary" href={d.href}>{d.label}</Link>
          <Text variant="small" tone="muted">{d.sub}</Text>
        </div>
      );
    },
  };
}

/** Read-only credited-quantity column (sales returns). */
function creditedCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const credited = b.credited!;
  return {
    key: 'credited',
    header: 'Credited',
    align: 'end',
    cell: (l) => (l.itemId ? <Text variant="small" className="whitespace-nowrap tabular-nums">{credited(l)}</Text> : null),
  };
}

/** Editable "Gross after disc." that back-calculates the unit price (invoices). */
function grossCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const g = b.gross!;
  return {
    key: 'gross',
    header: `Gross after disc. (${b.currency})`,
    align: 'end',
    cell: (l) => {
      if (!vis(b, l)) return null;
      if (b.readOnly) return <Text variant="small" className="whitespace-nowrap tabular-nums">{formatAmount(g.get(l))}</Text>;
      return <TextField aria-label="Gross price after discount" type="number" min={0} className="w-40" value={String(g.get(l))} onChange={(e) => g.onChange(l, num(e.currentTarget.value))} />;
    },
  };
}

/** "WTax" liable checkbox (invoices) — disabled when the doc is locked or the customer doesn't withhold. */
function wtaxCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const w = b.wtax!;
  return {
    key: 'wtax',
    header: 'WTax',
    cell: (l) => (vis(b, l) ? <Checkbox aria-label="WTax liable" disabled={w.disabled} checked={w.checked(l)} onChange={(e) => w.onChange(l, e.currentTarget.checked)} /> : null),
  };
}

/** "Comm. %" commission-percent column (A/R invoices). */
function commissionCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const c = b.commission!;
  return {
    key: 'commission',
    header: 'Comm. %',
    align: 'end',
    cell: (l) => {
      if (!vis(b, l)) return null;
      if (b.readOnly) return <Text variant="small" className="tabular-nums">{c.value(l) ? `${c.value(l)}%` : '—'}</Text>;
      return <TextField aria-label="Commission %" type="number" min={0} suffix="%" className="w-24" value={String(c.value(l))} onChange={(e) => c.onChange(l, Math.min(100, num(e.currentTarget.value)))} />;
    },
  };
}

/** Read-only "Open for delivery" column (reserve invoices). */
function openForDeliveryCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const get = b.openForDelivery!;
  return {
    key: 'openForDelivery',
    header: 'Open for delivery',
    align: 'end',
    cell: (l) => {
      const v = get(l);
      return v == null ? null : <Text variant="small" className="whitespace-nowrap tabular-nums">{v}</Text>;
    },
  };
}

/** "Delivered / Open" column with a status badge (sales orders). */
function deliveredOpenCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const get = b.deliveredOpen!;
  return {
    key: 'delivery',
    header: 'Delivered / Open',
    align: 'end',
    cell: (l) => (vis(b, l) ? <div className="flex flex-col items-end gap-1 whitespace-nowrap tabular-nums">{get(l)}</div> : null),
  };
}

/** Editable free-text description (service lines). */
function descriptionCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const d = b.serviceDescription!;
  return {
    key: 'description',
    header: 'Description',
    cell: (l) => (b.readOnly ? <Text variant="small" className="whitespace-normal">{d.value(l)}</Text> : <TextField aria-label="Description" className="w-72" invalid={d.invalid?.(l)} value={d.value(l)} onChange={(e) => d.onChange(l, e.currentTarget.value)} />),
  };
}

/** G/L revenue-account picker (service lines). */
function glAccountCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const g = b.glAccount!;
  return {
    key: 'glAccount',
    header: 'G/L account',
    cell: (l) => (b.readOnly ? <Text variant="small">{g.text(l) || '—'}</Text> : <div className="w-60"><Combobox aria-label="G/L account" invalid={g.invalid?.(l)} options={g.options(g.value(l))} value={g.value(l) || null} onValueChange={(v) => g.onChange(l, v ?? '')} /></div>),
  };
}

/** Editable amount (service lines) — sets quantity to 1. */
function serviceAmountCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  const a = b.serviceAmount!;
  return {
    key: 'amount',
    header: `Amount (${b.currency})`,
    align: 'end',
    cell: (l) => (b.readOnly ? <Text variant="small" className="whitespace-nowrap tabular-nums">{formatAmount(a.value(l))}</Text> : <TextField aria-label="Amount" type="number" min={0} className="w-40" invalid={a.invalid?.(l)} value={String(a.value(l))} onChange={(e) => a.onChange(l, num(e.currentTarget.value))} />),
  };
}

// ── Shared info / catalog columns (hidden by default; the Columns menu reveals them) ──

/** 'Item' / 'Service' kind badge. */
function typeCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  return {
    key: 'type',
    header: 'Type',
    cell: (l) => { const k = b.lineKind?.(l); return k ? <TableStatus intent={k === 'Service' ? 'primary' : 'default'}>{k}</TableStatus> : null; },
  };
}

/** Read-only UoM name (the qty column shows the code). */
function uomNameCol<T extends SalesLineLike>(): PrefColumn<T> {
  return { key: 'uomName', header: 'UoM name', cell: (l) => (l.itemId ? <Text variant="small">{l.uomName}</Text> : null) };
}

/** Inventory units in one line unit. */
function itemsPerUnitCol<T extends SalesLineLike>(): PrefColumn<T> {
  return { key: 'itemsPerUnit', header: 'Items per unit', align: 'end', cell: (l) => (l.itemId ? <span className="text-sm tabular-nums">{l.itemsPerUnit}</span> : null) };
}

/** What set the price — a list name, "Manual", an agreement. */
function priceSourceCol<T extends SalesLineLike>(): PrefColumn<T> {
  return { key: 'priceSource', header: 'Price source', cell: (l) => (l.itemId ? <Text variant="small" tone={l.priceSource ? 'default' : 'muted'}>{l.priceSource || '—'}</Text> : null) };
}

/** Read-only unit price after discount, in document currency. */
function priceAfterDiscCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  return { key: 'priceAfterDisc', header: `Price after discount (${b.currency})`, align: 'end', cell: (l) => (vis(b, l) ? <span className="text-sm tabular-nums">{formatAmount(b.priceAfterDisc(l))}</span> : null) };
}

/** Read-only line tax in PHP. */
function taxAmountCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  return { key: 'taxAmount', header: 'Tax amount (PHP)', align: 'end', cell: (l) => (vis(b, l) ? <span className="text-sm tabular-nums">{formatAmount((b.taxAmount?.(l) ?? 0) * b.fx)}</span> : null) };
}

/** Read-only line total including tax, in PHP. */
function grossTotalLcCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  return { key: 'grossTotalLc', header: 'Gross total (PHP)', align: 'end', cell: (l) => (vis(b, l) ? <span className="text-sm tabular-nums">{formatAmount((b.lineNet(l) + (b.taxAmount?.(l) ?? 0)) * b.fx)}</span> : null) };
}

/** A read-only placeholder cell ("—") for a field with no backing data. */
function placeholderCol<T extends SalesLineLike>(key: string, header: string): PrefColumn<T> {
  return { key, header, cell: (l) => (l.itemId ? <span className="text-sm text-muted">—</span> : null) };
}

/** Country of origin — a real picker where the doc binds `country`, else a read-only placeholder. */
function countryOfOriginCol<T extends SalesLineLike>(b: ColBindings<T>): PrefColumn<T> {
  if (b.country) {
    return masterCol({ key: 'countryOfOrigin', header: 'Country of origin', def: countryDef, get: (l) => b.country!.value(l), onChange: (l, v) => b.country!.onChange(l, v), readOnly: b.readOnly, clearable: true });
  }
  return placeholderCol('countryOfOrigin', 'Country of origin');
}

/**
 * The shared sales column registry. A document binds it with its data/services, then
 * `pick`s which columns to show and their default visibility (mirrors `purchCols`).
 */
export function salesCols<T extends SalesLineLike>(b: ColBindings<T>): Record<string, PrefColumn<T>> {
  return {
    qty: qtyCol(b),
    ordered: roCol('ordered', 'Ordered', (l) => b.ordered?.(l) ?? null),
    outstanding: roCol('outstanding', 'Outstanding', (l) => b.outstanding?.(l) ?? null),
    priceList: priceListCol(b),
    unitPrice: unitPriceCol(b),
    discount: discountCol(b),
    pricing: pricingCol(b),
    total: totalCol(b),
    warehouse: warehouseCol(b),
    stockPutBack: stockPutBackCol(b),
    tax: taxColSales(b),
    returnReason: returnReasonCol(b),
    returnCost: returnCostCol(b),
    countryOfOrigin: countryOfOriginCol(b),
    baseDoc: baseDocCol(b),
    credited: creditedCol(b),
    gross: grossCol(b),
    wtax: wtaxCol(b),
    commission: commissionCol(b),
    openForDelivery: openForDeliveryCol(b),
    delivery: deliveredOpenCol(b),
    description: descriptionCol(b),
    glAccount: glAccountCol(b),
    amount: serviceAmountCol(b),
    // Shared info / catalog columns (parity with purchasing; hidden by default).
    type: typeCol(b),
    uomName: uomNameCol(),
    itemsPerUnit: itemsPerUnitCol(),
    priceSource: priceSourceCol(),
    priceAfterDisc: priceAfterDiscCol(b),
    taxAmount: taxAmountCol(b),
    grossTotalLc: grossTotalLcCol(b),
  };
}
