import { Button, Icon, Text } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../components/form/docLines/DocLines';
import { RETURN_NOUN } from '../../paths';
import { cap } from '../../../../components/form/noun';
import { purchCols, pick } from '../../shared/purchCols';
import { costAccountOptions, lineHelpers, lineGlAccount, itemConfig } from '../../shared/purchLineHelpers';
import { countryDef, departmentDef, priceListDef, warrantyTemplateDef } from '../../../settings/masterDefs';
import { newReturnLine, needsCredit, type GoodsReturn, type ReturnLine } from '../../../../mocks/goodsReturns';
import { itemsPerUom } from '../../../../mocks/items';
import { holdsStock } from '../../../../mocks/itemMasters';
import { lineNet, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { grInventoryQty, grOpenQty } from '../../../../services/goodsReceipts';
import { returnableQty } from '../../../../services/apInvoices';
import { determineWithholding } from '../../../../services/taxDetermination';
import { binOptions } from '../../../inventory/transfers/TransferLines';
import { defaultBin, lineFromItem, linePricing } from '../../goods-receipts/detail/types';
import { baseLink, type RetContext, type RetMasters } from '../../shared/returnsTypes';
import type { Errors } from '../../../../components/form/fields';
import { taxCodeOptions } from '../../../../services/taxCodeOptions';
import { round2 } from '../../../../services/num';
import { returnTotals } from '../../../../services/goodsReturns';
import { PurchTotalsFooter } from '../../shared/PurchTotalsFooter';
import { CurrencyToggle, type PurchaseView } from '../../shared/purchaseView';

type RetDraft = Pick<GoodsReturn, 'lines' | 'vendorId' | 'postingDate' | 'currency' | 'vendorName' | 'status' | 'discountPct' | 'freight' | 'freightTaxCode'>;

/** Props returnDoc needs beyond the section spread: the Copy-from toolbar lives here, its panel in the detail. */
export interface ReturnDocProps {
  draft: RetDraft;
  update: (patch: { lines?: ReturnLine[]; discountPct?: number }) => void;
  errors: Errors;
  m: RetMasters;
  ctx: RetContext;
  onCopyClick: () => void;
  canCopy: boolean;
}

/** Builds the Goods Return contents descriptor for the shared <DocLines>. */
export function returnDoc({ draft, update, errors, m, ctx, onCopyClick, canCopy }: ReturnDocProps, view: PurchaseView): DocLinesProps<ReturnLine> {
  const lines = draft.lines;
  // Viewing in PHP is a read-only conversion: the prices stay in the document currency.
  const converted = view.converted;
  const locked = ctx.readOnly || converted;
  const totals = returnTotals(draft, ctx.rateOf, ctx.isReverseCharge);
  const vTotals = converted
    ? { ...totals, beforeDiscount: view.convert(totals.beforeDiscount), discount: view.convert(totals.discount), freight: view.convert(totals.freight), rounding: view.convert(totals.rounding ?? 0), tax: view.convert(totals.tax), total: view.convert(totals.total), reverseCharge: totals.reverseCharge ? view.convert(totals.reverseCharge) : undefined }
    : totals;
  const h = lineHelpers<ReturnLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate, uoms: m.inv.uoms });
  const { itemOf, patch, err, lineKind, uomLabel, uomOptions } = h;
  const whOf = (code: string) => m.inv.warehouses.find((w) => w.code === code);
  const taxRate = (l: ReturnLine) => ctx.rateOf(l.taxCode);
  const withholdingOf = (l: ReturnLine) => {
    const item = itemOf(l);
    return item && ctx.vendor ? determineWithholding(item, ctx.vendor, m.tax, draft.postingDate).withholding : [];
  };

  const taxOptions = (current: string) => taxCodeOptions(m.tax.codes, 'Purchase', current);

  const pickItem = (l: ReturnLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) { patch(l.id, { itemId: '' }); return; }
    const { invoicedQty: _i, returnedQty: _r, id: _id, ...base } = lineFromItem(item, { postingDate: draft.postingDate }, ctx, m, { quantity: l.quantity });
    patch(l.id, { ...base, countryOfOriginCode: item.countryOfOriginCode, warrantyTemplateId: item.warrantyTemplate, glAccount: '' } as Partial<ReturnLine>);
  };
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const blank = newReturnLine();
    const { invoicedQty: _i, returnedQty: _r, id: _id, ...base } = lineFromItem(item, { postingDate: draft.postingDate }, ctx, m, { quantity: 1 });
    return { ...blank, ...base, countryOfOriginCode: item.countryOfOriginCode, warrantyTemplateId: item.warrantyTemplate, glAccount: '' } as ReturnLine;
  };
  const changeUom = (l: ReturnLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!item || !itemsPerUnit) return;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit, ...(ctx.fx ? linePricing(item, { ...l, uomCode }, { postingDate: draft.postingDate }, ctx) : {}) });
  };
  const changeWarehouse = (l: ReturnLine, warehouse: string) => {
    const item = itemOf(l);
    patch(l.id, { warehouse, binId: item && warehouse ? defaultBin(item, warehouse, m) : '' });
  };

  const cols = purchCols<ReturnLine>({
    patch, readOnly: locked, currency: view.code,
    glAccountOf: (l) => lineGlAccount(itemOf(l), l, m.inv),
    glAccountOptions: (l) => costAccountOptions(m.inv.accounts, l.glAccount),
    lineNet,
    priceAfterDisc: priceAfterDiscount,
    grossAfterDisc: (l) => priceAfterDiscount(l) * (1 + taxRate(l) / 100),
    taxAmount: (l) => round2((lineNet(l) * taxRate(l)) / 100),
    taxOptions: (l) => taxOptions(l.taxCode),
    vendorOptions: [],
    warehouseOptions: m.inv.warehouses.filter((w) => holdsStock(w)).map((w) => ({ value: w.code, label: w.code })),
    blanketScope: { vendorId: draft.vendorId, date: draft.postingDate },
    uomOptions, uomLabel,
    priceListDef, departmentDef,
    changeUom,
    changePriceList: (l, priceListId) => patch(l.id, { priceListId }),
    onQty: (l, quantity) => patch(l.id, { quantity }),
    copiedQty: () => 0,
    invalid: (l, f) => Boolean(err(l, f)),
    lineKind,
    inventoryQty: grInventoryQty,
    // Still open to return on the source document, or how much was credited once added.
    qtyHint: (l) => {
      if (l.baseType === 'GRPO') {
        const gr = m.receipts.find((r) => r.id === l.baseId);
        const gl = gr?.lines.find((x) => x.id === l.baseLineId);
        return gr && gl ? <Text variant="small" tone="muted">{grOpenQty(gl, gr)} of {gl.quantity} left on the receipt</Text> : null;
      }
      if (l.baseType === 'APINV') {
        const il = m.invoices.find((i) => i.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId);
        return il ? <Text variant="small" tone="muted">{returnableQty(il)} of {il.quantity} billed left to return</Text> : null;
      }
      return needsCredit(l) && ctx.readOnly ? <Text variant="small" tone="muted">{l.creditedQty} credited</Text> : null;
    },
    lockUom: (l) => Boolean(l.baseType),
    warehouseStocked: (l) => Boolean(itemOf(l)?.inventoryItem),
    onWarehouse: changeWarehouse,
    bin: {
      show: (l) => Boolean(whOf(l.warehouse)?.binEnabled),
      options: (l) => { const wh = whOf(l.warehouse); return wh ? binOptions(m.inv.bins, wh, l.binId, ctx.readOnly ? l.binCode : '') : []; },
      onChange: (l, binId) => patch(l.id, { binId }),
      invalid: (l) => Boolean(err(l, 'bin')),
    },
    baseDoc: (l) => baseLink(l) ?? null,
    countryDef,
    warrantyDef: warrantyTemplateDef,
    itemWarranty: (l) => itemOf(l)?.warrantyTemplate ?? '',
    unitCost: (l) => l.unitCostLc || itemOf(l)?.itemCost || 0,
    withholdingText: (l) => { const wt = withholdingOf(l); return wt.length ? wt.map((w) => `${w.atc} (${w.rate}%)`).join(', ') : 'None'; },
    withholdingBase: (l) => (withholdingOf(l).length ? lineNet(l) : null),
  });

  const columns = pick(cols, [
    // Shown by default: the SAP B1 v10 Contents fields, in its order (plus the return reason).
    ['type', 'opt'], ['qty', 'always'], ['unitPrice', 'always'], ['discount', 'opt'], ['tax', 'opt'],
    ['total', 'always'], ['returnReason', 'always'], ['warehouse', 'opt'], ['glAccount', 'opt'], ['countryOfOrigin', 'opt'],
    ['warranty', 'opt'], ['unitCost', 'opt'],
    // Everything else, in the column chooser.
    ['uomName', 'hide'], ['itemsPerUnit', 'hide'], ['inventoryQty', 'hide'], ['priceList', 'hide'], ['priceAfterDisc', 'hide'],
    ['taxAmount', 'hide'], ['gross', 'hide'], ['grossTotalLc', 'hide'], ['withholding', 'hide'], ['withholdingBase', 'hide'],
    ['baseDoc', 'hide'], ['blanket', 'hide'], ['freeText', 'hide'], ['bpCatalogNo', 'hide'], ['mfrNo', 'hide'],
    ['department', 'hide'], ['requisition', 'hide'], ['lineStatus', 'hide'],
  ]);

  return {
    prefsKey: 'return',
    cardHeader: true,
    columns,
    rows: converted ? lines.map((l) => ({ ...l, unitPrice: view.convert(l.unitPrice) })) : lines,
    icon: 'list_alt',
    title: cap(RETURN_NOUN.lineLabel!),
    actions: <CurrencyToggle choices={view.choices} value={view.shown} onChange={view.onChange} />,
    description: errors.lines ?? view.note,
    sortableKeys: ['item'],
    sortValue: (l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof ReturnLine] ?? '')).toLowerCase(),
    readOnly: locked,
    onRemove: (picked) => update({ lines: lines.filter((l) => !picked.some((p) => p.id === l.id)) }),
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
        {draft.vendorId
          ? 'Copy from a goods receipt (goods not yet billed) or an A/P invoice (goods already billed), or add lines.'
          : 'Pick a vendor first.'}
      </Text>
    ),
    header: locked ? undefined : (
      <div className="flex justify-end px-2">
        <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!canCopy} onClick={onCopyClick}>
          Copy from
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
        totalLabel="Total credit"
      />
    ),
  };
}
