import { Combobox, Radio, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../components/form/docLines/DocLines';
import { purchCols, pick } from '../../shared/purchCols';
import { costAccountOptions, lineHelpers, lineGlAccount, itemConfig } from '../../shared/purchLineHelpers';
import { countryDef, departmentDef, priceListDef, warrantyTemplateDef } from '../../../settings/masterDefs';
import { isPriceListValid } from '../../../../services/priceLists';
import {
  PRICE_MODES,
  newPoLine,
  type PoLine,
  type PriceMode,
} from '../../../../mocks/purchaseOrders';
import { itemsPerUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import { formatDate } from '../../../../services/dates';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { getPurchasingSettings, grossPrice, inventoryQty, lineNet, poTotals, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { poWithholding } from '../../../../services/withholding';
import { linePricing, lineFromItem, viewCurrency, type PoTabProps } from './types';
import { PurchTotalsFooter, PurchTotalNote, PurchTotalRow } from '../../shared/PurchTotalsFooter';
import { taxCodeOptions } from '../../../../services/taxCodeOptions';
import { round2 } from '../../../../services/num';

const WITHHELD_LABEL: Record<string, string> = {
  'Expanded (EWT)': 'EWT',
  'Final (FWT)': 'Final tax',
  'Withholding VAT': 'VAT',
  'Percentage tax': 'Percentage tax',
};

/** Builds the Purchase Order contents descriptor for the shared <DocLines>. */
export function poDoc({ draft, update, errors, m, ctx }: PoTabProps): DocLinesProps<PoLine> {
  const lines = draft.lines;
  const linesLocked = ctx.readOnly || ctx.added;
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = poTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const withholdingLines = poWithholding(draft, ctx.vendor, m.items, m.tax, draft.postingDate);
  const withholdingTotal = withholdingLines.filter((w) => w.deducted).reduce((s, w) => s + w.amount, 0);
  const view = viewCurrency(draft, ctx, m);
  const showFreight = getPurchasingSettings().manageFreightInDocuments;
  const showRounding = getPurchasingSettings().roundingMethod === 'By Currency';
  const priceModeOn = getPurchasingSettings().separateNetGrossPriceMode;
  const vTotals = {
    beforeDiscount: view.convert(totals.beforeDiscount),
    discount: view.convert(totals.discount),
    freight: view.convert(totals.freight),
    rounding: view.convert(totals.rounding),
    tax: view.convert(totals.tax),
    total: view.convert(totals.total),
    reverseCharge: totals.reverseCharge ? view.convert(totals.reverseCharge) : undefined,
  };
  const h = lineHelpers<PoLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate, uoms: m.inv.uoms });
  const { itemOf, patch, err, lineKind, uomLabel, uomOptions } = h;

  const changeUom = (l: PoLine, uomCode: string) => {
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

  // Reverse-charge codes aren't paid to the vendor, so they add no tax to gross / tax-amount.
  const taxRate = (l: PoLine) => (ctx.isReverseCharge(l.taxCode) ? 0 : ctx.rateOf(l.taxCode));
  const reverseChargeVat = (l: PoLine) => (ctx.isReverseCharge(l.taxCode) ? round2((lineNet(l) * ctx.rateOf(l.taxCode)) / 100) : null);

  const taxOptions = (current: string) => taxCodeOptions(m.tax.codes, 'Purchase', current);

  const pickItem = (l: PoLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? lineFromItem(item, draft, ctx, m, { id: l.id, quantity: l.quantity, deliveryDate: l.deliveryDate || draft.deliveryDate }) : { itemId: '' });
  };
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const blank = newPoLine({ deliveryDate: draft.deliveryDate, warehouse: '' });
    return { ...blank, ...lineFromItem(item, draft, ctx, m, { id: blank.id, quantity: 1, deliveryDate: draft.deliveryDate, warehouse: '' }) } as PoLine;
  };
  const changePriceList = (l: PoLine, priceListId: string) => {
    const item = itemOf(l);
    const priced = item && ctx.fx ? linePricing(item, { ...l, priceListId }, draft, ctx) : undefined;
    patch(l.id, { priceListId, ...(priced ? { unitPrice: priced.unitPrice, discountPct: priced.discountPct } : {}) });
  };
  const changeQuantity = (l: PoLine, quantity: number) => {
    const item = itemOf(l);
    const p = item && linePricing(item, { ...l, quantity }, draft, ctx);
    patch(l.id, { quantity, ...(p ? { discountPct: p.discountPct, ...(p.source.kind === 'special' && ctx.fx ? { unitPrice: p.unitPrice } : {}) } : {}) });
  };

  // The per-field rendering lives in the shared registry; PO supplies its data/services
  // here and picks which columns + default visibility. Order mirrors PR / PQ.
  const cols = purchCols<PoLine>({
    patch, readOnly: linesLocked, currency: draft.currency, qtyHeader: 'Ordered qty',
    countryDef,
    warrantyDef: warrantyTemplateDef,
    itemWarranty: (l) => itemOf(l)?.warrantyTemplate ?? '',
    unitCost: (l) => itemOf(l)?.itemCost ?? 0,
    glAccountOf: (l) => lineGlAccount(itemOf(l), l, m.inv),
    glAccountOptions: (l) => costAccountOptions(m.inv.accounts, l.glAccount),
    lineNet,
    priceAfterDisc: priceAfterDiscount,
    grossAfterDisc: (l) => priceAfterDiscount(l) * (1 + taxRate(l) / 100),
    taxAmount: (l) => round2((lineNet(l) * taxRate(l)) / 100),
    reverseChargeVat,
    grossPrice: priceModeOn ? {
      showNet: draft.priceMode !== 'Gross',
      showGross: draft.priceMode !== 'Net',
      get: (l) => round2(grossPrice(l, taxRate(l))),
      onChange: (l, g) => patch(l.id, { unitPrice: round2(g / (1 + taxRate(l) / 100)) }),
    } : undefined,
    taxOptions: (l) => taxOptions(l.taxCode),
    vendorOptions: [],
    vendorOf: (l) => m.vendors.find((v) => v.id === (l.lineVendorId || draft.vendorId)),
    warehouseOptions: m.inv.warehouses.filter((w) => receivesFromVendors(w)).map((w) => ({ value: w.code, label: `${w.code} ${w.name}` })),
    blanketScope: { vendorId: draft.vendorId, date: draft.postingDate },
    uomOptions, uomLabel,
    priceListDef, priceListWhere: (r) => isPriceListValid(r, draft.postingDate), departmentDef,
    changeUom, changePriceList,
    onQty: changeQuantity,
    // Received qty locks the UoM and floors the order quantity.
    copiedQty: (l) => l.receivedQty ?? 0,
    invalid: (l, f) => Boolean(err(l, f)),
    lineKind,
    inventoryQty,
  });

  const columns = pick(cols, [
    // Shown by default: the SAP B1 v10 Contents fields, in its order.
    ['type', 'opt'], ['vendor', 'opt'], ['deliveryDate', 'opt'], ['qty', 'always'], ['unitPrice', 'always'],
    ['discount', 'opt'], ['tax', 'opt'], ['total', 'always'], ['glAccount', 'opt'], ['countryOfOrigin', 'opt'],
    ['warranty', 'opt'], ['unitCost', 'opt'],
    // Everything else, in the column chooser.
    ['uomName', 'hide'], ['itemsPerUnit', 'hide'], ['inventoryQty', 'hide'], ['warehouse', 'hide'], ['priceList', 'hide'],
    ['priceAfterDisc', 'hide'], ['taxAmount', 'hide'], ['reverseChargeVat', 'hide'], ['gross', 'hide'], ['grossTotalLc', 'hide'],
    ['lineStatus', 'hide'], ['blanket', 'hide'], ['bpCatalogNo', 'hide'], ['mfrNo', 'hide'], ['requisition', 'hide'],
    ['department', 'hide'], ['freeText', 'hide'],
  ]);

  return {
    prefsKey: 'po',
    cardHeader: true,
    columns,
    rows: lines,
    icon: 'list_alt',
    title: 'Contents',
    description: errors.lines ?? `Items to order, in the purchasing unit. Prices are in ${draft.currency}${draft.currency === 'PHP' ? '' : `; totals in PHP at ${ctx.fx ? `${ctx.fx} (${ctx.fxSource}, ${formatDate(ctx.fxDate)})` : '—'}`}.`,
    sortableKeys: ['item'],
    sortValue: (l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof PoLine] ?? '')).toLowerCase(),
    readOnly: linesLocked,
    onRemove: (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) }),
    item: itemConfig(h, {
      resolve: (l) => { const it = itemOf(l); return it ? { itemNo: it.itemNo, name: l.name || it.name } : null; },
      onPick: (l, id) => { if (id) pickItem(l, id); else patch(l.id, { itemId: '', itemNo: '', name: '', description: '' }); },
      fromItem,
      hint: (l) => (l.bpCatalogNo ? <Text variant="small" tone="muted">Vendor catalog no. {l.bpCatalogNo}</Text> : null),
      addDisabled: !draft.vendorId,
      addPlaceholder: draft.vendorId ? 'Search items to add a line…' : 'Pick a vendor to add items',
    }),
    empty: (
      <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
        {draft.vendorId ? 'No lines yet. Search above to add one.' : 'Pick a vendor first, then add lines.'}
      </Text>
    ),
    header: priceModeOn && !linesLocked ? (
      <div className="flex flex-wrap items-center gap-6 px-2" role="radiogroup" aria-label="Price mode">
        <Text variant="small" tone="muted">Price mode</Text>
        {PRICE_MODES.map((mode: PriceMode) => (
          <Radio key={mode} name="po-price-mode" checked={draft.priceMode === mode} onChange={() => update({ priceMode: mode })}>
            {mode}
          </Radio>
        ))}
        <Text variant="small" tone="muted">
          {draft.priceMode === 'Net'
            ? 'Enter net prices; gross is calculated.'
            : draft.priceMode === 'Gross'
              ? 'Enter prices including tax; net is calculated.'
              : 'Edit either price; the other follows.'}
        </Text>
      </div>
    ) : undefined,
    footer: (
      <PurchTotalsFooter
        totals={vTotals}
        currency={view.code}
        readOnly={linesLocked}
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
              className="w-48"
              options={taxCodeOptions(m.tax.codes, 'Purchase', draft.freightTaxCode)}
              value={draft.freightTaxCode}
              onValueChange={(freightTaxCode) => update({ freightTaxCode: freightTaxCode ?? '' })}
            />
          </div>
        ) : undefined}
        roundingLabel={showRounding ? `Rounding (${docCurrency?.rounding ?? 'No rounding'})` : undefined}
        extraRows={<>
          {withholdingLines.filter((w) => w.deducted).map((w) => (
            <PurchTotalRow
              key={w.atc}
              label={`${WITHHELD_LABEL[w.kind] ?? 'Tax'} withheld — ${w.atc} (${w.rate}%)`}
              value={-view.convert(w.amount)}
              code={view.code}
            />
          ))}
          {withholdingLines.filter((w) => !w.deducted).map((w) => (
            <PurchTotalNote key={w.atc}>
              VAT withheld — {w.atc} ({w.rate}%): {view.code} {formatAmount(view.convert(w.amount))} remitted by you on BIR 1600-VT, not deducted from the vendor.
            </PurchTotalNote>
          ))}
          <PurchTotalRow label="Net payment due" value={view.convert(totals.total - withholdingTotal)} code={view.code} strong />
          {draft.currency !== 'PHP' && draft.currencyView === 'BP' && ctx.fx ? (
            <PurchTotalNote>
              ≈ PHP {formatAmount(totals.total * ctx.fx)} at {ctx.fx} ({formatDate(ctx.fxDate)} rate).
            </PurchTotalNote>
          ) : null}
        </>}
      />
    ),
  };
}
