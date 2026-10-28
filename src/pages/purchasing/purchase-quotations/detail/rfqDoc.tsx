import { Text } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../components/form/docLines/DocLines';
import { purchCols, pick } from '../../shared/purchCols';
import { costAccountOptions, lineHelpers, lineGlAccount, itemConfig, itemVendorOptions } from '../../shared/purchLineHelpers';
import { purchFooter } from '../../shared/purchChrome';
import { countryDef, priceListDef, departmentDef, warrantyTemplateDef } from '../../../settings/masterDefs';
import { isPriceListValid } from '../../../../services/priceLists';
import { itemsPerUom } from '../../../../mocks/items';
import { formatDate } from '../../../../services/dates';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { lineNet, rfqTotals } from '../../../../services/rfqs';
import { type RfqLine } from '../../../../mocks/rfqs';
import { lineFromItem, linePricing, type RfqTabProps } from './types';
import { taxCodeOptions } from '../../../../services/taxCodeOptions';
import { round2 } from '../../../../services/num';
import { CurrencyToggle, amountsIn, currencyChoices } from '../../shared/CurrencyToggle';
import { RFQ_LINE_LAYOUT } from '../../shared/rfqLineLayout';
import { orderedByRfqLine } from '../../shared/poFromRfq';

/**
 * Builds the Purchase Quotation (RFQ) contents descriptor for the shared <DocLines>.
 * `view` is the currency the amounts are shown in ('' = the document's own).
 */
