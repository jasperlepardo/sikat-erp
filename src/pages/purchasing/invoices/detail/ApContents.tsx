import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Card, Checkbox, Combobox, Icon, Link, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { countryDef } from '../../../settings/masterDefs';
import { newApLine, type ApLine } from '../../../../mocks/apInvoices';
import { BLANKET_AGREEMENTS } from '../../../../mocks/purchaseOrders';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import { formatDate } from '../../../../services/dates';
import { movesStock } from '../../../../services/apInvoices';
import { grInventoryQty, grNumber, grOpenQty, invoiceableReceipts, receivablePos } from '../../../../services/goodsReceipts';
import { activeOptions } from '../../../../services/inventoryMasters';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { isValidToday } from '../../../../services/items';
import { lineNet, openQty, poNumber } from '../../../../services/purchaseOrders';
import { binOptions } from '../../../inventory/transfers/TransferLines';
import { CopyPanel } from '../../shared/CopyPanel';
import { defaultBin, lineFromItem, linePricing, linesFromPo } from '../../receipts/detail/types';
import { baseHref, linesFromReceipt, toApLine, type ApSectionProps } from './types';

const GROUPS = {
  details: 'Item details',
  references: 'References',
} as const;
type Group = keyof typeof GROUPS;

const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function ApContents({ draft, update, errors, m, ctx, onCopy }: ApSectionProps & { onCopy: (lines: ApLine[]) => void }) {
  const [shown, setShown] = useState<Group[]>(['references']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const lines = draft.lines;
  const itemOf = (l: ApLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<ApLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: ApLine, field: string) => errors[`line:${l.id}:${field}`];
  const is = (g: Group) => shown.includes(g);
  const sameCurrency = <T extends { currency: string }>(docs: T[]) => (ctx.based ? docs.filter((d) => d.currency === draft.currency) : docs);
  const receipts = draft.vendorId ? sameCurrency(invoiceableReceipts(m.receipts, draft.vendorId)) : [];
  const orders = draft.vendorId ? sameCurrency(receivablePos(m.orders, draft.vendorId)) : [];

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.purchaseItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({
        value: i.id,
        label: (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-60">{i.itemNo}</span>
            <span>{i.name}</span>
          </div>
        ),
        text: `${i.itemNo} ${i.description}`,
      }));
  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Purchase' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));
  const blanketOptions = [
    { value: '', label: '— None —' },
    ...BLANKET_AGREEMENTS.filter((b) => b.vendorId === draft.vendorId && b.validTo >= draft.postingDate).map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` })),
  ];

  const pickItem = (l: ApLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? toApLine(lineFromItem(item, draft, ctx, m, { id: l.id, quantity: l.quantity }), { baseType: '' }, m.items, draft.vendorId) : { itemId: '' });
  };
  const changeUom = (l: ApLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!item || !itemsPerUnit) return;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit, ...(ctx.fx ? linePricing(item, { ...l, uomCode }, draft, ctx) : {}) });
  };

  const col = (key: string, header: string, cell: (l: ApLine) => ReactNode, group?: Group): TableColumn<ApLine> & { group?: Group } => ({ key, header, cell, group });
  const columns = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      return (
        <div className="flex w-60 flex-col gap-1 whitespace-normal">
          {item ? (
            <>
              <div className="flex flex-col">
                <Text variant="caption">{item.itemNo}</Text>
                <Text variant="small">{l.name}</Text>
                <Text variant="small" tone="muted">{l.description}</Text>
              </div>
              {!ctx.readOnly && !l.baseType ? (
                <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', name: '', description: '' })}>Change</Link>
              ) : null}
            </>
          ) : (
            <Combobox aria-label="Item No." placeholder="Search items" options={itemOptions(l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(v) => pickItem(l, v)} />
          )}
        </div>
      );
    }),
    col('qty', 'Qty / UoM', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      const gr = l.baseType === 'GRPO' ? m.receipts.find((r) => r.id === l.baseId) : undefined;
      const gl = gr?.lines.find((x) => x.id === l.baseLineId);
      const pl = l.baseType === 'PO' ? m.orders.find((p) => p.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId) : undefined;
      return (
        <div className="flex w-32 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Quantity" type="number" min={0} invalid={Boolean(err(l, 'quantity'))} value={String(l.quantity)} onChange={(e) => patch(l.id, { quantity: num(e.currentTarget.value) })} />
          {l.baseType || ctx.readOnly ? (
            <Text variant="small" tone="muted">{l.uomCode}</Text>
          ) : (
            <Combobox aria-label="UoM code" options={itemUnits(item, 'purchase').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(v) => v && changeUom(l, v)} />
          )}
          {!ctx.readOnly && gr && gl ? <Text variant="small" tone="muted">{grOpenQty(gl, gr)} of {gl.quantity} left to bill on the receipt</Text> : null}
          {!ctx.readOnly && pl ? <Text variant="small" tone="muted">{openQty(pl)} of {pl.quantity} open on the PO</Text> : null}
        </div>
      );
    }),
    col('warehouse', 'Whse / Bin', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      if (!item.inventoryItem) return <span className="text-muted">Not stocked</span>;
      if (!movesStock(l, m.items)) return <Text variant="small" tone="muted">Received in {l.warehouse}</Text>;
      const wh = m.inv.warehouses.find((w) => w.code === l.warehouse);
      return (
        <div className="flex w-44 flex-col gap-1">
          <Combobox
            aria-label="Warehouse"
            invalid={Boolean(err(l, 'warehouse'))}
            options={activeOptions(m.inv.warehouses.filter((w) => receivesFromVendors(w) || w.code === l.warehouse), (w) => w.code, (w) => w.code, l.warehouse)}
            value={l.warehouse}
            onValueChange={(warehouse) => patch(l.id, { warehouse: warehouse ?? '', bin: warehouse ? defaultBin(item, warehouse, m) : '' })}
          />
          {wh?.binEnabled ? (
            <Combobox aria-label="Bin location" invalid={Boolean(err(l, 'bin'))} options={binOptions(m.inv.bins, wh, l.bin)} value={l.bin} onValueChange={(bin) => patch(l.id, { bin: bin ?? '' })} />
          ) : null}
          <Text variant="small" tone="muted">Received with this invoice</Text>
        </div>
      );
    }),
    col('pricing', 'Unit price / Tax / Discount', (l) =>
      l.itemId ? (
        <div className="flex w-44 flex-col gap-1">
          <TextField aria-label="Unit price" type="number" min={0} prefix={draft.currency} invalid={Boolean(err(l, 'unitPrice'))} value={String(l.unitPrice)} onChange={(e) => patch(l.id, { unitPrice: round2(num(e.currentTarget.value)) })} />
          <Combobox aria-label="Tax code" invalid={Boolean(err(l, 'taxCode'))} options={taxOptions} value={l.taxCode} onValueChange={(taxCode) => patch(l.id, { taxCode: taxCode ?? '' })} />
          <TextField aria-label="Discount %" type="number" min={0} suffix="%" value={String(l.discountPct)} onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)) })} />
        </div>
      ) : null,
    ),
    col('totalLc', 'Total (LC)', (l) => (l.itemId ? <span className="whitespace-nowrap">PHP {formatAmount(lineNet(l) * ctx.fx)}</span> : null)),
    col('inventoryQty', 'Qty (inventory UoM)', (l) => (itemOf(l) ? `${grInventoryQty(l).toLocaleString('en-PH')} ${itemOf(l)!.inventoryUom}` : null), 'details'),
    col('bpCatalogNo', 'BP catalog no.', (l) => (l.itemId ? <TextField aria-label="BP catalog no." className="w-36" value={l.bpCatalogNo} onChange={(e) => patch(l.id, { bpCatalogNo: e.currentTarget.value })} /> : null), 'details'),
    col('countryOfOriginCode', 'Country of origin', (l) =>
      l.itemId ? (
        <MasterLookup def={countryDef} fieldProps={{ 'aria-label': 'Country of origin', className: 'w-40' }} clearable value={l.countryOfOriginCode} onChange={(countryOfOriginCode) => patch(l.id, { countryOfOriginCode })} />
      ) : null, 'details'),
    col('unitCost', 'Unit cost price', (l) => (itemOf(l) ? <span className="whitespace-nowrap">PHP {formatAmount(itemOf(l)!.itemCost)}</span> : null), 'details'),
    col('base', 'Base document', (l) =>
      l.baseType ? <Link intent="primary" href={baseHref(l)}>{l.baseType === 'GRPO' ? 'Receipt' : 'PO'} {l.baseDocNo}</Link> : l.itemId ? <span className="text-muted">—</span> : null, 'references'),
    col('blanketAgreement', 'Blanket agreement', (l) =>
      l.itemId ? <Combobox aria-label="Blanket agreement" className="w-48" options={blanketOptions} value={l.blanketAgreement} onValueChange={(blanketAgreement) => patch(l.id, { blanketAgreement: blanketAgreement ?? '' })} /> : null, 'references'),
    col('freeText', 'Free text', (l) => (l.itemId ? <TextField aria-label="Free text" className="w-48" value={l.freeText} onChange={(e) => patch(l.id, { freeText: e.currentTarget.value })} /> : null), 'references'),
  ].filter((c) => !c.group || is(c.group));

  return (
    <>
      <DataTable
        variant="card"
        noPagination
        icon="list_alt"
        title="Contents"
        description={
          errors.lines ??
          `What the vendor billed, in the purchasing unit. Prices are in ${draft.currency}${draft.currency === 'PHP' ? '' : `; totals in PHP at ${ctx.fx ? `${ctx.fx} (${ctx.fxSource}, ${formatDate(ctx.fxDate)})` : '—'}`}.`
        }
        rows={lines}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
        sortValue={(l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof ApLine] ?? '')).toLowerCase()}
        onRemove={ctx.readOnly ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
        onColumnSettings={() => setSettingsOpen(!settingsOpen)}
        actions={
          ctx.readOnly ? null : (
            <div className="flex gap-1">
              <Button type="button" size="small" intent="default" variant="solid" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!receipts.length && !orders.length} onClick={() => setCopying(true)}>
                Copy from
              </Button>
              <Button type="button" size="small" intent="primary" variant="solid" aria-label="Add line" leadingIcon={<Icon size={16}>add</Icon>} disabled={!draft.vendorId} onClick={() => update({ lines: [...lines, newApLine()] })}>
                Add line
              </Button>
            </div>
          )
        }
        empty={
          <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
            {!draft.vendorId
              ? 'Pick a vendor first, then copy from its goods receipts or purchase orders, or add lines.'
              : receipts.length || orders.length
                ? `${draft.vendorName} has ${receipts.length} receipt${receipts.length === 1 ? '' : 's'} to bill and ${orders.length} open PO${orders.length === 1 ? '' : 's'} — use Copy from, or add lines by hand.`
                : 'Nothing from this vendor to bill. Add lines by hand.'}
          </Text>
        }
      >
        {settingsOpen ? (
          <Card>
            <Card.Header icon={<Icon size={24}>tune</Icon>}>Columns</Card.Header>
            <Card.Content>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {(Object.keys(GROUPS) as Group[]).map((g) => (
                  <Checkbox key={g} checked={is(g)} onChange={(e) => setShown(e.currentTarget.checked ? [...shown, g] : shown.filter((x) => x !== g))}>
                    {GROUPS[g]}
                  </Checkbox>
                ))}
              </div>
            </Card.Content>
          </Card>
        ) : null}
      </DataTable>
      {copying
        ? createPortal(
            <CopyPanel
              sources={[
                {
                  key: 'GRPO' as const,
                  label: 'Goods receipts',
                  totalHeader: 'Received',
                  qtyHeader: 'Bill',
                  hint: 'Bill what was received: the usual three-way match. Only receipts with quantity still to bill are listed.',
                  docs: receipts.map((gr) => ({
                    id: gr.id,
                    label: `Receipt ${grNumber(gr)}`,
                    description: `Received ${formatDate(gr.postingDate)} · ${gr.currency}${gr.orderNumber ? ` · PO ${gr.orderNumber}` : ''}`,
                    lines: gr.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: grOpenQty(l, gr) })),
                  })),
                },
                {
                  key: 'PO' as const,
                  label: 'Purchase orders',
                  totalHeader: 'Ordered',
                  qtyHeader: 'Bill',
                  hint: 'Bill straight from a PO when nothing was received on a receipt — the invoice receives the stock too.',
                  docs: orders.map((po) => ({
                    id: po.id,
                    label: `PO ${poNumber(po)}`,
                    description: `Delivery ${formatDate(po.deliveryDate)} · ${po.currency} · not yet received — billing it receives the stock`,
                    lines: po.lines.filter((l) => l.status === 'Open').map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
                  })),
                },
              ]}
              taken={new Set(lines.map((l) => l.baseLineId).filter(Boolean))}
              onCancel={() => setCopying(false)}
              onCopy={(type, docId, picks) => {
                if (type === 'GRPO') {
                  const gr = receipts.find((r) => r.id === docId)!;
                  onCopy(linesFromReceipt(gr, picks, m.items));
                } else {
                  const po = orders.find((p) => p.id === docId)!;
                  onCopy(linesFromPo(po, picks, m).map((l) => toApLine(l, { baseType: 'PO' }, m.items, po.vendorId)));
                }
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
