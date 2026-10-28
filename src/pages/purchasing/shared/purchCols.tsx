import type { ReactNode } from 'react';
import { AffixSelect, Combobox, DatePicker, Link, Select, TableStatus, Text, TextField, type ComboboxOption } from '@jasperlepardo/sikat-design-system';
import type { PrefColumn } from '../../../components/form/columnPrefs';
import { LineItemText } from '../../../components/form/LineItemText';
import { blanketLink, blanketOptions, blanketRef } from './purchLineHelpers';
import type { MasterDef, MasterRow } from '../../../components/form/MasterLookup';
import { formatAmount } from '../../../services/format';
import { warehouses } from '../../../services/inventoryMasters';
import { formatDate } from '../../../services/dates';
import { RETURN_REASONS } from '../../../mocks/goodsReturns';
import type { PurchLine } from '../../../mocks/purchLine';
import type { WarrantyTemplate } from '../../../mocks/itemMasters';
import { priceCol, discountCol, taxCol, amountCol, masterCol, textCol } from '../../../components/form/docLines/docColumns';
import { editTaxCode } from '../../../services/taxRecalc';

const num = (v: string) => (v === '' ? 0 : Number(v));
type Opt = { value: string; label: string };

/**
 * Per-document bindings for the shared column registry. The columns in `purchCols`
 * are thin shells that render identically across documents; each document supplies
 * its own data/services here (how to read/compute a value, option lists, totals),
 * so the *rendering* is unified in one place while the *logic* stays with the doc.
 */
