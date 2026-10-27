import { Button, Icon, Text } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../../components/form/docLines/DocLines';
import { pick } from '../../../../../components/form/docLines/pick';
import { salesCols } from '../../../shared/salesCols';
import { lineHelpers, itemConfig } from '../../../shared/salesLineHelpers';
import { itemsPerUom } from '../../../../../mocks/items';
import { newArCmLine, type ArCmLine } from '../../../../../mocks/arCreditMemos';
import { formatAmount } from '../../../../../services/format';
import { round2 } from '../../../../../services/num';
import { lineNet, lineTax, priceAfterDiscount } from '../../../../../services/salesOrders';
import { warehouseOptions } from '../../../../inventory/transfers/TransferLines';
import { editTaxCode } from '../../../../../services/taxRecalc';
import { taxCodeOptions } from '../../../../../services/taxCodeOptions';
import { AR_LIST_PATH, SR_LIST_PATH } from '../../../paths';
import { asSoDraft, type DnDraft } from '../../../deliveries/detail/types';
import { lineFromItem, type SoMasters } from '../../../sales-orders/detail/types';
import type { ArCmSectionProps } from '../../types';

/** Props arCmDoc needs beyond the section spread: the Copy-from-invoice toolbar lives here, its panel in the wrapper. */
export interface ArCmDocProps extends ArCmSectionProps {
  onCopyClick: () => void;
  canCopy: boolean;
}

