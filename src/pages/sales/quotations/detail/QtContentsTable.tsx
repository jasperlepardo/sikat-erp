import { useState, type ReactNode } from 'react';
import { Card, Checkbox, Combobox, Icon, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import type { QuoteLine } from '../../../../mocks/quotations';
import { formatAmount } from '../../../../services/format';
import { isValidToday } from '../../../../services/items';
import { isPriceListValid } from '../../../../services/priceLists';
import { lineNet } from '../../../../services/quotations';
import { priceAfterDiscount } from '../../../../services/salesOrders';
import { priceListDef } from '../../../settings/masterDefs';
import { lineFromItem, linePricing, type QtTabProps } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));

const GROUPS = { priceListId: 'Price list' } as const;
type Group = keyof typeof GROUPS;

/** The quotation's lines, laid out like the sales order's Item table. */
export function QtContentsTable({ draft, update, errors, ctx, m, cardFooter }: QtTabProps & { cardFooter?: ReactNode }) {
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const [shown, setShown] = useState<Group[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const is = (g: Group) => shown.includes(g);
  const lines = draft.lines;
  const itemLines = lines.filter((l) => !!l.itemId);
  const itemOf = (l: QuoteLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<QuoteLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: QuoteLine, field: string) => errors[`line:${l.id}:${field}`];
  const lc = (n: number) => formatAmount(n * ctx.fx);

  // Once added, only remarks and attachments change.
  const linesLocked = ctx.readOnly || ctx.added;

  // Sales items valid on the posting date.
  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.salesItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({
        value: i.id,
        label: (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-60">{i.itemNo}</span>
            <span>{i.description || i.name}</span>
          </div>
        ),
        text: `${i.itemNo} ${i.name} ${i.description}`,
      }));


  const pickItem = (l: QuoteLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? lineFromItem(item, draft, ctx, m, { id: l.id, quantity: l.quantity }) : { itemId: '' });
  };
  /** Re-run pricing after a change, unless the price was typed over. */
  const reprice = (l: QuoteLine, change: Partial<QuoteLine>) => {
    const item = itemOf(l);
    const next = { ...l, ...change };
    if (!item || !ctx.fx || l.priceSource === 'Manual') return patch(l.id, change);
    patch(l.id, { ...change, ...linePricing(item, next, draft, m.customers, ctx.vatRegistered, ctx.rateOf, ctx.fx) });
  };
  const changeUom = (l: QuoteLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!itemsPerUnit) return;
    reprice(l, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit });
  };

  const col = (key: string, header: ReactNode, cell: (l: QuoteLine) => ReactNode, group?: Group, align?: 'start' | 'end'): TableColumn<QuoteLine> & { group?: Group } => ({ key, header, cell, group, ...(align ? { align } : {}) });

  const columns: TableColumn<QuoteLine>[] = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      if (!item || (editing.has(l.id) && !linesLocked)) {
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
          {linesLocked ? null : (
            <div className="flex gap-3">
              <Link intent="primary" onClick={() => setEditing((s) => new Set(s).add(l.id))}>
                Edit
              </Link>
              <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', description: '' })}>
                Change
              </Link>
            </div>
          )}
        </div>
      );
    }),
    col('qty', 'Qty / UoM', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      if (linesLocked) return (
        <Text variant="small" className="whitespace-nowrap tabular-nums">
          {l.quantity.toLocaleString('en-PH')} {l.uomCode}
        </Text>
      );
      return (
        <div className="flex w-40 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField
            aria-label="Quantity"
            type="number"
            min={0}
            invalid={Boolean(err(l, 'quantity'))}
            value={String(l.quantity)}
            onChange={(e) => reprice(l, { quantity: num(e.currentTarget.value) })}
          />
          <Select
            aria-label="UoM code"
            options={itemUnits(item, 'sales').map((u) => ({ value: u.uom, label: u.uom }))}
            value={l.uomCode}
            onValueChange={(v) => v && changeUom(l, v)}
          />
          <Text variant="small" tone="muted">
            {l.uomCode}
            {l.uomCode === item.inventoryUom ? ' · inventory UoM' : ` · ${l.itemsPerUnit} ${item.inventoryUom} each`}
          </Text>
        </div>
      );
    }, undefined, 'end'),
    col('priceListId', 'Price list', (l) => {
      if (!itemOf(l)) return null;
      if (linesLocked) {
        const plRow = priceListDef.collection.snapshot().find((p) => p.id === l.priceListId);
        return <Text variant="small">{plRow ? priceListDef.label(plRow) : '—'}</Text>;
      }
      return (
        <MasterLookup
          def={priceListDef}
          fieldProps={{ 'aria-label': 'Price list', className: 'w-40' }}
          where={(r) => isPriceListValid(r, draft.postingDate)}
          value={l.priceListId}
          onChange={(v) => {
            const item = itemOf(l)!;
            const next = { ...l, priceListId: v };
            patch(l.id, { priceListId: v, ...(ctx.fx ? linePricing(item, next, draft, m.customers, ctx.vatRegistered, ctx.rateOf, ctx.fx) : {}) });
          }}
        />
      );
    }, 'priceListId'),
    col('pricing', 'Unit price / Discount', (l) => {
      if (!itemOf(l)) return null;
      if (linesLocked) return (
        <div className="flex flex-col whitespace-nowrap tabular-nums">
          <Text variant="small">{draft.currency} {formatAmount(l.discountPct ? priceAfterDiscount(l) : l.unitPrice)}</Text>
          {l.discountPct ? <Text variant="small" tone="muted" className="line-through">{draft.currency} {formatAmount(l.unitPrice)}</Text> : null}
        </div>
      );
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField
            aria-label="Unit price"
            type="number"
            min={0}
            prefix={draft.currency}
            invalid={Boolean(err(l, 'unitPrice'))}
            value={String(l.unitPrice)}
            onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value), priceSource: 'Manual' })}
          />
          <TextField
            aria-label="Discount %"
            type="number"
            min={0}
            suffix="%"
            value={String(l.discountPct)}
            onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)), priceSource: 'Manual' })}
          />
          <Text variant="small" tone="muted">
            {l.priceSource || '—'}
            {l.priceSource === 'Manual' ? (
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
    }, undefined, 'end'),
    col('totals', 'Total (LC)', (l) =>
      itemOf(l) ? (
        <Text variant="small" className="whitespace-nowrap tabular-nums">
          PHP {lc(lineNet(l))}
        </Text>
      ) : null,
    undefined, 'end'),
  ].filter((c) => !c.group || is(c.group));

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
      <div className={linesLocked ? '[&_.sikat-table__row:hover>.sikat-table__td]:[box-shadow:none]' : undefined}>
        <DataTable
          variant="plain"
          noPagination
          rows={itemLines}
          getRowId={(l) => l.id}
          columns={columns}
          unsortable={columns.map((c) => c.key)}
          onRemove={linesLocked ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
          onColumnSettings={() => setSettingsOpen(!settingsOpen)}
          empty={<Text variant="small" tone="muted">No lines yet.</Text>}
          spanRow={
            linesLocked ? undefined : (
              <Combobox
                key={addKey}
                aria-label="Search items to add a line"
                placeholder="Search items to add a line…"
                options={itemOptions('')}
                value={null}
                onValueChange={(id) => {
                  if (!id) return;
                  const item = m.items.find((i) => i.id === id);
                  if (!item) return;
                  update({ lines: [...itemLines, lineFromItem(item, draft, ctx, m)] });
                  setAddKey((k) => k + 1);
                }}
              />
            )
          }
          cardFooter={cardFooter}
        />
      </div>
    </div>
  );
}
