import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Card, Checkbox, Combobox, Icon, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { MasterLookup } from '../../../components/form/MasterLookup';
import { Fields, Section } from '../../../components/form/fields';
import { RETURN_REASONS } from '../../../mocks/goodsReturns';
import type { Delivery } from '../../../mocks/deliveries';
import { itemUnits, itemsPerUom } from '../../../mocks/items';
import { newSrLine, type SrLine } from '../../../mocks/salesReturns';
import { formatDate } from '../../../services/dates';
import { dnNumber, dnOpenQty } from '../../../services/deliveries';
import { formatAmount } from '../../../services/format';
import { isValidToday } from '../../../services/items';
import { lineNet, lineTax, priceAfterDiscount } from '../../../services/salesOrders';
import { countryDef } from '../../settings/masterDefs';
import { warehouseOptions } from '../../inventory/transfers/TransferLines';
import { EditPanel } from '../../partners/detail/EditPanel';
import { DN_LIST_PATH, asSoDraft, type DnDraft } from '../deliveries/detail/types';
import { lineFromItem, type SoMasters } from '../orders/detail/types';
import type { SrSectionProps } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));

const GROUPS = { reason: 'Return reason', warehouse: 'Warehouse', tax: 'Tax', details: 'Item details', references: 'References' } as const;
type Group = keyof typeof GROUPS;

