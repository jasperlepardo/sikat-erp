import { useState } from 'react';
import { Button, Combobox, Icon, Link, TableStatus, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { Section } from '../../../../components/form/fields';
import { itemsPerUom } from '../../../../mocks/items';
import { newBaLine, type BaLine } from '../../../../mocks/blanketAgreements';
import { formatAmount } from '../../../../services/format';
import { itemGroupName } from '../../../../services/inventoryMasters';
import { lineTotal, openAmountLC, openQty } from '../../../../services/blanketAgreements';
import type { BaDraft, BaMasters } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));

interface Props {
  draft: BaDraft;
  update: (patch: Partial<BaDraft>) => void;
  m: BaMasters;
  readOnly: boolean;
}

export function DetailsTab({ draft, update, m, readOnly }: Props) {
  const [editing, setEditing] = useState<Set<string>>(new Set());

  const lines = draft.lines;
  const itemOf = (l: BaLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<BaLine>) =>
    update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || i.salesItem)
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

  const pickItem = (l: BaLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) {
      patch(l.id, { itemId: '', itemNo: '', description: '', itemGroupId: '' });
      return;
    }
    const uom = m.inv.uoms.find((u) => u.code === item.salesUom);
    const uomGroupId = m.inv.uomGroups.find((g) => g.baseUom === item.salesUom || g.conversions.some((c) => c.altUom === item.salesUom))?.id ?? '';
    patch(l.id, {
      itemId: item.id,
      itemNo: item.itemNo,
      description: item.name,
      itemGroupId: item.itemGroupId,
      unitPrice: Math.round((item.basePrice / 1.12) * 100) / 100,
      uomCode: item.salesUom,
      uomName: uom?.name ?? item.salesUom,
      itemsPerUnit: itemsPerUom(item, item.salesUom) ?? 1,
      uomGroupId,
    });
  };

  const col = (key: string, header: string, cell: (l: BaLine) => React.ReactNode, opts?: Partial<TableColumn<BaLine>>): TableColumn<BaLine> => ({
    key,
    header,
    cell,
    ...opts,
  });

  const columns: TableColumn<BaLine>[] = [
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
    col('cumulativeQty', 'Cumulative qty', (l) => (
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
    <Section icon="list_alt" title="Line Items">
      <DataTable<BaLine>
        icon="receipt_long"
        title="Lines"
        columns={columns}
        rows={lines}
        getRowId={(l) => l.id}
        noPagination
        actions={
          !readOnly ? (
            <Button type="button" intent="primary" variant="solid" size="small" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => update({ lines: [...lines, newBaLine()] })}>
              Add line
            </Button>
          ) : undefined
        }
        empty={
          <Text tone="muted">{readOnly ? 'No lines.' : 'Add a line to get started.'}</Text>
        }
      />
      {lines.length > 0 && (
        <div className="flex justify-end gap-6 pt-2 text-sm">
          <span className="text-muted">
            Planned total:{' '}
            <strong className="tabular-nums">{draft.currency} {formatAmount(lines.reduce((n, l) => n + lineTotal(l), 0))}</strong>
          </span>
        </div>
      )}
    </Section>
  );
}
