import { Text } from '@jasperlepardo/sikat-design-system';
import { type PurchDocProps } from '../../shared/PurchDoc';
import { purchCols, pick } from '../../shared/purchCols';
import { lineHelpers, itemConfig } from '../../shared/purchLineHelpers';
import { purchFooter } from '../../shared/purchChrome';
import { priceListDef, departmentDef } from '../../../settings/masterDefs';
import { isPriceListValid } from '../../../../services/priceLists';
import { itemsPerUom } from '../../../../mocks/items';
import { formatDate } from '../../../../services/dates';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { lineNet, rfqTotals } from '../../../../services/rfqs';
import { type RfqLine } from '../../../../mocks/rfqs';
import { blanketOptions, lineFromItem, linePricing, type RfqTabProps } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Builds the Purchase Quotation (RFQ) contents descriptor for the shared <PurchDoc>. */
export function rfqDoc({ draft, update, errors, m, ctx }: RfqTabProps): PurchDocProps<RfqLine> {
  const lines = draft.lines;
  const linesLocked = ctx.readOnly || ctx.added;
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = rfqTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const showFreight = getPurchasingSettings().manageFreightInDocuments;
  const h = lineHelpers<RfqLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate, uoms: m.inv.uoms });
  const { itemOf, patch, err, lineKind, uomLabel, uomOptions } = h;

  const changeUom = (l: RfqLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!itemsPerUnit) return;
    const priced = item && ctx.fx ? linePricing(item, { ...l, uomCode }, draft, ctx) : undefined;
    patch(l.id, {
      uomCode,
      uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode,
      itemsPerUnit,
      ...(priced
        ? { unitPrice: priced.unitPrice, discountPct: priced.discountPct }
        : { unitPrice: round2((l.unitPrice / (l.itemsPerUnit || 1)) * itemsPerUnit) }),
    });
  };

  const pickItem = (l: RfqLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? lineFromItem(item, draft, ctx, m, { id: l.id, quantity: l.quantity }) : { itemId: '' });
  };
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    return item ? lineFromItem(item, draft, ctx, m, { requiredDate: draft.requiredDate }) : undefined;
  };
  const changePriceList = (l: RfqLine, priceListId: string) => {
    const item = itemOf(l);
    const priced = item && ctx.fx ? linePricing(item, { ...l, priceListId }, draft, ctx) : undefined;
    patch(l.id, { priceListId, ...(priced ? { unitPrice: priced.unitPrice, discountPct: priced.discountPct } : {}) });
  };

  const taxOptions = m.tax.codes
    .filter((c) => c.direction === 'Purchase' && c.active)
    .map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));
  const ba = blanketOptions(draft.vendorId, draft.postingDate);
  const vendorOpts = m.vendors.map((v) => ({ value: v.id, label: v.name }));
  const warehouseOpts = m.inv.warehouses.filter((w) => w.active).map((w) => ({ value: w.code, label: `${w.code} ${w.name}` }));

  const priceAfterDisc = (l: RfqLine) => l.unitPrice * (1 - l.discountPct / 100);
  // Reverse-charge codes aren't paid to the vendor, so they add no tax to gross / tax-amount.
  const taxRate = (l: RfqLine) => (ctx.isReverseCharge(l.taxCode) ? 0 : ctx.rateOf(l.taxCode));
  const grossAfterDisc = (l: RfqLine) => priceAfterDisc(l) * (1 + taxRate(l) / 100);
  const taxAmount = (l: RfqLine) => round2((lineNet(l) * taxRate(l)) / 100);

  // All column rendering lives in the shared registry; PQ supplies its data/services here
  // and picks which columns + default visibility. Order mirrors the Purchase Request.
  const cols = purchCols<RfqLine>({
    patch, readOnly: linesLocked, currency: draft.currency, fx: ctx.fx,
    lineNet, priceAfterDisc, grossAfterDisc, taxAmount,
    taxOptions: () => taxOptions,
    vendorOptions: vendorOpts, warehouseOptions: warehouseOpts, blanketOptions: ba,
    uomOptions, uomLabel,
    priceListDef, priceListWhere: (r) => isPriceListValid(r, draft.postingDate), departmentDef,
    changeUom, changePriceList,
    onQty: (l, q) => patch(l.id, { quantity: q }),
    copiedQty: () => 0,
    invalid: (l, f) => Boolean(err(l, f)),
    lineKind,
  });

  const columns = pick(cols, [
    ['type', 'opt'], ['qty', 'always'], ['quotedQty', 'opt'],
    ['priceList', 'hide'], ['unitPrice', 'always'], ['discount', 'hide'], ['priceAfterDisc', 'hide'],
    ['tax', 'opt'], ['taxAmount', 'hide'], ['gross', 'hide'], ['total', 'always'],
    ['requiredDate', 'hide'], ['quotedDate', 'hide'], ['uomName', 'hide'], ['itemsPerUnit', 'hide'],
    ['vendor', 'hide'], ['warehouse', 'hide'], ['department', 'hide'], ['freeText', 'hide'],
    ['blanket', 'hide'], ['requisition', 'hide'], ['returnReason', 'hide'],
    ['name', 'hide'], ['bpCatalogNo', 'hide'], ['mfrNo', 'hide'], ['deliveryDate', 'hide'],
    ['openQty', 'hide'], ['receivedQty', 'hide'], ['packages', 'hide'],
  ]);

  return {
    prefsKey: 'rfq',
    columns,
    rows: lines,
    icon: 'format_list_bulleted',
    title: 'Lines',
    // All columns are unsortable on the quotation lines table.
    sortableKeys: [],
    readOnly: linesLocked,
    onRemove: (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) }),
    item: itemConfig(h, {
      onPick: (l, id) => { if (id) pickItem(l, id); else patch(l.id, { itemId: '', itemNo: '', description: '' }); },
      fromItem,
    }),
    empty: <Text variant="small" tone="muted">No lines — search above to add items.</Text>,
    footer: purchFooter({
      totals,
      currency: draft.currency,
      readOnly: linesLocked,
      discount: { value: draft.discountPct, onChange: (d) => update({ discountPct: d }) },
      freight: { value: draft.freight, onChange: (v) => update({ freight: v }), show: showFreight },
      fx: draft.currency !== 'PHP' && ctx.fx ? { rate: ctx.fx, source: formatDate(ctx.fxDate) } : undefined,
    }),
  };
}
