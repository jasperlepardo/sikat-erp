import { Button, Combobox, Icon, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../components/form/docLines/DocLines';
import { purchCols, pick } from '../../shared/purchCols';
import { costAccountOptions, lineHelpers, lineGlAccount, itemConfig } from '../../shared/purchLineHelpers';
import { departmentDef, priceListDef, countryDef, warrantyTemplateDef } from '../../../settings/masterDefs';
import { itemsPerUom } from '../../../../mocks/items';
import { type ApLine } from '../../../../mocks/apInvoices';
import { formatAmount } from '../../../../services/format';
import { formatDate } from '../../../../services/dates';
import { apTotals, movesStock, netDue } from '../../../../services/apInvoices';
import { grInventoryQty, grOpenQty } from '../../../../services/goodsReceipts';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { lineAtc } from '../../../../services/taxRecalc';
import { getPurchasingSettings, lineNet, openQty, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { docWithholding } from '../../../../services/withholding';
import { binOptions } from '../../../inventory/transfers/TransferLines';
import { PurchTotalsFooter, PurchTotalNote, PurchTotalRow } from '../../shared/PurchTotalsFooter';
import { defaultBin, lineFromItem, linePricing } from '../../goods-receipts/detail/types';
import { baseHref, toApLine, type ApSectionProps } from './types';
import { taxCodeOptions } from '../../../../services/taxCodeOptions';
import { round2 } from '../../../../services/num';

const WITHHELD_LABEL: Record<string, string> = {
  'Expanded (EWT)': 'EWT',
  'Final (FWT)': 'Final tax',
  'Withholding VAT': 'VAT',
  'Percentage tax': 'Percentage tax',
};

/** Props apDoc needs beyond the section spread: the Copy-from and Draw toolbars live in the wrapper. */
export interface ApDocProps extends ApSectionProps {
  onCopyClick: () => void;
  copyableCount: number;
  onDrawClick: () => void;
  drawableCount: number;
}

/** Builds the A/P Invoice contents descriptor for the shared <DocLines>. */
export function apDoc({ draft, update, errors, m, ctx, onCopyClick, copyableCount, onDrawClick, drawableCount }: ApDocProps): DocLinesProps<ApLine> {
  const lines = draft.lines;
  const code = draft.currency;
  const docCurrency = m.currencies.find((c) => c.code === code);
  const totals = apTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const withholding = docWithholding(draft, ctx.vendor, m.items, m.tax, draft.postingDate);
  const due = netDue(totals.total, withholding, draft.downPayment);
  const balance = round2(due - draft.appliedAmount);
  const showFreight = getPurchasingSettings().manageFreightInDocuments;
  const showRounding = getPurchasingSettings().roundingMethod === 'By Currency';

  const h = lineHelpers<ApLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate, uoms: m.inv.uoms });
  const { itemOf, patch, err, lineKind, uomLabel, uomOptions } = h;
  const whOf = (whCode: string) => m.inv.warehouses.find((w) => w.code === whCode);

  // Reverse-charge codes aren't paid to the vendor, so they add no tax to gross / tax-amount.
  const taxRate = (l: ApLine) => (ctx.isReverseCharge(l.taxCode) ? 0 : ctx.rateOf(l.taxCode));
  const reverseChargeVat = (l: ApLine) => (ctx.isReverseCharge(l.taxCode) ? round2((lineNet(l) * ctx.rateOf(l.taxCode)) / 100) : null);

  const taxOptions = (current: string) => taxCodeOptions(m.tax.codes, 'Purchase', current);

  const pickItem = (l: ApLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? toApLine(lineFromItem(item, draft, ctx, m, { id: l.id, quantity: l.quantity }), { baseType: '' }, m.items, draft.vendorId) : { itemId: '' });
  };
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    return item ? toApLine(lineFromItem(item, draft, ctx, m, { quantity: 1 }), { baseType: '' }, m.items, draft.vendorId) : undefined;
  };
  const changeUom = (l: ApLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!item || !itemsPerUnit) return;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit, ...(ctx.fx ? linePricing(item, { ...l, uomCode }, draft, ctx) : {}) });
  };
  const changeWarehouse = (l: ApLine, warehouse: string) => {
    const item = itemOf(l);
    patch(l.id, { warehouse, binId: item && warehouse ? defaultBin(item, warehouse, m) : '' });
  };

  const cols = purchCols<ApLine>({
    patch, readOnly: ctx.readOnly, currency: code,
    glAccountOf: (l) => lineGlAccount(itemOf(l), l, m.inv),
    glAccountOptions: (l) => costAccountOptions(m.inv.accounts, l.glAccount),
    lineNet,
    priceAfterDisc: priceAfterDiscount,
    grossAfterDisc: (l) => priceAfterDiscount(l) * (1 + taxRate(l) / 100),
    taxAmount: (l) => round2((lineNet(l) * taxRate(l)) / 100),
    reverseChargeVat,
    taxOptions: (l) => taxOptions(l.taxCode),
    vendorOptions: [],
    warehouseOptions: m.inv.warehouses.filter((w) => receivesFromVendors(w)).map((w) => ({ value: w.code, label: w.code })),
    blanketScope: { vendorId: draft.vendorId, date: draft.postingDate },
    uomOptions, uomLabel,
    priceListDef, departmentDef, countryDef,
    changeUom,
    changePriceList: (l, priceListId) => patch(l.id, { priceListId }),
    onQty: (l, quantity) => patch(l.id, { quantity }),
    // Copied lines stay billable down (the upper bound is enforced by validate()).
    copiedQty: () => 0,
    lockUom: (l) => Boolean(l.baseType),
    invalid: (l, f) => Boolean(err(l, f)),
    lineKind,
    inventoryQty: grInventoryQty,
    unitCost: (l) => itemOf(l)?.itemCost ?? 0,
    warrantyDef: warrantyTemplateDef,
    itemWarranty: (l) => itemOf(l)?.warrantyTemplate ?? '',
    qtyHint: (l) => {
      if (l.baseType === 'GRPO') {
        const gr = m.receipts.find((r) => r.id === l.baseId);
        const gl = gr?.lines.find((x) => x.id === l.baseLineId);
        return gr && gl ? <Text variant="small" tone="muted">{grOpenQty(gl, gr)} of {gl.quantity} left to bill on the receipt</Text> : null;
      }
      if (l.baseType === 'PO') {
        const pl = m.orders.find((p) => p.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId);
        return pl ? <Text variant="small" tone="muted">{openQty(pl)} of {pl.quantity} open on the PO</Text> : null;
      }
      return null;
    },
    warehouseStocked: (l) => Boolean(itemOf(l)?.inventoryItem),
    // A receipt-copied line already came in: show where, read-only. A PO-copied or hand line receives on billing.
    warehouseNote: (l) => (movesStock(l, m.items) ? null : `Received in ${l.warehouse}`),
    onWarehouse: changeWarehouse,
    bin: {
      show: (l) => Boolean(whOf(l.warehouse)?.binEnabled),
      options: (l) => { const wh = whOf(l.warehouse); return wh ? binOptions(m.inv.bins, wh, l.binId, ctx.readOnly ? l.binCode : '') : []; },
      onChange: (l, binId) => patch(l.id, { binId }),
      invalid: (l) => Boolean(err(l, 'bin')),
    },
    taxHint: (l) => { const atc = lineAtc(l, m.tax.codes, ctx.readOnly); return atc ? <Text variant="small" tone="muted">ATC {atc}</Text> : null; },
    baseDoc: (l) => (l.baseType ? { href: baseHref(l), label: `${l.baseType === 'GRPO' ? 'Receipt' : 'PO'} ${l.baseDocNo}` } : null),
  });

  const columns = pick(cols, [
    // Shown by default: the SAP B1 v10 Contents fields, in its order.
    ['type', 'opt'], ['qty', 'always'], ['unitPrice', 'always'], ['discount', 'opt'], ['tax', 'always'],
    ['total', 'always'], ['warehouse', 'opt'], ['countryOfOrigin', 'opt'], ['blanket', 'opt'], ['warranty', 'opt'],
    ['unitCost', 'opt'],
    // Everything else, in the column chooser.
    ['uomName', 'hide'], ['itemsPerUnit', 'hide'], ['inventoryQty', 'hide'], ['priceList', 'hide'], ['priceAfterDisc', 'hide'],
    ['taxAmount', 'hide'], ['reverseChargeVat', 'hide'], ['gross', 'hide'], ['grossTotalLc', 'hide'], ['department', 'hide'],
    ['bpCatalogNo', 'hide'], ['requisition', 'hide'], ['baseDoc', 'hide'], ['freeText', 'hide'], ['glAccount', 'hide'],
  ]);

  return {
    prefsKey: 'ap',
    cardHeader: true,
    columns,
    rows: lines,
    icon: 'list_alt',
    title: 'Contents',
    description:
      errors.lines ??
      `What the vendor billed, in the purchasing unit. Prices are in ${code}${code === 'PHP' ? '' : `; totals in PHP at ${ctx.fx ? `${ctx.fx} (${ctx.fxSource}, ${formatDate(ctx.fxDate)})` : '—'}`}.`,
    sortableKeys: ['item'],
    sortValue: (l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof ApLine] ?? '')).toLowerCase(),
    readOnly: ctx.readOnly,
    onRemove: (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) }),
    item: itemConfig(h, {
      resolve: (l) => { const it = itemOf(l); return it ? { itemNo: it.itemNo, name: l.name || it.name } : null; },
      onPick: (l, id) => { if (id) pickItem(l, id); else patch(l.id, { itemId: '', itemNo: '', name: '', description: '' }); },
      fromItem,
      canChange: (l) => !l.baseType,
      addDisabled: !draft.vendorId,
      addPlaceholder: draft.vendorId ? 'Search items to add a line…' : 'Pick a vendor to add items',
    }),
    empty: (
      <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
        {!draft.vendorId
          ? 'Pick a vendor first, then copy from its goods receipts or purchase orders, or add lines.'
          : copyableCount
            ? `${draft.vendorName} has documents to bill — use Copy from, or add lines by hand.`
            : 'Nothing from this vendor to bill. Add lines by hand.'}
      </Text>
    ),
    header: ctx.readOnly ? undefined : (
      <div className="flex justify-end px-2">
        <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!copyableCount} onClick={onCopyClick}>
          Copy from
        </Button>
      </div>
    ),
    footer: (
      <PurchTotalsFooter
        totals={totals}
        currency={code}
        readOnly={ctx.readOnly}
        discountPct={draft.discountPct}
        onDiscountChange={(discountPct) => update({ discountPct })}
        freightInput={showFreight ? (
          <div className="flex gap-1">
            <TextField aria-label={`Freight (${code}, net)`} type="number" min={0} className="w-32" prefix={code} value={String(draft.freight)} onChange={(e) => update({ freight: Number(e.currentTarget.value) })} />
            <Combobox aria-label="Freight tax code" className="w-48" options={taxCodeOptions(m.tax.codes, 'Purchase', draft.freightTaxCode)} value={draft.freightTaxCode} onValueChange={(freightTaxCode) => update({ freightTaxCode: freightTaxCode ?? '' })} />
          </div>
        ) : undefined}
        roundingLabel={showRounding ? `Rounding (${docCurrency?.rounding ?? 'No rounding'})` : undefined}
        extraRows={
          <>
            {withholding.filter((w) => w.deducted).map((w) => (
              <PurchTotalRow key={w.atc} label={`${WITHHELD_LABEL[w.kind] ?? 'Tax'} withheld — ${w.atc} (${w.rate}%)`} value={-w.amount} code={code} />
            ))}
            {withholding.filter((w) => !w.deducted).map((w) => (
              <PurchTotalNote key={w.atc}>
                VAT withheld — {w.atc} ({w.rate}%): {code} {formatAmount(w.amount)} remitted by you on BIR 1600-VT, not deducted from the vendor.
              </PurchTotalNote>
            ))}
            <PurchTotalRow
              label="Total down payment"
              value={-draft.downPayment}
              code={code}
              input={!ctx.readOnly && drawableCount ? (
                <Button type="button" size="small" variant="ghost" onClick={onDrawClick}>
                  {draft.downPayment ? 'Change…' : `Draw… (${drawableCount})`}
                </Button>
              ) : undefined}
            />
            {(draft.drawnDownPayments ?? []).length ? (
              <PurchTotalNote>
                Drawn from {(draft.drawnDownPayments ?? []).map((d) => `request ${d.docNo} (${code} ${formatAmount(d.amount)})`).join(', ')} — clears PHP{' '}
                {formatAmount((draft.drawnDownPayments ?? []).reduce((n, d) => n + d.amountLc, 0))} from the advance account.
              </PurchTotalNote>
            ) : null}
            <PurchTotalRow label="Net payment due" value={due} code={code} strong />
            <PurchTotalRow label="Applied amount" value={-draft.appliedAmount} code={code} />
            <PurchTotalRow label="Balance due" value={balance} code={code} strong />
            {code !== 'PHP' ? <PurchTotalNote>≈ PHP {formatAmount(balance * ctx.fx)} at {ctx.fx ? `${ctx.fx} (${ctx.fxSource})` : '—'}.</PurchTotalNote> : null}
          </>
        }
      />
    ),
  };
}