export interface ColBindings<T extends PurchLine> {
  patch: (id: string, p: Partial<T>) => void;
  readOnly: boolean;
  /** Document currency, named in each amount column's header. */
  currency: string;
  /**
   * Header wording that differs by document: PR and PQ say "Required qty" and "Info price"
   * (an estimate or quote), the PO "Ordered qty"; the rest "Quantity" and "Unit price".
   */
  qtyHeader?: string;
  priceHeader?: string;
  /**
   * PO-only: an editable gross (tax-inclusive) unit price beside the net price,
   * driven by the document's Net/Gross price mode. Omitted elsewhere, so the
   * unit-price column stays a single net-price field (PR/PQ).
   */
  grossPrice?: {
    /** Show the editable net field (off in Gross-only mode). */
    showNet: boolean;
    /** Show the editable gross field (off in Net-only mode). */
    showGross: boolean;
    /** The gross price to show for this line. */
    get: (l: T) => number;
    /** Apply an edited gross price (writes the back-computed net). */
    onChange: (l: T, gross: number) => void;
  };
  lineNet: (l: T) => number;
  // pricing (per unit / per line)
  priceAfterDisc: (l: T) => number;
  grossAfterDisc: (l: T) => number;
  /** VAT charged by the vendor (0 on reverse-charge lines — the vendor doesn't bill it). */
  taxAmount: (l: T) => number;
  /** Self-assessed VAT on a reverse-charge line (you remit it on 1600-VT), or null when not reverse charge. */
  reverseChargeVat?: (l: T) => number | null;
  // option providers
  taxOptions: (l: T) => Opt[];
  /** Vendors a line can be bought from instead; per line when it depends on the item. */
  vendorOptions: ComboboxOption[] | ((l: T) => ComboboxOption[]);
  /**
   * Who the line is bought from: its own vendor, else the header vendor (PQ, PO, GR) or
   * the item's default vendor (PR). Shown as code over name, like the item column.
   */
  vendorOf?: (l: T) => { code: string; name: string } | undefined;
  warehouseOptions: Opt[];
  /**
   * Who and when the line's blanket agreement must cover (the document's vendor and date):
   * the column picks from the real agreements. Omitted = display only.
   */
  blanketScope?: { vendorId: string; date: string };
  uomOptions: (l: T) => Opt[];
  uomLabel: (l: T) => string;
  // masters (row type varies per project; only id/label are read)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  priceListDef: MasterDef<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  priceListWhere?: (r: any) => boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  departmentDef: MasterDef<any>;
  // behaviours
  changeUom: (l: T, uom: string) => void;
  changePriceList: (l: T, id: string) => void;
  onQty: (l: T, qty: number) => void;
  copiedQty: (l: T) => number;
  invalid: (l: T, field: string) => boolean;
  // doc-specific computed (optional — only columns a doc picks need them)
  lineKind?: (l: T) => string;
  stockAt?: (l: T) => { inStock: number; committed: number; ordered: number } | null;
  inventoryQty?: (l: T) => number;
  /** The line's G/L account, shown as number over name like the item column. */
  glAccountOf?: (l: T) => { code: string; name: string; editable: boolean; inherited: boolean } | null;
  /** Accounts a non-stock line's cost can go to (picker); omitted = the column is display-only. */
  glAccountOptions?: (l: T) => ComboboxOption[];
  // Goods-receipt extras (optional — leave unset elsewhere)
  /** A note rendered under the qty field (GR: how much of the PO line is still open). */
  qtyHint?: (l: T) => ReactNode;
  /** Lock the UoM select (default: locked once `copiedQty` > 0). GR locks copied-from-PO lines. */
  lockUom?: (l: T) => boolean;
  /** When false, the warehouse cell shows "Not stocked" instead of a picker (non-inventory lines). */
  warehouseStocked?: (l: T) => boolean;
  /** Bin picker rendered under the warehouse, for warehouses with bins enabled. */
  bin?: { show: (l: T) => boolean; options: (l: T) => Opt[]; onChange: (l: T, binId: string) => void; invalid?: (l: T) => boolean };
  /** Warehouse-change hook (GR resets the bin). Defaults to writing the warehouse only. */
  onWarehouse?: (l: T, code: string) => void;
  /**
   * How much of the line is on purchase orders (added, not cancelled), for the `orderedQty` column:
   * a request line's drawn quantity, or what was ordered from a quotation line.
   */
  orderedQtyOf?: (l: T) => number;
  /** Computed open qty for the `openQty` column (GR derives it from the receipt + PO). */
  openQtyOf?: (l: T) => number;
  /** The base document a line was copied from, for the `baseDoc` column (GR → PO, Return → GR/AP). */
  baseDoc?: (l: T) => { href: string; label: string } | null;
  /** A muted note shown instead of the warehouse picker (e.g. A/P invoice: "Received in WH01" for a receipt-copied line). */
  warehouseNote?: (l: T) => ReactNode;
  /** A muted sub-line under the tax-code cell (e.g. A/P invoice: the line's resolved ATC). */
  taxHint?: (l: T) => ReactNode;
  // Goods-return / credit-memo extras (optional)
  /** Country-of-origin master, for the `countryOfOrigin` column. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  countryDef?: MasterDef<any>;
  /** Warranty template picker; a line saved before warranties were stored shows the item's. */
  warrantyDef?: MasterDef<WarrantyTemplate>;
  itemWarranty?: (l: T) => string;
  /** The line's unit cost in PHP, for the `unitCost` column. */
  unitCost?: (l: T) => number;
  /** The line's withholding codes/rates summary (or "None"), for the `withholding` column. */
  withholdingText?: (l: T) => string;
  /** The withholding taxable base, or null when none applies, for the `withholdingBase` column. */
  withholdingBase?: (l: T) => number | null;
}

/**
 * A picker whose value reads as code over name, in the field and in its options (`subLabel`
 * on top). Empty means `inherited` (the vendor or account the line falls back to), laid over
 * the empty field the same way; ✕ goes back to it.
 */
function TwoLinePicker({ label, options, value, inherited, fallback = 'None', onChange }: {
  label: string;
  options: ComboboxOption[];
  value: string;
  inherited?: { code: string; name: string };
  fallback?: string;
  onChange: (value: string) => void;
}) {
  return (
    // Opening the dropdown selects the value's text in its search box, and a selected input scrolls
    // to its end ("17 Apple South…"): bring it back to the start, keeping the selection.
    <div className="two-line-field relative w-56" onFocus={(e) => { const t = e.target; if (t instanceof HTMLInputElement) requestAnimationFrame(() => { t.scrollLeft = 0; }); }}>
      <Combobox aria-label={label} clearable placeholder={inherited ? '' : fallback} options={options} value={value || null} onValueChange={(v) => onChange(v ?? '')} />
      {!value && inherited ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 right-14 flex min-w-0 flex-col justify-center pl-3">
          <Text variant="caption" className="truncate">{inherited.code}</Text>
          <Text variant="small" className="truncate">{inherited.name}</Text>
        </div>
      ) : null}
    </div>
  );
}

