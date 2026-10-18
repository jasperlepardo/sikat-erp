import React, { useState } from 'react';
import { Card, Checkbox, Combobox, Icon, IconButton, Link, Select, TableStatus, Text, TextField, Tooltip, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import type { SoLine } from '../../../../mocks/salesOrders';
import { formatAmount } from '../../../../services/format';
import { isValidToday } from '../../../../services/items';
import { isPriceListValid } from '../../../../services/priceLists';
import { lineNet, lineTax, openQty, priceAfterDiscount } from '../../../../services/salesOrders';
import { priceListDef } from '../../../settings/masterDefs';
import { warehouseOptions } from '../../../inventory/transfers/TransferLines';
import { availableIn, lineFromItem, linePricing, shortages, type SoTabProps } from './types';
import { listBlanketAgreements, baNumber, openQty as baOpenQty } from '../../../../services/blanketAgreements';
import { useAsync } from '../../../../services/useAsync';
import type { BlanketAgreement, BaLine } from '../../../../mocks/blanketAgreements';
import { BA_LIST_PATH } from '../../agreements/BlanketAgreementList';

const num = (v: string) => (v === '' ? 0 : Number(v));

const GROUPS = { warehouse: 'Warehouse', priceListId: 'Price list', tax: 'Tax', delivery: 'Delivered / Open' } as const;
type Group = keyof typeof GROUPS;

export function SoLinesCard({ draft, update, errors, m, ctx, hideDeliveries, spanRow, cardFooter }: SoTabProps & { hideDeliveries?: boolean; spanRow?: React.ReactNode; cardFooter?: React.ReactNode }) {
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const [shown, setShown] = useState<Group[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const is = (g: Group) => shown.includes(g);
  const lines = draft.lines;
  const itemLines = lines.filter((l) => !!l.itemId);
  const allAgreements = useAsync(listBlanketAgreements, []);
  // Agreements for the current customer that are not Closed or Terminated.
  const customerAgreements = (allAgreements ?? []).filter(
    (ba) => ba.customerId === draft.customerId && ba.status !== 'Closed' && ba.status !== 'Terminated',
  );
  const itemOf = (l: SoLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<SoLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: SoLine, field: string) => errors[`line:${l.id}:${field}`];
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const taxOf = (l: SoLine) => lineTax(l, ctx.rateOf(l.taxCode), 0);
  const linesLocked = ctx.readOnly || draft.status !== 'Draft';
  const locked = (l: SoLine) => linesLocked || l.status === 'Closed';
  // Item@warehouse pairs the open lines (added up) need more of than is free.
  const shortSet = new Set(shortages(draft, m, ctx.ownCommitted).map((s) => `${s.item.id}@${s.warehouse}`));
  const short = new Set(linesLocked ? [] : shortSet);

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
  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Sales' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));

  const pickItem = (l: SoLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? lineFromItem(item, draft, ctx, m, { id: l.id, quantity: l.quantity }) : { itemId: '' });
  };
  /** Re-run pricing after a change, unless the price was typed over. */
  const reprice = (l: SoLine, change: Partial<SoLine>) => {
    const item = itemOf(l);
    const next = { ...l, ...change };
    if (!item || !ctx.fx || l.priceSource === 'Manual') return patch(l.id, change);
    patch(l.id, { ...change, ...linePricing(item, next, draft, ctx) });
  };
  const changeUom = (l: SoLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!itemsPerUnit) return;
    reprice(l, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit });
  };

  const col = (key: string, header: React.ReactNode, cell: (l: SoLine) => React.ReactNode, group?: Group, align?: 'start' | 'end'): TableColumn<SoLine> & { group?: Group } => ({ key, header, cell, group, ...(align ? { align } : {}) });

  const itemColumns: TableColumn<SoLine>[] = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      if (!item || (editing.has(l.id) && !locked(l))) {
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
      // Build agreement line options for this SO line's item.
      const matchingBaLines: Array<{ ba: BlanketAgreement; baLine: BaLine; n: number }> = [];
      for (const ba of customerAgreements) {
        ba.lines.forEach((baLine, idx) => {
          if (baLine.itemId === l.itemId && baLine.rowStatus === 'Open') {
            matchingBaLines.push({ ba, baLine, n: idx + 1 });
          }
        });
      }
      const linkedBa = l.agreementId ? customerAgreements.find((ba) => ba.id === l.agreementId) : undefined;
      const linkedN = linkedBa ? linkedBa.lines.indexOf(linkedBa.lines.find((bl) => bl.id === l.agreementLineId)!) + 1 : 0;

      const agreementOptions = matchingBaLines.map(({ ba, baLine, n }) => ({
        value: `${ba.id}::${baLine.id}`,
        label: `${baNumber(ba)} · Line ${n} (${baOpenQty(baLine)} open)`,
      }));

      const pickAgreementLine = (combined: string | null) => {
        if (!combined) {
          patch(l.id, { agreementId: '', agreementLineId: '' });
          return;
        }
        const [baId, baLineId] = combined.split('::');
        const ba = customerAgreements.find((b) => b.id === baId);
        const baLine = ba?.lines.find((bl) => bl.id === baLineId);
        if (!ba || !baLine) return;
        const pricePatch = !ba.ignorePrices ? { unitPrice: baLine.unitPrice, priceSource: `Agreement ${baNumber(ba)}` } : {};
        patch(l.id, { agreementId: baId, agreementLineId: baLineId, ...pricePatch });
      };

      return (
        <div className="flex flex-col gap-1 whitespace-normal">
          <div className="flex flex-col">
            <Text variant="caption" className="wrap-break-word">{l.itemNo}</Text>
            <Text variant="small" className="wrap-break-word">{l.description}</Text>
          </div>
          {locked(l) ? null : (
            <div className="flex gap-3">
              <Link intent="primary" onClick={() => setEditing((s) => new Set(s).add(l.id))}>
                Edit
              </Link>
              <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', description: '' })}>
                Change
              </Link>
            </div>
          )}
          {/* Agreement picker — only shown when there are matching open BA lines or one is already linked. */}
          {(matchingBaLines.length > 0 || l.agreementId) && (
            <div className="flex items-center gap-1">
              {l.agreementId && linkedBa ? (
                <>
                  <Link intent="primary" href={`#${BA_LIST_PATH}/${linkedBa.docNum ? baNumber(linkedBa) : linkedBa.id}`}>
                    <Text variant="caption">{baNumber(linkedBa)} &middot; Line {linkedN}</Text>
                  </Link>
                  {!locked(l) && (
                    <IconButton
                      type="button"
                      size="small"
                      intent="default"
                      variant="link"
                      label="Unlink agreement"
                      onClick={() => patch(l.id, { agreementId: '', agreementLineId: '' })}
                    >
                      <Icon size={14}>close</Icon>
                    </IconButton>
                  )}
                </>
              ) : !locked(l) ? (
                <Select
                  aria-label="Link to agreement"
                  placeholder="Link to agreement..."
                  options={agreementOptions}
                  value={undefined}
                  onValueChange={(v) => pickAgreementLine(v ?? null)}
                />
              ) : null}
            </div>
          )}
        </div>
      );
    }),
    col('qty', 'Qty / UoM', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      const isShort = short.has(`${l.itemId}@${l.warehouse}`);
      if (linesLocked) return (
        <div className="flex items-center justify-end gap-1">
          <Text variant="small" className="whitespace-nowrap tabular-nums">
            {l.quantity.toLocaleString('en-PH')} {l.uomCode}
          </Text>
          {isShort && <Tooltip message="Not enough stock" icon="warning" />}
        </div>
      );
      return (
        <div className="flex w-40 shrink-0 flex-col gap-1 whitespace-normal">
          <div className="flex items-center gap-1">
            <TextField
              aria-label="Quantity"
              type="number"
              min={0}
              invalid={Boolean(err(l, 'quantity'))}
              value={String(l.quantity)}
              onChange={(e) => reprice(l, { quantity: num(e.currentTarget.value) })}
            />
            {isShort && <Tooltip message="Not enough stock" icon="warning" />}
          </div>
          <Select
            aria-label="UoM code"
            disabled={l.deliveredQty > 0}
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
    col('warehouse', 'Whse', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      if (!item.inventoryItem) return <span className="text-muted">Not stocked</span>;
      if (linesLocked) return <Text variant="small">{l.warehouse || '—'}</Text>;
      // What's free to promise, giving back what this order already commits as saved.
      const avail = availableIn(item, l.warehouse, ctx.ownCommitted);
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <Combobox
            aria-label="Warehouse"
            invalid={Boolean(err(l, 'warehouse'))}
            options={warehouseOptions(m.inv.warehouses, l.warehouse)}
            value={l.warehouse || null}
            onValueChange={(v) => patch(l.id, { warehouse: v ?? '' })}
          />
          <Text variant="small" tone={openQty(l) > 0 && short.has(`${item.id}@${l.warehouse}`) ? 'danger' : 'muted'}>
            {avail} {item.inventoryUom} available
          </Text>
        </div>
      );
    }, 'warehouse'),
    col('priceListId', 'Price list', (l) => {
      if (!itemOf(l)) return null;
      if (linesLocked) {
        const plRow = priceListDef.collection.snapshot().find((p) => p.id === l.priceListId);
        return <Text variant="small">{plRow ? priceListDef.label(plRow) : l.priceListId || '—'}</Text>;
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
            patch(l.id, { priceListId: v, ...(ctx.fx ? linePricing(item, next, draft, ctx) : {}) });
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
    col('tax', 'Tax code', (l) => {
      if (!itemOf(l)) return null;
      if (linesLocked) return (
        <div className="flex flex-col gap-0.5">
          <Text variant="small">{l.taxCode} ({ctx.rateOf(l.taxCode)}%)</Text>
          <Text variant="small" tone="muted">Tax PHP {lc(taxOf(l))}</Text>
        </div>
      );
      return (
        <div className="flex w-32 flex-col gap-1">
          <Combobox
            aria-label="Tax code"
            invalid={Boolean(err(l, 'taxCode'))}
            options={taxOptions}
            value={l.taxCode || null}
            onValueChange={(taxCode) => reprice(l, { taxCode: taxCode ?? '' })}
          />
          <Text variant="small" tone="muted">
            Tax PHP {lc(taxOf(l))}
          </Text>
        </div>
      );
    }, 'tax', 'end'),
    col('totals', 'Total (LC)', (l) =>
      itemOf(l) ? (
        <Text variant="small" className="whitespace-nowrap tabular-nums">
          PHP {lc(lineNet(l))}
        </Text>
      ) : null,
    undefined, 'end'),
    col('delivery', 'Delivered / Open', (l) =>
      itemOf(l) ? (
        <div className="flex flex-col items-end gap-1 whitespace-nowrap tabular-nums">
          <Text variant="small">
            {l.deliveredQty} / {openQty(l)}
          </Text>
          <TableStatus intent={l.status === 'Open' ? 'primary' : 'success'}>{l.status}</TableStatus>
        </div>
      ) : null,
    'delivery', 'end'),
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
     
      noPagination
      rows={itemLines}
      getRowId={(l) => l.id}
      columns={itemColumns}
      unsortable={itemColumns.map((c) => c.key)}
      onRemove={linesLocked ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l) || l.deliveredQty > 0) })}
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
              update({ lines: [...itemLines, lineFromItem(item, draft, ctx, m, {})] });
              setAddKey((k) => k + 1);
            }}
          />
        )
      }
      cardFooter={cardFooter}
    />
    </div>
    {spanRow}
    {!hideDeliveries && itemLines.length > 0 && (
      <DataTable
       
        noPagination
        rows={itemLines}
        getRowId={(l) => l.id}
        empty={<Text variant="small" tone="muted">No deliveries yet.</Text>}
        columns={[
          {
            key: 'item',
            header: 'Item / Description',
            cell: (l) => (
              <div className="flex flex-col">
                <Text variant="caption">{l.itemNo}</Text>
                <Text variant="small">{l.description}</Text>
              </div>
            ),
          },
          {
            key: 'ordered',
            header: 'Ordered',
            align: 'end' as const,
            cell: (l) => (
              <Text variant="small" className="whitespace-nowrap tabular-nums">
                {l.quantity.toLocaleString('en-PH')} {l.uomCode}
              </Text>
            ),
          },
          {
            key: 'delivered',
            header: 'Delivered',
            align: 'end' as const,
            cell: (l) => (
              <Text variant="small" className="whitespace-nowrap tabular-nums">
                {l.deliveredQty ? `${l.deliveredQty.toLocaleString('en-PH')} ${l.uomCode}` : '—'}
              </Text>
            ),
          },
        ]}
      />
    )}
    </div>
  );
}
