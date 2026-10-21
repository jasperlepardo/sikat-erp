import { useState, type ReactNode } from 'react';
import {
  Combobox,
  Link,
  Select,
  TableStatus,
  Text,
  TextField,
  DatePicker,
} from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { useColumnPrefs, type PrefColumn } from '../../../../components/form/columnPrefs';
import { textCol, masterCol, amountCol } from '../../shared/purchColumns';
import { departmentDef, priceListDef } from '../../../settings/masterDefs';
import { PR_SUMMARY_TYPES, type PrLine, type PrSummaryType } from '../../../../mocks/purchaseRequests';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import { holdsStock } from '../../../../mocks/itemMasters';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { formatAmount } from '../../../../services/format';
import { activeOptions } from '../../../../services/inventoryMasters';
import { isValidToday, stockTotals } from '../../../../services/items';
import { expenseAccountFor } from '../../../../services/goodsReceipts';
import { inventoryAccountFor } from '../../../../services/inventoryTransfers';
import { copiedQty, lineNet, openQty, priceAfterDiscount, inventoryQty, prTotals, summarizeLines } from '../../../../services/purchaseRequests';
import { PurchTotalsFooter } from '../../shared/PurchTotalsFooter';
import { infoPrice, lineFromItem, type PrTabProps } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));

