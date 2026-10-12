import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Card, Checkbox, Combobox, Icon, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { Fields, Section } from '../../../components/form/fields';
import { newArCmLine, type ArCmLine } from '../../../mocks/arCreditMemos';
import type { ArInvoice } from '../../../mocks/arInvoices';
import { RETURN_REASONS } from '../../../mocks/goodsReturns';
import { itemUnits, itemsPerUom } from '../../../mocks/items';
import { arNumber } from '../../../services/arInvoices';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { isValidToday } from '../../../services/items';
import { lineNet, lineTax, priceAfterDiscount } from '../../../services/salesOrders';
import { warehouseOptions } from '../../inventory/transfers/TransferLines';
import { EditPanel } from '../../partners/detail/EditPanel';
import { asSoDraft, type DnDraft } from '../deliveries/detail/types';
import { AR_LIST_PATH } from '../invoices/detail/types';
import { lineFromItem, type SoMasters } from '../orders/detail/types';
import { SR_LIST_PATH, type ArCmSectionProps } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));

const GROUPS = { warehouse: 'Warehouse', tax: 'Tax', reason: 'Return reason', base: 'Base document' } as const;
type Group = keyof typeof GROUPS;

/** The credit memo's lines, laid out like the sales order's Item table. */
export function AcmContents({
  draft,
  update,
  errors,
  m,
  ctx,
  invoices,
  onCopy,
  cardFooter,
}: ArCmSectionProps & { invoices: ArInvoice[]; onCopy: (inv: ArInvoice, picks: { lineId: string; qty: number }[]) => void; cardFooter?: ReactNode }) {
  const [copying, setCopying] = useState(false);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const [shown, setShown] = useState<Group[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const is = (g: Group) => shown.includes(g);
  const lines = draft.lines;
  const itemLines = lines.filter((l) => !!l.itemId);
  const ro = ctx.readOnly;
  const itemOf = (l: ArCmLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<ArCmLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: ArCmLine, f: string) => errors[`line:${l.id}:${f}`];
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const taxOf = (l: ArCmLine) => lineTax(l, ctx.rateOf(l.taxCode), 0);
  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Sales' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));

  // Sales items valid on the posting date.
  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.salesItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({ value: i.id, label: <div className="flex flex-col gap-0.5"><span className="text-xs opacity-60">{i.itemNo}</span><span>{i.description || i.name}</span></div>, text: `${i.itemNo} ${i.name} ${i.description}` }));

  /** A hand-entered line: priced and taxed as a sale to this customer, so the credit matches what they paid. */
  const fromItem = (itemId: string, base: Partial<ArCmLine>) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const s = lineFromItem(item, asSoDraft(draft as unknown as DnDraft), ctx, m as unknown as SoMasters, { quantity: base.quantity ?? 1 });
    return newArCmLine({
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
      returnGoods: item.inventoryItem,
    });
  };
  const pickItem = (l: ArCmLine, itemId: string | null) => {
    const line = itemId ? fromItem(itemId, { id: l.id, quantity: l.quantity }) : undefined;
    patch(l.id, line ?? { itemId: '' });
  };

  const col = (key: string, header: ReactNode, cell: (l: ArCmLine) => ReactNode, group?: Group, align?: 'start' | 'end'): TableColumn<ArCmLine> & { group?: Group } => ({ key, header, cell, group, ...(align ? { align } : {}) });

  const columns: TableColumn<ArCmLine>[] = [
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
              {/* A copied line stays its base document's item. */}
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
      if (ro) return <Text variant="small" className="whitespace-nowrap tabular-nums">{l.quantity.toLocaleString('en-PH')} {l.uomName}</Text>;
      return (
        <div className="flex w-40 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Quantity" type="number" min={0} invalid={Boolean(err(l, 'quantity'))} value={String(l.quantity)} onChange={(e) => patch(l.id, { quantity: num(e.currentTarget.value) })} />
          {l.baseId ? null : (
            <Select aria-label="UoM code" options={itemUnits(item, 'sales').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(uomCode) => patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: itemsPerUom(item, uomCode) ?? 1 })} />
          )}
          <Text variant="small" tone="muted">{l.uomName}</Text>
        </div>
      );
    }, undefined, 'end'),
    col('returnGoods', 'Stock', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      if (!item.inventoryItem) return <Text variant="small" tone="muted">Not stocked</Text>;
      return (
        <Checkbox aria-label={`Return goods for ${l.itemNo}`} checked={l.returnGoods} disabled={ro} onChange={(e) => patch(l.id, { returnGoods: e.currentTarget.checked })}>
          {l.returnGoods ? 'Put back' : 'Price only'}
        </Checkbox>
      );
    }),
    col('warehouse', 'Returns to', (l) => {
      const item = itemOf(l);
      if (!item?.inventoryItem || !l.returnGoods) return item ? <Text variant="small" tone="muted">—</Text> : null;
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
    col('base', 'Base document', (l) => {
      if (!l.baseId) return <Text variant="small" tone="muted">—</Text>;
      const path = l.baseType === 'SRT' ? SR_LIST_PATH : AR_LIST_PATH;
      return (
        <div className="flex flex-col whitespace-nowrap">
          <Link intent="primary" href={`#${path}/${l.baseId}`}>{l.baseDocNo}</Link>
          <Text variant="small" tone="muted">{l.baseType === 'SRT' ? 'Sales return' : 'A/R invoice'}{l.baseRow ? ` · row ${l.baseRow}` : ''}</Text>
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
      <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!invoices.length} onClick={() => setCopying(true)}>
        Copy from invoice
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
            <CopyFromInvoicePanel
              invoices={invoices}
              onCancel={() => setCopying(false)}
              onCopy={(inv, picks) => {
                setCopying(false);
                onCopy(inv, picks);
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function CopyFromInvoicePanel({
  invoices,
  onCancel,
  onCopy,
}: {
  invoices: ArInvoice[];
  onCancel: () => void;
  onCopy: (inv: ArInvoice, picks: { lineId: string; qty: number }[]) => void;
}) {
  const sorted = [...invoices].sort((a, b) => b.postingDate.localeCompare(a.postingDate));
  const [selected, setSelected] = useState<string | null>(sorted[0]?.id ?? null);
  const inv = sorted.find((i) => i.id === selected);
  const [qtys, setQtys] = useState<Record<string, number>>({});

  useEffect(() => {
    if (inv) setQtys(Object.fromEntries(inv.lines.map((l) => [l.id, l.quantity])));
  }, [selected, inv]);

  const lineColumns: TableColumn<ArInvoice['lines'][number]>[] = [
    { key: 'item', header: 'Item', cell: (l) => <span>{l.itemNo} <span className="text-muted-foreground text-xs">{l.description}</span></span> },
    { key: 'qty', header: 'Billed', cell: (l) => `${l.quantity} ${l.uomCode}` },
    {
      key: 'credit',
      header: 'Credit qty',
      cell: (l) => (
        <TextField
          aria-label={`Credit qty for ${l.itemNo}`}
          type="number"
          min={0}
          max={l.quantity}
          className="w-24"
          value={String(qtys[l.id] ?? l.quantity)}
          onChange={(e) => setQtys((q) => ({ ...q, [l.id]: Math.min(l.quantity, Number(e.currentTarget.value) || 0) }))}
        />
      ),
    },
  ];

  return (
    <EditPanel
      icon="receipt"
      title="Copy from A/R invoice"
      onCancel={onCancel}
      onDone={() => {
        if (!inv) return onCancel();
        const picks = inv.lines.filter((l) => (qtys[l.id] ?? l.quantity) > 0).map((l) => ({ lineId: l.id, qty: qtys[l.id] ?? l.quantity }));
        if (picks.length) onCopy(inv, picks);
        else onCancel();
      }}
    >
      <Section icon="receipt" title="Pick an invoice">
        <Fields cols={1}>
          <Select
            aria-label="Invoice"
            options={sorted.map((i) => ({ value: i.id, label: `${arNumber(i)} · ${formatDate(i.postingDate)} · ${i.currency}` }))}
            value={selected ?? ''}
            onValueChange={setSelected}
          />
        </Fields>
      </Section>
      {inv ? (
        <DataTable
          icon="receipt_long"
          title="Lines"
          rows={inv.lines}
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
