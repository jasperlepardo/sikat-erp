import { Button, Icon, Link, Text } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../components/form/docLines/DocLines';
import { pick } from '../../../../components/form/docLines/pick';
import { salesCols } from '../../shared/salesCols';
import { lineHelpers, itemConfig } from '../../shared/salesLineHelpers';
import { itemsPerUom } from '../../../../mocks/items';
import { newDnLine, type DnLine } from '../../../../mocks/deliveries';
import { dnInventoryQty } from '../../../../services/deliveries';
import { lineTax, openQty, priceAfterDiscount, soNumber } from '../../../../services/salesOrders';
import { isPriceListValid } from '../../../../services/priceLists';
import { formatAmount } from '../../../../services/format';
import { warehouseOptions } from '../../../inventory/transfers/TransferLines';
import { editTaxCode } from '../../../../services/taxRecalc';
import { taxCodeOptions } from '../../../../services/taxCodeOptions';
import { SO_LIST_PATH } from '../../paths';
import { lineFromItem, linePricing } from '../../sales-orders/detail/types';
import { asSoDraft, type DnSectionProps } from './types';

/** Props dnDoc needs beyond the section spread: the Copy-from-SO toolbar lives here, its panel in the wrapper. */
export interface DnDocProps extends DnSectionProps {
  onCopyClick: () => void;
  canCopy: boolean;
}

