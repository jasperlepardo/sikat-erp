import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Checkbox, Combobox, Icon, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { newArLine, type ArLine } from '../../../../mocks/arInvoices';
import type { Delivery } from '../../../../mocks/deliveries';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import type { SalesOrder, SoDocType } from '../../../../mocks/salesOrders';
import { customerWithholds, shipsStock } from '../../../../services/arInvoices';
import { dnInventoryQty, dnNumber } from '../../../../services/deliveries';
import { formatAmount } from '../../../../services/format';
import { isValidToday } from '../../../../services/items';
import { isPriceListValid } from '../../../../services/priceLists';
import { lineNet, lineTax, openQty, soNumber } from '../../../../services/salesOrders';
import { priceListDef } from '../../../settings/masterDefs';
import { warehouseOptions } from '../../../inventory/transfers/TransferLines';
import { CopyPanel, type CopySourceType } from '../../../purchasing/shared/CopyPanel';
import { asSoDraft } from '../../deliveries/detail/types';
import { lineFromItem, linePricing } from '../../orders/detail/types';
import type { ArSectionProps } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

export type CopyPick = { kind: 'DN'; doc: Delivery } | { kind: 'SO'; doc: SalesOrder };

export function ArContents({ draft, update, errors, m, ctx, onCopy }: ArSectionProps & { onCopy: (from: CopyPick, picks: { lineId: string; qty: number }[]) => void }) {
  const [copying, setCopying] = useState(false);
  const lines = draft.lines;
  const ro = ctx.readOnly;
  const service = draft.docType === 'Service';
  const withholds = customerWithholds(ctx.customer);
  const itemOf = (l: ArLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<ArLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: ArLine, f: string) => errors[`line:${l.id}:${f}`];
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const rate = (l: ArLine) => ctx.rateOf(l.taxCode);
  const taxOf = (l: ArLine) => lineTax(l as never, rate(l), 0);
  const so = asSoDraft(draft as never);
  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Sales' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));
  const revenueOptions = m.accounts.filter((a) => a.drawer === 'Revenue' && !a.title && a.active && !a.contra).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }));

  // Copy From: this customer's open deliveries with something left to bill, and open orders with something left to ship.
  const mine = (c: { customerId: string; currency: string }) => (!draft.customerId || c.customerId === draft.customerId) && (!ctx.based || c.currency === draft.currency);
  const taken = new Set(lines.map((l) => l.baseLineId).filter(Boolean));
  const dns = m.deliveries.filter((d) => d.status === 'Open' && mine(d) && d.lines.some((l) => l.quantity > l.invoicedQty));
  const sos = m.orders.filter((o) => o.status === 'Open' && o.docType === draft.docType && mine(o) && o.lines.some((l) => openQty(l) > 0));
  const sources: CopySourceType<'DN' | 'SO'>[] = [
    {
      key: 'DN',
      label: 'Deliveries',
      totalHeader: 'Shipped',
      qtyHeader: 'Bill',
      hint: 'Bills what was shipped, at the delivery’s price. The stock already went out with the delivery.',
      docs: dns.map((d) => ({
        id: d.id,
        label: `${dnNumber(d)} · ${d.customerName}`,
        description: `Shipped ${d.postingDate}${d.orderNumber ? ` · order ${d.orderNumber}` : ''}`,
        lines: d.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: l.quantity - l.invoicedQty })),
      })),
    },
    {
      key: 'SO',
      label: 'Sales orders',
      totalHeader: 'Ordered',
      qtyHeader: 'Bill',
      hint: 'Bills straight from the order with no delivery: adding the invoice also ships the stock.',
      docs: sos.map((o) => ({
        id: o.id,
        label: `${soNumber(o)} · ${o.customerName}`,
        description: o.deliveryDate ? `Due ${o.deliveryDate}` : 'No delivery date',
        lines: o.lines.map((l) => ({ id: l.id, itemNo: l.itemNo || l.description, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
      })),
    },
  ];

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.salesItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({ value: i.id, label: <div className="flex flex-col gap-0.5"><span className="text-xs opacity-60">{i.itemNo}</span><span>{i.name}</span></div>, text: `${i.itemNo} ${i.name}` }));
  const pickItem = (l: ArLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return patch(l.id, { itemId: '' });
    const s = lineFromItem(item, so, ctx, m, { quantity: l.quantity });
    patch(l.id, newArLine({ ...s, id: l.id, baseType: '', baseId: '', baseLineId: '', baseDocNo: '', baseRow: 0, wtaxLiable: withholds }));
  };
  const reprice = (l: ArLine, change: Partial<ArLine>) => {
    const item = itemOf(l);
    if (!item || l.baseId || !ctx.fx || l.priceSource === 'Manual') return patch(l.id, change);
    patch(l.id, { ...change, ...linePricing(item, { ...l, ...change }, so, ctx) });
  };
  /** Gross Price after Disc.: typing it back-calculates the unit price, keeping the discount. */
  const grossAfter = (l: ArLine) => round2(l.unitPrice * (1 - l.discountPct / 100) * (1 + rate(l) / 100));
  const setGrossAfter = (l: ArLine, gross: number) => {
    const net = gross / (1 + rate(l) / 100);
    patch(l.id, { unitPrice: round2(l.discountPct < 100 ? net / (1 - l.discountPct / 100) : net), priceSource: 'Manual' });
  };

  const wtaxCol: TableColumn<ArLine> = {
    key: 'wtax',
    header: 'WTax liable',
    cell: (l) =>
      l.itemId || service ? <Checkbox aria-label={`WTax liable ${l.itemNo || l.description}`} disabled={ro || !withholds} checked={l.wtaxLiable} onChange={(e) => patch(l.id, { wtaxLiable: e.currentTarget.checked })} /> : null,
  };
  const totalsCol: TableColumn<ArLine> = {
    key: 'totals',
    header: 'Total / Gross (LC)',
    cell: (l) =>
      l.itemId || service ? (
        <div className="flex flex-col whitespace-nowrap tabular-nums">
          <Text variant="small">PHP {lc(lineNet(l as never))}</Text>
          <Text variant="small" tone="muted">PHP {lc(lineNet(l as never) + taxOf(l))} gross</Text>
        </div>
      ) : null,
  };
  const taxCol: TableColumn<ArLine> = {
    key: 'tax',
    header: 'Tax code',
    cell: (l) =>
      l.itemId || service ? (
        <div className="flex w-32 flex-col gap-1">
          <Combobox aria-label="Tax code" disabled={ro} invalid={Boolean(err(l, 'taxCode'))} options={taxOptions} value={l.taxCode || null} onValueChange={(v) => patch(l.id, { taxCode: v ?? '' })} />
          <Text variant="small" tone="muted">Tax PHP {lc(taxOf(l))}</Text>
        </div>
      ) : null,
  };

  const itemColumns: TableColumn<ArLine>[] = [
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
        return (
          <div className="flex w-40 shrink-0 flex-col gap-1 whitespace-normal">
            <TextField aria-label="Quantity" type="number" min={0} readOnly={ro} invalid={Boolean(err(l, 'quantity'))} value={String(l.quantity)} onChange={(e) => reprice(l, { quantity: num(e.currentTarget.value) })} />
            {l.baseId || ro ? (
              <Text variant="small" tone="muted">{l.uomCode} · {l.uomName}</Text>
            ) : (
              <Select aria-label="UoM code" options={itemUnits(item, 'sales').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(uomCode) => reprice(l, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: itemsPerUom(item, uomCode) ?? 1 })} />
            )}
          </div>
        );
      },
    },
    {
      key: 'warehouse',
      header: 'Whse',
      cell: (l) => {
        const item = itemOf(l);
        if (!item) return null;
        if (!item.inventoryItem) return <Text variant="small" tone="muted">Not stocked</Text>;
        if (!shipsStock(l, m.items)) return <Text variant="small" tone="muted">{l.warehouse} · shipped</Text>;
        const inWhse = item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0;
        return (
          <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
            <Combobox aria-label="Warehouse" disabled={ro} invalid={Boolean(err(l, 'warehouse'))} options={warehouseOptions(m.inv.warehouses, l.warehouse)} value={l.warehouse || null} onValueChange={(v) => patch(l.id, { warehouse: v ?? '' })} />
            {ro ? null : <Text variant="small" tone={dnInventoryQty(l) > inWhse ? 'danger' : 'muted'}>{inWhse} {item.inventoryUom} in stock · ships now</Text>}
          </div>
        );
      },
    },
    {
      key: 'priceList',
      header: 'Price list',
      cell: (l) =>
        itemOf(l) ? (
          l.baseId || ro ? <Text variant="small">{l.priceList}</Text> : <MasterLookup def={priceListDef} fieldProps={{ 'aria-label': 'Price list', className: 'w-40' }} where={(r) => isPriceListValid(r, draft.postingDate)} value={l.priceList} onChange={(v) => reprice({ ...l, priceSource: '' }, { priceList: v })} />
        ) : null,
    },
    {
      key: 'pricing',
      header: 'Unit price / Discount / Gross after disc.',
      cell: (l) =>
        itemOf(l) ? (
          <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
            <TextField aria-label="Unit price" type="number" min={0} prefix={draft.currency} readOnly={ro} invalid={Boolean(err(l, 'unitPrice'))} value={String(l.unitPrice)} onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value), priceSource: 'Manual' })} />
            <TextField aria-label="Discount %" type="number" min={0} suffix="%" readOnly={ro} value={String(l.discountPct)} onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)), priceSource: 'Manual' })} />
            <TextField aria-label="Gross price after discount" type="number" min={0} prefix="gross" readOnly={ro} value={String(grossAfter(l))} onChange={(e) => setGrossAfter(l, num(e.currentTarget.value))} />
            <Text variant="small" tone="muted">{l.priceSource || '—'}</Text>
          </div>
        ) : null,
    },
    taxCol,
    totalsCol,
    wtaxCol,
    {
      key: 'commission',
      header: 'Comm. %',
      cell: (l) => (itemOf(l) ? <TextField aria-label="Commission %" type="number" min={0} suffix="%" className="w-24" readOnly={ro} value={String(l.commissionPct)} onChange={(e) => patch(l.id, { commissionPct: Math.min(100, num(e.currentTarget.value)) })} /> : null),
    },
    {
      key: 'base',
      header: 'Base document',
      cell: (l) =>
        l.baseId ? (
          <div className="flex flex-col whitespace-nowrap">
            <Text variant="small">{l.baseType === 'DN' ? 'Delivery' : 'Sales order'} {l.baseDocNo}</Text>
            <Text variant="small" tone="muted">Row {l.baseRow}</Text>
          </div>
        ) : (
          <Text variant="small" tone="muted">—</Text>
        ),
    },
  ];

  const serviceColumns: TableColumn<ArLine>[] = [
    { key: 'description', header: 'Description', cell: (l) => <TextField aria-label="Description" className="w-72" readOnly={ro} invalid={Boolean(err(l, 'description'))} value={l.description} onChange={(e) => patch(l.id, { description: e.currentTarget.value })} /> },
    { key: 'glAccount', header: 'G/L account', cell: (l) => <div className="w-60"><Combobox aria-label="G/L account" disabled={ro} invalid={Boolean(err(l, 'glAccount'))} options={revenueOptions} value={l.glAccount || null} onValueChange={(v) => patch(l.id, { glAccount: v ?? '' })} /></div> },
    { key: 'amount', header: 'Amount', cell: (l) => <TextField aria-label="Amount" type="number" min={0} prefix={draft.currency} className="w-40" readOnly={ro} invalid={Boolean(err(l, 'unitPrice'))} value={String(l.unitPrice)} onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value), quantity: 1, priceSource: 'Manual' })} /> },
    taxCol,
    totalsCol,
    wtaxCol,
  ];

  const columns = service ? serviceColumns : itemColumns;
  const hasLines = lines.some((l) => l.itemId || l.description);

  return (
    <>
      <DataTable
        variant="card"
        noPagination
        icon="receipt"
        title="Contents"
        description={errors.lines ?? (service ? `Services billed by amount, net of VAT, to revenue accounts.` : `Prices net of VAT in ${draft.currency}. Lines from a delivery bill what was shipped; other stocked lines also ship the stock when the invoice is added.`)}
        rows={lines}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
        sortValue={(l) => l.itemNo.toLowerCase()}
        onRemove={ro ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
        actions={
          ro ? null : (
            <div className="flex items-center gap-1">
              <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!dns.length && !sos.length} onClick={() => setCopying(true)}>
                Copy from
              </Button>
              <Button
                type="button"
                size="small"
                intent="primary"
                variant="solid"
                leadingIcon={<Icon size={16}>add</Icon>}
                disabled={!draft.customerId}
                onClick={() => update({ lines: [...lines, newArLine(service ? { taxCode: '31', glAccount: '4030', priceSource: 'Manual', wtaxLiable: withholds } : { wtaxLiable: withholds })] })}
              >
                Add line
              </Button>
            </div>
          )
        }
        empty={<Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>{draft.customerId ? 'Copy from a delivery or sales order, or add lines.' : 'Pick a customer, or copy from a delivery or sales order.'}</Text>}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Text variant="small" tone="muted">Item/Service type</Text>
          <Select aria-label="Item/Service type" className="w-36" disabled={ctx.added || hasLines} options={(['Item', 'Service'] as SoDocType[]).map((t) => ({ value: t, label: t }))} value={draft.docType} onValueChange={(docType) => update({ docType: docType as SoDocType, lines: [] })} />
          <Text variant="small" tone="muted">
            {withholds ? `${ctx.customer?.name} withholds tax — WTax liable lines default on.` : ctx.customer ? `${ctx.customer.name} doesn’t withhold.` : ''}
          </Text>
        </div>
      </DataTable>
      {copying
        ? createPortal(
            <CopyPanel
              sources={sources}
              taken={taken}
              onCancel={() => setCopying(false)}
              onCopy={(type, docId, picks) => {
                setCopying(false);
                if (type === 'DN') {
                  const doc = m.deliveries.find((d) => d.id === docId);
                  if (doc) onCopy({ kind: 'DN', doc }, picks);
                } else {
                  const doc = m.orders.find((o) => o.id === docId);
                  if (doc) onCopy({ kind: 'SO', doc }, picks);
                }
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
