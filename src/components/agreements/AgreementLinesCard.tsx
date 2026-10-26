import { useState } from 'react';
import { Button, Combobox, Icon, Link, TableStatus, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../components/form/DataTable';
import { itemsPerUom } from '../../mocks/items';
import type { Item } from '../../mocks/items';
import type { BaLine } from '../../mocks/blanketAgreements';
import type { PbaLine } from '../../mocks/purchaseBlanketAgreements';
import { formatAmount } from '../../services/format';
import { itemGroupName, type InventoryMasters } from '../../services/inventoryMasters';
import { lineTotal, openAmountLC, openQty } from '../../services/blanketAgreements';

const num = (v: string) => (v === '' ? 0 : Number(v));

/** A blanket agreement line: purchase and sales agreement lines have the same shape. */
type Line = PbaLine | BaLine;

interface Props<L extends Line> {
  /** Purchase agreements commit purchase items at cost; sales agreements, sales items at their net price. */
  side: 'purchase' | 'sales';
  draft: { lines: L[]; currency: string };
  update: (patch: { lines: L[] }) => void;
  m: { items: Item[]; inv: Pick<InventoryMasters, 'uoms' | 'uomGroups'> };
  readOnly: boolean;
  newLine: () => L;
}

/** The Lines tab of a purchase or sales blanket agreement. */
export function AgreementLinesCard<L extends Line>({ side, draft, update, m, readOnly, newLine }: Props<L>) {
  const purchase = side === 'purchase';
  const [editing, setEditing] = useState<Set<string>>(new Set());

  const lines = draft.lines;
  const itemOf = (l: L) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<Line>) =>
    update({ lines: lines.map((l) => (l.id === id ? ({ ...l, ...p } as L) : l)) });

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (purchase ? i.purchaseItem : i.salesItem))
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

  const pickItem = (l: L, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) {
      patch(l.id, { itemId: '', itemNo: '', description: '', itemGroupId: '' });
      return;
    }
    const unit = purchase ? item.purchasingUom : item.salesUom;
    const uom = m.inv.uoms.find((u) => u.code === unit);
    const uomGroupId = m.inv.uomGroups.find((g) => g.baseUom === unit || g.conversions.some((c) => c.altUom === unit))?.id ?? '';
    patch(l.id, {
      itemId: item.id,
      itemNo: item.itemNo,
      description: item.description || item.name,
      itemGroupId: item.itemGroupId,
      // The agreed purchase cost; a sale's price net of VAT.
      unitPrice: Math.round((purchase ? item.itemCost : item.basePrice / 1.12) * 100) / 100,
      uomCode: unit,
      uomName: uom?.name ?? unit,
      itemsPerUnit: itemsPerUom(item, unit) ?? 1,
      uomGroupId,
    });
  };

  const col = (key: string, header: string, cell: (l: L) => React.ReactNode, opts?: Partial<TableColumn<L>>): TableColumn<L> => ({
    key, header, cell, ...opts,
  });

  const columns: TableColumn<L>[] = [
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
    ...(purchase ? [col('cumulativeOrderedQty', 'Ordered qty', (l) => (
      <Text variant="small" tone="muted" className="tabular-nums">{l.cumulativeCommittedQty}</Text>
    ))] : []),
    col('cumulativeQty', purchase ? 'Received qty' : 'Cumulative qty', (l) => (
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
    <DataTable<L>
      variant={purchase ? undefined : 'plain'}
      icon="list_alt"
      title="Line Items"
      description={`Items committed under this agreement. Unit prices are ${purchase ? 'the agreed purchase cost' : 'net of VAT'} in ${draft.currency}.`}
      columns={columns}
      rows={lines}
      getRowId={(l) => l.id}
      noPagination
      unsortable={columns.map((c) => c.key)}
      actions={
        !readOnly ? (
          <Button type="button" intent="primary" variant="solid" size="small" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => update({ lines: [...lines, newLine()] })}>
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
