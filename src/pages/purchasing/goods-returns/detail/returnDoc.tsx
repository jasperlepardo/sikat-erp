import { Button, Icon, Text } from '@jasperlepardo/sikat-design-system';
import { type PurchDocProps } from '../../shared/PurchDoc';
import { purchCols, pick } from '../../shared/purchCols';
import { lineHelpers, itemConfig } from '../../shared/purchLineHelpers';
import { countryDef, departmentDef, priceListDef } from '../../../settings/masterDefs';
import { BLANKET_AGREEMENTS } from '../../../../mocks/purchaseOrders';
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

type RetDraft = Pick<GoodsReturn, 'lines' | 'vendorId' | 'postingDate' | 'currency' | 'vendorName' | 'status'>;

/** Props returnDoc needs beyond the section spread: the Copy-from toolbar lives here, its panel in the detail. */
export interface ReturnDocProps {
  draft: RetDraft;
  update: (patch: { lines: ReturnLine[] }) => void;
  errors: Errors;
  m: RetMasters;
  ctx: RetContext;
  onCopyClick: () => void;
  canCopy: boolean;
}

/** Builds the Goods Return contents descriptor for the shared <PurchDoc>. */
export function returnDoc({ draft, update, errors, m, ctx, onCopyClick, canCopy }: ReturnDocProps): PurchDocProps<ReturnLine> {
  const lines = draft.lines;
  const h = lineHelpers<ReturnLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate, uoms: m.inv.uoms });
  const { itemOf, patch, err, lineKind, uomLabel, uomOptions } = h;
  const whOf = (code: string) => m.inv.warehouses.find((w) => w.code === code);
  const taxRate = (l: ReturnLine) => ctx.rateOf(l.taxCode);
  const withholdingOf = (l: ReturnLine) => {
    const item = itemOf(l);
    return item && ctx.vendor ? determineWithholding(item, ctx.vendor, m.tax, draft.postingDate).withholding : [];
  };

  const taxOptions = (current: string) => taxCodeOptions(m.tax.codes, 'Purchase', current);
  const blanketOptions = [
    ...BLANKET_AGREEMENTS.filter((b) => b.vendorId === draft.vendorId).map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` })),
  ];

  const pickItem = (l: ReturnLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) { patch(l.id, { itemId: '' }); return; }
    const { invoicedQty: _i, returnedQty: _r, id: _id, ...base } = lineFromItem(item, { postingDate: draft.postingDate }, ctx, m, { quantity: l.quantity });
    patch(l.id, { ...base, countryOfOriginCode: item.countryOfOriginCode } as Partial<ReturnLine>);
  };
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const blank = newReturnLine();
    const { invoicedQty: _i, returnedQty: _r, id: _id, ...base } = lineFromItem(item, { postingDate: draft.postingDate }, ctx, m, { quantity: 1 });
    return { ...blank, ...base, countryOfOriginCode: item.countryOfOriginCode } as ReturnLine;
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
    patch, readOnly: ctx.readOnly, currency: draft.currency, fx: ctx.fx,
    lineNet,
    priceAfterDisc: priceAfterDiscount,
    grossAfterDisc: (l) => priceAfterDiscount(l) * (1 + taxRate(l) / 100),
    taxAmount: (l) => round2((lineNet(l) * taxRate(l)) / 100),
    taxOptions: (l) => taxOptions(l.taxCode),
    vendorOptions: [],
    warehouseOptions: m.inv.warehouses.filter((w) => holdsStock(w)).map((w) => ({ value: w.code, label: w.code })),
    blanketOptions,
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
    warrantyText: (l) => { const w = itemOf(l)?.warrantyTemplate; return w ? (m.inv.warranties.find((x) => x.id === w)?.name ?? w) : 'None'; },
    unitCost: (l) => l.unitCostLc || itemOf(l)?.itemCost || 0,
    withholdingText: (l) => { const wt = withholdingOf(l); return wt.length ? wt.map((w) => `${w.atc} (${w.rate}%)`).join(', ') : 'None'; },
    withholdingBase: (l) => (withholdingOf(l).length ? lineNet(l) : null),
  });

  const columns = pick(cols, [
    ['type', 'hide'], ['qty', 'always'],
    ['warehouse', 'hide'], ['inventoryQty', 'hide'],
    ['unitPrice', 'always'], ['discount', 'hide'],
    ['tax', 'hide'], ['taxAmount', 'hide'],
    ['total', 'always'],
    ['returnReason', 'always'],
    ['countryOfOrigin', 'hide'], ['warranty', 'hide'], ['unitCost', 'hide'],
    ['withholding', 'hide'], ['withholdingBase', 'hide'],
    ['baseDoc', 'hide'], ['blanket', 'hide'], ['freeText', 'hide'],
  ]);

  return {
    prefsKey: 'return',
    columns,
    rows: lines,
    icon: 'list_alt',
    title: 'Contents',
    description: errors.lines ?? `What goes back, in the line's unit. Stock leaves at the cost it came in at; prices are in ${draft.currency} for the vendor's credit.`,
    sortableKeys: ['item'],
    sortValue: (l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof ReturnLine] ?? '')).toLowerCase(),
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
        {draft.vendorId
          ? 'Copy from a goods receipt (goods not yet billed) or an A/P invoice (goods already billed), or add lines.'
          : 'Pick a vendor first.'}
      </Text>
    ),
    header: ctx.readOnly ? undefined : (
      <div className="flex justify-end px-2">
        <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!canCopy} onClick={onCopyClick}>
          Copy from
        </Button>
      </div>
    ),
  };
}