export function rfqDoc(
  { draft, update, errors, m, ctx }: RfqTabProps,
  view: { value: string; onChange: (code: string) => void } = { value: '', onChange: () => {} },
): DocLinesProps<RfqLine> {
  const choices = currencyChoices(draft.currency);
  // Until switched, show the vendor's currency (the document's own for a multi-currency vendor).
  const vendorCurrency = ctx.vendor?.currency ?? '';
  const shown = choices.includes(view.value) ? view.value : choices.includes(vendorCurrency) ? vendorCurrency : draft.currency;
  const conv = amountsIn(shown, draft.currency, ctx.fx, m.rates, draft.postingDate);
  const converted = shown !== draft.currency;
  // Another currency is a view of the amounts: the prices stay in the document's, so it's read-only.
  const lines = converted ? draft.lines.map((l) => ({ ...l, unitPrice: l.unitPrice * conv.factor })) : draft.lines;
  const linesLocked = ctx.readOnly || ctx.added || converted;
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const docTotals = rfqTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const totals = converted
    ? {
        ...docTotals,
        beforeDiscount: docTotals.beforeDiscount * conv.factor, discount: docTotals.discount * conv.factor,
        freight: docTotals.freight * conv.factor, rounding: docTotals.rounding * conv.factor, tax: docTotals.tax * conv.factor,
        total: docTotals.total * conv.factor, reverseCharge: docTotals.reverseCharge * conv.factor,
      }
    : docTotals;
  const showFreight = getPurchasingSettings().manageFreightInDocuments;
  const ordered = orderedByRfqLine(m.pos, draft);
  const h = lineHelpers<RfqLine>({ items: m.items, lines: draft.lines, update, errors, postingDate: draft.postingDate, uoms: m.inv.uoms });
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

  const taxOptions = (current: string) => taxCodeOptions(m.tax.codes, 'Purchase', current);
  // Active warehouses, and any a line already uses (one list for every row).
  const warehouseOpts = m.inv.warehouses.filter((w) => w.active || draft.lines.some((l) => l.warehouse === w.code)).map((w) => ({ value: w.code, label: `${w.code} ${w.name}` }));

  const priceAfterDisc = (l: RfqLine) => l.unitPrice * (1 - l.discountPct / 100);
  // Reverse-charge codes aren't paid to the vendor, so they add no tax to gross / tax-amount.
  const taxRate = (l: RfqLine) => (ctx.isReverseCharge(l.taxCode) ? 0 : ctx.rateOf(l.taxCode));
  const grossAfterDisc = (l: RfqLine) => priceAfterDisc(l) * (1 + taxRate(l) / 100);
  const taxAmount = (l: RfqLine) => round2((lineNet(l) * taxRate(l)) / 100);
  // The self-assessed VAT the buyer remits on a reverse-charge line (not billed by the vendor).
  const reverseChargeVat = (l: RfqLine) => (ctx.isReverseCharge(l.taxCode) ? round2((lineNet(l) * ctx.rateOf(l.taxCode)) / 100) : null);

  // All column rendering lives in the shared registry; PQ supplies its data/services here
  // and picks which columns + default visibility. Order mirrors the Purchase Request.
  const cols = purchCols<RfqLine>({
    patch, readOnly: linesLocked, currency: conv.code, qtyHeader: 'Required qty', priceHeader: 'Info price',
    glAccountOf: (l) => lineGlAccount(itemOf(l), l, m.inv),
    glAccountOptions: (l) => costAccountOptions(m.inv.accounts, l.glAccount),
    lineNet, priceAfterDisc, grossAfterDisc, taxAmount, reverseChargeVat,
    taxOptions: (l) => taxOptions(l.taxCode),
    vendorOptions: (l) => itemVendorOptions(itemOf(l), m.vendors, l.lineVendorId, draft.vendorId), warehouseOptions: warehouseOpts, blanketScope: { vendorId: draft.vendorId, date: draft.postingDate },
    vendorOf: (l) => m.vendors.find((v) => v.id === (l.lineVendorId || draft.vendorId)),
    uomOptions, uomLabel,
    priceListDef, priceListWhere: (r) => isPriceListValid(r, draft.postingDate), departmentDef,
    changeUom, changePriceList,
    onQty: (l, q) => patch(l.id, { quantity: q }),
    copiedQty: () => 0,
    orderedQtyOf: (l) => ordered.get(l.id) ?? 0,
    invalid: (l, f) => Boolean(err(l, f)),
    lineKind,
    countryDef,
    warrantyDef: warrantyTemplateDef,
    itemWarranty: (l) => itemOf(l)?.warrantyTemplate ?? '',
    unitCost: (l) => itemOf(l)?.itemCost ?? 0,
  });

  const columns = pick(cols, RFQ_LINE_LAYOUT);

  return {
    prefsKey: 'rfq',
    cardHeader: true,
    columns,
    rows: lines,
    icon: 'format_list_bulleted',
    title: 'Lines',
    actions: <CurrencyToggle choices={choices} value={shown} onChange={view.onChange} />,
    description: converted
      ? conv.factor
        ? `Shown in ${conv.code} at the ${formatDate(conv.rate?.date ?? ctx.fxDate)} rate. Switch to ${draft.currency} to edit.`
        : `No ${conv.code} rate on or before ${formatDate(draft.postingDate)}.`
      : undefined,
    // All columns are unsortable on the quotation lines table.
    sortableKeys: [],
    readOnly: linesLocked,
    onRemove: (picked) => update({ lines: draft.lines.filter((l) => !picked.some((p) => p.id === l.id)) }),
    item: itemConfig(h, {
      onPick: (l, id) => { if (id) pickItem(l, id); else patch(l.id, { itemId: '', itemNo: '', description: '' }); },
      fromItem,
    }),
    empty: <Text variant="small" tone="muted">No lines — search above to add items.</Text>,
    footer: purchFooter({
      totals,
      currency: conv.code,
      readOnly: linesLocked,
      discount: { value: draft.discountPct, onChange: (d) => update({ discountPct: d }) },
      freight: { value: draft.freight, onChange: (v) => update({ freight: v }), show: showFreight },
      fx: !converted && draft.currency !== 'PHP' && ctx.fx ? { rate: ctx.fx, source: formatDate(ctx.fxDate) } : undefined,
    }),
  };
}
