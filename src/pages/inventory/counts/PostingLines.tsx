import { useState } from 'react';
import { Button, Combobox, Icon, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import type { Errors } from '../../../components/form/fields';
import { countedQty, newPostingLine, type InventoryPosting, type PostingLine } from '../../../mocks/inventoryCountings';
import type { Item } from '../../../mocks/items';
import { formatAmount } from '../../../services/format';
import { lineTotal, postingTotal, postingVariance, sourcePrice, stockAfter, variancePct } from '../../../services/inventoryCountings';
import { inStockAt } from '../../../services/inventoryTransfers';
import { warehouseOptions } from '../transfers/TransferLines';
import { AddItemsBar, FindBar, findRows, itemOptions, itemsPer, num, signed, uomOptions, type CountMasters } from './shared';

export type PostingDraft = Omit<InventoryPosting, 'id'> & { id?: string };

/** A line added directly (no count): book = counted = In Stock now, so it starts with no variance. */
export function postingLineFor(item: Item, warehouse: string, draft: PostingDraft, base: Partial<PostingLine> = {}): PostingLine {
  const inWhseQty = inStockAt(item, warehouse);
  return newPostingLine({
    ...base,
    itemId: item.id,
    itemNo: item.itemNo,
    description: item.name,
    warehouse,
    bin: item.warehouses.find((w) => w.code === warehouse)?.defaultBin ?? '',
    inWhseQty,
    uomCode: item.inventoryUom,
    itemsPerUnit: 1,
    uomCountedQty: inWhseQty,
    price: sourcePrice(item, draft),
  });
}

export function PostingLines({
  draft,
  update,
  errors,
  m,
  readOnly,
}: {
  draft: PostingDraft;
  update: (patch: Partial<PostingDraft>) => void;
  errors: Errors;
  m: CountMasters;
  readOnly: boolean;
}) {
  const [find, setFind] = useState({ query: '', warehouse: '' });
  const lines = draft.lines;
  const fromCount = Boolean(draft.countingId);
  const itemOf = (l: PostingLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<PostingLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: PostingLine, field: string) => errors[`line:${l.id}:${field}`];

  const columns: TableColumn<PostingLine>[] = [
    {
      key: 'item',
      header: 'Item No.',
      cell: (l) =>
        itemOf(l) || readOnly ? (
          <Text variant="caption">{l.itemNo}</Text>
        ) : (
          <div className="w-56">
            <Combobox
              aria-label="Item No."
              placeholder="Search items"
              options={itemOptions(m.items, l.itemId)}
              value={l.itemId || null}
              invalid={Boolean(err(l, 'item'))}
              onValueChange={(v) => {
                const item = m.items.find((i) => i.id === v);
                patch(l.id, item ? postingLineFor(item, l.warehouse, draft, { id: l.id }) : { itemId: '' });
              }}
            />
          </div>
        ),
    },
    {
      key: 'description',
      header: 'Item description',
      cell: (l) =>
        itemOf(l) ? <TextField aria-label="Item description" className="w-52" readOnly={readOnly} value={l.description} onChange={(e) => patch(l.id, { description: e.currentTarget.value })} /> : null,
    },
    {
      key: 'warehouse',
      header: 'Whse',
      cell: (l) =>
        fromCount || readOnly ? (
          <span>{l.warehouse}</span>
        ) : (
          <div className="w-44">
            <Combobox
              aria-label="Warehouse"
              invalid={Boolean(err(l, 'warehouse'))}
              options={warehouseOptions(m.warehouses, l.warehouse)}
              value={l.warehouse || null}
              onValueChange={(v) => {
                const item = itemOf(l);
                patch(l.id, item ? postingLineFor(item, v ?? '', draft, { id: l.id }) : { warehouse: v ?? '' });
              }}
            />
          </div>
        ),
    },
    {
      key: 'inWhse',
      header: 'In-Whse Qty on Count Date',
      cell: (l) => (itemOf(l) && l.warehouse ? <span className="tabular-nums whitespace-nowrap">{l.inWhseQty} {itemOf(l)!.inventoryUom}</span> : null),
    },
    {
      key: 'uomCountedQty',
      header: 'UoM Counted Qty',
      cell: (l) =>
        itemOf(l) ? (
          <TextField
            aria-label="UoM counted quantity"
            type="number"
            min={0}
            className="w-28"
            readOnly={readOnly}
            invalid={Boolean(err(l, 'countedQty'))}
            value={String(l.uomCountedQty)}
            onChange={(e) => patch(l.id, { uomCountedQty: num(e.currentTarget.value) })}
          />
        ) : null,
    },
    {
      key: 'uomCode',
      header: 'UoM Code',
      cell: (l) => {
        const item = itemOf(l);
        if (!item) return null;
        return (
          <div className="flex w-28 flex-col gap-1">
            <Select aria-label="UoM code" disabled={readOnly} options={uomOptions(item)} value={l.uomCode} onValueChange={(uomCode) => patch(l.id, { uomCode, itemsPerUnit: itemsPer(item, uomCode) })} />
            <Text variant="small" tone="muted">
              {l.itemsPerUnit} per unit
            </Text>
          </div>
        );
      },
    },
    { key: 'countedQty', header: 'Counted Qty', cell: (l) => (itemOf(l) ? <span className="tabular-nums">{countedQty(l)}</span> : null) },
    {
      key: 'variance',
      header: 'Variance',
      cell: (l) => {
        if (!itemOf(l)) return null;
        const v = postingVariance(l);
        const pct = variancePct(l);
        return (
          <div className="flex flex-col whitespace-nowrap tabular-nums">
            <Text variant="small" tone={v < 0 ? 'danger' : v > 0 ? 'success' : 'muted'}>
              {signed(v)}
            </Text>
            <Text variant="small" tone={pct !== undefined && Math.abs(pct) >= 10 ? 'danger' : 'muted'}>
              {pct === undefined ? (v ? 'new stock' : '—') : `${pct > 0 ? '+' : ''}${pct}%`}
            </Text>
          </div>
        );
      },
    },
    {
      key: 'price',
      header: 'Price',
      cell: (l) =>
        itemOf(l) ? (
          <TextField
            aria-label="Price"
            type="number"
            min={0}
            prefix="PHP"
            className="w-36"
            readOnly={readOnly}
            invalid={Boolean(err(l, 'price'))}
            value={String(l.price)}
            onChange={(e) => patch(l.id, { price: num(e.currentTarget.value) })}
          />
        ) : null,
    },
    { key: 'total', header: 'Total', cell: (l) => (itemOf(l) ? <span className="tabular-nums whitespace-nowrap">PHP {formatAmount(lineTotal(l))}</span> : null) },
    ...(readOnly
      ? []
      : [
          {
            key: 'after',
            header: 'In stock after',
            cell: (l: PostingLine) => {
              const item = itemOf(l);
              if (!item || !l.warehouse) return null;
              const now = inStockAt(item, l.warehouse);
              const after = stockAfter(l, m.items);
              return (
                <div className="flex flex-col whitespace-nowrap tabular-nums">
                  <Text variant="small" tone={after < 0 ? 'danger' : 'default'}>
                    {now} → {after}
                  </Text>
                  {now !== l.inWhseQty ? (
                    <Text variant="small" tone="muted">
                      moved since count
                    </Text>
                  ) : null}
                </div>
              );
            },
          },
        ]),
  ];

  const listed = new Set(lines.filter((l) => l.itemId).map((l) => `${l.itemId}@${l.warehouse}`));
  const shown = findRows(lines, find.query, find.warehouse);

  return (
    <DataTable
      variant="card"
      noPagination
      icon="fact_check"
      title="Contents"
      description={
        errors.lines ??
        `Adding the posting moves In Stock by each line’s variance (counted − In-Whse Qty on Count Date), valued at the price. Total: PHP ${formatAmount(postingTotal(draft))}.`
      }
      rows={shown}
      getRowId={(l) => l.id}
      columns={columns}
      unsortable={columns.map((c) => c.key).filter((k) => k !== 'item' && k !== 'warehouse')}
      sortValue={(l, key) => (key === 'item' ? l.itemNo.toLowerCase() : key === 'warehouse' ? l.warehouse : 0)}
      onRemove={readOnly ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
      actions={
        readOnly || fromCount ? null : (
          <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => update({ lines: [...lines, newPostingLine({ warehouse: lines[lines.length - 1]?.warehouse ?? '' })] })}>
            Add line
          </Button>
        )
      }
      empty={
        <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
          {lines.length ? 'No lines match the Find filter.' : 'Copy from an inventory counting, or add items to adjust directly.'}
        </Text>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <FindBar m={m} query={find.query} warehouse={find.warehouse} onChange={(query, warehouse) => setFind({ query, warehouse })} />
        {readOnly || fromCount ? null : <AddItemsBar m={m} listed={listed} onAdd={(items, wh) => update({ lines: [...lines.filter((l) => l.itemId), ...items.map((i) => postingLineFor(i, wh, draft))] })} />}
      </div>
    </DataTable>
  );
}
