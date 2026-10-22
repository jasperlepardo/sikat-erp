import { Combobox, Radio, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { type PurchDocProps } from '../../shared/PurchDoc';
import { purchCols, pick } from '../../shared/purchCols';
import { lineHelpers, itemConfig } from '../../shared/purchLineHelpers';
import { departmentDef, priceListDef } from '../../../settings/masterDefs';
import { isPriceListValid } from '../../../../services/priceLists';
import {
  BLANKET_AGREEMENTS,
  PRICE_MODES,
  newPoLine,
  type PoLine,
  type PriceMode,
} from '../../../../mocks/purchaseOrders';
import { itemsPerUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import { formatDate } from '../../../../services/dates';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { getPurchasingSettings, grossPrice, inventoryQty, lineNet, poTotals, poWithholding, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { linePricing, lineFromItem, viewCurrency, type PoTabProps } from './types';
import { PurchTotalsFooter, PurchTotalNote, PurchTotalRow } from '../../shared/PurchTotalsFooter';

const round2 = (n: number) => Math.round(n * 100) / 100;

const WITHHELD_LABEL: Record<string, string> = {
  'Expanded (EWT)': 'EWT',
  'Final (FWT)': 'Final tax',
  'Withholding VAT': 'VAT',
  'Percentage tax': 'Percentage tax',
};

/** Builds the Purchase Order contents descriptor for the shared <PurchDoc>. */
export function poDoc({ draft, update, errors, m, ctx }: PoTabProps): PurchDocProps<PoLine> {
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

  const taxRate = (l: PoLine) => ctx.rateOf(l.taxCode);

  const taxOptions = m.tax.codes
    .filter((c) => c.direction === 'Purchase' && c.active)
    .map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));
  const blanketOptions = [
    { value: '', label: '— None —' },
    ...BLANKET_AGREEMENTS.filter((b) => b.vendorId === draft.vendorId && b.validTo >= draft.postingDate).map((b) => ({
      value: b.no,
      label: `${b.no} · ${b.description}`,
    })),
  ];

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
    patch, readOnly: linesLocked, currency: draft.currency, fx: ctx.fx,
    lineNet,
    unitPriceHeader: 'Unit price',
    priceAfterDisc: priceAfterDiscount,
    grossAfterDisc: (l) => priceAfterDiscount(l) * (1 + taxRate(l) / 100),
    taxAmount: (l) => round2((lineNet(l) * taxRate(l)) / 100),
    grossPrice: priceModeOn ? {
      showNet: draft.priceMode !== 'Gross',
      showGross: draft.priceMode !== 'Net',
      get: (l) => round2(grossPrice(l, taxRate(l))),
      onChange: (l, g) => patch(l.id, { unitPrice: round2(g / (1 + taxRate(l) / 100)) }),
    } : undefined,
    taxOptions: () => taxOptions,
    vendorOptions: [],
    warehouseOptions: m.inv.warehouses.filter((w) => receivesFromVendors(w)).map((w) => ({ value: w.code, label: `${w.code} ${w.name}` })),
    blanketOptions,
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
    ['type', 'hide'], ['qty', 'always'],
    ['uomName', 'hide'], ['itemsPerUnit', 'hide'], ['inventoryUom', 'hide'], ['inventoryQty', 'hide'],
    ['warehouse', 'hide'], ['priceList', 'hide'],
    ['unitPrice', 'always'], ['discount', 'opt'], ['priceAfterDisc', 'hide'],
    ['tax', 'hide'], ['taxAmount', 'hide'], ['gross', 'hide'], ['total', 'always'], ['grossTotalLc', 'hide'],
    ['deliveryDate', 'opt'], ['lineStatus', 'opt'], ['blanket', 'hide'],
    ['bpCatalogNo', 'hide'], ['mfrNo', 'hide'], ['requisition', 'hide'],
    ['department', 'hide'], ['freeText', 'hide'], ['returnReason', 'hide'],
  ]);

  return {
    prefsKey: 'po',
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
              className="w-28"
              options={m.tax.codes.filter((c) => c.direction === 'Purchase' && c.active).map((c) => ({ value: c.code, label: c.code }))}
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
