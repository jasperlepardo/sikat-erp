import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Button,
  Combobox,
  Icon,
  Link,
  Text,
  TextField,
} from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { useColumnPrefs, type PrefColumn } from '../../../../components/form/columnPrefs';
import { textCol, masterCol, amountCol } from '../../shared/purchColumns';
import { newGrLine, type GrLine } from '../../../../mocks/goodsReceipts';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import { BLANKET_AGREEMENTS, type PurchaseOrder } from '../../../../mocks/purchaseOrders';
import { formatAmount } from '../../../../services/format';
import { grInventoryQty, grOpenQty, grTotals, receivablePos } from '../../../../services/goodsReceipts';
import { activeOptions } from '../../../../services/inventoryMasters';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { isValidToday } from '../../../../services/items';
import { isPriceListValid } from '../../../../services/priceLists';
import { getPurchasingSettings, lineNet, openQty, poNumber, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { binOptions } from '../../../inventory/transfers/TransferLines';
import { formatDate } from '../../../../services/dates';
import { CopyPanel, type CopySourceType } from '../../shared/CopyPanel';
import { priceListDef } from '../../../settings/masterDefs';
import { PurchTotalsFooter } from '../../shared/PurchTotalsFooter';
import { defaultBin, lineFromItem, linePricing, linesFromPo, type GrSectionProps } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function GrContents({ draft, update, errors, m, ctx, onCopy }: GrSectionProps & { onCopy: (po: PurchaseOrder, lines: GrLine[]) => void }) {
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const [copying, setCopying] = useState(false);
  const lines = draft.lines;
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = grTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const showFreight = getPurchasingSettings().manageFreightInDocuments;
  const showRounding = getPurchasingSettings().roundingMethod === 'By Currency';
  const itemOf = (l: GrLine) => m.items.find((i) => i.id === l.itemId);
  const whOf = (code: string) => m.inv.warehouses.find((w) => w.code === code);
  const patch = (id: string, p: Partial<GrLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: GrLine, field: string) => errors[`line:${l.id}:${field}`];
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
            <span>{i.description || i.name}</span>
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
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const blank = newGrLine();
    return { ...blank, ...lineFromItem(item, draft, ctx, m, { id: blank.id, quantity: 1 }) } as GrLine;
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

  const col = (key: string, header: string, cell: (l: GrLine) => ReactNode, opts?: { optional?: boolean; defaultHidden?: boolean }): PrefColumn<GrLine> => ({ key, header, cell, ...opts });

  const allColumns: PrefColumn<GrLine>[] = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      if (!item) return (
        <div className="flex w-64 flex-col gap-1">
          <Combobox aria-label="Item No." placeholder="Search items" options={itemOptions(l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(v) => pickItem(l, v)} />
        </div>
      );
      if (editing.has(l.id) && !ctx.readOnly) return (
        <div className="flex w-64 flex-col gap-1">
          <Text variant="caption">{item.itemNo}</Text>
          <TextField aria-label="Item description" value={l.description} onChange={(e) => patch(l.id, { description: e.currentTarget.value })} />
          <Link intent="primary" onClick={() => setEditing((s) => { const n = new Set(s); n.delete(l.id); return n; })}>Done</Link>
        </div>
      );
      return (
        <div className="flex w-64 flex-col gap-1 whitespace-normal">
          <div className="flex flex-col">
            <Text variant="caption">{item.itemNo}</Text>
            <Text variant="small">{l.name}</Text>
            <Text variant="small" tone="muted">{l.description}</Text>
          </div>
          {ctx.readOnly ? null : (
            <div className="flex gap-3">
              <Link intent="primary" onClick={() => setEditing((s) => new Set(s).add(l.id))}>Edit</Link>
              {l.baseId ? null : <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', name: '', description: '' })}>Change</Link>}
            </div>
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
    }, { optional: true, defaultHidden: true }),
    col('packages', 'No. of packages', (l) => (l.itemId ? (
      <TextField aria-label="No. of packages" type="number" min={0} className="w-24" value={String(l.packages)} onChange={(e) => patch(l.id, { packages: num(e.currentTarget.value) })} />
    ) : null), { optional: true, defaultHidden: true }),
    col('openQty', 'Open qty', (l) => (l.itemId ? grOpenQty(l, draft).toLocaleString('en-PH') : null), { optional: true, defaultHidden: true }),
    masterCol({ key: 'priceListId', header: 'Price list', def: priceListDef, get: (l: GrLine) => l.priceListId, onChange: (l, v) => changePriceList(l, v), where: (r) => isPriceListValid(r, draft.postingDate), readOnly: ctx.readOnly, width: 'w-44' }),
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
    amountCol({ key: 'priceAfterDiscount', header: 'Price after discount', value: (l: GrLine) => priceAfterDiscount(l) }),
    col('totalLc', 'Total (LC)', (l) => (l.itemId ? <span className="whitespace-nowrap">PHP {lc(lineNet(l))}</span> : null)),
    col('base', 'Base document', (l) => (l.baseId ? (
      <Link intent="primary" href={`#/purchasing/purchase-orders/${l.baseId}`}>PO {l.baseDocNo}</Link>
    ) : l.itemId ? <span className="text-muted">—</span> : null), { optional: true }),
    col('blanketAgreement', 'Blanket agreement', (l) => (l.itemId ? (
      <Combobox aria-label="Blanket agreement" className="w-48" options={blanketOptions} value={l.blanketAgreement} onValueChange={(blanketAgreement) => patch(l.id, { blanketAgreement: blanketAgreement ?? '' })} />
    ) : null), { optional: true }),
    col('lineVendorId', 'Vendor', (l) => (l.itemId ? (
      <Combobox aria-label="Line vendor" className="w-48" options={vendorOptions} value={l.lineVendorId} onValueChange={(lineVendorId) => patch(l.id, { lineVendorId: lineVendorId ?? '' })} />
    ) : null), { optional: true }),
    textCol({ key: 'requisitionSlipNo', header: 'Requisition slip no.', width: 'w-36', readOnly: ctx.readOnly, defaultHidden: false, get: (l: GrLine) => l.requisitionSlipNo, onChange: (l, v) => patch(l.id, { requisitionSlipNo: v }) }),
    textCol({ key: 'freeText', header: 'Free text', width: 'w-48', readOnly: ctx.readOnly, defaultHidden: false, get: (l: GrLine) => l.freeText, onChange: (l, v) => patch(l.id, { freeText: v }) }),
  ];
  const prefs = useColumnPrefs('gr', allColumns);
  const columns = prefs.columns;

  return (
    <>
      {prefs.settings}
      <DataTable
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
        onColumnSettings={prefs.toggleSettings}
        spanRow={ctx.readOnly ? undefined : (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Combobox
                key={addKey}
                aria-label="Search items to add a line"
                placeholder={draft.vendorId ? 'Search items to add a line…' : 'Pick a vendor to add items'}
                disabled={!draft.vendorId}
                options={itemOptions('')}
                value={null}
                onValueChange={(id) => {
                  const line = id ? fromItem(id) : undefined;
                  if (!line) return;
                  update({ lines: [...lines, line] });
                  setAddKey((k) => k + 1);
                }}
              />
            </div>
            <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!copyable.length} onClick={() => setCopying(true)}>
              Copy from PO
            </Button>
          </div>
        )}
        empty={
          <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
            {!draft.vendorId
              ? 'Pick a vendor first, then copy from its purchase orders or add lines.'
              : copyable.length
                ? `${draft.vendorName} has ${copyable.length} open purchase order${copyable.length === 1 ? '' : 's'} — use Copy from PO, or add lines by hand.`
                : 'No open purchase orders from this vendor. Add lines by hand.'}
          </Text>
        }
        cardFooter={
          <PurchTotalsFooter
            totals={totals}
            currency={draft.currency}
            readOnly={ctx.readOnly}
            discountPct={draft.discountPct}
            onDiscountChange={(discountPct) => update({ discountPct })}
            freightInput={showFreight ? (
              <div className="flex gap-1">
                <TextField
                  aria-label={`Freight (${draft.currency}, net)`}
                  type="number"
                  min={0}
                  className="w-32"
                  prefix={draft.currency}
                  value={String(draft.freight)}
                  onChange={(e) => update({ freight: Number(e.currentTarget.value) })}
                />
                <Combobox
                  aria-label="Freight tax code"
                  className="w-28"
                  options={m.tax.codes.filter((c) => c.direction === 'Purchase' && c.active).map((c) => ({ value: c.code, label: c.code }))}
                  value={draft.freightTaxCode}
                  onValueChange={(freightTaxCode) => update({ freightTaxCode: freightTaxCode ?? '' })}
                />
              </div>
            ) : undefined}
            roundingLabel={showRounding ? `Rounding (${docCurrency?.rounding ?? 'No rounding'})` : undefined}
            fx={draft.currency !== 'PHP' ? { rate: ctx.fx, source: ctx.fxSource } : undefined}
          />
        }
      />
      {copying
        ? createPortal(
            <CopyPanel
              sources={[{
                key: 'PO' as const,
                label: 'Purchase orders',
                totalHeader: 'Ordered',
                qtyHeader: 'Receive',
                hint: 'Receive quantities can be at most the PO open qty.',
                docs: copyable.map((po) => ({
                  id: po.id,
                  label: `${poNumber(po)} · ${po.vendorName}`,
                  description: po.postingDate,
                  lines: po.lines
                    .filter((l) => l.status === 'Open' && openQty(l) > 0)
                    .map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
                })),
              }] satisfies CopySourceType<'PO'>[]}
              taken={new Set(lines.map((l) => l.baseLineId).filter((id): id is string => !!id))}
              onCancel={() => setCopying(false)}
              onCopy={(_type: 'PO', docId: string, picks: { lineId: string; qty: number }[]) => {
                const po = copyable.find((p) => p.id === docId);
                setCopying(false);
                if (po) onCopy(po, linesFromPo(po, picks, m));
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
