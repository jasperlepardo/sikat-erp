import type { ReactNode } from 'react';
import { DatePicker, Link, Select, TableStatus, Text, TextField } from '@jasperlepardo/sikat-design-system';
import type { PrefColumn } from '../../../components/form/columnPrefs';
import type { MasterDef, MasterRow } from '../../../components/form/MasterLookup';
import { formatAmount } from '../../../services/format';
import { formatDate } from '../../../services/dates';
import { RETURN_REASONS } from '../../../mocks/goodsReturns';
import type { PurchLine } from '../../../mocks/purchLine';
import { priceCol, discountCol, taxCol, amountCol, masterCol, textCol, comboCol } from './purchColumns';

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
  /** Document currency ('PHP' hides the prefix + FX line, like PR). */
  currency: string;
  /** PHP per unit of the document currency, for the Net-total FX sub-line. */
  fx?: number;
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
  taxAmount: (l: T) => number;
  // option providers
  taxOptions: (l: T) => Opt[];
  vendorOptions: Opt[];
  warehouseOptions: Opt[];
  blanketOptions: Opt[];
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
  glAccountText?: (l: T) => string;
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
  /** Computed open qty for the `openQty` column (GR derives it from the receipt + PO). */
  openQtyOf?: (l: T) => number;
  /** The base document a line was copied from, for the `baseDoc` column (GR → PO, Return → GR/AP). */
  baseDoc?: (l: T) => { href: string; label: string } | null;
  // Goods-return / credit-memo extras (optional)
  /** Country-of-origin master, for the `countryOfOrigin` column. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  countryDef?: MasterDef<any>;
  /** The line item's warranty template name (or "None"), for the `warranty` column. */
  warrantyText?: (l: T) => string;
  /** The line's unit cost in PHP, for the `unitCost` column. */
  unitCost?: (l: T) => number;
  /** The line's withholding codes/rates summary (or "None"), for the `withholding` column. */
  withholdingText?: (l: T) => string;
  /** The withholding taxable base, or null when none applies, for the `withholdingBase` column. */
  withholdingBase?: (l: T) => number | null;
}

const money = (n: number) => <span className="whitespace-nowrap text-sm tabular-nums">{formatAmount(n)}</span>;

/**
 * The single source of truth for every purchasing line column (except the item cell
 * and ⋯ actions, which `<PurchDoc>` injects). A document builds this map with its
 * bindings, then `pick()`s the columns it wants and their default visibility.
 */
