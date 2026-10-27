import { Link, Text } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../components/form/docLines/DocLines';
import { pick } from '../../../../components/form/docLines/pick';
import { salesCols } from '../../shared/salesCols';
import { lineHelpers, itemConfig } from '../../shared/salesLineHelpers';
import { itemsPerUom } from '../../../../mocks/items';
import type { QuoteLine } from '../../../../mocks/quotations';
import { lineNet } from '../../../../services/quotations';
import { lineTax, priceAfterDiscount } from '../../../../services/salesOrders';
import { isPriceListValid } from '../../../../services/priceLists';
import { formatAmount } from '../../../../services/format';
import { editTaxCode } from '../../../../services/taxRecalc';
import { taxCodeOptions } from '../../../../services/taxCodeOptions';
import { lineFromItem, linePricing, type QtTabProps } from './types';

/** Builds the Sales Quotation contents descriptor for the shared <DocLines>. */
export function qtDoc({ draft, update, errors, m, ctx }: QtTabProps): DocLinesProps<QuoteLine> {
  const lines = draft.lines;
  const linesLocked = ctx.readOnly || ctx.added;
  const h = lineHelpers<QuoteLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate });
  const { itemOf, patch, err } = h;

  const priced = (l: QuoteLine, next: QuoteLine) =>
    linePricing(itemOf(l)!, next, draft, m.customers, ctx.vatRegistered, ctx.rateOf, ctx.fx);

  /** Re-run pricing after a change, unless the price was typed over. */
  const reprice = (l: QuoteLine, change: Partial<QuoteLine>) => {
    const item = itemOf(l);
    if (!item || !ctx.fx || l.priceSource === 'Manual') return patch(l.id, change);
    patch(l.id, { ...change, ...priced(l, { ...l, ...change }) });
  };
  const changeUom = (l: QuoteLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!itemsPerUnit) return;
    reprice(l, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit });
  };
  const changePriceList = (l: QuoteLine, priceListId: string) => {
    const item = itemOf(l);
    patch(l.id, { priceListId, ...(item && ctx.fx ? priced(l, { ...l, priceListId }) : {}) });
  };

  const cols = salesCols<QuoteLine>({
    readOnly: linesLocked,
    currency: draft.currency,
    fx: ctx.fx,
    invalid: (l, f) => Boolean(err(l, f)),
    qty: (l) => l.quantity,
    onQty: (l, quantity) => reprice(l, { quantity }),
    uomValue: (l) => l.uomCode,
    uomOptions: h.uomOptions,
    changeUom,
    unitPrice: (l) => l.unitPrice,
    onUnitPrice: (l, v) => patch(l.id, { unitPrice: v, priceSource: 'Manual' }),
    discountPct: (l) => l.discountPct,
    onDiscount: (l, v) => patch(l.id, { discountPct: v, priceSource: 'Manual' }),
    priceAfterDisc: priceAfterDiscount,
    repriceLink: (l) => (l.priceSource === 'Manual' ? <Link intent="primary" onClick={() => reprice({ ...l, priceSource: '' }, {})}>Reprice</Link> : null),
    priceListValue: (l) => l.priceListId,
    changePriceList,
    priceListWhere: (r) => isPriceListValid(r, draft.postingDate),
    lineNet,
    tax: {
      options: (l) => taxCodeOptions(m.tax.codes, 'Sales', l.taxCode),
      value: (l) => l.taxCode,
      onChange: (l, v) => reprice(l, editTaxCode(v)),
      invalid: (l) => Boolean(err(l, 'taxCode')),
      note: (l) => <Text variant="small" tone="muted">Tax PHP {formatAmount(lineTax(l, ctx.rateOf(l.taxCode), 0) * ctx.fx)}</Text>,
      roText: (l) => `${l.taxCode} (${ctx.rateOf(l.taxCode)}%)`,
    },
    lineKind: (l) => { const it = itemOf(l); return it ? (it.inventoryItem ? 'Item' : 'Service') : ''; },
    taxAmount: (l) => lineTax(l, ctx.rateOf(l.taxCode), 0),
  });

  const columns = pick(cols, [
    ['qty', 'always'], ['priceList', 'hide'], ['unitPrice', 'always'], ['discount', 'always'], ['tax', 'opt'], ['total', 'always'],
    // Info / catalog columns (hidden).
    ['type', 'hide'], ['uomName', 'hide'], ['itemsPerUnit', 'hide'],
    ['priceSource', 'hide'], ['priceAfterDisc', 'hide'], ['taxAmount', 'hide'], ['grossTotalLc', 'hide'],
    ['countryOfOrigin', 'hide'],
  ]);

  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    return item ? lineFromItem(item, draft, ctx, m) : undefined;
  };

  return {
    prefsKey: 'qt',
    columns,
    rows: lines,
    icon: 'list_alt',
    title: 'Contents',
    description: errors.lines,
    sortableKeys: ['item'],
    readOnly: linesLocked,
    onRemove: (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) }),
    item: itemConfig(h, {
      onPick: (l, id) => {
        const item = id ? m.items.find((i) => i.id === id) : undefined;
        patch(l.id, item ? lineFromItem(item, draft, ctx, m, { id: l.id, quantity: l.quantity }) : { itemId: '', itemNo: '', description: '' });
      },
      fromItem,
      errorText: (l) => err(l, 'item'),
    }),
    empty: <Text variant="small" tone="muted">No lines yet — search above to add one.</Text>,
  };
}
