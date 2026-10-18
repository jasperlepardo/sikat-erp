import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Card, Checkbox, Combobox, Icon, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { newDnLine, type DnLine } from '../../../../mocks/deliveries';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import type { SalesOrder } from '../../../../mocks/salesOrders';
import { dnInventoryQty } from '../../../../services/deliveries';
import { formatAmount } from '../../../../services/format';
import { isValidToday } from '../../../../services/items';
import { isPriceListValid, priceListName } from '../../../../services/priceLists';
import { lineTax, openQty, priceAfterDiscount, soNumber } from '../../../../services/salesOrders';
import { priceListDef } from '../../../settings/masterDefs';
import { warehouseOptions } from '../../../inventory/transfers/TransferLines';
import { CopyPanel, type CopySourceType } from '../../../purchasing/shared/CopyPanel';
import { lineFromItem, linePricing, SO_LIST_PATH } from '../../sales-orders/detail/types';
import { asSoDraft, type DnSectionProps } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));

const GROUPS = { warehouse: 'Warehouse', priceListId: 'Price list', pricing: 'Unit price / Discount', tax: 'Tax', base: 'Base document' } as const;
type Group = keyof typeof GROUPS;

export function DnContentsCard({ draft, update, errors, m, ctx, onCopy, cardFooter }: DnSectionProps & { onCopy: (so: SalesOrder, picks: { lineId: string; qty: number }[]) => void; cardFooter?: ReactNode }) {
  const [copying, setCopying] = useState(false);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const [shown, setShown] = useState<Group[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const is = (g: Group) => shown.includes(g);
  const lines = draft.lines;
  const itemLines = lines.filter((l) => !!l.itemId);
  const ro = ctx.readOnly;
  const itemOf = (l: DnLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<DnLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: DnLine, f: string) => errors[`line:${l.id}:${f}`];
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const taxOf = (l: DnLine) => lineTax(l, ctx.rateOf(l.taxCode), 0);
  const orderOf = (l: DnLine) => (l.baseId ? m.orders.find((o) => o.id === l.baseId) : undefined);
  const baseLineOf = (l: DnLine) => orderOf(l)?.lines.find((x) => x.id === l.baseLineId);
  const so = asSoDraft(draft);
  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Sales' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));

  // Open orders of this customer (or any customer, before one is picked) with something left to ship.
  const orders = m.orders.filter((o) => o.status === 'Open' && o.docType === 'Item' && (!draft.customerId || o.customerId === draft.customerId) && o.lines.some((l) => openQty(l) > 0) && (!ctx.based || o.currency === draft.currency));
  const taken = new Set(lines.map((l) => l.baseLineId).filter(Boolean));
  const sources: CopySourceType<'SO'>[] = [
    {
      key: 'SO',
      label: 'Sales orders',
      totalHeader: 'Ordered',
      qtyHeader: 'Deliver',
      hint: 'Open lines come at their open quantity; ship less if the order allows partial delivery.',
      docs: orders.map((o) => ({
        id: o.id,
        label: `${soNumber(o)} · ${o.customerName}`,
        description: `${o.deliveryDate ? `Due ${o.deliveryDate}` : 'No delivery date'}${o.allowPartialDelivery ? '' : ' · full delivery only'}`,
        lines: o.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
      })),
    },
  ];

  // Stocked sales items valid on the posting date.
  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.salesItem && i.inventoryItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({ value: i.id, label: <div className="flex flex-col gap-0.5"><span className="text-xs opacity-60">{i.itemNo}</span><span>{i.description || i.name}</span></div>, text: `${i.itemNo} ${i.name} ${i.description}` }));

  const fromItem = (itemId: string, base: Partial<DnLine>) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const s = lineFromItem(item, so, ctx, m, { quantity: base.quantity ?? 1 });
    return newDnLine({ ...s, ...(base.id ? { id: base.id } : {}), baseType: '', baseId: '', baseLineId: '', baseDocNo: '', baseRow: 0 });
  };
  const pickItem = (l: DnLine, itemId: string | null) => {
    const line = itemId ? fromItem(itemId, { id: l.id, quantity: l.quantity }) : undefined;
    patch(l.id, line ?? { itemId: '' });
  };
  /** Re-run pricing after a change, unless the price was typed over or comes from the order. */
  const reprice = (l: DnLine, change: Partial<DnLine>) => {
    const item = itemOf(l);
    if (!item || l.baseId || !ctx.fx || l.priceSource === 'Manual') return patch(l.id, change);
    patch(l.id, { ...change, ...linePricing(item, { ...l, ...change }, so, ctx) });
  };

  const col = (key: string, header: ReactNode, cell: (l: DnLine) => ReactNode, group?: Group, align?: 'start' | 'end'): TableColumn<DnLine> & { group?: Group } => ({ key, header, cell, group, ...(align ? { align } : {}) });

  const columns: TableColumn<DnLine>[] = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      if (!item || (editing.has(l.id) && !ro)) {
        return (
          <div className="flex w-64 flex-col gap-1">
            {item ? (
              <TextField aria-label="Item description" value={l.description} onChange={(e) => patch(l.id, { description: e.currentTarget.value })} />
            ) : (
              <Combobox aria-label="Item No." placeholder="Search items" options={itemOptions(l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(v) => pickItem(l, v)} />
            )}
            {item ? (
              <Link intent="primary" onClick={() => setEditing((s) => { const n = new Set(s); n.delete(l.id); return n; })}>
                Done
              </Link>
            ) : null}
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-1 whitespace-normal">
          <div className="flex flex-col">
            <Text variant="caption" className="wrap-break-word">{l.itemNo}</Text>
            <Text variant="small" className="wrap-break-word">{l.description}</Text>
          </div>
          {ro ? null : (
            <div className="flex gap-3">
              <Link intent="primary" onClick={() => setEditing((s) => new Set(s).add(l.id))}>
                Edit
              </Link>
              {/* A line copied from an order stays that order's item. */}
              {l.baseId ? null : (
                <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', description: '' })}>
                  Change
                </Link>
              )}
            </div>
          )}
        </div>
      );
    }),
    col('ordered', 'Ordered', (l) => {
      const base = baseLineOf(l);
      if (!base) return <Text variant="small" tone="muted">—</Text>;
      return (
        <Text variant="small" className="whitespace-nowrap tabular-nums">
          {base.quantity.toLocaleString('en-PH')} {l.uomCode}
        </Text>
      );
    }, undefined, 'end'),
    col('shipped', 'Shipped', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      const invNote = l.uomCode === item.inventoryUom ? null : `${dnInventoryQty(l)} ${item.inventoryUom}`;
      if (ro) return (
        <div className="flex flex-col items-end">
          <Text variant="small" className="whitespace-nowrap tabular-nums">
            {l.quantity.toLocaleString('en-PH')} {l.uomCode}
          </Text>
          {invNote ? <Text variant="small" tone="muted" className="whitespace-nowrap">{invNote}</Text> : null}
        </div>
      );
      return (
        <div className="flex w-40 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Quantity" type="number" min={0} invalid={Boolean(err(l, 'quantity'))} value={String(l.quantity)} onChange={(e) => reprice(l, { quantity: num(e.currentTarget.value) })} />
          {l.baseId ? null : (
            <Select aria-label="UoM code" options={itemUnits(item, 'sales').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(uomCode) => reprice(l, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: itemsPerUom(item, uomCode) ?? 1 })} />
          )}
          {invNote ? <Text variant="small" tone="muted">{invNote}</Text> : null}
        </div>
      );
    }, undefined, 'end'),
    col('outstanding', 'Outstanding', (l) => {
      const base = baseLineOf(l);
      if (!base) return <Text variant="small" tone="muted">—</Text>;
      const remaining = ctx.added
        ? openQty(base)
        : Math.max(0, openQty(base) - l.quantity);
      return (
        <Text variant="small" className="whitespace-nowrap tabular-nums">
          {remaining.toLocaleString('en-PH')} {l.uomCode}
        </Text>
      );
    }, undefined, 'end'),
    col('warehouse', 'Whse', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      const inWhse = item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0;
      if (ro) return <Text variant="small">{l.warehouse || '—'}</Text>;
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <Combobox aria-label="Warehouse" invalid={Boolean(err(l, 'warehouse'))} options={warehouseOptions(m.inv.warehouses, l.warehouse)} value={l.warehouse || null} onValueChange={(v) => patch(l.id, { warehouse: v ?? '' })} />
          <Text variant="small" tone={dnInventoryQty(l) > inWhse ? 'danger' : 'muted'}>
            {inWhse} {item.inventoryUom} in stock
          </Text>
        </div>
      );
    }, 'warehouse'),
    col('priceListId', 'Price list', (l) => {
      if (!itemOf(l)) return null;
      if (l.baseId || ro) return <Text variant="small">{priceListName(l.priceListId) || '—'}</Text>;
      return (
        <MasterLookup def={priceListDef} fieldProps={{ 'aria-label': 'Price list', className: 'w-40' }} where={(r) => isPriceListValid(r, draft.postingDate)} value={l.priceListId} onChange={(v) => reprice({ ...l, priceSource: '' }, { priceListId: v })} />
      );
    }, 'priceListId'),
    col('pricing', 'Unit price / Discount', (l) => {
      if (!itemOf(l)) return null;
      if (ro) return (
        <div className="flex flex-col whitespace-nowrap tabular-nums">
          <Text variant="small">{draft.currency} {formatAmount(l.discountPct ? priceAfterDiscount(l) : l.unitPrice)}</Text>
          {l.discountPct ? <Text variant="small" tone="muted" className="line-through">{draft.currency} {formatAmount(l.unitPrice)}</Text> : null}
        </div>
      );
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Unit price" type="number" min={0} prefix={draft.currency} invalid={Boolean(err(l, 'unitPrice'))} value={String(l.unitPrice)} onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value), priceSource: 'Manual' })} />
          <TextField aria-label="Discount %" type="number" min={0} suffix="%" value={String(l.discountPct)} onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)), priceSource: 'Manual' })} />
          <Text variant="small" tone="muted">
            {l.priceSource || '—'}
            {l.priceSource === 'Manual' && !l.baseId ? (
              <>
                {' · '}
                <Link intent="primary" onClick={() => reprice({ ...l, priceSource: '' }, {})}>
                  Reprice
                </Link>
              </>
            ) : null}
          </Text>
        </div>
      );
    }, 'pricing', 'end'),
    col('tax', 'Tax code', (l) => {
      if (!itemOf(l)) return null;
      if (ro) return (
        <div className="flex flex-col gap-0.5">
          <Text variant="small">{l.taxCode} ({ctx.rateOf(l.taxCode)}%)</Text>
          <Text variant="small" tone="muted">Tax PHP {lc(taxOf(l))}</Text>
        </div>
      );
      return (
        <div className="flex w-32 flex-col gap-1">
          <Combobox aria-label="Tax code" invalid={Boolean(err(l, 'taxCode'))} options={taxOptions} value={l.taxCode || null} onValueChange={(v) => patch(l.id, { taxCode: v ?? '' })} />
          <Text variant="small" tone="muted">Tax PHP {lc(taxOf(l))}</Text>
        </div>
      );
    }, 'tax', 'end'),
    col('base', 'Base document', (l) => {
      const order = orderOf(l);
      if (!l.baseId) return <Text variant="small" tone="muted">—</Text>;
      return (
        <div className="flex flex-col whitespace-nowrap">
          {order ? <Link intent="primary" href={`#${SO_LIST_PATH}/${soNumber(order)}`}>{soNumber(order)}</Link> : <Text variant="small">{l.baseDocNo}</Text>}
          <Text variant="small" tone="muted">Row {l.baseRow}</Text>
        </div>
      );
    }, 'base'),
  ].filter((c) => !c.group || is(c.group));

  const addRow = ro ? undefined : (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <Combobox
          key={addKey}
          aria-label="Search items to add a line"
          placeholder={draft.customerId ? 'Search items to add a line…' : 'Pick a customer to add items'}
          disabled={!draft.customerId}
          options={itemOptions('')}
          value={null}
          onValueChange={(id) => {
            const line = id ? fromItem(id, {}) : undefined;
            if (!line) return;
            update({ lines: [...itemLines, line] });
            setAddKey((k) => k + 1);
          }}
        />
      </div>
      <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!orders.length} onClick={() => setCopying(true)}>
        Copy from sales order
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {settingsOpen ? (
        <Card>
          <Card.Header icon={<Icon size={24}>tune</Icon>}>Columns</Card.Header>
          <Card.Content>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {(Object.keys(GROUPS) as Group[]).map((g) => (
                <Checkbox
                  key={g}
                  checked={is(g)}
                  onChange={(e) => setShown(e.currentTarget.checked ? [...shown, g] : shown.filter((x) => x !== g))}
                >
                  {GROUPS[g]}
                </Checkbox>
              ))}
            </div>
          </Card.Content>
        </Card>
      ) : null}
      {errors.lines ? <Text variant="small" tone="danger">{errors.lines}</Text> : null}
      <div className={ro ? '[&_.sikat-table__row:hover>.sikat-table__td]:[box-shadow:none]' : undefined}>
        <DataTable
         
          noPagination
          rows={itemLines}
          getRowId={(l) => l.id}
          columns={columns}
          unsortable={columns.map((c) => c.key)}
          onRemove={ro ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
          onColumnSettings={() => setSettingsOpen(!settingsOpen)}
          empty={<Text variant="small" tone="muted">No lines yet.</Text>}
          spanRow={addRow}
          cardFooter={cardFooter}
        />
      </div>
      {copying
        ? createPortal(
            <CopyPanel
              sources={sources}
              taken={taken}
              onCancel={() => setCopying(false)}
              onCopy={(_type, docId, picks) => {
                const order = m.orders.find((o) => o.id === docId);
                setCopying(false);
                if (order) onCopy(order, picks);
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
