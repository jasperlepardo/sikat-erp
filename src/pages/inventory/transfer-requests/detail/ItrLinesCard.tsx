import { useState } from 'react';
import { Combobox, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { newTransferRequestLine, type TransferRequestLine } from '../../../../mocks/inventoryTransferRequests';
import { isValidToday } from '../../../../services/items';
import { inStockAt } from '../../../../services/inventoryTransfers';
import { openQty } from '../../../../services/inventoryTransferRequests';
import { warehouseOptions } from '../../transfers/TransferLines';
import { transferredQty, type ItrSectionProps } from './types';
import { LineItemText } from '../../../../components/form/LineItemText';

const num = (v: string) => (v === '' ? 0 : Number(v));

/** The requested items. A line that's been partly transferred keeps its item and can't drop below what's gone. */
export function ItrLinesCard({ draft, update, errors, m, readOnly }: ItrSectionProps) {
  const [addKey, setAddKey] = useState(0);
  const lines = draft.lines;
  const err = (l: TransferRequestLine, field: string) => errors[`line:${l.id}:${field}`];
  const patch = (id: string, p: Partial<TransferRequestLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.inventoryItem && isValidToday(i, draft.postingDate)))
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

  const fromItem = (itemId: string, base: Partial<TransferRequestLine> = {}) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const quantity = base.quantity ?? 1;
    return newTransferRequestLine({
      ...base,
      itemId: item.id,
      itemNo: item.itemNo,
      name: item.name,
      description: item.description,
      uom: item.inventoryUom,
      quantity,
      openQty: quantity,
      toWarehouse: base.toWarehouse || draft.toWarehouse,
    });
  };

  const columns: TableColumn<TransferRequestLine>[] = [
    {
      key: 'item',
      header: 'Item',
      cell: (l) => {
        if (!l.itemId) {
          return (
            <div className="flex min-w-52 flex-col gap-1">
              <Combobox
                aria-label="Item"
                placeholder="Search items"
                options={itemOptions('')}
                value={null}
                invalid={Boolean(err(l, 'item'))}
                onValueChange={(id) => {
                  const line = id ? fromItem(id, { id: l.id, quantity: l.quantity, toWarehouse: l.toWarehouse }) : undefined;
                  if (line) update({ lines: lines.map((x) => (x.id === l.id ? line : x)) });
                }}
              />
              {err(l, 'item') && <Text variant="small" tone="danger">{err(l, 'item')}</Text>}
            </div>
          );
        }
        return (
          <div className="flex min-w-52 flex-col gap-1 whitespace-normal">
            <LineItemText itemNo={l.itemNo} description={l.description} name={l.name} />
            {readOnly || transferredQty(l) ? null : (
              <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', name: '', description: '' })}>Change</Link>
            )}
            {err(l, 'item') && <Text variant="small" tone="danger">{err(l, 'item')}</Text>}
          </div>
        );
      },
    },
    {
      key: 'quantity',
      header: 'Quantity',
      cell: (l) => (
        <div className="w-24">
          <TextField
            aria-label="Quantity"
            type="number"
            min={transferredQty(l)}
            suffix={l.uom || undefined}
            value={String(l.quantity)}
            invalid={Boolean(err(l, 'quantity'))}
            disabled={readOnly}
            // Open quantity keeps what's already been transferred off it.
            onChange={(e) => {
              const quantity = num(e.currentTarget.value);
              patch(l.id, { quantity, openQty: Math.max(0, quantity - transferredQty(l)) });
            }}
          />
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
          {transferredQty(l) ? <Text variant="caption" tone="muted">{transferredQty(l)} transferred</Text> : null}
        </div>
      ),
    },
    {
      key: 'inStock',
      header: `In stock at ${draft.fromWarehouse || 'source'}`,
      cell: (l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        return <span className="text-sm tabular-nums">{item && draft.fromWarehouse ? inStockAt(item, draft.fromWarehouse) : '—'}</span>;
      },
    },
    {
      key: 'toWarehouse',
      header: 'To warehouse',
      cell: (l) => (
        <div className="min-w-40">
          <Select
            aria-label="To warehouse"
            placeholder="Header's"
            clearable
            options={warehouseOptions(m.warehouses, l.toWarehouse, draft.fromWarehouse)}
            value={l.toWarehouse}
            onValueChange={(v) => patch(l.id, { toWarehouse: v ?? '' })}
            disabled={readOnly || transferredQty(l) > 0}
          />
          {err(l, 'toWarehouse') && <Text variant="small" tone="danger">{err(l, 'toWarehouse')}</Text>}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      noPagination
      icon="list_alt"
      title="Contents"
      description={errors.lines ?? 'What the destination needs. Nothing moves until a transfer copied from this request is posted.'}
      rows={lines}
      getRowId={(l) => l.id}
      columns={columns}
      unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
      sortValue={(l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof TransferRequestLine] ?? '')).toLowerCase()}
      // Partly transferred lines stay: a transfer already points at them.
      onRemove={readOnly ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l) || transferredQty(l) > 0) })}
      spanRow={
        readOnly ? undefined : (
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
        )
      }
      empty={<Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>No lines yet — search above to add one.</Text>}
    />
  );
}
