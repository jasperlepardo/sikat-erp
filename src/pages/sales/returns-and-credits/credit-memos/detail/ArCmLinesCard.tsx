import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Card, Checkbox, Combobox, Icon, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../../components/form/DataTable';
import { newArCmLine, type ArCmLine } from '../../../../../mocks/arCreditMemos';
import type { ArInvoice } from '../../../../../mocks/arInvoices';
import { RETURN_REASONS } from '../../../../../mocks/goodsReturns';
import { itemUnits, itemsPerUom } from '../../../../../mocks/items';
import { arNumber } from '../../../../../services/arInvoices';
import { formatAmount } from '../../../../../services/format';
import { isValidToday } from '../../../../../services/items';
import { lineNet, lineTax, priceAfterDiscount } from '../../../../../services/salesOrders';
import { warehouseOptions } from '../../../../inventory/transfers/TransferLines';
import { CopyPanel, type CopySourceType } from '../../../../purchasing/shared/CopyPanel';
import { asSoDraft, type DnDraft } from '../../../deliveries/detail/types';
import { lineFromItem, type SoMasters } from '../../../sales-orders/detail/types';
import { type ArCmSectionProps } from '../../types';
import { editTaxCode } from '../../../../../services/taxRecalc';
import { AR_LIST_PATH, SR_LIST_PATH } from '../../../paths';
import { taxCodeOptions } from '../../../../../services/taxCodeOptions';

const num = (v: string) => (v === '' ? 0 : Number(v));

const GROUPS = { warehouse: 'Warehouse', tax: 'Tax', reason: 'Return reason', base: 'Base document' } as const;
type Group = keyof typeof GROUPS;

export function ArCmLinesCard({
  draft, update, errors, m, ctx, invoices, onCopy, cardFooter,
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
  const taxOptions = (current: string) => taxCodeOptions(m.tax.codes, 'Sales', current);

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.salesItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({ value: i.id, label: <div className="flex flex-col gap-0.5"><span className="text-xs opacity-60">{i.itemNo}</span><span>{i.description || i.name}</span></div>, text: `${i.itemNo} ${i.name} ${i.description}` }));

  const fromItem = (itemId: string, base: Partial<ArCmLine>) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const s = lineFromItem(item, asSoDraft(draft as unknown as DnDraft), ctx, m as unknown as SoMasters, { quantity: base.quantity ?? 1 });
    return newArCmLine({
      ...(base.id ? { id: base.id } : {}),
      itemId: s.itemId, itemNo: s.itemNo, description: s.description, quantity: s.quantity,
      uomCode: s.uomCode, uomName: s.uomName, itemsPerUnit: s.itemsPerUnit, warehouse: s.warehouse,
      priceListId: s.priceListId, unitPrice: s.unitPrice, discountPct: s.discountPct,
      priceSource: s.priceSource, taxCode: s.taxCode, taxOverridden: false, returnGoods: item.inventoryItem,
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
              <Link intent="primary" onClick={() => setEditing((s) => { const n = new Set(s); n.delete(l.id); return n; })}>Done</Link>
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
              <Link intent="primary" onClick={() => setEditing((s) => new Set(s).add(l.id))}>Edit</Link>
              {l.baseId ? null : (
                <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', description: '' })}>Change</Link>
              )}
            </div>
          )}
        </div>
      );
    }),
    col('qty', 'Qty / UoM', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      if (ro) return <Text variant="small" className="whitespace-nowrap tabular-nums">{l.quantity.toLocaleString('en-PH')} {l.uomCode}</Text>;
      return (
        <div className="flex w-40 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Quantity" type="number" min={0} invalid={Boolean(err(l, 'quantity'))} value={String(l.quantity)} onChange={(e) => patch(l.id, { quantity: num(e.currentTarget.value) })} />
          {l.baseId ? null : (
            <Select aria-label="UoM code" options={itemUnits(item, 'sales').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(uomCode) => patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: itemsPerUom(item, uomCode) ?? 1 })} />
          )}
          <Text variant="small" tone="muted">{l.uomCode}</Text>
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
          <Combobox aria-label="Tax code" invalid={Boolean(err(l, 'taxCode'))} options={taxOptions(l.taxCode)} value={l.taxCode || null} onValueChange={(v) => patch(l.id, editTaxCode(v ?? ''))} />
          <Text variant="small" tone="muted">Tax PHP {lc(taxOf(l))}</Text>
        </div>
      );
    }, 'tax', 'end'),
    col('totals', 'Total (LC)', (l) => (itemOf(l) ? <Text variant="small" className="whitespace-nowrap tabular-nums">PHP {lc(lineNet(l))}</Text> : null), undefined, 'end'),
    col('returnReason', 'Reason', (l) => {
      if (!itemOf(l)) return null;
      if (ro) return <Text variant="small" tone={l.returnReason ? undefined : 'muted'}>{l.returnReason || '—'}</Text>;
      return (
        <Select clearable placeholder="None" aria-label="Return reason" className="w-32" options={RETURN_REASONS.map((r) => ({ value: r, label: r }))} value={l.returnReason} onValueChange={(returnReason) => patch(l.id, { returnReason })} />
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
        <Combobox key={addKey} aria-label="Search items to add a line" placeholder={draft.customerId ? 'Search items to add a line…' : 'Pick a customer to add items'} disabled={!draft.customerId} options={itemOptions('')} value={null}
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
        <DataTable noPagination rows={itemLines} getRowId={(l) => l.id} columns={columns} unsortable={columns.map((c) => c.key)}
          onRemove={ro ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
          onColumnSettings={() => setSettingsOpen(!settingsOpen)}
          empty={<Text variant="small" tone="muted">No lines yet.</Text>}
          spanRow={addRow} cardFooter={cardFooter}
        />
      </div>
      {copying
        ? createPortal(
            <CopyPanel
              sources={[{
                key: 'AR' as const,
                label: 'A/R invoices',
                totalHeader: 'Billed',
                qtyHeader: 'Credit',
                hint: 'Credit quantities can be at most the billed quantity.',
                docs: invoices.map((inv) => ({
                  id: inv.id,
                  label: `${arNumber(inv)} · ${inv.customerName}`,
                  description: `Invoiced ${inv.postingDate}`,
                  lines: inv.lines
                    .filter((l) => l.quantity > 0)
                    .map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: l.quantity })),
                })),
              }] satisfies CopySourceType<'AR'>[]}
              taken={new Set(lines.map((l) => l.baseLineId).filter((id): id is string => !!id))}
              onCancel={() => setCopying(false)}
              onCopy={(_type, docId, picks) => {
                const inv = invoices.find((i) => i.id === docId);
                setCopying(false);
                if (inv) onCopy(inv, picks);
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
