import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Combobox, Icon, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { newDnLine, type DnLine } from '../../../../mocks/deliveries';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import type { SalesOrder } from '../../../../mocks/salesOrders';
import { dnInventoryQty, dnOpenQty } from '../../../../services/deliveries';
import { formatAmount } from '../../../../services/format';
import { isValidToday } from '../../../../services/items';
import { isPriceListValid } from '../../../../services/priceLists';
import { lineNet, lineTax, openQty, soNumber } from '../../../../services/salesOrders';
import { priceListDef } from '../../../settings/masterDefs';
import { warehouseOptions } from '../../../inventory/transfers/TransferLines';
import { CopyPanel, type CopySourceType } from '../../../purchasing/shared/CopyPanel';
import { lineFromItem, linePricing } from '../../orders/detail/types';
import { asSoDraft, type DnSectionProps } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));

export function DnContents({ draft, update, errors, m, ctx, onCopy }: DnSectionProps & { onCopy: (so: SalesOrder, picks: { lineId: string; qty: number }[]) => void }) {
  const [copying, setCopying] = useState(false);
  const lines = draft.lines;
  const ro = ctx.readOnly;
  const itemOf = (l: DnLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<DnLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: DnLine, f: string) => errors[`line:${l.id}:${f}`];
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const taxOf = (l: DnLine) => lineTax(l as never, ctx.rateOf(l.taxCode), 0);
  const so = asSoDraft(draft);
  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Sales' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));

  // Open orders of this customer (or any customer, before one is picked) with something left to ship.
  const orders = m.orders.filter((o) => o.status === 'Open' && o.docType === 'Item' && (!draft.customerId || o.customerId === draft.customerId) && o.lines.some((l) => openQty(l) > 0) && (!ctx.based || o.currency === draft.currency));
  const taken = new Set(lines.map((l) => l.baseLineId).filter(Boolean));
  const sources: CopySourceType<'SO'>[] = [
    {
      key: 'SO',
      label: 'Sales orders',
      totalHeader: 'Ordered',
      qtyHeader: 'Deliver',
      hint: 'Open lines come at their open quantity; ship less if the order allows partial delivery.',
      docs: orders.map((o) => ({
        id: o.id,
        label: `${soNumber(o)} · ${o.customerName}`,
        description: `${o.deliveryDate ? `Due ${o.deliveryDate}` : 'No delivery date'}${o.allowPartialDelivery ? '' : ' · full delivery only'}`,
        lines: o.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
      })),
    },
  ];

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.salesItem && i.inventoryItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({ value: i.id, label: <div className="flex flex-col gap-0.5"><span className="text-xs opacity-60">{i.itemNo}</span><span>{i.name}</span></div>, text: `${i.itemNo} ${i.name}` }));

  const pickItem = (l: DnLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return patch(l.id, { itemId: '' });
    const s = lineFromItem(item, so, ctx, m, { quantity: l.quantity });
    patch(l.id, newDnLine({ ...s, id: l.id, baseType: '', baseId: '', baseLineId: '', baseDocNo: '', baseRow: 0 }));
  };
  const reprice = (l: DnLine, change: Partial<DnLine>) => {
    const item = itemOf(l);
    if (!item || l.baseId || !ctx.fx || l.priceSource === 'Manual') return patch(l.id, change);
    patch(l.id, { ...change, ...linePricing(item, { ...l, ...change }, so, ctx) });
  };

  const columns: TableColumn<DnLine>[] = [
    {
      key: 'item',
      header: 'Item / Description',
      cell: (l) => {
        const item = itemOf(l);
        if (!item && !ro) return <div className="w-60"><Combobox aria-label="Item No." placeholder="Search items" options={itemOptions(l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(v) => pickItem(l, v)} /></div>;
        return (
          <div className="flex w-60 flex-col gap-1">
            <Text variant="caption">{l.itemNo}</Text>
            {ro ? <Text variant="small">{l.description}</Text> : <TextField aria-label="Item description" value={l.description} onChange={(e) => patch(l.id, { description: e.currentTarget.value })} />}
            {!ro && !l.baseId ? <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', description: '' })}>Change</Link> : null}
          </div>
        );
      },
    },
    {
      key: 'qty',
      header: 'Qty / UoM',
      cell: (l) => {
        const item = itemOf(l);
        if (!item) return null;
        const base = l.baseLineId ? m.orders.flatMap((o) => o.lines).find((x) => x.id === l.baseLineId) : undefined;
        return (
          <div className="flex w-40 shrink-0 flex-col gap-1 whitespace-normal">
            <TextField aria-label="Quantity" type="number" min={0} readOnly={ro} invalid={Boolean(err(l, 'quantity'))} value={String(l.quantity)} onChange={(e) => reprice(l, { quantity: num(e.currentTarget.value) })} />
            {l.baseId || ro ? (
              <Text variant="small" tone="muted">{l.uomCode} · {l.uomName}</Text>
            ) : (
              <Select aria-label="UoM code" options={itemUnits(item, 'sales').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(uomCode) => reprice(l, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: itemsPerUom(item, uomCode) ?? 1 })} />
            )}
            <Text variant="small" tone="muted">
              {l.uomCode === item.inventoryUom ? 'Inventory UoM' : `${dnInventoryQty(l)} ${item.inventoryUom}`}
              {base && !ro ? ` · ${openQty(base)} open on order` : ''}
              {draft.status === 'Open' ? ` · ${dnOpenQty(l, draft)} to invoice` : ''}
            </Text>
          </div>
        );
      },
    },
    {
      key: 'warehouse',
      header: 'Whse / Qty in Whse',
      cell: (l) => {
        const item = itemOf(l);
        if (!item) return null;
        const inWhse = item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0;
        return (
          <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
            <Combobox aria-label="Warehouse" disabled={ro} invalid={Boolean(err(l, 'warehouse'))} options={warehouseOptions(m.inv.warehouses, l.warehouse)} value={l.warehouse || null} onValueChange={(v) => patch(l.id, { warehouse: v ?? '' })} />
            {ro ? null : (
              <Text variant="small" tone={dnInventoryQty(l) > inWhse ? 'danger' : 'muted'}>
                {inWhse} {item.inventoryUom} in {l.warehouse || '—'}
              </Text>
            )}
          </div>
        );
      },
    },
    {
      key: 'priceList',
      header: 'Price list',
      cell: (l) =>
        itemOf(l) ? (
          l.baseId || ro ? (
            <Text variant="small">{l.priceList}</Text>
          ) : (
            <MasterLookup def={priceListDef} fieldProps={{ 'aria-label': 'Price list', className: 'w-40' }} where={(r) => isPriceListValid(r, draft.postingDate)} value={l.priceList} onChange={(v) => reprice({ ...l, priceSource: '' }, { priceList: v })} />
          )
        ) : null,
    },
    {
      key: 'pricing',
      header: 'Unit price / Discount',
      cell: (l) =>
        itemOf(l) ? (
          <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
            <TextField aria-label="Unit price" type="number" min={0} prefix={draft.currency} readOnly={ro} invalid={Boolean(err(l, 'unitPrice'))} value={String(l.unitPrice)} onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value), priceSource: 'Manual' })} />
            <TextField aria-label="Discount %" type="number" min={0} suffix="%" readOnly={ro} value={String(l.discountPct)} onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)), priceSource: 'Manual' })} />
            <Text variant="small" tone="muted">{l.priceSource || '—'}</Text>
          </div>
        ) : null,
    },
    {
      key: 'tax',
      header: 'Tax code',
      cell: (l) =>
        itemOf(l) ? (
          <div className="flex w-32 flex-col gap-1">
            <Combobox aria-label="Tax code" disabled={ro} invalid={Boolean(err(l, 'taxCode'))} options={taxOptions} value={l.taxCode || null} onValueChange={(v) => patch(l.id, { taxCode: v ?? '' })} />
            <Text variant="small" tone="muted">Tax PHP {lc(taxOf(l))}</Text>
          </div>
        ) : null,
    },
    {
      key: 'totals',
      header: 'Total / Gross (LC)',
      cell: (l) =>
        itemOf(l) ? (
          <div className="flex flex-col whitespace-nowrap tabular-nums">
            <Text variant="small">PHP {lc(lineNet(l as never))}</Text>
            <Text variant="small" tone="muted">PHP {lc(lineNet(l as never) + taxOf(l))} gross</Text>
          </div>
        ) : null,
    },
    {
      key: 'base',
      header: 'Base document',
      cell: (l) =>
        l.baseId ? (
          <div className="flex flex-col whitespace-nowrap">
            <Text variant="small">Sales order {l.baseDocNo}</Text>
            <Text variant="small" tone="muted">Row {l.baseRow} · key {l.baseLineId}</Text>
          </div>
        ) : (
          <Text variant="small" tone="muted">—</Text>
        ),
    },
  ];

  return (
    <>
      <DataTable
        variant="card"
        noPagination
        icon="local_shipping"
        title="Contents"
        description={errors.lines ?? `Items shipped, in the line's unit. Adding the delivery takes them out of stock at item cost. Prices are net of VAT in ${draft.currency}.`}
        rows={lines}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
        sortValue={(l) => l.itemNo.toLowerCase()}
        onRemove={ro ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
        actions={
          ro ? null : (
            <div className="flex items-center gap-1">
              <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!orders.length} onClick={() => setCopying(true)}>
                Copy from sales order
              </Button>
              <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} disabled={!draft.customerId} onClick={() => update({ lines: [...lines, newDnLine()] })}>
                Add line
              </Button>
            </div>
          )
        }
        empty={<Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>{orders.length ? 'Copy lines from an open sales order, or add items directly.' : draft.customerId ? 'No open sales orders for this customer — add items directly.' : 'Pick a customer, or copy from a sales order.'}</Text>}
      />
      {copying
        ? createPortal(
            <CopyPanel
              sources={sources}
              taken={taken}
              onCancel={() => setCopying(false)}
              onCopy={(_type, docId, picks) => {
                const order = m.orders.find((o) => o.id === docId);
                setCopying(false);
                if (order) onCopy(order, picks);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

