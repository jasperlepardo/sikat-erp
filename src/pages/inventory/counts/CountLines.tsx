import { useState } from 'react';
import { binCodeOf, binLocations } from '../../../services/binLocations';
import { Button, Checkbox, Combobox, Icon, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import type { Errors } from '../../../components/form/fields';
import { countedQty, newCountLine, type CountLine, type InventoryCounting } from '../../../mocks/inventoryCountings';
import type { Item } from '../../../mocks/items';
import { counterStatus, countVariance } from '../../../services/inventoryCountings';
import { nameIn, salesEmployees } from '../../../services/partnerMasters';
import { inStockAt } from '../../../services/inventoryTransfers';
import { warehouseOptions } from '../transfers/TransferLines';
import { AddItemsBar, FindBar, findRows, itemOptions, itemsPer, num, signed, uomOptions, type CountMasters } from './shared';

export type CountingDraft = Omit<InventoryCounting, 'id'> & { id?: string };

/** A count line for the item in a warehouse, with In-Whse Qty snapshotted now. */
export function countLineFor(item: Item, warehouse: string, base: Partial<CountLine> = {}): CountLine {
  return newCountLine({
    ...base,
    itemId: item.id,
    itemNo: item.itemNo,
    description: item.name,
    warehouse,
    binId: item.warehouses.find((w) => w.code === warehouse)?.defaultBinId ?? '',
    inWhseQty: inStockAt(item, warehouse),
    uomCode: item.inventoryUom,
    itemsPerUnit: 1,
  });
}

const ADJUST = [
  { value: 'match', label: 'Uncounted lines: counted = In-Whse Qty' },
  { value: 'agreed', label: 'Take quantities the counters agree on' },
  { value: 'clear', label: 'Clear all counted quantities' },
];

export function CountLines({
  draft,
  update,
  errors,
  m,
  readOnly,
}: {
  draft: CountingDraft;
  update: (patch: Partial<CountingDraft>) => void;
  errors: Errors;
  m: CountMasters;
  readOnly: boolean;
}) {
  const [changing, setChanging] = useState<Set<string>>(new Set());
  const [find, setFind] = useState({ query: '', warehouse: '' });
  const lines = draft.lines;
  const multiple = draft.countingType === 'multiple';
  const counters = draft.counters.filter((c) => c.employeeId);
  const counterIds = counters.map((c) => c.id);
  const itemOf = (l: CountLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<CountLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  /** A counter's figure on the line, '' when they haven't counted it. */
  const qtyOf = (l: CountLine, counterId: string) => {
    const q = l.counts.find((c) => c.counterId === counterId)?.qty;
    return q === undefined ? '' : String(q);
  };
  const err = (l: CountLine, field: string) => errors[`line:${l.id}:${field}`];

  const pickItem = (l: CountLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? countLineFor(item, l.warehouse, { id: l.id, freeze: l.freeze }) : { itemId: '' });
    setChanging((prev) => {
      const next = new Set(prev);
      next.delete(l.id);
      return next;
    });
  };

  /** A counter's figure; when every counter is in and they agree, that becomes the counted qty. */
  const setCounterQty = (l: CountLine, counterId: string, value: string) => {
    const others = l.counts.filter((c) => c.counterId !== counterId);
    const counts = value === '' ? others : [...others, { counterId, qty: num(value) }];
    const s = counterStatus({ ...l, counts }, counterIds);
    patch(l.id, { counts, ...(s.agree ? { counted: true, uomCountedQty: s.agreed! } : {}) });
  };

  const adjust = (how: string) => {
    update({
      lines: lines.map((l) => {
        if (!l.itemId) return l;
        if (how === 'match' && !l.counted) return { ...l, counted: true, uomCountedQty: Math.round((l.inWhseQty / (l.itemsPerUnit || 1)) * 1000) / 1000 };
        if (how === 'clear') return { ...l, counted: false, uomCountedQty: 0, counts: [] };
        if (how === 'agreed') {
          const s = counterStatus(l, counterIds);
          return s.agree ? { ...l, counted: true, uomCountedQty: s.agreed! } : l;
        }
        return l;
      }),
    });
  };

  const counterColumns: TableColumn<CountLine>[] = multiple
    ? [
        ...counters.map((c) => {
          const name = nameIn(salesEmployees, c.employeeId);
          return {
            key: `counter:${c.id}`,
            header: name,
            cell: (l: CountLine) =>
              itemOf(l) ? (
                <TextField
                  aria-label={`${name}'s count`}
                  type="number"
                  min={0}
                  className="w-24"
                  readOnly={readOnly}
                  placeholder="—"
                  value={qtyOf(l, c.id)}
                  onChange={(e) => setCounterQty(l, c.id, e.currentTarget.value)}
                />
              ) : null,
          };
        }),
        {
          key: 'agreement',
          header: 'Counters',
          cell: (l: CountLine) => {
            if (!itemOf(l)) return null;
            const s = counterStatus(l, counterIds);
            return (
              <Text variant="small" tone={!s.all ? 'muted' : s.agree ? 'success' : 'danger'}>
                {!s.all ? 'Waiting' : s.agree ? 'Agree' : 'Differ — recount'}
              </Text>
            );
          },
        },
      ]
    : [];

  const columns: TableColumn<CountLine>[] = [
    {
      key: 'item',
      header: 'Item No.',
      cell: (l) => {
        const item = itemOf(l);
        if (item && !changing.has(l.id)) {
          return (
            <div className="flex w-48 flex-col">
              <Text variant="caption">{l.itemNo}</Text>
              {readOnly ? null : (
                <Link intent="primary" onClick={() => setChanging((prev) => new Set(prev).add(l.id))}>
                  Change
                </Link>
              )}
            </div>
          );
        }
        return (
          <div className="w-56">
            <Combobox aria-label="Item No." placeholder="Search items" options={itemOptions(m.items, l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(v) => pickItem(l, v)} />
          </div>
        );
      },
    },
    {
      key: 'description',
      header: 'Item description',
      cell: (l) =>
        itemOf(l) ? (
          <TextField aria-label="Item description" className="w-56" readOnly={readOnly} value={l.description} onChange={(e) => patch(l.id, { description: e.currentTarget.value })} />
        ) : null,
    },
    {
      key: 'freeze',
      header: 'Freeze',
      cell: (l) => (itemOf(l) ? <Checkbox aria-label={`Freeze ${l.itemNo}`} disabled={readOnly} checked={l.freeze} onChange={(e) => patch(l.id, { freeze: e.currentTarget.checked })} /> : null),
    },
    {
      key: 'warehouse',
      header: 'Whse',
      cell: (l) => (
        <div className="flex w-48 flex-col gap-1">
          <Combobox
            aria-label="Warehouse"
            disabled={readOnly}
            invalid={Boolean(err(l, 'warehouse'))}
            options={warehouseOptions(m.warehouses, l.warehouse)}
            value={l.warehouse || null}
            onValueChange={(v) => {
              const item = itemOf(l);
              // A new warehouse means a new book quantity.
              patch(l.id, item ? countLineFor(item, v ?? '', { ...l, warehouse: v ?? '' }) : { warehouse: v ?? '' });
            }}
          />
          {l.binId ? <Text variant="small" tone="muted">Bin {binCodeOf(binLocations.snapshot(), l.binId)}</Text> : null}
        </div>
      ),
    },
    {
      key: 'inWhse',
      header: 'In-Whse Qty on Count Date',
      cell: (l) => {
        const item = itemOf(l);
        if (!item || !l.warehouse) return null;
        const now = inStockAt(item, l.warehouse);
        return (
          <div className="flex flex-col whitespace-nowrap tabular-nums">
            <Text variant="small">
              {l.inWhseQty} {item.inventoryUom}
            </Text>
            {draft.status === 'Open' && now !== l.inWhseQty ? (
              <Text variant="small" tone="danger">
                {now} now — stock moved since
              </Text>
            ) : null}
          </div>
        );
      },
    },
    ...counterColumns,
    {
      key: 'counted',
      header: 'Counted',
      cell: (l) =>
        itemOf(l) ? (
          <Checkbox aria-label={`Counted ${l.itemNo}`} disabled={readOnly} checked={l.counted} onChange={(e) => patch(l.id, { counted: e.currentTarget.checked })} />
        ) : null,
    },
    {
      key: 'uomCountedQty',
      header: multiple ? 'Agreed qty' : 'UoM Counted Qty',
      cell: (l) =>
        itemOf(l) ? (
          <TextField
            aria-label="UoM counted quantity"
            type="number"
            min={0}
            className="w-28"
            readOnly={readOnly || !l.counted}
            invalid={Boolean(err(l, 'countedQty'))}
            placeholder={l.counted ? '0' : 'Tick Counted'}
            value={l.counted ? String(l.uomCountedQty) : ''}
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
    {
      key: 'countedQty',
      header: 'Counted Qty',
      cell: (l) => (itemOf(l) && l.counted ? <span className="tabular-nums whitespace-nowrap">{countedQty(l)} {itemOf(l)!.inventoryUom}</span> : null),
    },
    {
      key: 'variance',
      header: 'Variance',
      cell: (l) => {
        if (!itemOf(l) || !l.counted) return null;
        const v = countVariance(l);
        return (
          <Text variant="small" tone={v < 0 ? 'danger' : v > 0 ? 'success' : 'muted'}>
            <span className="tabular-nums whitespace-nowrap">{signed(v)}</span>
          </Text>
        );
      },
    },
  ];

  const lastWh = lines[lines.length - 1]?.warehouse ?? '';
  const listed = new Set(lines.filter((l) => l.itemId).map((l) => `${l.itemId}@${l.warehouse}`));
  const shown = findRows(lines, find.query, find.warehouse);

  return (
    <DataTable
      variant="card"
      noPagination
      icon="checklist"
      title="Contents"
      description={
        errors.lines ??
        'Count first, then compare: In-Whse Qty is the book quantity when the line was added. Counted Qty is the UoM Counted Qty in the inventory unit. Nothing changes stock until an Inventory Posting is made from this count.'
      }
      rows={shown}
      getRowId={(l) => l.id}
      columns={columns}
      unsortable={columns.map((c) => c.key).filter((k) => k !== 'item' && k !== 'warehouse')}
      sortValue={(l, key) => (key === 'item' ? l.itemNo.toLowerCase() : key === 'warehouse' ? l.warehouse : 0)}
      onRemove={readOnly ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
      actions={
        readOnly ? null : (
          <div className="flex items-center gap-1">
            <Select aria-label="Adjust counted quantities" className="w-72" placeholder="Adjust counted quantities…" options={ADJUST.filter((a) => multiple || a.value !== 'agreed')} value="" onValueChange={adjust} />
            <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => update({ lines: [...lines, newCountLine({ warehouse: lastWh })] })}>
              Add line
            </Button>
          </div>
        )
      }
      empty={
        <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
          {lines.length ? 'No lines match the Find filter.' : 'No items yet. Use Add Items to load everything stocked in a warehouse, or add lines one by one.'}
        </Text>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <FindBar m={m} query={find.query} warehouse={find.warehouse} onChange={(query, warehouse) => setFind({ query, warehouse })} />
        {readOnly ? null : <AddItemsBar m={m} listed={listed} onAdd={(items, wh) => update({ lines: [...lines.filter((l) => l.itemId), ...items.map((i) => countLineFor(i, wh))] })} />}
      </div>
    </DataTable>
  );
}
