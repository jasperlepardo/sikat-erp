import type { ReactNode } from 'react';
import { Button, Combobox, FormField, Icon, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { newQuoteLine, type QuoteLine } from '../../../../mocks/quotations';
import { isValidToday } from '../../../../services/items';
import { activeOptions } from '../../../../services/inventoryMasters';
import { BASE_PRICE_LIST_ID } from '../../../../services/priceLists';
import { formatAmount } from '../../../../services/format';
import { linePricing, proposedTaxCode, round2, itemsPerUnit, type QtTabProps } from './types';

export function QtContentsTable({ draft, update, errors, ctx, m, cardFooter }: QtTabProps & { cardFooter?: ReactNode }) {
  const { readOnly, fx, vatRegistered, rateOf, customer } = ctx;
  const date = draft.postingDate;
  const code = draft.currency;

  const patch = (lineId: string, p: Partial<QuoteLine>) =>
    update({ lines: draft.lines.map((l) => (l.id === lineId ? { ...l, ...p } : l)) });

  const pickItem = (l: QuoteLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) { patch(l.id, { itemId: '' }); return; }
    const uom = m.inv.uoms.find((u) => u.code === item.salesUom);
    const priceListId = customer?.priceListId || BASE_PRICE_LIST_ID;
    const taxCode = proposedTaxCode(item, customer, m, date);
    const base: Partial<QuoteLine> = {
      itemId: item.id,
      itemNo: item.itemNo,
      description: item.name,
      uomCode: item.salesUom,
      uomName: uom?.name ?? item.salesUom,
      itemsPerUnit: itemsPerUnit(item),
      warehouse: item.inventoryItem ? (item.warehouses[0]?.code ?? 'WH-MNL') : '',
      priceListId,
      taxCode,
    };
    const pricing = linePricing(item, { ...l, ...base }, draft, m.customers, vatRegistered, rateOf, fx);
    patch(l.id, { ...base, ...pricing });
  };

  const net = (l: QuoteLine) => round2(l.quantity * l.unitPrice * (1 - l.discountPct / 100));
  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Sales' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${rateOf(c.code)}%)` }));
  const warehouseOpts = (cur: string) => activeOptions(m.inv.warehouses, (w) => w.code, (w) => `${w.code} — ${w.name}`, cur);

  const columns: TableColumn<QuoteLine>[] = [
    {
      key: 'item',
      header: 'Item',
      cell: (l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        if (item) {
          return (
            <div className="flex w-52 shrink-0 flex-col whitespace-normal">
              <Text variant="caption">{item.itemNo}</Text>
              <Text variant="small">{l.description}</Text>
              {!readOnly ? <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', description: '' })}>Change</Link> : null}
            </div>
          );
        }
        const opts = m.items
          .filter((i) => i.id === l.itemId || (i.salesItem && isValidToday(i, date)))
          .map((i) => ({ value: i.id, label: i.itemNo, subLabel: i.description, text: `${i.itemNo} ${i.name} ${i.description}` }));
        return (
          <FormField label="" error={errors[`line:${l.id}:item`]}>
            {(fp) => (
              <Combobox {...fp} aria-label="Item" className="w-52" placeholder="Search items" options={opts} value={l.itemId || null} disabled={readOnly} onValueChange={(v) => pickItem(l, v)} />
            )}
          </FormField>
        );
      },
    },
    {
      key: 'qty',
      header: 'Qty / UoM',
      cell: (l) => !l.itemId ? null : (
        <div className="flex w-32 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Quantity" type="number" min={0} invalid={Boolean(errors[`line:${l.id}:quantity`])} value={String(l.quantity)} disabled={readOnly} onChange={(e) => patch(l.id, { quantity: Number(e.currentTarget.value) || 0 })} />
          <Text variant="small" tone="muted">{l.uomCode}</Text>
        </div>
      ),
    },
    {
      key: 'pricing',
      header: 'Price / Disc. / Tax',
      cell: (l) => !l.itemId ? null : (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Unit price" type="number" min={0} prefix={code} invalid={Boolean(errors[`line:${l.id}:unitPrice`])} value={String(l.unitPrice)} disabled={readOnly} onChange={(e) => patch(l.id, { unitPrice: round2(Number(e.currentTarget.value) || 0), priceSource: 'Manual' })} />
          <TextField aria-label="Discount %" type="number" min={0} suffix="%" value={String(l.discountPct)} disabled={readOnly} onChange={(e) => patch(l.id, { discountPct: Math.min(100, Number(e.currentTarget.value) || 0) })} />
          <Select aria-label="Tax code" invalid={Boolean(errors[`line:${l.id}:taxCode`])} options={[{ value: '', label: '— None —' }, ...taxOptions]} value={l.taxCode} disabled={readOnly} onValueChange={(taxCode) => patch(l.id, { taxCode })} />
        </div>
      ),
    },
    {
      key: 'total',
      header: `Total (${code})`,
      cell: (l) => l.itemId ? <span className="whitespace-nowrap tabular-nums">{formatAmount(net(l))}</span> : null,
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      cell: (l) => {
        const item = m.items.find((i) => i.id === l.itemId);
        if (!item?.inventoryItem) return l.itemId ? <Text variant="small" tone="muted">—</Text> : null;
        return (
          <Select aria-label="Warehouse" className="w-40" options={[{ value: '', label: '— None —' }, ...warehouseOpts(l.warehouse)]} value={l.warehouse} disabled={readOnly} onValueChange={(warehouse) => patch(l.id, { warehouse })} />
        );
      },
    },
  ];

  return (
    <DataTable
      variant="card"
      icon="receipt_long"
      title="Contents"
      description="Items and prices being quoted. No stock is committed until copied to a sales order."
      rows={draft.lines}
      getRowId={(l) => l.id}
      columns={columns}
      unsortable={columns.map((c) => c.key)}
      noPagination
      empty={<Text variant="small" tone="muted">{draft.customerId ? 'Add items to quote.' : 'Pick a customer first.'}</Text>}
      onRemove={!readOnly ? (removed) => update({ lines: draft.lines.filter((l) => !removed.includes(l)) }) : undefined}
      actions={
        !readOnly && draft.customerId ? (
          <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} onClick={() => update({ lines: [...draft.lines, newQuoteLine()] })}>
            Add line
          </Button>
        ) : undefined
      }
      cardFooter={cardFooter}
    />
  );
}