/** Builds the Delivery contents descriptor for the shared <DocLines>. */
export function dnDoc({ draft, update, errors, m, ctx, onCopyClick, canCopy }: DnDocProps): DocLinesProps<DnLine> {
  const lines = draft.lines;
  const ro = ctx.readOnly;
  const so = asSoDraft(draft);
  const h = lineHelpers<DnLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate, itemWhere: (i) => i.inventoryItem });
  const { itemOf, patch, err } = h;
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const taxOf = (l: DnLine) => lineTax(l, ctx.rateOf(l.taxCode), 0);
  const orderOf = (l: DnLine) => (l.baseId ? m.orders.find((o) => o.id === l.baseId) : undefined);
  const baseLineOf = (l: DnLine) => orderOf(l)?.lines.find((x) => x.id === l.baseLineId);

  /** Re-run pricing after a change, unless the price was typed over or comes from the order. */
  const reprice = (l: DnLine, change: Partial<DnLine>) => {
    const item = itemOf(l);
    if (!item || l.baseId || !ctx.fx || l.priceSource === 'Manual') return patch(l.id, change);
    patch(l.id, { ...change, ...linePricing(item, { ...l, ...change }, so, ctx) });
  };
  const fromItem = (itemId: string, base: Partial<DnLine>) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const s = lineFromItem(item, so, ctx, m, { quantity: base.quantity ?? 1 });
    return newDnLine({ ...s, ...(base.id ? { id: base.id } : {}), baseType: '', baseId: '', baseLineId: '', baseDocNo: '', baseRow: 0 });
  };
  const invNote = (l: DnLine) => {
    const item = itemOf(l);
    return item && l.uomCode !== item.inventoryUom ? <Text variant="small" tone="muted">{dnInventoryQty(l)} {item.inventoryUom}</Text> : null;
  };

  const cols = salesCols<DnLine>({
    readOnly: ro,
    currency: draft.currency,
    fx: ctx.fx,
    invalid: (l, f) => Boolean(err(l, f)),
    qtyHeader: 'Shipped',
    qty: (l) => l.quantity,
    onQty: (l, quantity) => reprice(l, { quantity }),
    uomValue: (l) => l.uomCode,
    uomOptions: h.uomOptions,
    changeUom: (l, uomCode) => { const item = itemOf(l); reprice(l, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: item ? itemsPerUom(item, uomCode) ?? 1 : 1 }); },
    uomDisabled: (l) => Boolean(l.baseId),
    qtyNote: invNote,
    ordered: (l) => { const base = baseLineOf(l); return base ? `${base.quantity.toLocaleString('en-PH')} ${l.uomCode}` : '—'; },
    outstanding: (l) => {
      const base = baseLineOf(l);
      if (!base) return '—';
      const remaining = ctx.added ? openQty(base) : Math.max(0, openQty(base) - l.quantity);
      return `${remaining.toLocaleString('en-PH')} ${l.uomCode}`;
    },
    unitPrice: (l) => l.unitPrice,
    onUnitPrice: (l, v) => patch(l.id, { unitPrice: v, priceSource: 'Manual' }),
    discountPct: (l) => l.discountPct,
    onDiscount: (l, v) => patch(l.id, { discountPct: v, priceSource: 'Manual' }),
    priceAfterDisc: priceAfterDiscount,
    priceSourceLabel: (l) => l.priceSource || '—',
    repriceLink: (l) => (l.priceSource === 'Manual' && !l.baseId ? <>{' · '}<Link intent="primary" onClick={() => reprice({ ...l, priceSource: '' }, {})}>Reprice</Link></> : null),
    priceListValue: (l) => l.priceListId,
    changePriceList: (l, id) => reprice({ ...l, priceSource: '' }, { priceListId: id }),
    priceListWhere: (r) => isPriceListValid(r, draft.postingDate),
    priceListLocked: (l) => Boolean(l.baseId),
    lineNet: () => 0,
    warehouse: {
      options: (l) => warehouseOptions(m.inv.warehouses, l.warehouse),
      value: (l) => l.warehouse,
      onChange: (l, v) => patch(l.id, { warehouse: v }),
      invalid: (l) => Boolean(err(l, 'warehouse')),
      note: (l) => {
        const item = itemOf(l);
        if (!item) return null;
        const inWhse = item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0;
        return <Text variant="small" tone={dnInventoryQty(l) > inWhse ? 'danger' : 'muted'}>{inWhse} {item.inventoryUom} in stock</Text>;
      },
    },
    tax: {
      options: (l) => taxCodeOptions(m.tax.codes, 'Sales', l.taxCode),
      value: (l) => l.taxCode,
      onChange: (l, v) => patch(l.id, editTaxCode(v)),
      invalid: (l) => Boolean(err(l, 'taxCode')),
      note: (l) => <Text variant="small" tone="muted">Tax PHP {lc(taxOf(l))}</Text>,
      roText: (l) => `${l.taxCode} (${ctx.rateOf(l.taxCode)}%)`,
    },
    baseDoc: (l) => {
      if (!l.baseId) return null;
      const order = orderOf(l);
      return { href: `#${SO_LIST_PATH}/${order ? soNumber(order) : l.baseId}`, label: order ? soNumber(order) : l.baseDocNo, sub: `Row ${l.baseRow}` };
    },
  });

  const columns = pick(cols, [
    ['ordered', 'always'], ['qty', 'always'], ['outstanding', 'always'],
    ['warehouse', 'hide'], ['priceList', 'hide'], ['pricing', 'hide'], ['tax', 'hide'], ['baseDoc', 'hide'],
  ]);

  return {
    prefsKey: 'dn',
    columns,
    rows: lines,
    icon: 'list_alt',
    title: 'Contents',
    description: errors.lines,
    sortableKeys: ['item'],
    readOnly: ro,
    onRemove: (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) }),
    item: itemConfig(h, {
      onPick: (l, id) => { const line = id ? fromItem(id, { id: l.id, quantity: l.quantity }) : undefined; patch(l.id, line ?? { itemId: '', itemNo: '', description: '' }); },
      fromItem: (id) => fromItem(id, {}),
      canChange: (l) => !l.baseId,
      errorText: (l) => err(l, 'item'),
      addDisabled: !draft.customerId,
      addPlaceholder: draft.customerId ? 'Search items to add a line…' : 'Pick a customer to add items',
    }),
    empty: <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>No lines yet.</Text>,
    header: ro ? undefined : (
      <div className="flex justify-end px-2">
        <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!canCopy} onClick={onCopyClick}>
          Copy from sales order
        </Button>
      </div>
    ),
  };
}
