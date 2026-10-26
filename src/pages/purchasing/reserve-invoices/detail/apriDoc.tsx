import { Button, Combobox, Icon, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../components/form/docLines/DocLines';
import { purchCols, pick } from '../../shared/purchCols';
import { lineHelpers, itemConfig } from '../../shared/purchLineHelpers';
import { departmentDef, priceListDef, countryDef } from '../../../settings/masterDefs';
import { BLANKET_AGREEMENTS } from '../../../../mocks/purchaseOrders';
import { itemsPerUom } from '../../../../mocks/items';
import { type ApRiLine } from '../../../../mocks/apReserveInvoices';
import { formatAmount } from '../../../../services/format';
import { formatDate } from '../../../../services/dates';
import { apRiTotals } from '../../../../services/apReserveInvoices';
import { getPurchasingSettings, lineNet, openQty, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { grInventoryQty } from '../../../../services/goodsReceipts';
import { docWithholding } from '../../../../services/withholding';
import { PurchTotalsFooter, PurchTotalNote, PurchTotalRow } from '../../shared/PurchTotalsFooter';
import { taxCodeOptions } from '../../../../services/taxCodeOptions';
import { round2 } from '../../../../services/num';
import { riLineFromItem, type ApriSectionProps } from './types';

const WITHHELD_LABEL: Record<string, string> = {
  'Expanded (EWT)': 'EWT',
  'Final (FWT)': 'Final tax',
  'Withholding VAT': 'VAT',
  'Percentage tax': 'Percentage tax',
};

/** Props apriDoc needs beyond the section spread: the Copy-from-PO toolbar lives here, its panel in the wrapper. */
export interface ApriDocProps extends ApriSectionProps {
  onCopyClick: () => void;
  copyableCount: number;
}

/** Builds the A/P Reserve Invoice contents descriptor for the shared <DocLines>. */
export function apriDoc({ draft, update, errors, m, ctx, onCopyClick, copyableCount }: ApriDocProps): DocLinesProps<ApRiLine> {
  const lines = draft.lines;
  const code = draft.currency;
  const docCurrency = m.currencies.find((c) => c.code === code);
  const totals = apRiTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const withholding = docWithholding(draft as Parameters<typeof docWithholding>[0], ctx.vendor, m.items, m.tax, draft.postingDate);
  const balance = round2(totals.total - draft.appliedAmount);
  const showFreight = getPurchasingSettings().manageFreightInDocuments;
  const showRounding = getPurchasingSettings().roundingMethod === 'By Currency';

  const h = lineHelpers<ApRiLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate, uoms: m.inv.uoms });
  const { itemOf, patch, err, lineKind, uomLabel, uomOptions } = h;

  // Reverse-charge codes aren't paid to the vendor, so they add no tax to gross / tax-amount.
  const taxRate = (l: ApRiLine) => (ctx.isReverseCharge(l.taxCode) ? 0 : ctx.rateOf(l.taxCode));
  const reverseChargeVat = (l: ApRiLine) => (ctx.isReverseCharge(l.taxCode) ? round2((lineNet(l) * ctx.rateOf(l.taxCode)) / 100) : null);

  const taxOptions = (current: string) => taxCodeOptions(m.tax.codes, 'Purchase', current);
  const blanketOptions = BLANKET_AGREEMENTS.filter((b) => b.vendorId === draft.vendorId && b.validTo >= draft.postingDate).map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` }));

  const pickItem = (l: ApRiLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? riLineFromItem(item, draft, ctx, m, { id: l.id, quantity: l.quantity }) : { itemId: '' });
  };
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    return item ? riLineFromItem(item, draft, ctx, m, { quantity: 1 }) : undefined;
  };
  const changeUom = (l: ApRiLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!item || !itemsPerUnit) return;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit });
  };

  const cols = purchCols<ApRiLine>({
    patch, readOnly: ctx.readOnly, currency: code, fx: ctx.fx,
    lineNet,
    priceAfterDisc: priceAfterDiscount,
    grossAfterDisc: (l) => priceAfterDiscount(l) * (1 + taxRate(l) / 100),
    taxAmount: (l) => round2((lineNet(l) * taxRate(l)) / 100),
    reverseChargeVat,
    taxOptions: (l) => taxOptions(l.taxCode),
    vendorOptions: [],
    warehouseOptions: [],
    blanketOptions,
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
    warrantyText: (l) => { const w = itemOf(l)?.warrantyTemplate; return w ? (m.inv.warranties.find((x) => x.id === w)?.name ?? w) : 'None'; },
    qtyHint: (l) => {
      const pl = l.baseType === 'PO' ? m.orders.find((p) => p.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId) : undefined;
      return pl ? <Text variant="small" tone="muted">{openQty(pl)} of {pl.quantity} open on the PO</Text> : null;
    },
    baseDoc: (l) => (l.baseType ? { href: `#/purchasing/purchase-orders/${l.baseId}`, label: `PO ${l.baseDocNo}` } : null),
  });

  const columns = pick(cols, [
    ['type', 'hide'], ['qty', 'always'], ['uomName', 'hide'], ['itemsPerUnit', 'hide'], ['inventoryUom', 'hide'], ['inventoryQty', 'hide'],
    ['priceList', 'hide'],
    ['unitPrice', 'always'], ['discount', 'hide'], ['priceAfterDisc', 'hide'],
    ['tax', 'always'], ['taxAmount', 'hide'], ['reverseChargeVat', 'hide'], ['gross', 'hide'], ['total', 'always'], ['grossTotalLc', 'hide'],
    ['countryOfOrigin', 'hide'], ['warranty', 'hide'], ['unitCost', 'hide'], ['department', 'hide'],
    ['name', 'hide'], ['bpCatalogNo', 'hide'], ['requisition', 'hide'],
    ['baseDoc', 'hide'], ['blanket', 'hide'], ['freeText', 'hide'],
  ]);

  return {
    prefsKey: 'apri',
    columns,
    rows: lines,
    icon: 'list_alt',
    title: 'Contents',
    description:
      errors.lines ??
      `What the vendor billed ahead of delivery, in the purchasing unit. Prices are in ${code}${code === 'PHP' ? '' : `; totals in PHP at ${ctx.fx ? `${ctx.fx} (${ctx.fxSource}, ${formatDate(ctx.fxDate)})` : '—'}`}. No stock movement until the Goods Receipt is created.`,
    sortableKeys: ['item'],
    sortValue: (l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof ApRiLine] ?? '')).toLowerCase(),
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
          ? 'Pick a vendor first, then copy from its purchase orders or add lines.'
          : copyableCount
            ? `${draft.vendorName} has ${copyableCount} open PO${copyableCount === 1 ? '' : 's'} — use Copy from, or add lines by hand.`
            : 'No open POs from this vendor. Add lines by hand.'}
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
            <PurchTotalRow label="Applied amount" value={-draft.appliedAmount} code={code} />
            <PurchTotalRow label="Balance due" value={balance} code={code} strong />
            {code !== 'PHP' ? (
              <PurchTotalNote>≈ PHP {formatAmount(balance * ctx.fx)} at {ctx.fx ? `${ctx.fx} (${ctx.fxSource})` : '—'}.</PurchTotalNote>
            ) : null}
          </>
        }
      />
    ),
  };
}