export function purchCols<T extends PurchLine>(b: ColBindings<T>): Record<string, PrefColumn<T>> {
  const ro = b.readOnly;
  const prefix = b.currency === 'PHP' ? '' : `${b.currency} `;
  const curPrefix = b.currency === 'PHP' ? undefined : b.currency;

  return {
    type: {
      key: 'lineKind', header: 'Type',
      cell: (l) => { const k = b.lineKind?.(l); return k ? <TableStatus intent={k === 'Service' ? 'primary' : 'default'}>{k}</TableStatus> : null; },
    },
    qty: {
      key: 'qty', header: 'Quantity', align: 'end',
      cell: (l) => {
        if (!l.itemId) return null;
        if (ro) return <span className="whitespace-nowrap text-sm tabular-nums">{l.quantity.toLocaleString('en-PH')} {b.uomLabel(l)}</span>;
        const lockUom = b.lockUom ? b.lockUom(l) : b.copiedQty(l) > 0;
        return (
          <div className="flex flex-col items-end gap-1">
            <div className="flex w-44 items-stretch">
              <TextField aria-label="Quantity" className="z-10 -mr-px min-w-0 flex-1 rounded-r-none! [&_input]:text-right" type="number" min={b.copiedQty(l)} value={String(l.quantity)} invalid={b.invalid(l, 'quantity')} onChange={(e) => b.onQty(l, num(e.currentTarget.value))} />
              <div className="z-20 w-24 shrink-0">
                <Select aria-label="UoM" className="rounded-l-none!" options={b.uomOptions(l)} value={l.uomCode} onValueChange={(v) => v && b.changeUom(l, v)} disabled={lockUom} />
              </div>
            </div>
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
    quotedQty: {
      key: 'quotedQty', header: 'Quoted qty', align: 'end',
      cell: (l) => {
        if (!l.itemId) return null;
        if (ro) return <Text variant="small" className="whitespace-nowrap tabular-nums">{(l.quotedQty ?? 0).toLocaleString('en-PH')}</Text>;
        return <TextField aria-label="Quoted quantity" type="number" min={0} className="w-24" value={String(l.quotedQty ?? 0)} onChange={(e) => b.patch(l.id, { quotedQty: num(e.currentTarget.value) } as Partial<T>)} />;
      },
    },
    inventoryQty: { key: 'inventoryQty', header: 'Inventory qty', align: 'end', cell: (l) => (l.itemId ? money(b.inventoryQty?.(l) ?? 0) : null) },
    inStock: { key: 'inStock', header: 'In stock', align: 'end', cell: (l) => { const s = b.stockAt?.(l); return <span className="text-sm tabular-nums">{s ? formatAmount(s.inStock) : '—'}</span>; } },
    committed: { key: 'committed', header: 'Committed', align: 'end', cell: (l) => { const s = b.stockAt?.(l); return <span className="text-sm tabular-nums">{s ? formatAmount(s.committed) : '—'}</span>; } },
    ordered: { key: 'ordered', header: 'On order', align: 'end', cell: (l) => { const s = b.stockAt?.(l); return <span className="text-sm tabular-nums">{s ? formatAmount(s.ordered) : '—'}</span>; } },

    priceList: masterCol<T, MasterRow>({ key: 'priceList', header: 'Price list', def: b.priceListDef, get: (l) => l.priceListId, onChange: (l, v) => b.changePriceList(l, v), where: b.priceListWhere, readOnly: ro, width: 'w-44' }),
    unitPrice: b.grossPrice
      ? {
          key: 'unitPrice', header: 'Unit price', align: 'end',
          cell: (l) => {
            if (!l.itemId) return null;
            if (ro) return <span className="whitespace-nowrap text-sm tabular-nums">{prefix}{formatAmount(l.unitPrice)}</span>;
            const gp = b.grossPrice!;
            const field = (label: string, value: number, onChange: (v: number) => void, invalid?: boolean) => (
              <TextField aria-label={label} type="number" min={0} prefix={curPrefix} className="w-28 [&_input]:text-right" value={value ? String(value) : ''} placeholder="0.00" invalid={invalid} onChange={(e) => onChange(num(e.currentTarget.value))} />
            );
            return (
              <div className="flex flex-col items-end gap-1">
                {gp.showNet ? field('Unit price', l.unitPrice, (v) => b.patch(l.id, { unitPrice: v } as Partial<T>), b.invalid(l, 'unitPrice')) : null}
                {gp.showGross ? field('Gross price', gp.get(l), (v) => gp.onChange(l, v)) : null}
              </div>
            );
          },
        }
      : priceCol<T>({ key: 'unitPrice', header: 'Unit price', prefix: curPrefix, readOnly: ro, get: (l) => l.unitPrice, onChange: (l, v) => b.patch(l.id, { unitPrice: v } as Partial<T>) }),
    discount: discountCol<T>({ key: 'discountPct', header: 'Discount', readOnly: ro, get: (l) => l.discountPct, onChange: (l, v) => b.patch(l.id, { discountPct: v } as Partial<T>), basePrice: (l) => l.unitPrice }),
    priceAfterDisc: amountCol<T>({ key: 'priceAfterDisc', header: 'Price after discount', value: b.priceAfterDisc, align: 'end' }),
    tax: taxCol<T>({ key: 'taxCode', header: 'Tax code', options: b.taxOptions, get: (l) => l.taxCode, onChange: (l, v) => b.patch(l.id, { taxCode: v } as Partial<T>), readOnly: ro, clearable: true, invalid: (l) => b.invalid(l, 'taxCode') }),
    taxAmount: amountCol<T>({ key: 'taxAmount', header: 'Tax amount', value: b.taxAmount, align: 'end' }),
    gross: amountCol<T>({ key: 'grossAfterDisc', header: 'Gross price', value: b.grossAfterDisc, align: 'end' }),
    total: {
      key: 'total', header: 'Net total', align: 'end',
      cell: (l) => {
        if (!l.itemId) return null;
        const net = b.lineNet(l);
        return (
          <div className="flex flex-col items-end gap-0.5 tabular-nums">
            <span className="whitespace-nowrap text-sm">{prefix}{formatAmount(net)}</span>
            {b.currency !== 'PHP' && b.fx ? <Text variant="small" tone="muted">PHP {formatAmount(net * b.fx)}</Text> : null}
          </div>
        );
      },
    },
    // Line total including tax, in local currency (PHP). Used by the PO.
    grossTotalLc: { key: 'grossTotalLc', header: 'Gross total (LC)', align: 'end', cell: (l) => (l.itemId ? <span className="whitespace-nowrap text-sm tabular-nums">PHP {formatAmount((b.lineNet(l) + b.taxAmount(l)) * (b.fx ?? 1))}</span> : null) },

    requiredDate: { key: 'requiredDate', header: 'Required date', cell: (l) => !l.itemId ? null : ro ? <Text variant="small">{l.requiredDate ? formatDate(l.requiredDate) : '—'}</Text> : <DatePicker aria-label="Required date" className="w-36" value={l.requiredDate || null} onValueChange={(v) => b.patch(l.id, { requiredDate: v ?? '' } as Partial<T>)} /> },
    quotedDate: { key: 'quotedDate', header: 'Quoted date', cell: (l) => !l.itemId ? null : ro ? <Text variant="small">{l.quotedDate ? formatDate(l.quotedDate) : '—'}</Text> : <DatePicker aria-label="Quoted date" className="w-36" value={l.quotedDate || null} onValueChange={(v) => b.patch(l.id, { quotedDate: v ?? '' } as Partial<T>)} /> },
    uomName: { key: 'uomName', header: 'UoM name', cell: (l) => (l.itemId ? <Text variant="small">{l.uomName}</Text> : null) },
    itemsPerUnit: { key: 'itemsPerUnit', header: 'Items per unit', align: 'end', cell: (l) => (l.itemId ? <span className="text-sm tabular-nums">{l.itemsPerUnit}</span> : null) },
    // Yes/No — is the purchasing unit the inventory unit (items per unit == 1)?
    inventoryUom: { key: 'inventoryUom', header: 'Inventory UoM', cell: (l) => (l.itemId ? (l.itemsPerUnit === 1 ? 'Yes' : 'No') : null) },

    vendor: comboCol<T>({ key: 'lineVendorId', header: 'Preferred vendor', options: b.vendorOptions, readOnly: ro, get: (l) => l.lineVendorId ?? '', onChange: (l, v) => b.patch(l.id, { lineVendorId: v } as Partial<T>), placeholder: 'Any vendor' }),
    warehouse: {
      key: 'warehouse', header: b.bin ? 'Whse / Bin' : 'Warehouse',
      cell: (l) => {
        if (!l.itemId) return null;
        if (b.warehouseStocked && !b.warehouseStocked(l)) return <span className="text-muted">Not stocked</span>;
        const showBin = b.bin?.show(l) ?? false;
        if (ro) {
          const w = b.warehouseOptions.find((o) => o.value === l.warehouse);
          return (
            <div className="flex flex-col gap-0.5">
              <Text variant="small">{w?.label ?? l.warehouse ?? '—'}</Text>
              {showBin && l.binCode ? <Text variant="caption" tone="muted">{l.binCode}</Text> : null}
            </div>
          );
        }
        // Copied lines keep their warehouse (a downstream doc points at it).
        return (
          <div className="flex flex-col gap-1">
            <Select aria-label="Warehouse" className="min-w-28" placeholder="None" clearable options={b.warehouseOptions} value={l.warehouse ?? ''} onValueChange={(v) => (b.onWarehouse ? b.onWarehouse(l, v ?? '') : b.patch(l.id, { warehouse: v ?? '' } as Partial<T>))} disabled={b.copiedQty(l) > 0} invalid={b.invalid(l, 'warehouse')} />
            {showBin ? <Select aria-label="Bin location" className="min-w-28" options={b.bin!.options(l)} value={l.binId ?? ''} onValueChange={(v) => b.bin!.onChange(l, v ?? '')} invalid={b.bin!.invalid?.(l)} /> : null}
          </div>
        );
      },
    },
    glAccount: { key: 'glAccount', header: 'G/L account', cell: (l) => { const t = b.glAccountText?.(l); return t ? <Text variant="small" className="whitespace-normal">{t}</Text> : <span className="text-muted">—</span>; } },
    department: masterCol<T, MasterRow>({ key: 'department', header: 'Department', def: b.departmentDef, get: (l) => l.departmentId ?? '', onChange: (l, v) => b.patch(l.id, { departmentId: v } as Partial<T>), placeholder: 'None', clearable: true, readOnly: ro }),
    freeText: textCol<T>({ key: 'freeText', header: 'Free text', width: 'min-w-40', readOnly: ro, get: (l) => l.freeText ?? '', onChange: (l, v) => b.patch(l.id, { freeText: v } as Partial<T>) }),
    blanket: {
      key: 'blanketAgreement', header: 'Blanket agreement',
      cell: (l) => !l.itemId ? null : ro ? <Text variant="small">{l.blanketAgreement || '—'}</Text> : <Select aria-label="Blanket agreement" className="w-48" options={b.blanketOptions} value={l.blanketAgreement ?? ''} onValueChange={(v) => b.patch(l.id, { blanketAgreement: v } as Partial<T>)} />,
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
    countryOfOrigin: masterCol<T, MasterRow>({ key: 'countryOfOrigin', header: 'Country of origin', def: b.countryDef!, get: (l) => (l as { countryOfOriginCode?: string }).countryOfOriginCode ?? '', onChange: (l, v) => b.patch(l.id, { countryOfOriginCode: v } as unknown as Partial<T>), clearable: true, readOnly: ro, width: 'w-40' }),
    warranty: { key: 'warranty', header: 'Warranty', cell: (l) => { if (!l.itemId) return null; const t = b.warrantyText?.(l) || 'None'; return <Text variant="small" tone={t === 'None' ? 'muted' : 'default'}>{t}</Text>; } },
    unitCost: { key: 'unitCost', header: 'Unit cost price', align: 'end', cell: (l) => (l.itemId ? <span className="whitespace-nowrap text-sm tabular-nums">PHP {formatAmount(b.unitCost?.(l) ?? 0)}</span> : null) },
    withholding: { key: 'withholding', header: 'WT code / rate', cell: (l) => (l.itemId ? <Text variant="small">{b.withholdingText?.(l) || 'None'}</Text> : null) },
    withholdingBase: { key: 'withholdingBase', header: 'Taxable amount', align: 'end', cell: (l) => { const v = b.withholdingBase?.(l); return l.itemId && v != null ? <span className="text-sm tabular-nums">{formatAmount(v)}</span> : null; } },
    lineStatus: { key: 'lineStatus', header: 'Line status', cell: (l) => { const s = (l as { status?: 'Open' | 'Closed' }).status; return s ? <TableStatus intent={s === 'Open' ? 'primary' : 'success'}>{s}</TableStatus> : null; } },

    // Catalog extras — mostly post-order/receipt fields, available (hidden) on any doc.
    name: textCol<T>({ key: 'name', header: 'Item name', readOnly: true, get: (l) => l.name ?? '', onChange: () => {} }),
    bpCatalogNo: textCol<T>({ key: 'bpCatalogNo', header: 'BP catalog no.', width: 'w-36', readOnly: ro, get: (l) => l.bpCatalogNo ?? '', onChange: (l, v) => b.patch(l.id, { bpCatalogNo: v } as Partial<T>) }),
    mfrNo: textCol<T>({ key: 'mfrNo', header: 'Mfr no.', width: 'w-36', readOnly: ro, get: (l) => l.mfrNo ?? '', onChange: (l, v) => b.patch(l.id, { mfrNo: v } as Partial<T>) }),
    deliveryDate: { key: 'deliveryDate', header: 'Del. date', cell: (l) => !l.itemId ? null : ro ? <Text variant="small">{l.deliveryDate ? formatDate(l.deliveryDate) : '—'}</Text> : <DatePicker aria-label="Del. date" className="w-36" value={l.deliveryDate || null} onValueChange={(v) => b.patch(l.id, { deliveryDate: v ?? '' } as Partial<T>)} /> },
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

type Vis = 'always' | 'opt' | 'hide';
/**
 * Choose a document's columns, in order, from the registry — and their default
 * visibility. 'always' = shown, not hideable; 'opt' = shown, in the Columns menu;
 * 'hide' = available but hidden by default.
 */
export function pick<T>(cols: Record<string, PrefColumn<T>>, list: [string, Vis][]): PrefColumn<T>[] {
  return list.map(([key, vis]) => {
    const c = cols[key];
    if (!c) throw new Error(`purchCols: unknown column "${key}"`);
    // Set both flags explicitly — the registry primitives default to optional+defaultHidden,
    // so 'always'/'opt' must clear them, not just leave them untouched.
    const flags =
      vis === 'always' ? { optional: false, defaultHidden: false }
      : vis === 'opt' ? { optional: true, defaultHidden: false }
      : { optional: true, defaultHidden: true };
    return { ...c, ...flags };
  });
}