export function PrLinesCard({ draft, update, errors, m, ctx }: PrTabProps) {
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const lines = draft.lines;
  const totals = prTotals(draft, ctx.rateOf);
  // "By Item" collapses the grid to one read-only row per item; the footer totals stay off the real lines.
  const summarized = draft.summaryType === 'By Item';
  const ro = ctx.readOnly || summarized;
  const viewRows = summarized ? summarizeLines(lines) : lines;
  const itemOf = (l: PrLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<PrLine>) =>
    update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });

  // An item's G/L account is derived from its item master / item group, never typed:
  // inventory items post to their inventory account, services to their expense account.
  // (m.items is already merged, so variants carry their parent's group accounts.)
  const glAccountOf = (l: PrLine) => {
    const it = itemOf(l);
    return !it ? '' : it.inventoryItem ? inventoryAccountFor(it, l.warehouse, m.inv.groups) : expenseAccountFor(it, m.inv.groups);
  };
  const lineKind = (l: PrLine) => { const it = itemOf(l); return it ? (it.inventoryItem ? 'Item' : 'Service') : ''; };
  const grossAfterDisc = (l: PrLine) => priceAfterDiscount(l) * (1 + ctx.rateOf(l.taxCode) / 100);

  // Stock at the line's warehouse; every warehouse when the line has none.
  const stockAt = (l: PrLine) => {
    const item = itemOf(l);
    if (!item) return null;
    if (!l.warehouse) return stockTotals(item);
    const wh = item.warehouses.find((w) => w.code === l.warehouse);
    return { inStock: wh?.inStock ?? 0, committed: wh?.committed ?? 0, ordered: wh?.ordered ?? 0 };
  };
  const err = (l: PrLine, field: string) => errors[`line:${l.id}:${field}`];

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.purchaseItem && isValidToday(i, draft.postingDate)))
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

  const taxOptions = (current: string) =>
    activeOptions(m.tax.codes.filter((c) => c.direction === 'Purchase'), (c) => c.code, (c) => `${c.code} (${ctx.rateOf(c.code)}%)`, current);

  const warehouseOptions = (current: string) =>
    activeOptions(m.inv.warehouses.filter((w) => holdsStock(w) || w.code === current), (w) => w.code, (w) => `${w.code} ${w.name}`, current);

  // Preferred vendor links to the Business Partner master (vendor role); the saved vendor stays pickable.
  const vendorOptions = (current: string) =>
    m.vendors
      .filter((v) => v.status !== 'Inactive' || v.id === current)
      .map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }));

  const col = (key: string, header: string, cell: (l: PrLine) => ReactNode): PrefColumn<PrLine> => ({ key, header, cell });
  const opt = { optional: true, defaultHidden: true } as const;
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    return item ? lineFromItem(item, draft, m, { requiredDate: draft.requiredDate }) : undefined;
  };

  // The info price follows the unit: re-read from the last-purchase list, else scale by the unit size.
  const changeUom = (l: PrLine, uomCode: string) => {
    const item = itemOf(l);
    const ipu = item ? (itemsPerUom(item, uomCode) ?? 1) : 1;
    const listed = item ? infoPrice(item, uomCode, draft.postingDate) : 0;
    const scaled = Math.round((l.infoPrice / (l.itemsPerUnit || 1)) * ipu * 100) / 100;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: ipu, infoPrice: listed || scaled });
  };

  const uomOptions = (l: PrLine) => {
    const item = itemOf(l);
    if (!item) return [{ value: l.uomCode, label: l.uomName || l.uomCode }];
    // Purchase units only, as on a PO; the saved unit stays pickable.
    const codes = [item.inventoryUom, item.purchasingUom, ...itemUnits(item, 'purchase').map((u) => u.uom), l.uomCode].filter(Boolean);
    const opts = m.inv.uoms.filter((u) => (u.active || u.code === l.uomCode) && codes.includes(u.code)).map((u) => ({ value: u.code, label: u.name }));
    return opts.length ? opts : [{ value: l.uomCode, label: l.uomName || l.uomCode }];
  };

  const allColumns: PrefColumn<PrLine>[] = [
    col('item', 'Item', (l) => {
      const item = itemOf(l);
      if (!item) return (
        <div className="flex min-w-52 flex-col gap-1">
          <Combobox aria-label="Item" placeholder="Search items" options={itemOptions(l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(id) => { if (!id) return; const found = m.items.find((i) => i.id === id); if (!found) return; const line = lineFromItem(found, draft, m, { id: l.id, requiredQty: l.requiredQty, openQty: l.requiredQty }); update({ lines: lines.map((x) => (x.id === l.id ? line : x)) }); }} />
          {err(l, 'item') && <Text variant="small" tone="danger">{err(l, 'item')}</Text>}
        </div>
      );
      if (editing.has(l.id) && !ro) return (
        <div className="flex min-w-52 flex-col gap-1">
          <Text variant="caption">{item.itemNo}</Text>
          <TextField aria-label="Item description" value={l.itemDescription} onChange={(e) => patch(l.id, { itemDescription: e.currentTarget.value })} />
          <Link intent="primary" onClick={() => setEditing((s) => { const n = new Set(s); n.delete(l.id); return n; })}>Done</Link>
        </div>
      );
      return (
        <div className="flex min-w-52 flex-col gap-1 whitespace-normal">
          <Text variant="caption">{item.itemNo}</Text>
          <Text variant="small">{item.name}</Text>
          <Text variant="small" tone="muted">{l.itemDescription}</Text>
          {ro ? null : (
            <div className="flex gap-3">
              <Link intent="primary" onClick={() => setEditing((s) => new Set(s).add(l.id))}>Edit</Link>
              {copiedQty(l) ? null : <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', itemDescription: '' })}>Change</Link>}
            </div>
          )}
        </div>
      );
    }),
    { key: 'lineKind', header: 'Type', optional: true, cell: (l) => { const k = lineKind(l); return k ? <TableStatus intent={k === 'Service' ? 'primary' : 'default'}>{k}</TableStatus> : null; } },
    {
      key: 'qty',
      header: 'Req. qty',
      cell: (l) => (
        <div className="w-24">
          <TextField aria-label="Required qty" type="number" min={copiedQty(l)} value={String(l.requiredQty)} invalid={Boolean(err(l, 'quantity'))} onChange={(e) => { const qty = num(e.currentTarget.value); const open = Math.max(0, qty - (l.requiredQty - l.openQty)); patch(l.id, { requiredQty: qty, openQty: open }); }} disabled={ro} />
          {err(l, 'quantity') && <Text variant="small" tone="danger">{err(l, 'quantity')}</Text>}
        </div>
      ),
    },
    {
      key: 'openQty',
      header: 'Open qty',
      cell: (l) => (
        <div className="flex flex-col">
          <span className="text-sm tabular-nums">{openQty(l)}</span>
          {copiedQty(l) ? <Text variant="caption" tone="muted">{copiedQty(l)} copied</Text> : null}
        </div>
      ),
    },
    { key: 'uom', header: 'UoM', cell: (l) => <Select aria-label="UoM" className="w-24" options={uomOptions(l)} value={l.uomCode} onValueChange={(v) => v && changeUom(l, v)} disabled={ro || copiedQty(l) > 0} /> },
    { key: 'infoPrice', header: 'Info price', cell: (l) => <TextField aria-label="Info price" type="number" min={0} className="w-28" prefix="PHP" value={String(l.infoPrice)} onChange={(e) => patch(l.id, { infoPrice: num(e.currentTarget.value) })} disabled={ro} /> },
    {
      key: 'warehouse',
      header: 'Warehouse',
      cell: (l) => (
        <div className="min-w-28">
          <Select aria-label="Warehouse" placeholder="None" clearable options={warehouseOptions(l.warehouse)} value={l.warehouse} onValueChange={(v) => patch(l.id, { warehouse: v ?? '' })} disabled={ro || copiedQty(l) > 0} />
          {err(l, 'warehouse') && <Text variant="small" tone="danger">{err(l, 'warehouse')}</Text>}
        </div>
      ),
    },
    {
      key: 'taxCode',
      header: 'Tax code',
      cell: (l) => (
        <div className="min-w-24">
          <Select aria-label="Tax code" placeholder="None" clearable options={taxOptions(l.taxCode)} value={l.taxCode} onValueChange={(v) => patch(l.id, { taxCode: v ?? '' })} disabled={ro} />
          {err(l, 'taxCode') && <Text variant="small" tone="danger">{err(l, 'taxCode')}</Text>}
        </div>
      ),
    },
    { key: 'glAccount', header: 'G/L account', optional: true, cell: (l) => { const code = glAccountOf(l); return code ? <Text variant="small" className="whitespace-normal">{accountText(code, m.inv.accounts)}</Text> : <span className="text-muted">—</span>; } },
    { key: 'total', header: 'Total (PHP)', cell: (l) => <span className="whitespace-nowrap text-sm tabular-nums">{formatAmount(lineNet(l))}</span> },
    amountCol({ key: 'grossAfterDisc', header: 'Gross after disc.', value: grossAfterDisc }),
    { key: 'inStock', header: 'In stock', ...opt, cell: (l: PrLine) => { const s = stockAt(l); return <span className="text-sm tabular-nums">{s ? formatAmount(s.inStock) : '—'}</span>; } },
    { key: 'committed', header: 'Committed', ...opt, cell: (l: PrLine) => { const s = stockAt(l); return <span className="text-sm tabular-nums">{s ? formatAmount(s.committed) : '—'}</span>; } },
    { key: 'ordered', header: 'On order', ...opt, cell: (l: PrLine) => { const s = stockAt(l); return <span className="text-sm tabular-nums">{s ? formatAmount(s.ordered) : '—'}</span>; } },
    { key: 'inventoryQty', header: 'Qty (inv. UoM)', ...opt, cell: (l: PrLine) => <span className="text-sm tabular-nums">{formatAmount(inventoryQty(l))}</span> },
    { key: 'discountPct', header: 'Disc. %', ...opt, cell: (l: PrLine) => <TextField aria-label="Discount %" type="number" min={0} max={100} className="w-20" suffix="%" value={String(l.discountPct)} onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)) })} disabled={ro} /> },
    amountCol({ key: 'priceAfterDisc', header: 'Price after disc.', value: (l: PrLine) => priceAfterDiscount(l) }),
    { key: 'requiredDate', header: 'Required date', ...opt, cell: (l: PrLine) => <DatePicker aria-label="Required date" className="w-36" value={l.requiredDate} onValueChange={(v) => patch(l.id, { requiredDate: v ?? '' })} disabled={ro} /> },
    { key: 'vendorId', header: 'Preferred vendor', ...opt, cell: (l: PrLine) => ro
      ? <Text variant="small">{l.vendorId ? (m.vendors.find((v) => v.id === l.vendorId)?.name ?? l.vendorId) : '—'}</Text>
      : <Combobox aria-label="Preferred vendor" className="min-w-44" placeholder="Any vendor" clearable options={vendorOptions(l.vendorId)} value={l.vendorId || null} onValueChange={(v) => patch(l.id, { vendorId: v ?? '' })} /> },
    masterCol({ key: 'department', header: 'Department', def: departmentDef, get: (l: PrLine) => l.departmentId, onChange: (l, v) => patch(l.id, { departmentId: v }), placeholder: 'None', clearable: true, readOnly: ro }),
    masterCol({ key: 'priceList', header: 'Price list', def: priceListDef, get: (l: PrLine) => l.priceListId, onChange: (l, v) => patch(l.id, { priceListId: v }), readOnly: ro }),
    textCol({ key: 'freeText', header: 'Free text', width: 'min-w-40', readOnly: ro, get: (l: PrLine) => l.freeText, onChange: (l, v) => patch(l.id, { freeText: v }) }),
    textCol({ key: 'requisitionSlipNo', header: 'Requisition slip no.', width: 'w-36', readOnly: ro, get: (l: PrLine) => l.requisitionSlipNo, onChange: (l, v) => patch(l.id, { requisitionSlipNo: v }) }),
    { key: 'lineStatus', header: 'Status', cell: (l) => <TableStatus intent={l.status === 'Open' ? 'primary' : 'success'}>{l.status}</TableStatus> },
  ];
  const prefs = useColumnPrefs('pr', allColumns);
  const columns = prefs.columns;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-2">
        <Text variant="small" tone="muted">Summary type</Text>
        <Select
          aria-label="Summary type"
          className="w-40"
          options={PR_SUMMARY_TYPES.map((s) => ({ value: s, label: s }))}
          value={draft.summaryType}
          onValueChange={(v) => v && update({ summaryType: v as PrSummaryType })}
          disabled={ctx.readOnly}
        />
        {summarized ? <Text variant="small" tone="muted">Grouped by item — read-only view.</Text> : null}
      </div>
      {prefs.settings}
      <DataTable
        noPagination
        icon="list_alt"
        title="Contents"
        description={errors.lines ?? 'Items or services requested — informational prices only, not binding.'}
        rows={viewRows}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
        sortValue={(l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof PrLine] ?? '')).toLowerCase()}
        // Copied lines stay: an RFQ or PO already points at them.
        onRemove={ro ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l) || copiedQty(l) > 0) })}
        onColumnSettings={prefs.toggleSettings}
        spanRow={ro ? undefined : (
          <Combobox
            key={addKey}
            aria-label="Search items to add a line"
            placeholder="Search items to add a line…"
            options={itemOptions('')}
            value={null}
            onValueChange={(id) => {
              const line = id ? fromItem(id) : undefined;
              if (!line) return;
              update({ lines: [...lines, line] });
              setAddKey((k) => k + 1);
            }}
          />
        )}
        empty={<Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>No lines yet — search above to add one.</Text>}
        cardFooter={
          <PurchTotalsFooter
            totals={{ ...totals, rounding: 0 }}
            currency="PHP"
            readOnly={ro}
            discountPct={0}
            onDiscountChange={() => {}}
            freightInput={
              <TextField
                aria-label="Freight estimate"
                type="number"
                min={0}
                className="w-32"
                prefix="PHP"
                value={String(draft.freight)}
                onChange={(e) => update({ freight: Number(e.currentTarget.value) })}
              />
            }
            totalLabel="Total payment due (estimate)"
          />
        }
      />
    </div>
  );
}
