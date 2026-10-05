import { useState } from 'react';
import { Button, Checkbox, Combobox, Icon, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import type { Errors } from '../../../components/form/fields';
import { newCountLine, type CountLine, type InventoryCounting } from '../../../mocks/inventoryCountings';
import type { Item } from '../../../mocks/items';
import type { ItemGroup, Warehouse } from '../../../mocks/itemMasters';
import { formatAmount } from '../../../services/format';
import { lineVariance, lineVarianceValue, systemQty } from '../../../services/inventoryCountings';
import { warehouseOptions } from '../transfers/TransferLines';

export type CountingDraft = Omit<InventoryCounting, 'id'> & { id?: string };

export interface CountMasters {
  items: Item[];
  warehouses: Warehouse[];
  groups: ItemGroup[];
}

const num = (v: string) => (v === '' ? 0 : Number(v));

export function lineFor(item: Item, warehouse: string, base: Partial<CountLine> = {}): CountLine {
  return newCountLine({
    ...base,
    itemId: item.id,
    itemNo: item.itemNo,
    name: item.name,
    warehouse,
    bin: item.warehouses.find((w) => w.code === warehouse)?.defaultBin ?? '',
    uom: item.inventoryUom,
  });
}

/** Signed quantity, e.g. "+2" / "−1" / "0". */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

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
  const [pickWh, setPickWh] = useState('');
  const [pickGroup, setPickGroup] = useState('');
  const lines = draft.lines;
  const posted = draft.status === 'Posted';
  const itemOf = (l: CountLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<CountLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: CountLine, field: string) => errors[`line:${l.id}:${field}`];

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || i.inventoryItem)
      .map((i) => ({
        value: i.id,
        label: (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-60">{i.itemNo}</span>
            <span>{i.name}</span>
          </div>
        ),
        text: `${i.itemNo} ${i.name} ${i.description}`,
      }));

  const pickItem = (l: CountLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? lineFor(item, l.warehouse, { id: l.id }) : { itemId: '' });
    setChanging((prev) => {
      const next = new Set(prev);
      next.delete(l.id);
      return next;
    });
  };

  /** SAP's "select items by criteria": every stocked item in the warehouse (and group) not already listed. */
  const listed = new Set(lines.filter((l) => l.itemId).map((l) => `${l.itemId}@${l.warehouse}`));
  const matching = pickWh
    ? m.items
        .filter(
          (i) =>
            i.inventoryItem &&
            (!pickGroup || i.itemGroup === pickGroup) &&
            i.warehouses.some((w) => w.code === pickWh && w.inStock > 0) &&
            !listed.has(`${i.id}@${pickWh}`),
        )
        .sort((a, b) => a.itemNo.localeCompare(b.itemNo))
    : [];
  const addMatching = () => update({ lines: [...lines.filter((l) => l.itemId), ...matching.map((i) => lineFor(i, pickWh))] });

  const columns: TableColumn<CountLine>[] = [
    {
      key: 'item',
      header: 'Item',
      cell: (l) => {
        const item = itemOf(l);
        if (item && !changing.has(l.id)) {
          return (
            <div className="flex w-60 flex-col">
              <Text variant="caption">{l.itemNo}</Text>
              <Text variant="small">{l.name}</Text>
              {readOnly ? null : (
                <Link intent="primary" onClick={() => setChanging((prev) => new Set(prev).add(l.id))}>
                  Change
                </Link>
              )}
            </div>
          );
        }
        return (
          <div className="w-60">
            <Combobox
              aria-label="Item No."
              placeholder="Search items"
              options={itemOptions(l.itemId)}
              value={l.itemId || null}
              invalid={Boolean(err(l, 'item'))}
              onValueChange={(v) => pickItem(l, v)}
            />
          </div>
        );
      },
    },
    {
      key: 'warehouse',
      header: 'Warehouse / bin',
      cell: (l) => (
        <div className="flex w-52 flex-col gap-1">
          <Combobox
            aria-label="Warehouse"
            disabled={readOnly}
            invalid={Boolean(err(l, 'warehouse'))}
            options={warehouseOptions(m.warehouses, l.warehouse)}
            value={l.warehouse || null}
            onValueChange={(v) => {
              const item = itemOf(l);
              patch(l.id, { warehouse: v ?? '', bin: item?.warehouses.find((w) => w.code === v)?.defaultBin ?? '' });
            }}
          />
          {l.bin ? <Text variant="small" tone="muted">Bin {l.bin}</Text> : null}
        </div>
      ),
    },
    {
      key: 'inWhse',
      header: 'In stock',
      cell: (l) =>
        itemOf(l) && l.warehouse ? (
          <div className="flex flex-col whitespace-nowrap tabular-nums">
            <Text variant="small">
              {systemQty(l, m.items, posted)} {l.uom}
            </Text>
            <Text variant="small" tone="muted">
              {posted ? 'when posted' : 'now'}
            </Text>
          </div>
        ) : null,
    },
    {
      key: 'counted',
      header: 'Counted',
      cell: (l) =>
        itemOf(l) ? (
          <Checkbox
            aria-label={`Counted ${l.itemNo}`}
            disabled={readOnly}
            checked={l.counted}
            // Ticking an untouched line starts it at In Stock, so a match is one click.
            onChange={(e) =>
              patch(l.id, {
                counted: e.currentTarget.checked,
                ...(e.currentTarget.checked && !l.countedQty ? { countedQty: systemQty(l, m.items, posted) } : {}),
              })
            }
          />
        ) : null,
    },
    {
      key: 'countedQty',
      header: 'Counted qty',
      cell: (l) =>
        itemOf(l) ? (
          <TextField
            aria-label="Counted quantity"
            type="number"
            min={0}
            className="w-32"
            suffix={l.uom}
            readOnly={readOnly}
            invalid={Boolean(err(l, 'countedQty'))}
            value={l.counted ? String(l.countedQty) : ''}
            placeholder="Not counted"
            onChange={(e) => patch(l.id, { counted: e.currentTarget.value !== '', countedQty: num(e.currentTarget.value) })}
          />
        ) : null,
    },
    {
      key: 'variance',
      header: 'Variance',
      cell: (l) => {
        if (!itemOf(l) || !l.counted) return null;
        const v = lineVariance(l, m.items, posted);
        return (
          <div className="flex flex-col whitespace-nowrap tabular-nums">
            <Text variant="small" tone={v < 0 ? 'danger' : v > 0 ? 'success' : 'muted'}>
              {signed(v)} {l.uom}
            </Text>
            <Text variant="small" tone="muted">
              PHP {formatAmount(lineVarianceValue(l, m.items, posted))}
            </Text>
          </div>
        );
      },
    },
    {
      key: 'remarks',
      header: 'Remarks',
      cell: (l) =>
        itemOf(l) ? (
          <TextField aria-label="Line remarks" className="w-48" placeholder="e.g. damaged box" value={l.remarks} readOnly={readOnly} onChange={(e) => patch(l.id, { remarks: e.currentTarget.value })} />
        ) : null,
    },
  ];

  const lastWh = lines[lines.length - 1]?.warehouse ?? '';

  return (
    <DataTable
      variant="card"
      noPagination
      icon="checklist"
      title="Count sheet"
      description={
        errors.lines ??
        'Items to count, in their inventory unit. Enter what’s on the shelf; the variance is against In Stock, which keeps moving until the count is posted.'
      }
      rows={lines}
      getRowId={(l) => l.id}
      columns={columns}
      unsortable={columns.map((c) => c.key).filter((k) => k !== 'item' && k !== 'warehouse')}
      sortValue={(l, key) => (key === 'item' ? l.itemNo.toLowerCase() : key === 'warehouse' ? l.warehouse : 0)}
      onRemove={readOnly ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
      actions={
        readOnly ? null : (
          <Button
            type="button"
            size="small"
            variant="outline"
            leadingIcon={<Icon size={16}>add</Icon>}
            onClick={() => update({ lines: [...lines, newCountLine({ warehouse: lastWh })] })}
          >
            Add line
          </Button>
        )
      }
      empty={
        <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
          No items yet. Add everything stocked in a warehouse below, or add lines one by one.
        </Text>
      }
    >
      {readOnly ? null : (
        <div className="flex flex-wrap items-end gap-1">
          <div className="w-64">
            <Combobox aria-label="Warehouse to count" placeholder="Warehouse to count" options={warehouseOptions(m.warehouses, pickWh)} value={pickWh || null} onValueChange={(v) => setPickWh(v ?? '')} />
          </div>
          <Select
            aria-label="Item group"
            className="w-48"
            options={[{ value: '', label: 'All item groups' }, ...m.groups.map((g) => ({ value: g.name, label: g.name }))]}
            value={pickGroup}
            onValueChange={setPickGroup}
          />
          <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>playlist_add</Icon>} disabled={!matching.length} onClick={addMatching}>
            {pickWh ? `Add ${matching.length} stocked item${matching.length === 1 ? '' : 's'}` : 'Add stocked items'}
          </Button>
        </div>
      )}
    </DataTable>
  );
}

