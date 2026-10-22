import { Button, Combobox, Icon, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { type PurchDocProps } from '../../shared/PurchDoc';
import { purchCols, pick } from '../../shared/purchCols';
import { lineHelpers, itemConfig } from '../../shared/purchLineHelpers';
import { departmentDef, priceListDef } from '../../../settings/masterDefs';
import { isPriceListValid } from '../../../../services/priceLists';
import { BLANKET_AGREEMENTS } from '../../../../mocks/purchaseOrders';
import { newGrLine, type GrLine } from '../../../../mocks/goodsReceipts';
import { itemsPerUom } from '../../../../mocks/items';
import { formatDate } from '../../../../services/dates';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { getPurchasingSettings, lineNet, openQty, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { grInventoryQty, grOpenQty, grTotals } from '../../../../services/goodsReceipts';
import { binOptions } from '../../../inventory/transfers/TransferLines';
import { PurchTotalsFooter } from '../../shared/PurchTotalsFooter';
import { defaultBin, lineFromItem, linePricing, type GrSectionProps } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Props grDoc needs beyond the section spread: the Copy-from-PO toolbar lives here, its panel in the wrapper. */
export interface GrDocProps extends GrSectionProps {
  onCopyClick: () => void;
  copyableCount: number;
}

/** Builds the Goods Receipt (GRPO) contents descriptor for the shared <PurchDoc>. */
export function grDoc({ draft, update, errors, m, ctx, onCopyClick, copyableCount }: GrDocProps): PurchDocProps<GrLine> {
  const lines = draft.lines;
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = grTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const showFreight = getPurchasingSettings().manageFreightInDocuments;
  const showRounding = getPurchasingSettings().roundingMethod === 'By Currency';

  const h = lineHelpers<GrLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate, uoms: m.inv.uoms });
  const { itemOf, patch, err, lineKind, uomLabel, uomOptions } = h;
  const whOf = (code: string) => m.inv.warehouses.find((w) => w.code === code);
  const taxRate = (l: GrLine) => ctx.rateOf(l.taxCode);

  const taxOptions = m.tax.codes
    .filter((c) => c.direction === 'Purchase' && c.active)
    .map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));
  const blanketOptions = [
    { value: '', label: '— None —' },
    ...BLANKET_AGREEMENTS.filter((b) => b.vendorId === draft.vendorId && b.validTo >= draft.postingDate).map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` })),
  ];
  const vendorOptions = [
    { value: '', label: '— Header vendor —' },
    ...m.vendors.filter((v) => v.status !== 'Inactive' && v.id !== draft.vendorId).map((v) => ({ value: v.id, label: v.name })),
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

  // The per-field rendering lives in the shared registry; GR supplies its data/services
  // here and picks which columns + default visibility. Order mirrors PR / PQ / PO.
  const cols = purchCols<GrLine>({
    patch, readOnly: ctx.readOnly, currency: draft.currency, fx: ctx.fx,
    lineNet,
    priceAfterDisc: priceAfterDiscount,
    grossAfterDisc: (l) => priceAfterDiscount(l) * (1 + taxRate(l) / 100),
    taxAmount: (l) => round2((lineNet(l) * taxRate(l)) / 100),
    taxOptions: () => taxOptions,
    vendorOptions,
    warehouseOptions: m.inv.warehouses.filter((w) => receivesFromVendors(w)).map((w) => ({ value: w.code, label: w.code })),
    blanketOptions,
    uomOptions, uomLabel,
    priceListDef, priceListWhere: (r) => isPriceListValid(r, draft.postingDate), departmentDef,
    changeUom, changePriceList,
    onQty: (l, quantity) => patch(l.id, { quantity }),
    copiedQty: () => 0,
    invalid: (l, f) => Boolean(err(l, f)),
    lineKind,
    inventoryQty: grInventoryQty,
    // Received, in the receiving warehouse / bin.
    qtyHeader: 'Received qty',
    qtyHint: (l) => {
      const pl = l.baseId ? m.orders.find((p) => p.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId) : undefined;
      return pl ? <Text variant="small" tone="muted">{openQty(pl)} of {pl.quantity} open on the PO</Text> : null;
    },
    lockUom: (l) => Boolean(l.baseId),
    warehouseStocked: (l) => Boolean(itemOf(l)?.inventoryItem),
    onWarehouse: changeWarehouse,
    bin: {
      show: (l) => Boolean(whOf(l.warehouse)?.binEnabled),
      options: (l) => { const wh = whOf(l.warehouse); return wh ? binOptions(m.inv.bins, wh, l.binId, ctx.readOnly ? l.binCode : '') : []; },
      onChange: (l, binId) => patch(l.id, { binId }),
      invalid: (l) => Boolean(err(l, 'bin')),
    },
    openQtyOf: (l) => grOpenQty(l, draft),
    baseDoc: (l) => (l.baseId ? { href: `#/purchasing/purchase-orders/${l.baseId}`, label: `PO ${l.baseDocNo}` } : null),
  });

  const columns = pick(cols, [
    ['qty', 'always'],
    ['warehouse', 'opt'],
    ['inventoryQty', 'hide'], ['packages', 'hide'], ['openQty', 'hide'],
    ['priceList', 'opt'],
    ['unitPrice', 'always'], ['discount', 'opt'], ['priceAfterDisc', 'opt'],
    ['tax', 'opt'], ['taxAmount', 'hide'],
    ['total', 'always'],
    ['baseDoc', 'opt'], ['blanket', 'hide'], ['vendor', 'hide'],
    ['requisition', 'opt'], ['freeText', 'opt'],
  ]);

  return {
    prefsKey: 'gr',
    columns,
    rows: lines,
    icon: 'list_alt',
    title: 'Contents',
    description: errors.lines ?? `What arrived, in the purchasing unit. Prices are in ${draft.currency}${draft.currency === 'PHP' ? '' : `; totals in PHP at ${ctx.fx ? `${ctx.fx} (${ctx.fxSource}, ${formatDate(ctx.fxDate)})` : '—'}`}.`,
    sortableKeys: ['item'],
    sortValue: (l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof GrLine] ?? '')).toLowerCase(),
    readOnly: ctx.readOnly,
    onRemove: (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) }),
    item: itemConfig(h, {
      resolve: (l) => { const it = itemOf(l); return it ? { itemNo: it.itemNo, name: l.name || it.name } : null; },
      onPick: (l, id) => { if (id) pickItem(l, id); else patch(l.id, { itemId: '', itemNo: '', name: '', description: '' }); },
      fromItem,
      canChange: (l) => !l.baseId,
      addDisabled: !draft.vendorId,
      addPlaceholder: draft.vendorId ? 'Search items to add a line…' : 'Pick a vendor to add items',
    }),
    empty: (
      <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
        {!draft.vendorId
          ? 'Pick a vendor first, then copy from its purchase orders or add lines.'
          : copyableCount
            ? `${draft.vendorName} has ${copyableCount} open purchase order${copyableCount === 1 ? '' : 's'} — use Copy from PO, or add lines by hand.`
            : 'No open purchase orders from this vendor. Add lines by hand.'}
      </Text>
    ),
    header: ctx.readOnly ? undefined : (
      <div className="flex justify-end px-2">
        <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!copyableCount} onClick={onCopyClick}>
          Copy from PO
        </Button>
      </div>
    ),
    footer: (
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
    ),
  };
}
