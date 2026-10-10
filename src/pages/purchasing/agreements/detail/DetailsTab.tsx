import { useState } from 'react';
import { Button, Combobox, Icon, Link, TableStatus, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { itemsPerUom } from '../../../../mocks/items';
import { newPbaLine, type PbaLine } from '../../../../mocks/purchaseBlanketAgreements';
import { formatAmount } from '../../../../services/format';
import { itemGroupName } from '../../../../services/inventoryMasters';
import { lineTotal, openAmountLC, openQty } from '../../../../services/purchaseBlanketAgreements';
import type { PbaDraft, PbaMasters } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));

interface Props {
  draft: PbaDraft;
  update: (patch: Partial<PbaDraft>) => void;
  m: PbaMasters;
  readOnly: boolean;
}

export function DetailsTab({ draft, update, m, readOnly }: Props) {
  const [editing, setEditing] = useState<Set<string>>(new Set());

  const lines = draft.lines;
  const itemOf = (l: PbaLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<PbaLine>) =>
    update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || i.purchaseItem)
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

  const pickItem = (l: PbaLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) {
      patch(l.id, { itemId: '', itemNo: '', description: '', itemGroupId: '' });
      return;
    }
    const uom = m.inv.uoms.find((u) => u.code === item.purchasingUom);
    const uomGroupId = m.inv.uomGroups.find((g) => g.baseUom === item.purchasingUom || g.conversions.some((c) => c.altUom === item.purchasingUom))?.id ?? '';
    patch(l.id, {
      itemId: item.id,
      itemNo: item.itemNo,
      description: item.name,
      itemGroupId: item.itemGroupId,
      unitPrice: Math.round(item.itemCost * 100) / 100,
      uomCode: item.purchasingUom,
      uomName: uom?.name ?? item.purchasingUom,
      itemsPerUnit: itemsPerUom(item, item.purchasingUom) ?? 1,
      uomGroupId,
    });
  };

  const col = (key: string, header: string, cell: (l: PbaLine) => React.ReactNode, opts?: Partial<TableColumn<PbaLine>>): TableColumn<PbaLine> => ({
    key, header, cell, ...opts,
  });

  const columns: TableColumn<PbaLine>[] = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      if (!item || (editing.has(l.id) && !readOnly)) {
        return (
          <div className="flex w-64 flex-col gap-1">
            {item ? (
              <TextField
                aria-label="Description"
                value={l.description}
                onChange={(e) => patch(l.id, { description: e.currentTarget.value })}
              />
            ) : (
              <Combobox
                aria-label="Item No."
                placeholder="Search items"
                options={itemOptions(l.itemId)}
                value={l.itemId || null}
                onValueChange={(v) => pickItem(l, v)}
              />
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
        <span className="flex flex-col gap-0.5">
          <span className="text-xs opacity-60">{item.itemNo}</span>
          <Link intent="default" onClick={() => !readOnly && setEditing((s) => new Set(s).add(l.id))}>
            {l.description || item.name}
          </Link>
        </span>
      );
    }),
    col('itemGroup', 'Item group', (l) => (
      <Text variant="small" tone="muted">{l.itemGroupId ? itemGroupName(l.itemGroupId) : '—'}</Text>
    )),
    col('plannedQty', 'Planned qty', (l) =>
      readOnly ? (
        <span className="tabular-nums">{l.plannedQty}</span>
      ) : (
        <TextField
          aria-label="Planned quantity"
          type="number"
          min={0}
          className="w-24"
          value={String(l.plannedQty)}
          onChange={(e) => patch(l.id, { plannedQty: num(e.currentTarget.value) })}
        />
      ),
    ),
    col('unitPrice', 'Unit price', (l) =>
      readOnly ? (
        <span className="tabular-nums">{formatAmount(l.unitPrice)}</span>
      ) : (
        <TextField
          aria-label="Unit price"
          type="number"
          min={0}
          className="w-28"
          prefix={draft.currency}
          value={String(l.unitPrice)}
          onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value) })}
        />
      ),
    ),
    col('cumulativeOrderedQty', 'Ordered qty', (l) => (
      <Text variant="small" tone="muted" className="tabular-nums">{l.cumulativeCommittedQty}</Text>
    )),
    col('cumulativeQty', 'Received qty', (l) => (
      <Text variant="small" tone="muted" className="tabular-nums">{l.cumulativeQty}</Text>
    )),
    col('cumulativeAmountLC', 'Cumulative amt (LC)', (l) => (
      <Text variant="small" tone="muted" className="tabular-nums">{formatAmount(l.cumulativeAmountLC)}</Text>
    )),
    col('openQty', 'Open qty', (l) => (
      <Text variant="small" tone={openQty(l) === 0 ? 'muted' : 'default'} className="tabular-nums">
        {openQty(l)}
      </Text>
    )),
    col('openAmountLC', 'Open amt (LC)', (l) => (
      <Text variant="small" tone={openAmountLC(l) === 0 ? 'muted' : 'default'} className="tabular-nums">
        {formatAmount(openAmountLC(l))}
      </Text>
    )),
    col('rowStatus', 'Status', (l) => (
      <TableStatus intent={l.rowStatus === 'Open' ? 'primary' : 'success'}>{l.rowStatus}</TableStatus>
    )),
    ...(!readOnly ? [col('remove', '', (l) => (
      <Button
        type="button"
        intent="danger"
        variant="link"
        size="small"
        onClick={() => update({ lines: lines.filter((x) => x.id !== l.id) })}
      >
        <Icon size={16}>delete</Icon>
      </Button>
    ))] : []),
  ];

  return (
    <DataTable<PbaLine>
      variant="card"
      icon="list_alt"
      title="Line Items"
      description={`Items committed under this agreement. Unit prices are the agreed purchase cost in ${draft.currency}.`}
      columns={columns}
      rows={lines}
      getRowId={(l) => l.id}
      noPagination
      unsortable={columns.map((c) => c.key)}
      actions={
        !readOnly ? (
          <Button type="button" intent="primary" variant="solid" size="small" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => update({ lines: [...lines, newPbaLine()] })}>
            Add line
          </Button>
        ) : undefined
      }
      empty={
        <Text variant="small" tone="muted">{readOnly ? 'No lines.' : 'Add a line to get started.'}</Text>
      }
    >
      {lines.length > 0 && (
        <div className="flex justify-end gap-6 pb-2 text-sm tabular-nums">
          <span>Planned total: <strong>{draft.currency} {formatAmount(lines.reduce((n, l) => n + lineTotal(l), 0))}</strong></span>
        </div>
      )}
    </DataTable>
  );
}
