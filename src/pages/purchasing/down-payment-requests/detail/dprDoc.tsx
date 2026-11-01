import { Button, Icon, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../components/form/docLines/DocLines';
import { DPR_NOUN } from '../../paths';
import { cap } from '../../../../components/form/noun';
import { purchCols, pick } from '../../shared/purchCols';
import { costAccountOptions, lineHelpers, lineGlAccount, itemConfig } from '../../shared/purchLineHelpers';
import { countryDef, departmentDef, priceListDef, warrantyTemplateDef } from '../../../settings/masterDefs';
import { newDprLine, type DprLine } from '../../../../mocks/apDownPayments';
import { itemsPerUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import { dprTotals } from '../../../../services/apDownPayments';
import { lineNet, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { grInventoryQty } from '../../../../services/goodsReceipts';
import { docWithholding } from '../../../../services/withholding';
import { lineFromItem, linePricing } from '../../goods-receipts/detail/types';
import { PurchTotalsFooter, PurchTotalNote, PurchTotalRow } from '../../shared/PurchTotalsFooter';
import { CurrencyToggle, type PurchaseView } from '../../shared/purchaseView';
import { taxCodeOptions } from '../../../../services/taxCodeOptions';
import { round2 } from '../../../../services/num';
import { type DprSectionProps } from './types';

const WITHHELD_LABEL: Record<string, string> = {
  'Expanded (EWT)': 'EWT',
  'Final (FWT)': 'Final tax',
  'Withholding VAT': 'VAT',
  'Percentage tax': 'Percentage tax',
};

/** Props dprDoc needs beyond the section spread: the Copy-from-PO toolbar lives here, its panel in the detail. */
export interface DprDocProps extends DprSectionProps {
  onCopyClick: () => void;
  canCopy: boolean;
}

/** Builds the A/P Down Payment Request contents descriptor for the shared <DocLines>. */
export function dprDoc({ draft, update, errors, m, ctx, onCopyClick, canCopy }: DprDocProps, view: PurchaseView): DocLinesProps<DprLine> {
  const { lines, postingDate, vendorId } = draft;
  // Viewing in PHP is a read-only conversion: the prices stay in the document currency.
  const converted = view.converted;
  const locked = ctx.readOnly || converted;
  const totals = dprTotals(draft, ctx.rateOf, ctx.isReverseCharge);
  const vTotals = converted
    ? { beforeDiscount: view.convert(totals.beforeDiscount), discount: view.convert(totals.discount), tax: view.convert(totals.tax), total: view.convert(totals.total), reverseCharge: totals.reverseCharge ? view.convert(totals.reverseCharge) : undefined, freight: 0, rounding: 0 }
    : { ...totals, freight: 0, rounding: 0 };
  const balance = round2(totals.total - draft.appliedAmount);
  // Informational only: withholding is taken on the final invoice, never on the request — totals are unchanged.
  const withholding = docWithholding(draft as Parameters<typeof docWithholding>[0], ctx.vendor, m.items, m.tax, postingDate);

  const h = lineHelpers<DprLine>({ items: m.items, lines, update, errors, postingDate, uoms: m.inv.uoms });
  const { itemOf, patch, err, lineKind, uomLabel, uomOptions } = h;
  const taxRate = (l: DprLine) => ctx.rateOf(l.taxCode);

  const taxOptions = (current: string) => taxCodeOptions(m.tax.codes, 'Purchase', current);

  const pickItem = (l: DprLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) { patch(l.id, { itemId: '' }); return; }
    const { invoicedQty: _i, returnedQty: _r, id: _id, ...base } = lineFromItem(item, { postingDate }, ctx, m, { quantity: l.quantity });
    patch(l.id, { ...base, warehouse: '', binId: '', countryOfOriginCode: item.countryOfOriginCode, warrantyTemplateId: item.warrantyTemplate, glAccount: '', bpCatalogNo: item.vendors.find((v) => v.vendorId === vendorId)?.vendorItemNo ?? '' });
  };
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const { invoicedQty: _i, returnedQty: _r, id: _id, ...base } = lineFromItem(item, { postingDate }, ctx, m, { quantity: 1 });
    return newDprLine({ ...base, warehouse: '', binId: '', countryOfOriginCode: item.countryOfOriginCode, warrantyTemplateId: item.warrantyTemplate, glAccount: '', bpCatalogNo: item.vendors.find((v) => v.vendorId === vendorId)?.vendorItemNo ?? '' });
  };
  const changeUom = (l: DprLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!item || !itemsPerUnit) return;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit, ...(ctx.fx ? linePricing(item, { ...l, uomCode }, { postingDate }, ctx) : {}) });
  };

  const cols = purchCols<DprLine>({
    patch, readOnly: locked, currency: view.code,
    glAccountOf: (l) => lineGlAccount(itemOf(l), l, m.inv),
    glAccountOptions: (l) => costAccountOptions(m.inv.accounts, l.glAccount),
    lineNet,
    priceAfterDisc: priceAfterDiscount,
    grossAfterDisc: (l) => priceAfterDiscount(l) * (1 + taxRate(l) / 100),
    taxAmount: (l) => round2((lineNet(l) * taxRate(l)) / 100),
    taxOptions: (l) => taxOptions(l.taxCode),
    vendorOptions: [],
    warehouseOptions: [],
    blanketScope: { vendorId, date: postingDate },
    uomOptions, uomLabel,
    priceListDef, departmentDef, countryDef,
    changeUom,
    changePriceList: (l, priceListId) => patch(l.id, { priceListId }),
    onQty: (l, quantity) => patch(l.id, { quantity }),
    copiedQty: () => 0,
    lockUom: (l) => Boolean(l.baseType),
    invalid: (l, f) => Boolean(err(l, f)),
    lineKind,
    inventoryQty: grInventoryQty,
    unitCost: (l) => itemOf(l)?.itemCost ?? 0,
    warrantyDef: warrantyTemplateDef,
    itemWarranty: (l) => itemOf(l)?.warrantyTemplate ?? '',
    baseDoc: (l) => (l.baseType ? { href: `#/purchasing/purchase-orders/${l.baseId}`, label: `PO ${l.baseDocNo}` } : null),
  });

  const columns = pick(cols, [
    // Shown by default: the SAP B1 v10 Contents fields, in its order.
    ['type', 'opt'], ['qty', 'always'], ['unitPrice', 'always'], ['discount', 'opt'], ['tax', 'always'],
    ['total', 'always'], ['countryOfOrigin', 'opt'], ['blanket', 'opt'], ['warranty', 'opt'], ['unitCost', 'opt'],
    // Everything else, in the column chooser.
    ['uomName', 'hide'], ['itemsPerUnit', 'hide'], ['inventoryQty', 'hide'], ['priceList', 'hide'], ['priceAfterDisc', 'hide'],
    ['taxAmount', 'hide'], ['reverseChargeVat', 'hide'], ['gross', 'hide'], ['grossTotalLc', 'hide'], ['department', 'hide'],
    ['bpCatalogNo', 'hide'], ['requisition', 'hide'], ['baseDoc', 'hide'], ['freeText', 'hide'], ['glAccount', 'hide'],
  ]);

  return {
    prefsKey: 'dpr',
    cardHeader: true,
    columns,
    rows: converted ? lines.map((l) => ({ ...l, unitPrice: view.convert(l.unitPrice) })) : lines,
    icon: 'list_alt',
    title: cap(DPR_NOUN.lineLabel!),
    actions: <CurrencyToggle choices={view.choices} value={view.shown} onChange={view.onChange} />,
    description: errors.lines ?? view.note,
    sortableKeys: ['item'],
    sortValue: (l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof DprLine] ?? '')).toLowerCase(),
    readOnly: locked,
    onRemove: (picked) => update({ lines: lines.filter((l) => !picked.some((p) => p.id === l.id)) }),
    item: itemConfig(h, {
      resolve: (l) => { const it = itemOf(l); return it ? { itemNo: it.itemNo, name: l.name || it.name } : null; },
      onPick: (l, id) => { if (id) pickItem(l, id); else patch(l.id, { itemId: '', itemNo: '', name: '', description: '' }); },
      fromItem,
      canChange: (l) => !l.baseType,
      addDisabled: !vendorId,
      addPlaceholder: vendorId ? 'Search items to add a line…' : 'Pick a vendor to add items',
    }),
    empty: (
      <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
        {vendorId ? 'Search below to add a line, or copy from an open PO.' : 'Pick a vendor first.'}
      </Text>
    ),
    header: locked ? undefined : (
      <div className="flex justify-end px-2">
        <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!canCopy} onClick={onCopyClick}>
          Copy from PO
        </Button>
      </div>
    ),
    footer: (
      <PurchTotalsFooter
        totals={vTotals}
        currency={view.code}
        readOnly={locked}
        discountPct={draft.discountPct}
        onDiscountChange={(discountPct) => update({ discountPct })}
        midRows={
          <PurchTotalRow
            label={ctx.readOnly ? `Down payment (${draft.dpmPct}%)` : 'Down payment'}
            value={view.convert(totals.dpm)}
            code={view.code}
            input={locked ? undefined : (
              <TextField aria-label="Down payment %" type="number" min={0} className="w-24" suffix="%" value={String(draft.dpmPct)} onChange={(e) => update({ dpmPct: Math.min(100, Number(e.currentTarget.value)) })} />
            )}
          />
        }
        extraRows={
          <>
            <PurchTotalRow label="Applied amount" value={-view.convert(draft.appliedAmount)} code={view.code} />
            <PurchTotalRow label="Balance due" value={view.convert(balance)} code={view.code} strong />
            {ctx.readOnly && draft.drawnAmount > 0 ? (
              <PurchTotalNote>Drawn on A/P invoices: {view.code} {formatAmount(view.convert(draft.drawnAmount))} of {formatAmount(view.convert(draft.appliedAmount))} paid.</PurchTotalNote>
            ) : null}
            {withholding.map((w) => (
              <PurchTotalNote key={w.atc}>
                {WITHHELD_LABEL[w.kind] ?? 'Tax'} — {w.atc} ({w.rate}%): {view.code} {formatAmount(view.convert(w.amount))} is withheld on the final invoice, not on this request.
              </PurchTotalNote>
            ))}
          </>
        }
      />
    ),
  };
}
