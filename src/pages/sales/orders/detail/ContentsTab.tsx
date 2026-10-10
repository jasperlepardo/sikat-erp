import { useState } from 'react';
import { Button, Combobox, Icon, IconButton, Link, Select, TableStatus, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import { newSoLine, type SoLine } from '../../../../mocks/salesOrders';
import { formatAmount } from '../../../../services/format';
import { isValidToday } from '../../../../services/items';
import { isPriceListValid } from '../../../../services/priceLists';
import { inventoryQty, lineNet, lineTax, openQty, priceAfterDiscount } from '../../../../services/salesOrders';
import { formatDate } from '../../../../services/dates';
import { priceListDef } from '../../../settings/masterDefs';
import { warehouseOptions } from '../../../inventory/transfers/TransferLines';
import { availableIn, lineFromItem, linePricing, type SoTabProps } from './types';
import { listBlanketAgreements, baNumber, openQty as baOpenQty } from '../../../../services/blanketAgreements';
import { useAsync } from '../../../../services/useAsync';
import type { BlanketAgreement, BaLine } from '../../../../mocks/blanketAgreements';
import { BA_LIST_PATH } from '../../agreements/BlanketAgreementList';

const num = (v: string) => (v === '' ? 0 : Number(v));

export function ContentsTab({ draft, update, errors, m, ctx }: SoTabProps) {
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const lines = draft.lines;
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
  const locked = (l: SoLine) => ctx.readOnly || l.status === 'Closed';

  // Sales items valid on the posting date.
  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.salesItem && isValidToday(i, draft.postingDate)))
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

  const col = (key: string, header: string, cell: (l: SoLine) => React.ReactNode): TableColumn<SoLine> => ({ key, header, cell });

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
        <div className="flex w-64 flex-col gap-1">
          <div className="flex flex-col">
            <Text variant="caption">{l.itemNo}</Text>
            <Text variant="small">{l.description}</Text>
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
      return (
        <div className="flex w-40 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField
            aria-label="Quantity"
            type="number"
            min={0}
            readOnly={locked(l)}
            invalid={Boolean(err(l, 'quantity'))}
            value={String(l.quantity)}
            onChange={(e) => reprice(l, { quantity: num(e.currentTarget.value) })}
          />
          <Select
            aria-label="UoM code"
            disabled={locked(l) || l.deliveredQty > 0}
            options={itemUnits(item, 'sales').map((u) => ({ value: u.uom, label: u.uom }))}
            value={l.uomCode}
            onValueChange={(v) => v && changeUom(l, v)}
          />
          <Text variant="small" tone="muted">
            {l.uomName}
            {l.uomCode === item.inventoryUom ? ' · inventory UoM' : ` · ${l.itemsPerUnit} ${item.inventoryUom} each`}
          </Text>
        </div>
      );
    }),
    col('warehouse', 'Whse', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      if (!item.inventoryItem) return <span className="text-muted">Not stocked</span>;
      // What's free to promise, giving back what this order already commits on the line as saved.
      const avail = availableIn(item, l.warehouse);
      const need = inventoryQty(l, openQty(l));
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <Combobox
            aria-label="Warehouse"
            disabled={locked(l)}
            invalid={Boolean(err(l, 'warehouse'))}
            options={warehouseOptions(m.inv.warehouses, l.warehouse)}
            value={l.warehouse || null}
            onValueChange={(v) => patch(l.id, { warehouse: v ?? '' })}
          />
          <Text variant="small" tone={!ctx.added && need > avail ? 'danger' : 'muted'}>
            {avail} {item.inventoryUom} available
          </Text>
        </div>
      );
    }),
    col('priceListId', 'Price list', (l) =>
      itemOf(l) ? (
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
      ) : null,
    ),
    col('pricing', 'Unit price / Discount', (l) => {
      if (!itemOf(l)) return null;
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField
            aria-label="Unit price"
            type="number"
            min={0}
            prefix={draft.currency}
            readOnly={locked(l)}
            invalid={Boolean(err(l, 'unitPrice'))}
            value={String(l.unitPrice)}
            onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value), priceSource: 'Manual' })}
          />
          <TextField
            aria-label="Discount %"
            type="number"
            min={0}
            suffix="%"
            readOnly={locked(l)}
            value={String(l.discountPct)}
            onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)), priceSource: 'Manual' })}
          />
          <Text variant="small" tone="muted">
            {l.priceSource || '—'}
            {l.priceSource === 'Manual' && !locked(l) ? (
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
    }),
    col('tax', 'Tax code', (l) =>
      itemOf(l) ? (
        <div className="flex w-32 flex-col gap-1">
          <Combobox
            aria-label="Tax code"
            disabled={locked(l)}
            invalid={Boolean(err(l, 'taxCode'))}
            options={taxOptions}
            value={l.taxCode || null}
            onValueChange={(taxCode) => reprice(l, { taxCode: taxCode ?? '' })}
          />
          <Text variant="small" tone="muted">
            Tax PHP {lc(taxOf(l))}
          </Text>
        </div>
      ) : null,
    ),
    col('totals', 'Total / Gross (LC)', (l) =>
      itemOf(l) ? (
        <div className="flex flex-col whitespace-nowrap tabular-nums">
          <Text variant="small">PHP {lc(lineNet(l))}</Text>
          <Text variant="small" tone="muted">
            PHP {lc(lineNet(l) + taxOf(l))} gross
          </Text>
          {l.discountPct ? (
            <Text variant="small" tone="muted">
              {formatAmount(priceAfterDiscount(l))} after discount
            </Text>
          ) : null}
        </div>
      ) : null,
    ),
    col('delivery', 'Delivered / Open', (l) =>
      itemOf(l) ? (
        <div className="flex flex-col gap-1 whitespace-nowrap tabular-nums">
          <Text variant="small">
            {l.deliveredQty} / {openQty(l)}
          </Text>
          <TableStatus intent={l.status === 'Open' ? 'primary' : 'success'}>{l.status}</TableStatus>
        </div>
      ) : null,
    ),
  ];

  return (
    <DataTable
      variant="card"
      noPagination
      icon="list_alt"
      title="Contents"
      description={errors.lines ?? `Items in the sales unit. Unit prices are net of VAT in ${draft.currency}${draft.currency === 'PHP' ? '' : `; totals in PHP at ${ctx.fx ? `${ctx.fx} (${formatDate(ctx.fxDate)})` : '—'}`}. Open lines commit stock in their warehouse.`}
      rows={lines}
      getRowId={(l) => l.id}
      columns={itemColumns}
      unsortable={itemColumns.map((c) => c.key).filter((k) => k !== 'item')}
      sortValue={(l) => l.itemNo.toLowerCase()}
      onRemove={ctx.readOnly ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l) || l.deliveredQty > 0) })}
      actions={
        ctx.readOnly ? null : (
          <Button
            type="button"
            size="small"
            intent="primary"
            variant="solid"
            leadingIcon={<Icon size={16}>add</Icon>}
            disabled={!draft.customerId}
            onClick={() => update({ lines: [...lines, newSoLine({ warehouse: '' })] })}
          >
            Add line
          </Button>
        )
      }
      empty={
        <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
          {draft.customerId ? 'No lines yet. Add a line and pick an item.' : 'Pick a customer first, then add lines.'}
        </Text>
      }
    />
  );
}