/** Builds the A/R Credit Memo contents descriptor for the shared <DocLines>. */
export function arCmDoc({ draft, update, errors, m, ctx, onCopyClick, canCopy }: ArCmDocProps): DocLinesProps<ArCmLine> {
  const lines = draft.lines;
  const ro = ctx.readOnly;
  const h = lineHelpers<ArCmLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate });
  const { itemOf, patch, err } = h;
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const taxOf = (l: ArCmLine) => lineTax(l, ctx.rateOf(l.taxCode), 0);

  const fromItem = (itemId: string, base: Partial<ArCmLine>) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const s = lineFromItem(item, asSoDraft(draft as unknown as DnDraft), ctx, m as unknown as SoMasters, { quantity: base.quantity ?? 1 });
    return newArCmLine({
      ...(base.id ? { id: base.id } : {}),
      itemId: s.itemId, itemNo: s.itemNo, description: s.description, quantity: s.quantity,
      uomCode: s.uomCode, uomName: s.uomName, itemsPerUnit: s.itemsPerUnit, warehouse: s.warehouse,
      priceListId: s.priceListId, unitPrice: s.unitPrice, discountPct: s.discountPct,
      priceSource: s.priceSource, taxCode: s.taxCode, taxOverridden: false, returnGoods: item.inventoryItem,
    });
  };

  const cols = salesCols<ArCmLine>({
    readOnly: ro,
    currency: draft.currency,
    fx: ctx.fx,
    invalid: (l, f) => Boolean(err(l, f)),
    lineKind: (l) => { const it = itemOf(l); return it ? (it.inventoryItem ? 'Item' : 'Service') : ''; },
    itemName: (l) => itemOf(l)?.name ?? '',
    taxAmount: taxOf,
    qty: (l) => l.quantity,
    onQty: (l, quantity) => patch(l.id, { quantity }),
    uomValue: (l) => l.uomCode,
    uomOptions: h.uomOptions,
    changeUom: (l, uomCode) => { const item = itemOf(l); patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: item ? itemsPerUom(item, uomCode) ?? 1 : 1 }); },
    uomDisabled: (l) => Boolean(l.baseId),
    qtyNote: (l) => (ro ? null : <Text variant="small" tone="muted">{l.uomCode}</Text>),
    unitPrice: (l) => l.unitPrice,
    onUnitPrice: (l, v) => patch(l.id, { unitPrice: v, priceSource: 'Manual' }),
    discountPct: (l) => l.discountPct,
    onDiscount: (l, v) => patch(l.id, { discountPct: v, priceSource: 'Manual' }),
    priceAfterDisc: priceAfterDiscount,
    priceSourceLabel: (l) => l.priceSource || '—',
    gross: {
      get: (l) => round2(l.unitPrice * (1 - l.discountPct / 100) * (1 + ctx.rateOf(l.taxCode) / 100)),
      onChange: (l, g) => { const netp = g / (1 + ctx.rateOf(l.taxCode) / 100); patch(l.id, { unitPrice: round2(l.discountPct < 100 ? netp / (1 - l.discountPct / 100) : netp), priceSource: 'Manual' }); },
    },
    priceListValue: (l) => l.priceListId,
    changePriceList: (l, id) => patch(l.id, { priceListId: id }),
    lineNet,
    stockPutBack: {
      show: (l) => Boolean(itemOf(l)),
      notStocked: (l) => !itemOf(l)?.inventoryItem,
      checked: (l) => l.returnGoods,
      onChange: (l, on) => patch(l.id, { returnGoods: on }),
    },
    warehouse: {
      header: 'Returns to',
      blank: (l) => (!itemOf(l)?.inventoryItem || !l.returnGoods ? <Text variant="small" tone="muted">—</Text> : undefined),
      options: (l) => warehouseOptions(m.inv.warehouses, l.warehouse),
      value: (l) => l.warehouse,
      onChange: (l, v) => patch(l.id, { warehouse: v }),
      invalid: (l) => Boolean(err(l, 'warehouse')),
    },
    tax: {
      options: (l) => taxCodeOptions(m.tax.codes, 'Sales', l.taxCode),
      value: (l) => l.taxCode,
      onChange: (l, v) => patch(l.id, editTaxCode(v)),
      invalid: (l) => Boolean(err(l, 'taxCode')),
      note: (l) => <Text variant="small" tone="muted">Tax PHP {lc(taxOf(l))}</Text>,
      roText: (l) => `${l.taxCode} (${ctx.rateOf(l.taxCode)}%)`,
    },
    returnReason: { value: (l) => l.returnReason, onChange: (l, v) => patch(l.id, { returnReason: v }) },
    baseDoc: (l) => {
      if (!l.baseId) return null;
      const path = l.baseType === 'SRT' ? SR_LIST_PATH : AR_LIST_PATH;
      return { href: `#${path}/${l.baseId}`, label: l.baseDocNo, sub: `${l.baseType === 'SRT' ? 'Sales return' : 'A/R invoice'}${l.baseRow ? ` · row ${l.baseRow}` : ''}` };
    },
  });

  const columns = pick(cols, [
    ['qty', 'always'], ['stockPutBack', 'always'], ['warehouse', 'hide'], ['pricing', 'always'], ['gross', 'hide'],
    ['tax', 'hide'], ['total', 'always'], ['returnReason', 'hide'], ['baseDoc', 'hide'],
    // Info / catalog columns (hidden).
    ['type', 'hide'], ['name', 'hide'], ['uomName', 'hide'], ['itemsPerUnit', 'hide'], ['inventoryUom', 'hide'],
    ['priceSource', 'hide'], ['priceAfterDisc', 'hide'], ['taxAmount', 'hide'], ['grossTotalLc', 'hide'],
    // SAP workbook long-tail / UDF placeholders (hidden) — row-for-row parity.
    ['summaryType', 'hide'], ['rowNo', 'hide'], ['distrRule', 'hide'], ['cogsDistrRule', 'hide'],
    ['blanketAgreementNo', 'hide'], ['allowProcmnt', 'hide'], ['warranty', 'hide'], ['serialNo', 'hide'],
    ['unitCostPrice', 'hide'], ['priceForReport', 'hide'], ['customerDescription', 'hide'], ['amountInPrintout', 'hide'],
    ['moveRow', 'hide'], ['wWTCode', 'hide'], ['wVTVendor', 'hide'], ['wTaxDefined', 'hide'], ['wtaxRate', 'hide'],
    ['xSupplierName', 'hide'], ['xAddress', 'hide'], ['xTINumber', 'hide'], ['xCardType', 'hide'], ['countryOfOrigin', 'hide'],
    ['standardItemId', 'hide'], ['commodityClass', 'hide'], ['binAllocation', 'hide'],
  ]);

  return {
    prefsKey: 'arcm',
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
          Copy from invoice
        </Button>
      </div>
    ),
  };
}