/** The return's lines, laid out like the sales order's Item table. */
export function SrContents({
  draft,
  update,
  errors,
  m,
  ctx,
  deliveries,
  onCopy,
  cardFooter,
}: SrSectionProps & { deliveries: Delivery[]; onCopy: (dn: Delivery, picks: { lineId: string; qty: number }[]) => void; cardFooter?: ReactNode }) {
  const [copying, setCopying] = useState(false);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const [shown, setShown] = useState<Group[]>(['reason']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const is = (g: Group) => shown.includes(g);
  const lines = draft.lines;
  const itemLines = lines.filter((l) => !!l.itemId);
  const ro = ctx.readOnly;
  const itemOf = (l: SrLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<SrLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: SrLine, f: string) => errors[`line:${l.id}:${f}`];
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const taxOf = (l: SrLine) => lineTax(l, ctx.rateOf(l.taxCode), 0);
  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Sales' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));

  // Sales items valid on the posting date.
  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.salesItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({ value: i.id, label: <div className="flex flex-col gap-0.5"><span className="text-xs opacity-60">{i.itemNo}</span><span>{i.description || i.name}</span></div>, text: `${i.itemNo} ${i.name} ${i.description}` }));

  /** A hand-entered line: priced and taxed as a sale to this customer, so the credit matches what they paid. */
  const fromItem = (itemId: string, base: Partial<SrLine>) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const s = lineFromItem(item, asSoDraft(draft as unknown as DnDraft), ctx, m as unknown as SoMasters, { quantity: base.quantity ?? 1 });
    return newSrLine({
      ...(base.id ? { id: base.id } : {}),
      itemId: s.itemId,
      itemNo: s.itemNo,
      description: s.description,
      quantity: s.quantity,
      uomCode: s.uomCode,
      uomName: s.uomName,
      itemsPerUnit: s.itemsPerUnit,
      warehouse: s.warehouse,
      priceListId: s.priceListId,
      unitPrice: s.unitPrice,
      discountPct: s.discountPct,
      priceSource: s.priceSource,
      taxCode: s.taxCode,
      countryOfOriginCode: item.countryOfOriginCode,
    });
  };
  const pickItem = (l: SrLine, itemId: string | null) => {
    const line = itemId ? fromItem(itemId, { id: l.id, quantity: l.quantity }) : undefined;
    patch(l.id, line ?? { itemId: '' });
  };

  const col = (key: string, header: ReactNode, cell: (l: SrLine) => ReactNode, group?: Group, align?: 'start' | 'end'): TableColumn<SrLine> & { group?: Group } => ({ key, header, cell, group, ...(align ? { align } : {}) });

  const columns: TableColumn<SrLine>[] = [
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
              {/* A line copied from a delivery stays that delivery's item. */}
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
    col('qty', 'Qty / UoM', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      const dn = l.baseType === 'DN' ? m.deliveries.find((d) => d.id === l.baseId) : undefined;
      const dl = dn?.lines.find((x) => x.id === l.baseLineId);
      const note = [
        dn && dl && !ro ? `${dnOpenQty(dl, dn)} open on ${dnNumber(dn)}` : null,
        draft.status === 'Open' ? `${Math.max(0, l.quantity - l.creditedQty)} to credit` : null,
      ].filter(Boolean).join(' · ');
      if (ro) return (
        <div className="flex flex-col items-end">
          <Text variant="small" className="whitespace-nowrap tabular-nums">{l.quantity.toLocaleString('en-PH')} {l.uomName}</Text>
          {note ? <Text variant="small" tone="muted" className="whitespace-nowrap">{note}</Text> : null}
        </div>
      );
      return (
        <div className="flex w-40 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Quantity" type="number" min={0} invalid={Boolean(err(l, 'quantity'))} value={String(l.quantity)} onChange={(e) => patch(l.id, { quantity: num(e.currentTarget.value) })} />
          {l.baseId ? null : (
            <Select aria-label="UoM code" options={itemUnits(item, 'sales').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(uomCode) => patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: itemsPerUom(item, uomCode) ?? 1 })} />
          )}
          <Text variant="small" tone="muted">
            {l.uomName}
            {note ? ` · ${note}` : ''}
          </Text>
        </div>
      );
    }, undefined, 'end'),
    col('warehouse', 'Returns to', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      if (!item.inventoryItem) return <Text variant="small" tone="muted">Not stocked</Text>;
      if (ro) return <Text variant="small">{l.warehouse || '—'}</Text>;
      return (
        <div className="w-44">
          <Combobox aria-label="Warehouse" invalid={Boolean(err(l, 'warehouse'))} options={warehouseOptions(m.inv.warehouses, l.warehouse)} value={l.warehouse || null} onValueChange={(v) => patch(l.id, { warehouse: v ?? '' })} />
        </div>
      );
    }, 'warehouse'),
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
          <Text variant="small" tone="muted">{l.priceSource || '—'}</Text>
        </div>
      );
    }, undefined, 'end'),
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
    col('totals', 'Total (LC)', (l) => (itemOf(l) ? <Text variant="small" className="whitespace-nowrap tabular-nums">PHP {lc(lineNet(l))}</Text> : null), undefined, 'end'),
    col('returnReason', 'Reason', (l) => {
      if (!itemOf(l)) return null;
      if (ro) return <Text variant="small" tone={l.returnReason ? undefined : 'muted'}>{l.returnReason || '—'}</Text>;
      return (
        <Select
          aria-label="Return reason"
          className="w-32"
          options={[{ value: '', label: '— None —' }, ...RETURN_REASONS.map((r) => ({ value: r, label: r }))]}
          value={l.returnReason}
          onValueChange={(returnReason) => patch(l.id, { returnReason })}
        />
      );
    }, 'reason'),
    col('returnCost', 'Return cost', (l) => {
      const item = itemOf(l);
      if (!item?.inventoryItem) return null;
      const manual = l.unitCostLc > 0;
      if (ro) return <Text variant="small" className="whitespace-nowrap tabular-nums">PHP {formatAmount(l.unitCostLc || item.itemCost || 0)}</Text>;
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <Checkbox checked={manual} onChange={(e) => patch(l.id, { unitCostLc: e.currentTarget.checked ? item.itemCost || 0 : 0 })}>
            Set manually
          </Checkbox>
          {manual ? (
            <TextField aria-label="Return cost" type="number" min={0} prefix="PHP" value={String(l.unitCostLc)} onChange={(e) => patch(l.id, { unitCostLc: num(e.currentTarget.value) })} />
          ) : (
            <Text variant="small" tone="muted">Auto (item cost)</Text>
          )}
        </div>
      );
    }, 'details', 'end'),
    col('countryOfOrigin', 'Country of origin', (l) =>
      itemOf(l) ? (
        <MasterLookup def={countryDef} fieldProps={{ 'aria-label': 'Country of origin', className: 'w-40', disabled: ro }} clearable value={l.countryOfOriginCode} onChange={(countryOfOriginCode) => patch(l.id, { countryOfOriginCode })} />
      ) : null,
    'details'),
    col('baseDoc', 'Base document', (l) => {
      if (!l.baseId) return <Text variant="small" tone="muted">—</Text>;
      const dn = m.deliveries.find((d) => d.id === l.baseId);
      return (
        <div className="flex flex-col whitespace-nowrap">
          <Link intent="primary" href={`#${DN_LIST_PATH}/${l.baseId}`}>{dn ? dnNumber(dn) : l.baseDocNo}</Link>
          <Text variant="small" tone="muted">Delivery{l.baseRow ? ` · row ${l.baseRow}` : ''}</Text>
        </div>
      );
    }, 'references'),
    col('creditedQty', 'Credited', (l) =>
      itemOf(l) ? <Text variant="small" className="whitespace-nowrap tabular-nums">{l.creditedQty > 0 ? `${l.creditedQty} ${l.uomName}` : '—'}</Text> : null,
    'references', 'end'),
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
      <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!deliveries.length} onClick={() => setCopying(true)}>
        Copy from delivery
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
                <Checkbox key={g} checked={is(g)} onChange={(e) => setShown(e.currentTarget.checked ? [...shown, g] : shown.filter((x) => x !== g))}>
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
          variant="plain"
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
            <CopyFromDeliveryPanel
              deliveries={deliveries}
              taken={new Set(lines.map((l) => l.baseLineId).filter(Boolean))}
              onCancel={() => setCopying(false)}
              onCopy={(dn, picks) => {
                setCopying(false);
                onCopy(dn, picks);
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function CopyFromDeliveryPanel({
  deliveries,
  taken,
  onCancel,
  onCopy,
}: {
  deliveries: Delivery[];
  taken: Set<string>;
  onCancel: () => void;
  onCopy: (dn: Delivery, picks: { lineId: string; qty: number }[]) => void;
}) {
  const sorted = [...deliveries].sort((a, b) => b.postingDate.localeCompare(a.postingDate));
  const [selected, setSelected] = useState<string | null>(sorted[0]?.id ?? null);
  const dn = sorted.find((d) => d.id === selected);
  const [qtys, setQtys] = useState<Record<string, number>>({});

  useEffect(() => {
    if (dn) setQtys(Object.fromEntries(dn.lines.map((l) => [l.id, dnOpenQty(l, dn)])));
  }, [selected, dn]);

  const lineColumns: TableColumn<Delivery['lines'][number]>[] = [
    { key: 'item', header: 'Item', cell: (l) => <span>{l.itemNo} <span className="text-muted-foreground text-xs">{l.description}</span></span> },
    { key: 'shipped', header: 'Shipped', cell: (l) => `${l.quantity} ${l.uomCode}` },
    { key: 'open', header: 'Open', cell: (l) => `${dn ? dnOpenQty(l, dn) : 0} ${l.uomCode}` },
    {
      key: 'return',
      header: 'Return qty',
      cell: (l) => {
        if (taken.has(l.id)) return <Text variant="small" tone="muted">Already on return</Text>;
        const openQ = dn ? dnOpenQty(l, dn) : 0;
        return (
          <TextField
            aria-label={`Return qty for ${l.itemNo}`}
            type="number"
            min={0}
            max={openQ}
            className="w-24"
            value={String(qtys[l.id] ?? openQ)}
            onChange={(e) => setQtys((q) => ({ ...q, [l.id]: Math.min(openQ, Number(e.currentTarget.value) || 0) }))}
          />
        );
      },
    },
  ];

  return (
    <EditPanel
      icon="local_shipping"
      title="Copy from delivery"
      onCancel={onCancel}
      onDone={() => {
        if (!dn) return onCancel();
        const picks = dn.lines
          .filter((l) => !taken.has(l.id) && (qtys[l.id] ?? dnOpenQty(l, dn)) > 0)
          .map((l) => ({ lineId: l.id, qty: qtys[l.id] ?? dnOpenQty(l, dn) }));
        if (picks.length) onCopy(dn, picks);
        else onCancel();
      }}
    >
      <Section icon="local_shipping" title="Pick a delivery">
        <Fields cols={1}>
          <Select
            aria-label="Delivery"
            options={sorted.map((d) => ({ value: d.id, label: `${dnNumber(d)} · ${formatDate(d.postingDate)} · ${d.currency}` }))}
            value={selected ?? ''}
            onValueChange={setSelected}
          />
        </Fields>
      </Section>
      {dn ? (
        <DataTable
          icon="receipt_long"
          title="Lines"
          rows={dn.lines}
          getRowId={(l) => l.id}
          columns={lineColumns}
          unsortable={lineColumns.map((c) => c.key)}
          noPagination
          empty={null}
        />
      ) : null}
    </EditPanel>
  );
}