/** Warehouse picker options as code over name (the documents pass code-keyed options, some labelled by code only). */
const twoLineWarehouses = (opts: Opt[]): ComboboxOption[] => {
  const all = warehouses.snapshot();
  return opts.map((o) => {
    const w = all.find((x) => x.code === o.value);
    return w ? { value: o.value, label: w.name, subLabel: w.code, subLabelPlacement: 'top' as const, text: `${w.code} ${w.name}` } : o;
  });
};

const money = (n: number) => <span className="whitespace-nowrap text-sm tabular-nums">{formatAmount(n)}</span>;
// Quantities, like open qty: no forced decimals (100, not 100.00).
const qty = (n: number) => <span className="whitespace-nowrap text-sm tabular-nums">{n.toLocaleString('en-PH')}</span>;

/**
 * The single source of truth for every purchasing line column (except the item cell
 * and ⋯ actions, which `<DocLines>` injects). A document builds this map with its
 * bindings, then `pick()`s the columns it wants and their default visibility.
 */
export function purchCols<T extends PurchLine>(b: ColBindings<T>): Record<string, PrefColumn<T>> {
  const ro = b.readOnly;
  // Amounts are plain numbers; the currency is in the header (one per document).
  const cur = (header: string) => `${header} (${b.currency})`;

  return {
    type: {
      key: 'lineKind', header: 'Item/service type',
      cell: (l) => { const k = b.lineKind?.(l); return k ? <TableStatus intent={k === 'Service' ? 'primary' : 'default'}>{k}</TableStatus> : null; },
    },
    qty: {
      key: 'qty', header: b.qtyHeader ?? 'Quantity', align: 'end',
      cell: (l) => {
        if (!l.itemId) return null;
        if (ro) return <span className="whitespace-nowrap text-sm tabular-nums">{l.quantity.toLocaleString('en-PH')} {b.uomLabel(l)}</span>;
        const lockUom = b.lockUom ? b.lockUom(l) : b.copiedQty(l) > 0;
        // Like the discount field: the number with its unit as a dropdown in the field's suffix.
        return (
          <div className="flex flex-col items-end gap-1">
            <TextField
              aria-label="Quantity"
              className="w-32 *:justify-end [&_input]:text-right"
              type="number"
              min={b.copiedQty(l)}
              value={String(l.quantity)}
              invalid={b.invalid(l, 'quantity')}
              onChange={(e) => b.onQty(l, num(e.currentTarget.value))}
              suffix={<AffixSelect aria-label="UoM" options={b.uomOptions(l)} value={l.uomCode} onValueChange={(v) => v && b.changeUom(l, v)} disabled={lockUom} />}
            />
            {b.qtyHint?.(l) ?? null}
          </div>
        );
      },
    },
    openQty: {
      key: 'openQty', header: 'Open qty', align: 'end',
      cell: (l) => {
        if (!l.itemId) return null;
        const copied = b.copiedQty(l);
        const open = b.openQtyOf?.(l) ?? l.openQty ?? 0;
        return (
          <div className="flex flex-col items-end">
            <span className="whitespace-nowrap text-sm tabular-nums">{open.toLocaleString('en-PH')} {b.uomLabel(l)}</span>
            {copied ? <Text variant="caption" tone="muted">{copied} copied</Text> : null}
          </div>
        );
      },
    },
    orderedQty: {
      key: 'orderedQty', header: 'Ordered qty', align: 'end',
      cell: (l) => (l.itemId ? <span className="whitespace-nowrap text-sm tabular-nums">{(b.orderedQtyOf?.(l) ?? 0).toLocaleString('en-PH')} {b.uomLabel(l)}</span> : null),
    },
    quotedQty: {
      key: 'quotedQty', header: 'Quoted qty', align: 'end',
      cell: (l) => {
        if (!l.itemId) return null;
        if (ro) return <Text variant="small" className="whitespace-nowrap tabular-nums">{(l.quotedQty ?? 0).toLocaleString('en-PH')}</Text>;
        return <TextField aria-label="Quoted quantity" type="number" min={0} className="w-24" value={String(l.quotedQty ?? 0)} onChange={(e) => b.patch(l.id, { quotedQty: num(e.currentTarget.value) } as Partial<T>)} />;
      },
    },
    inventoryQty: { key: 'inventoryQty', header: 'Inventory qty', align: 'end', cell: (l) => (l.itemId ? qty(b.inventoryQty?.(l) ?? 0) : null) },
    inStock: { key: 'inStock', header: 'In stock', align: 'end', cell: (l) => { const s = b.stockAt?.(l); return s ? qty(s.inStock) : <span className="text-sm">—</span>; } },
    committed: { key: 'committed', header: 'Committed', align: 'end', cell: (l) => { const s = b.stockAt?.(l); return s ? qty(s.committed) : <span className="text-sm">—</span>; } },
    ordered: { key: 'ordered', header: 'On order', align: 'end', cell: (l) => { const s = b.stockAt?.(l); return s ? qty(s.ordered) : <span className="text-sm">—</span>; } },

    priceList: masterCol<T, MasterRow>({ key: 'priceList', header: 'Price list', def: b.priceListDef, get: (l) => l.priceListId, onChange: (l, v) => b.changePriceList(l, v), where: b.priceListWhere, readOnly: ro, width: 'w-44' }),
    unitPrice: b.grossPrice
      ? {
          key: 'unitPrice', header: cur(b.priceHeader ?? 'Unit price'), align: 'end',
          cell: (l) => {
            if (!l.itemId) return null;
            if (ro) return money(l.unitPrice);
            const gp = b.grossPrice!;
            const field = (label: string, value: number, onChange: (v: number) => void, invalid?: boolean) => (
              <TextField aria-label={label} type="number" min={0} className="w-28 [&_input]:text-right" value={value ? String(value) : ''} placeholder="0.00" invalid={invalid} onChange={(e) => onChange(num(e.currentTarget.value))} />
            );
            return (
              <div className="flex flex-col items-end gap-1">
                {gp.showNet ? field('Unit price', l.unitPrice, (v) => b.patch(l.id, { unitPrice: v } as Partial<T>), b.invalid(l, 'unitPrice')) : null}
                {gp.showGross ? field('Gross price', gp.get(l), (v) => gp.onChange(l, v)) : null}
              </div>
            );
          },
        }
      : priceCol<T>({ key: 'unitPrice', header: cur(b.priceHeader ?? 'Unit price'), readOnly: ro, get: (l) => l.unitPrice, onChange: (l, v) => b.patch(l.id, { unitPrice: v } as Partial<T>) }),
    discount: discountCol<T>({ key: 'discountPct', header: 'Discount %', readOnly: ro, get: (l) => l.discountPct, onChange: (l, v) => b.patch(l.id, { discountPct: v } as Partial<T>), basePrice: (l) => l.unitPrice }),
    priceAfterDisc: amountCol<T>({ key: 'priceAfterDisc', header: cur('Price after discount'), value: b.priceAfterDisc, align: 'end' }),
    tax: (() => {
      const base = taxCol<T>({ key: 'taxCode', header: 'Tax code', options: b.taxOptions, get: (l) => l.taxCode, onChange: (l, v) => b.patch(l.id, editTaxCode(v) as Partial<T>), readOnly: ro, clearable: true, invalid: (l) => b.invalid(l, 'taxCode') });
      if (!b.taxHint) return base;
      // Compose the tax picker with a per-line hint (the resolved ATC) underneath.
      return { ...base, cell: (l: T) => (l.itemId ? <div className="flex flex-col gap-1">{base.cell!(l)}{b.taxHint!(l) ?? null}</div> : null) };
    })(),
    taxAmount: amountCol<T>({ key: 'taxAmount', header: cur('Tax amount'), value: b.taxAmount, align: 'end' }),
    // Reverse-charge (self-assessed) VAT: shown only on reverse-charge lines; "—" elsewhere.
    reverseChargeVat: { key: 'reverseChargeVat', header: cur('Reverse-charge VAT'), align: 'end', cell: (l) => { if (!l.itemId) return null; const v = b.reverseChargeVat?.(l); return v != null ? money(v) : <span className="text-muted">—</span>; } },
    gross: amountCol<T>({ key: 'grossAfterDisc', header: cur('Gross price'), value: b.grossAfterDisc, align: 'end' }),
    total: { key: 'total', header: cur('Total'), align: 'end', cell: (l) => (l.itemId ? money(b.lineNet(l)) : null) },
    // Line total including tax, in the shown currency like every other amount (the key predates that).
    grossTotalLc: { key: 'grossTotalLc', header: cur('Gross total'), align: 'end', cell: (l) => (l.itemId ? money(b.lineNet(l) + b.taxAmount(l)) : null) },

    requiredDate: { key: 'requiredDate', header: 'Required date', cell: (l) => !l.itemId ? null : ro ? <Text variant="small">{l.requiredDate ? formatDate(l.requiredDate) : '—'}</Text> : <DatePicker aria-label="Required date" className="w-36" value={l.requiredDate || null} onValueChange={(v) => b.patch(l.id, { requiredDate: v ?? '' } as Partial<T>)} /> },
    quotedDate: { key: 'quotedDate', header: 'Quoted date', cell: (l) => !l.itemId ? null : ro ? <Text variant="small">{l.quotedDate ? formatDate(l.quotedDate) : '—'}</Text> : <DatePicker aria-label="Quoted date" className="w-36" value={l.quotedDate || null} onValueChange={(v) => b.patch(l.id, { quotedDate: v ?? '' } as Partial<T>)} /> },
    uomName: { key: 'uomName', header: 'UoM name', cell: (l) => (l.itemId ? <Text variant="small">{l.uomName}</Text> : null) },
    itemsPerUnit: { key: 'itemsPerUnit', header: 'Items per unit', align: 'end', cell: (l) => (l.itemId ? <span className="text-sm tabular-nums">{l.itemsPerUnit}</span> : null) },

    vendor: {
      key: 'lineVendorId', header: 'Vendor',
      cell: (l) => {
        if (!l.itemId) return null;
        const own = l.lineVendorId ?? '';
        const v = b.vendorOf?.(l);
        const opts = typeof b.vendorOptions === 'function' ? b.vendorOptions(l) : b.vendorOptions;
        // No other vendor to pick (PO, invoices, an item no vendor carries): show who it's bought from.
        if (ro || !opts.length) return v ? <LineItemText itemNo={v.code} description={v.name} /> : <Text variant="small">Any vendor</Text>;
        // Editable lines pick straight from the dropdown; empty = the inherited vendor.
        return <TwoLinePicker label="Vendor" options={opts} value={own} inherited={own ? undefined : v} fallback="Any vendor" onChange={(id) => b.patch(l.id, { lineVendorId: id } as Partial<T>)} />;
      },
    },
    warehouse: {
      key: 'warehouse', header: b.bin ? 'Warehouse / Bin' : 'Warehouse',
      cell: (l) => {
        if (!l.itemId) return null;
        if (b.warehouseStocked && !b.warehouseStocked(l)) return <span className="text-muted">Not stocked</span>;
        const note = b.warehouseNote?.(l);
        if (note) return <Text variant="small" tone="muted">{note}</Text>;
        const showBin = b.bin?.show(l) ?? false;
        if (ro) {
          if (!l.warehouse) return <span className="text-muted">—</span>;
          const w = warehouses.snapshot().find((x) => x.code === l.warehouse);
          return (
            <div className="flex flex-col gap-0.5">
              <LineItemText itemNo={l.warehouse} description={w?.name ?? ''} />
              {showBin && l.binCode ? <Text variant="caption" tone="muted">{l.binCode}</Text> : null}
            </div>
          );
        }
        // Copied lines keep their warehouse (a downstream doc points at it). Code over name, like the vendor.
        return (
          <div className="flex flex-col gap-1">
            <div className="two-line-field w-48">
              <Select aria-label="Warehouse" placeholder="None" clearable options={twoLineWarehouses(b.warehouseOptions)} value={l.warehouse ?? ''} onValueChange={(v) => (b.onWarehouse ? b.onWarehouse(l, v ?? '') : b.patch(l.id, { warehouse: v ?? '' } as Partial<T>))} disabled={b.copiedQty(l) > 0} invalid={b.invalid(l, 'warehouse')} />
            </div>
            {showBin ? <Select aria-label="Bin location" className="min-w-28" options={b.bin!.options(l)} value={l.binId ?? ''} onValueChange={(v) => b.bin!.onChange(l, v ?? '')} invalid={b.bin!.invalid?.(l)} /> : null}
          </div>
        );
      },
    },
    glAccount: {
      key: 'glAccount', header: 'G/L account',
      cell: (l) => {
        const a = b.glAccountOf?.(l);
        if (!a) return <span className="text-muted">—</span>;
        // Stock lines post to the inventory account: shown, never picked.
        if (ro || !a.editable || !b.glAccountOptions) return <LineItemText itemNo={a.code} description={a.name} />;
        return <TwoLinePicker label="G/L account" options={b.glAccountOptions(l)} value={l.glAccount ?? ''} inherited={a.inherited ? a : undefined} onChange={(code) => b.patch(l.id, { glAccount: code } as Partial<T>)} />;
      },
    },
    department: masterCol<T, MasterRow>({ key: 'department', header: 'Department', def: b.departmentDef, get: (l) => l.departmentId ?? '', onChange: (l, v) => b.patch(l.id, { departmentId: v } as Partial<T>), placeholder: 'None', clearable: true, readOnly: ro }),
    freeText: textCol<T>({ key: 'freeText', header: 'Free text', width: 'min-w-40', readOnly: ro, get: (l) => l.freeText ?? '', onChange: (l, v) => b.patch(l.id, { freeText: v } as Partial<T>) }),
    blanket: {
      key: 'blanketAgreement', header: 'Blanket agreement no.',
      cell: (l) => {
        if (!l.itemId) return null;
        const ref = blanketRef(l.agreementId);
        if (ro || !b.blanketScope) return ref ? <LineItemText itemNo={ref.code} description={ref.name} /> : <span className="text-muted">—</span>;
        return <TwoLinePicker label="Blanket agreement" options={blanketOptions(b.blanketScope, l.itemId, l.agreementId)} value={l.agreementId ?? ''} onChange={(id) => b.patch(l.id, (id ? blanketLink(id, l.itemId) : { agreementId: '', agreementLineId: '' }) as Partial<T>)} />;
      },
    },
    requisition: textCol<T>({ key: 'requisitionSlipNo', header: 'Requisition slip no.', width: 'w-36', readOnly: ro, get: (l) => l.requisitionSlipNo, onChange: (l, v) => b.patch(l.id, { requisitionSlipNo: v } as Partial<T>) }),
    returnReason: {
      key: 'returnReason', header: 'Return reason',
      cell: (l) => {
        if (!l.itemId) return null;
        const value = (l as { returnReason?: string }).returnReason ?? '';
        if (ro) return <Text variant="small">{value || '—'}</Text>;
        return <Select aria-label="Return reason" className="w-44" placeholder="— Pick a reason —" clearable invalid={b.invalid(l, 'returnReason')} options={RETURN_REASONS.map((r) => ({ value: r, label: r }))} value={value} onValueChange={(v) => b.patch(l.id, { returnReason: v ?? '' } as Partial<T>)} />;
      },
    },
    // Goods-return / credit-memo columns.
    countryOfOrigin: masterCol<T, MasterRow>({ key: 'countryOfOrigin', header: 'Country/region of origin', def: b.countryDef!, get: (l) => (l as { countryOfOriginCode?: string }).countryOfOriginCode ?? '', onChange: (l, v) => b.patch(l.id, { countryOfOriginCode: v } as unknown as Partial<T>), clearable: true, readOnly: ro, width: 'w-40' }),
    warranty: masterCol<T, WarrantyTemplate>({ key: 'warranty', header: 'Warranty', def: b.warrantyDef!, get: (l) => l.warrantyTemplateId ?? b.itemWarranty?.(l) ?? '', onChange: (l, v) => b.patch(l.id, { warrantyTemplateId: v } as Partial<T>), where: (r) => r.active, readOnly: ro, clearable: true, placeholder: 'None', width: 'w-56' }),
    unitCost: { key: 'unitCost', header: 'Unit cost price (PHP)', align: 'end', cell: (l) => (l.itemId ? money(b.unitCost?.(l) ?? 0) : null) },
    withholding: { key: 'withholding', header: 'Withholding tax code / rate', cell: (l) => (l.itemId ? <Text variant="small">{b.withholdingText?.(l) || 'None'}</Text> : null) },
    withholdingBase: { key: 'withholdingBase', header: 'Taxable amount', align: 'end', cell: (l) => { const v = b.withholdingBase?.(l); return l.itemId && v != null ? <span className="text-sm tabular-nums">{formatAmount(v)}</span> : null; } },
    lineStatus: { key: 'lineStatus', header: 'Line status', cell: (l) => { const s = (l as { status?: 'Open' | 'Closed' }).status; return s ? <TableStatus intent={s === 'Open' ? 'primary' : 'success'}>{s}</TableStatus> : null; } },

    // Catalog extras — mostly post-order/receipt fields, available (hidden) on any doc.
    bpCatalogNo: textCol<T>({ key: 'bpCatalogNo', header: 'Vendor catalog no.', width: 'w-36', readOnly: ro, get: (l) => l.bpCatalogNo ?? '', onChange: (l, v) => b.patch(l.id, { bpCatalogNo: v } as Partial<T>) }),
    mfrNo: textCol<T>({ key: 'mfrNo', header: 'Manufacturer no.', width: 'w-36', readOnly: ro, get: (l) => l.mfrNo ?? '', onChange: (l, v) => b.patch(l.id, { mfrNo: v } as Partial<T>) }),
    deliveryDate: { key: 'deliveryDate', header: 'Delivery date', cell: (l) => !l.itemId ? null : ro ? <Text variant="small">{l.deliveryDate ? formatDate(l.deliveryDate) : '—'}</Text> : <DatePicker aria-label="Del. date" className="w-36" value={l.deliveryDate || null} onValueChange={(v) => b.patch(l.id, { deliveryDate: v ?? '' } as Partial<T>)} /> },
    receivedQty: { key: 'receivedQty', header: 'Received qty', align: 'end', cell: (l) => (l.itemId ? <span className="text-sm tabular-nums">{(l.receivedQty ?? 0).toLocaleString('en-PH')}</span> : null) },
    packages: {
      key: 'packages', header: 'No. of packages', align: 'end',
      cell: (l) => !l.itemId ? null : ro
        ? <span className="text-sm tabular-nums">{(l.packages ?? 0).toLocaleString('en-PH')}</span>
        : <TextField aria-label="No. of packages" type="number" min={0} className="w-24" value={String(l.packages ?? 0)} onChange={(e) => b.patch(l.id, { packages: num(e.currentTarget.value) } as Partial<T>)} />,
    },
    // The document a line was copied from (GR → PO).
    baseDoc: { key: 'baseDoc', header: 'Base document', cell: (l) => { const d = b.baseDoc?.(l); return d ? <Link intent="primary" href={d.href}>{d.label}</Link> : l.itemId ? <span className="text-muted">—</span> : null; } },
  };
}

// The generic column picker now lives in the shared docLines module; re-exported
// here so document descriptors keep importing `{ purchCols, pick }` from one place.
export { pick } from '../../../components/form/docLines/pick';
