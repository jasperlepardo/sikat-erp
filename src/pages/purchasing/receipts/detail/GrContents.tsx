import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Button,
  Card,
  Checkbox,
  Combobox,
  Icon,
  Link,
  Text,
  TextField,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { Section } from '../../../../components/form/fields';
import { newGrLine, type GrLine } from '../../../../mocks/goodsReceipts';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import { BLANKET_AGREEMENTS, type PurchaseOrder } from '../../../../mocks/purchaseOrders';
import { formatAmount } from '../../../../services/format';
import { formatDate } from '../../../../services/dates';
import { grInventoryQty, grOpenQty, receivablePos } from '../../../../services/goodsReceipts';
import { activeOptions } from '../../../../services/inventoryMasters';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { isValidToday } from '../../../../services/items';
import { isPriceListValid } from '../../../../services/priceLists';
import { lineNet, openQty, poNumber, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { binOptions } from '../../../inventory/transfers/TransferLines';
import { EditPanel } from '../../../partners/detail/EditPanel';
import { priceListDef } from '../../../settings/masterDefs';
import { defaultBin, lineFromItem, linePricing, linesFromPo, type GrSectionProps } from './types';

/** Optional column groups (the table's column settings). Item, quantity, warehouse, price and total always show. */
const GROUPS = {
  quantities: 'Quantities & packages',
  pricing: 'Pricing',
  references: 'References',
} as const;
type Group = keyof typeof GROUPS;

const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function GrContents({ draft, update, errors, m, ctx, onCopy }: GrSectionProps & { onCopy: (po: PurchaseOrder, lines: GrLine[]) => void }) {
  const [shown, setShown] = useState<Group[]>(['references']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const lines = draft.lines;
  const itemOf = (l: GrLine) => m.items.find((i) => i.id === l.itemId);
  const whOf = (code: string) => m.inv.warehouses.find((w) => w.code === code);
  const patch = (id: string, p: Partial<GrLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: GrLine, field: string) => errors[`line:${l.id}:${field}`];
  const is = (g: Group) => shown.includes(g);
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const copyable = draft.vendorId ? receivablePos(m.orders, draft.vendorId).filter((po) => !ctx.based || po.currency === draft.currency) : [];

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.purchaseItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({
        value: i.id,
        label: (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-60">{i.itemNo}</span>
            <span>{i.name}</span>
            <span className="text-xs opacity-60">{i.description}</span>
          </div>
        ),
        text: `${i.itemNo} ${i.description}`,
      }));
  const taxOptions = m.tax.codes
    .filter((c) => c.direction === 'Purchase' && c.active)
    .map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));
  const blanketOptions = [
    { value: '', label: '— None —' },
    ...BLANKET_AGREEMENTS.filter((b) => b.vendorId === draft.vendorId && b.validTo >= draft.postingDate).map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` })),
  ];
  const vendorOptions = [
    { value: '', label: '— Header vendor —' },
    ...m.vendors.filter((v) => v.status !== 'Inactive' && v.id !== draft.vendorId).map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` })),
  ];

  const pickItem = (l: GrLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? lineFromItem(item, draft, ctx, m, { id: l.id, quantity: l.quantity }) : { itemId: '' });
  };
  const changeUom = (l: GrLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!item || !itemsPerUnit) return;
    const priced = ctx.fx ? linePricing(item, { ...l, uomCode }, draft, ctx) : undefined;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit, ...priced });
  };
  const changeWarehouse = (l: GrLine, warehouse: string) => {
    const item = itemOf(l);
    patch(l.id, { warehouse, binId: item && warehouse ? defaultBin(item, warehouse, m) : '' });
  };
  const changePriceList = (l: GrLine, priceListId: string) => {
    const item = itemOf(l);
    patch(l.id, { priceListId, ...(item && ctx.fx ? linePricing(item, { ...l, priceListId }, draft, ctx) : {}) });
  };

  const col = (key: string, header: string, cell: (l: GrLine) => ReactNode, group?: Group): TableColumn<GrLine> & { group?: Group } => ({ key, header, cell, group });

  const columns = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      return (
        <div className="flex w-64 flex-col gap-1 whitespace-normal">
          {item ? (
            <>
              <div className="flex flex-col">
                <Text variant="caption">{item.itemNo}</Text>
                <Text variant="small">{l.name}</Text>
                <Text variant="small" tone="muted">{l.description}</Text>
              </div>
              {!ctx.readOnly && !l.baseId ? (
                <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', name: '', description: '' })}>
                  Change
                </Link>
              ) : null}
            </>
          ) : (
            <Combobox
              aria-label="Item No."
              placeholder="Search items"
              options={itemOptions(l.itemId)}
              value={l.itemId || null}
              invalid={Boolean(err(l, 'item'))}
              onValueChange={(v) => pickItem(l, v)}
            />
          )}
        </div>
      );
    }),
    col('qty', 'Qty / UoM', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      const pl = l.baseId ? m.orders.find((p) => p.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId) : undefined;
      return (
        <div className="flex w-32 flex-col gap-1 whitespace-normal">
          <TextField
            aria-label="Quantity"
            type="number"
            min={0}
            invalid={Boolean(err(l, 'quantity'))}
            value={String(l.quantity)}
            onChange={(e) => patch(l.id, { quantity: num(e.currentTarget.value) })}
          />
          {l.baseId || ctx.readOnly ? (
            <Text variant="small" tone="muted">{l.uomCode}</Text>
          ) : (
            <Combobox
              aria-label="UoM code"
              options={itemUnits(item, 'purchase').map((u) => ({ value: u.uom, label: u.uom }))}
              value={l.uomCode}
              onValueChange={(v) => v && changeUom(l, v)}
            />
          )}
          {pl && !ctx.readOnly ? (
            <Text variant="small" tone="muted">
              {openQty(pl)} of {pl.quantity} open on the PO
            </Text>
          ) : null}
        </div>
      );
    }),
    col('warehouse', 'Whse / Bin', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      if (!item.inventoryItem) return <span className="text-muted">Not stocked</span>;
      const wh = whOf(l.warehouse);
      return (
        <div className="flex w-44 flex-col gap-1">
          <Combobox
            aria-label="Warehouse"
            invalid={Boolean(err(l, 'warehouse'))}
            options={activeOptions(m.inv.warehouses.filter((w) => receivesFromVendors(w) || w.code === l.warehouse), (w) => w.code, (w) => w.code, l.warehouse)}
            value={l.warehouse}
            onValueChange={(warehouse) => changeWarehouse(l, warehouse ?? '')}
          />
          {wh?.binEnabled ? (
            <Combobox
              aria-label="Bin location"
              invalid={Boolean(err(l, 'bin'))}
              options={binOptions(m.inv.bins, wh, l.binId, ctx.readOnly ? l.binCode : '')}
              value={l.binId}
              onValueChange={(bin) => patch(l.id, { binId: bin ?? '' })}
            />
          ) : null}
        </div>
      );
    }),
    col('inventoryQty', 'Qty (inventory UoM)', (l) => {
      const item = itemOf(l);
      return item ? `${grInventoryQty(l).toLocaleString('en-PH')} ${item.inventoryUom}` : null;
    }, 'quantities'),
    col('packages', 'No. of packages', (l) => (l.itemId ? (
      <TextField aria-label="No. of packages" type="number" min={0} className="w-24" value={String(l.packages)} onChange={(e) => patch(l.id, { packages: num(e.currentTarget.value) })} />
    ) : null), 'quantities'),
    col('openQty', 'Open qty', (l) => (l.itemId ? grOpenQty(l, draft).toLocaleString('en-PH') : null), 'quantities'),
    col('priceListId', 'Price list', (l) => (l.itemId ? (
      <MasterLookup def={priceListDef} fieldProps={{ 'aria-label': 'Price list', className: 'w-44' }} where={(r) => isPriceListValid(r, draft.postingDate)} value={l.priceListId} onChange={(v) => changePriceList(l, v)} />
    ) : null), 'pricing'),
    col('pricing', 'Unit price / Tax / Discount', (l) => {
      if (!l.itemId) return null;
      return (
        <div className="flex w-44 flex-col gap-1">
          <TextField
            aria-label="Unit price"
            type="number"
            min={0}
            prefix={draft.currency}
            invalid={Boolean(err(l, 'unitPrice'))}
            value={String(l.unitPrice)}
            onChange={(e) => patch(l.id, { unitPrice: round2(num(e.currentTarget.value)) })}
          />
          <Combobox aria-label="Tax code" invalid={Boolean(err(l, 'taxCode'))} options={taxOptions} value={l.taxCode} onValueChange={(taxCode) => patch(l.id, { taxCode: taxCode ?? '' })} />
          <TextField
            aria-label="Discount %"
            type="number"
            min={0}
            suffix="%"
            value={String(l.discountPct)}
            onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)) })}
          />
        </div>
      );
    }),
    col('priceAfterDiscount', 'Price after discount', (l) => (l.itemId ? formatAmount(priceAfterDiscount(l)) : null), 'pricing'),
    col('totalLc', 'Total (LC)', (l) => (l.itemId ? <span className="whitespace-nowrap">PHP {lc(lineNet(l))}</span> : null)),
    col('base', 'Base document', (l) => (l.baseId ? (
      <Link intent="primary" href={`#/purchasing/purchase-orders/${l.baseId}`}>PO {l.baseDocNo}</Link>
    ) : l.itemId ? <span className="text-muted">—</span> : null), 'references'),
    col('blanketAgreement', 'Blanket agreement', (l) => (l.itemId ? (
      <Combobox aria-label="Blanket agreement" className="w-48" options={blanketOptions} value={l.blanketAgreement} onValueChange={(blanketAgreement) => patch(l.id, { blanketAgreement: blanketAgreement ?? '' })} />
    ) : null), 'references'),
    col('lineVendorId', 'Vendor', (l) => (l.itemId ? (
      <Combobox aria-label="Line vendor" className="w-48" options={vendorOptions} value={l.lineVendorId} onValueChange={(lineVendorId) => patch(l.id, { lineVendorId: lineVendorId ?? '' })} />
    ) : null), 'references'),
    col('requisitionSlipNo', 'Requisition slip no.', (l) => (l.itemId ? (
      <TextField aria-label="Requisition slip no." className="w-36" value={l.requisitionSlipNo} onChange={(e) => patch(l.id, { requisitionSlipNo: e.currentTarget.value })} />
    ) : null), 'references'),
    col('freeText', 'Free text', (l) => (l.itemId ? (
      <TextField aria-label="Free text" className="w-48" value={l.freeText} onChange={(e) => patch(l.id, { freeText: e.currentTarget.value })} />
    ) : null), 'references'),
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
          `What arrived, in the purchasing unit. Prices are in ${draft.currency}${draft.currency === 'PHP' ? '' : `; totals in PHP at ${ctx.fx ? `${ctx.fx} (${ctx.fxSource}, ${formatDate(ctx.fxDate)})` : '—'}`}.`
        }
        rows={lines}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
        sortValue={(l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof GrLine] ?? '')).toLowerCase()}
        onRemove={ctx.readOnly ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
        onColumnSettings={() => setSettingsOpen(!settingsOpen)}
        actions={
          ctx.readOnly ? null : (
            <div className="flex gap-1">
              <Button
                type="button"
                size="small"
                intent="default"
                variant="solid"
                leadingIcon={<Icon size={16}>content_copy</Icon>}
                disabled={!copyable.length}
                onClick={() => setCopying(true)}
              >
                Copy from PO
              </Button>
              <Button
                type="button"
                size="small"
                intent="primary"
                variant="solid"
                aria-label="Add line"
                leadingIcon={<Icon size={16}>add</Icon>}
                disabled={!draft.vendorId}
                onClick={() => update({ lines: [...lines, newGrLine()] })}
              >
                Add line
              </Button>
            </div>
          )
        }
        empty={
          <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
            {!draft.vendorId
              ? 'Pick a vendor first, then copy from its purchase orders or add lines.'
              : copyable.length
                ? `${draft.vendorName} has ${copyable.length} open purchase order${copyable.length === 1 ? '' : 's'} — use Copy from PO, or add lines by hand.`
                : 'No open purchase orders from this vendor. Add lines by hand.'}
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
            <CopyFromPoPanel
              orders={copyable}
              taken={new Set(lines.map((l) => l.baseLineId).filter(Boolean))}
              onCancel={() => setCopying(false)}
              onCopy={(po, picks) => {
                onCopy(po, linesFromPo(po, picks, m));
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * Copy From › Purchase Orders: the vendor's open POs, each open line ticked with its open
 * quantity to receive. Lines already on the receipt aren't offered again.
 */
function CopyFromPoPanel({
  orders,
  taken,
  onCancel,
  onCopy,
}: {
  orders: PurchaseOrder[];
  taken: Set<string>;
  onCancel: () => void;
  onCopy: (po: PurchaseOrder, picks: { lineId: string; qty: number }[]) => void;
}) {
  const [poId, setPoId] = useState(orders[0]?.id ?? '');
  const po = orders.find((o) => o.id === poId);
  const open = (po?.lines ?? []).filter((l) => l.status === 'Open' && openQty(l) > 0 && !taken.has(l.id));
  const [qty, setQty] = useState<Record<string, number>>({});
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const picks = open.filter((l) => !unticked.has(l.id)).map((l) => ({ lineId: l.id, qty: qty[l.id] ?? openQty(l) }));

  const columns: TableColumn<(typeof open)[number]>[] = [
    {
      key: 'pick',
      header: '',
      cell: (l) => (
        <Checkbox
          aria-label={`Receive ${l.itemNo}`}
          checked={!unticked.has(l.id)}
          onChange={(e) => {
            const next = new Set(unticked);
            if (e.currentTarget.checked) next.delete(l.id);
            else next.add(l.id);
            setUnticked(next);
          }}
        />
      ),
    },
    {
      key: 'item',
      header: 'Item',
      cell: (l) => (
        <div className="flex flex-col">
          <Text variant="caption">{l.itemNo}</Text>
          <Text variant="small">{l.name}</Text>
        </div>
      ),
    },
    { key: 'warehouse', header: 'Whse', cell: (l) => l.warehouse || '—' },
    { key: 'ordered', header: 'Ordered', cell: (l) => `${l.quantity} ${l.uomCode}` },
    {
      key: 'receive',
      header: 'Receive',
      cell: (l) => (
        <TextField
          aria-label={`Quantity to receive of ${l.itemNo}`}
          type="number"
          min={0}
          max={openQty(l)}
          className="w-24"
          suffix={`/ ${openQty(l)}`}
          value={String(qty[l.id] ?? openQty(l))}
          onChange={(e) => setQty({ ...qty, [l.id]: Math.min(openQty(l), num(e.currentTarget.value)) })}
        />
      ),
    },
  ];

  return (
    <EditPanel icon="content_copy" title="Copy from purchase order" onCancel={onCancel} onDone={() => (po && picks.length ? onCopy(po, picks.filter((p) => p.qty > 0)) : onCancel())}>
      <Section icon="receipt_long" title="Purchase order">
        <Combobox
          aria-label="Purchase order"
          options={orders.map((o) => ({
            value: o.id,
            label: `PO ${poNumber(o)}`,
            description: `Delivery ${formatDate(o.deliveryDate)} · ${o.currency}${o.vendorRef ? ` · ref. ${o.vendorRef}` : ''}`,
            text: `${poNumber(o)} ${o.vendorRef}`,
          }))}
          value={poId || null}
          onValueChange={(v) => {
            setPoId(v ?? '');
            setQty({});
            setUnticked(new Set());
          }}
        />
        <Text variant="small" tone="muted">
          Only open, approved POs from this vendor with quantity still to receive are listed. Quantities are in each PO line's unit.
        </Text>
      </Section>
      <DataTable
        icon="list_alt"
        title="Open lines"
        description={open.length ? `${picks.length} of ${open.length} line${open.length === 1 ? '' : 's'} ticked.` : undefined}
        rows={open}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={['pick', 'receive']}
        noPagination
        empty={<Text variant="small" tone="muted">Every open line of this PO is already on the receipt.</Text>}
      />
    </EditPanel>
  );
}
