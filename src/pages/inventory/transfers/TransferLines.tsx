import { useState } from 'react';
import { Button, Combobox, Icon, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import type { Errors } from '../../../components/form/fields';
import { newTransferLine, type InventoryTransfer, type TransferLine } from '../../../mocks/inventoryTransfers';
import type { Item } from '../../../mocks/items';
import { holdsStock, type Warehouse } from '../../../mocks/itemMasters';
import type { BinLocation } from '../../../mocks/binLocations';
import { binsOf, receivingBin } from '../../../services/binLocations';
import { formatAmount } from '../../../services/format';
import { isValidToday } from '../../../services/items';
import { inStockAt, qtyByItem } from '../../../services/inventoryTransfers';

export type TransferDraft = Omit<InventoryTransfer, 'id'> & { id?: string };

export interface TransferMasters {
  items: Item[];
  warehouses: Warehouse[];
  bins: BinLocation[];
}

/** Stock location picker options: active warehouses and stores (plus the current value), name over code. */
export const warehouseOptions = (whs: Warehouse[], current: string, exclude = '') =>
  whs
    .filter((w) => ((w.active && holdsStock(w)) || w.code === current) && (w.code !== exclude || w.code === current))
    .map((w) => ({ value: w.code, label: w.name, subLabel: w.code, subLabelPlacement: 'top' as const, text: `${w.code} ${w.name}` }));

/**
 * A warehouse's active bins (plus the current one) by id, labelled with code and description. A
 * posted line passes its `snapshot` code so it reads as posted; a bin that no longer exists stays
 * listed, flagged, so the line shows what to fix.
 */
export const binOptions = (bins: BinLocation[], wh: Warehouse | undefined, current = '', snapshot = '') => {
  const live = wh ? binsOf(bins, wh.code, current) : [];
  const label = (b: BinLocation) => {
    const code = b.id === current && snapshot ? snapshot : b.code;
    return b.description ? `${code} · ${b.description}` : code;
  };
  return [
    { value: '', label: '— Pick a bin —' },
    ...(current && !live.some((b) => b.id === current) ? [{ value: current, label: `${snapshot || current} (no longer exists)` }] : []),
    ...live.map((b) => ({ value: b.id, label: label(b) })),
  ];
};

const num = (v: string) => (v === '' ? 0 : Number(v));

/**
 * Default bins for an item: its default bin in that warehouse, else the header bin, else
 * (inbound) the receiving bin, else the first bin.
 */
export const binFor = (item: Item, wh: Warehouse | undefined, bins: BinLocation[], fallback = '', inbound = false) =>
  !wh?.binEnabled
    ? ''
    : item.warehouses.find((w) => w.code === wh.code)?.defaultBinId ||
      fallback ||
      (inbound ? receivingBin(bins, wh.code)?.id : '') ||
      binsOf(bins, wh.code)[0]?.id ||
      '';

export function lineFromItem(item: Item, draft: TransferDraft, m: TransferMasters, base: Partial<TransferLine>): TransferLine {
  const from = m.warehouses.find((w) => w.code === draft.fromWarehouse);
  const toWarehouse = base.toWarehouse || draft.toWarehouse;
  const to = m.warehouses.find((w) => w.code === toWarehouse);
  return newTransferLine({
    ...base,
    itemId: item.id,
    itemNo: item.itemNo,
    name: item.name,
    description: item.description,
    uom: item.inventoryUom,
    fromBinId: binFor(item, from, m.bins),
    toWarehouse,
    toBinId: binFor(item, to, m.bins, draft.toBinId, true),
    unitCost: item.itemCost,
  });
}

export function TransferLines({
  draft,
  update,
  errors,
  m,
  readOnly,
}: {
  draft: TransferDraft;
  update: (patch: Partial<TransferDraft>) => void;
  errors: Errors;
  m: TransferMasters;
  readOnly: boolean;
}) {
  const [changing, setChanging] = useState<Set<string>>(new Set());
  const lines = draft.lines;
  const posted = draft.status === 'Posted';
  const itemOf = (l: TransferLine) => m.items.find((i) => i.id === l.itemId);
  const whOf = (code: string) => m.warehouses.find((w) => w.code === code);
  const patch = (id: string, p: Partial<TransferLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: TransferLine, field: string) => errors[`line:${l.id}:${field}`];
  const from = whOf(draft.fromWarehouse);
  const totals = qtyByItem(lines);

  // Stocked items with something in the source warehouse, valid on the posting date.
  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.inventoryItem && isValidToday(i, draft.postingDate) && inStockAt(i, draft.fromWarehouse) > 0))
      .map((i) => ({
        value: i.id,
        label: (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-60">{i.itemNo}</span>
            <span>{i.name}</span>
            <span className="text-xs opacity-60">
              {inStockAt(i, draft.fromWarehouse)} {i.inventoryUom} in {draft.fromWarehouse}
            </span>
          </div>
        ),
        text: `${i.itemNo} ${i.description}`,
      }));

  const pickItem = (l: TransferLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? lineFromItem(item, draft, m, { id: l.id, quantity: l.quantity, toWarehouse: l.toWarehouse }) : { itemId: '' });
    setChanging((prev) => {
      const next = new Set(prev);
      next.delete(l.id);
      return next;
    });
  };

  const changeTo = (l: TransferLine, toWarehouse: string) => {
    const item = itemOf(l);
    patch(l.id, { toWarehouse, toBinId: item ? binFor(item, whOf(toWarehouse), m.bins, toWarehouse === draft.toWarehouse ? draft.toBinId : '', true) : '' });
  };

  const columns: TableColumn<TransferLine>[] = [
    {
      key: 'item',
      header: 'Item',
      cell: (l) => {
        const item = itemOf(l);
        if (item && !changing.has(l.id)) {
          return (
            <div className="flex w-64 flex-col gap-1">
              <div className="flex flex-col">
                <Text variant="caption">{l.itemNo}</Text>
                <Text variant="small">{l.name}</Text>
                <Text variant="small" tone="muted">{l.description}</Text>
              </div>
              {item.manageBy !== 'None' ? (
                <Text variant="small" tone="muted">
                  {item.manageBy === 'Batches' ? 'Batch' : 'Serial'}-managed: moves by qty
                </Text>
              ) : null}
              {readOnly ? null : (
                <Link intent="primary" onClick={() => setChanging((prev) => new Set(prev).add(l.id))}>
                  Change
                </Link>
              )}
            </div>
          );
        }
        return (
          <div className="w-64">
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
      key: 'quantity',
      header: 'Quantity',
      cell: (l) => {
        const item = itemOf(l);
        if (!item) return null;
        return (
          <div className="flex w-32 flex-col gap-1">
            <TextField
              aria-label="Quantity"
              type="number"
              min={0}
              suffix={l.uom}
              readOnly={readOnly}
              invalid={Boolean(err(l, 'quantity'))}
              value={String(l.quantity)}
              onChange={(e) => patch(l.id, { quantity: num(e.currentTarget.value) })}
            />
            {posted ? null : (
              <Text variant="small" tone={(totals.get(l.itemId) ?? 0) > inStockAt(item, draft.fromWarehouse) ? 'danger' : 'muted'}>
                {inStockAt(item, draft.fromWarehouse)} in {draft.fromWarehouse}
              </Text>
            )}
          </div>
        );
      },
    },
    ...(from?.binEnabled
      ? [
          {
            key: 'fromBin',
            header: 'From bin',
            cell: (l: TransferLine) =>
              itemOf(l) ? (
                <Select
                  aria-label="From bin"
                  className="w-48"
                  disabled={readOnly}
                  invalid={Boolean(err(l, 'fromBin'))}
                  options={binOptions(m.bins, from, l.fromBinId, posted ? l.fromBinCode : '')}
                  value={l.fromBinId}
                  onValueChange={(fromBin) => patch(l.id, { fromBinId: fromBin })}
                />
              ) : null,
          },
        ]
      : []),
    {
      key: 'toWarehouse',
      header: 'To warehouse',
      cell: (l) =>
        itemOf(l) ? (
          <div className="w-64">
            <Combobox
              aria-label="To warehouse"
              disabled={readOnly}
              invalid={Boolean(err(l, 'toWarehouse'))}
              options={warehouseOptions(m.warehouses, l.toWarehouse, draft.fromWarehouse)}
              value={l.toWarehouse || null}
              onValueChange={(v) => changeTo(l, v ?? '')}
            />
          </div>
        ) : null,
    },
    {
      key: 'toBin',
      header: 'To bin',
      cell: (l) => {
        const to = whOf(l.toWarehouse);
        if (!itemOf(l)) return null;
        if (!to?.binEnabled) return <Text variant="small" tone="muted">No bins</Text>;
        return (
          <Select
            aria-label="To bin"
            className="w-48"
            disabled={readOnly}
            invalid={Boolean(err(l, 'toBin'))}
            options={binOptions(m.bins, to, l.toBinId, posted ? l.toBinCode : '')}
            value={l.toBinId}
            onValueChange={(toBin) => patch(l.id, { toBinId: toBin })}
          />
        );
      },
    },
    {
      key: 'effect',
      header: 'In stock after',
      cell: (l) => {
        const item = itemOf(l);
        if (!item || !l.toWarehouse) return null;
        if (posted) return <Text variant="small" tone="muted">Posted</Text>;
        // Every line of the item moves together, so show the item's total effect.
        const out = totals.get(l.itemId) ?? 0;
        const into = lines.filter((x) => x.itemId === l.itemId && x.toWarehouse === l.toWarehouse).reduce((n, x) => n + x.quantity, 0);
        const src = inStockAt(item, draft.fromWarehouse);
        const dst = inStockAt(item, l.toWarehouse);
        return (
          <div className="flex flex-col whitespace-nowrap tabular-nums">
            <Text variant="small">
              {draft.fromWarehouse}: {src} → {src - out}
            </Text>
            <Text variant="small">
              {l.toWarehouse}: {dst} → {dst + into}
            </Text>
          </div>
        );
      },
    },
    {
      key: 'value',
      header: 'Value at cost',
      cell: (l) => {
        const item = itemOf(l);
        if (!item) return null;
        const cost = posted ? l.unitCost : item.itemCost;
        return (
          <div className="flex flex-col whitespace-nowrap tabular-nums">
            <Text variant="small">PHP {formatAmount(l.quantity * cost)}</Text>
            <Text variant="small" tone="muted">
              {formatAmount(cost)} / {l.uom}
            </Text>
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      variant="card"
      noPagination
      icon="list_alt"
      title="Contents"
      description={
        errors.lines ??
        'Items to move, in their inventory unit. Each line leaves from the From warehouse and goes to its own To warehouse (the header’s by default).'
      }
      rows={lines}
      getRowId={(l) => l.id}
      columns={columns}
      unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
      sortValue={(l, key) => (key === 'item' ? l.itemNo.toLowerCase() : 0)}
      onRemove={readOnly ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
      actions={
        readOnly ? null : (
          <Button
            type="button"
            size="small"
            intent="primary"
            variant="solid"
            leadingIcon={<Icon size={16}>add</Icon>}
            disabled={!draft.fromWarehouse || !draft.toWarehouse}
            onClick={() => update({ lines: [...lines, newTransferLine({ toWarehouse: draft.toWarehouse, toBinId: draft.toBinId })] })}
          >
            Add line
          </Button>
        )
      }
      empty={
        <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
          {draft.fromWarehouse && draft.toWarehouse ? 'No lines yet. Add a line and pick an item.' : 'Pick the From and To warehouses first, then add lines.'}
        </Text>
      }
    />
  );
}
