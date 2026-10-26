import { Button, Checkbox, Icon, Text } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../components/form/docLines/DocLines';
import { type PrefColumn } from '../../../../components/form/columnPrefs';
import { purchCols, pick } from '../../shared/purchCols';
import { lineHelpers, itemConfig } from '../../shared/purchLineHelpers';
import { countryDef, departmentDef, priceListDef } from '../../../settings/masterDefs';
import { BLANKET_AGREEMENTS } from '../../../../mocks/purchaseOrders';
import { newMemoLine, type MemoLine } from '../../../../mocks/apCreditMemos';
import { itemsPerUom } from '../../../../mocks/items';
import { holdsStock } from '../../../../mocks/itemMasters';
import { lineNet, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { grInventoryQty } from '../../../../services/goodsReceipts';
import { returnableQty } from '../../../../services/apInvoices';
import { returnOpenQty } from '../../../../services/goodsReturns';
import { sendsStock } from '../../../../services/apCreditMemos';
import { binCodeOf } from '../../../../services/binLocations';
import { binOptions } from '../../../inventory/transfers/TransferLines';
import { defaultBin, lineFromItem, linePricing } from '../../goods-receipts/detail/types';
import { baseLink } from '../../shared/returnsTypes';
import { taxCodeOptions } from '../../../../services/taxCodeOptions';
import { round2 } from '../../../../services/num';
import { type CmSectionProps } from './types';

/** Props memoDoc needs beyond the section spread: the Copy-from toolbar lives here, its panel in the detail. */
export interface MemoDocProps extends CmSectionProps {
  onCopyClick: () => void;
  canCopy: boolean;
}

/** Builds the A/P Credit Memo contents descriptor for the shared <DocLines>. */
export function memoDoc({ draft, update, errors, m, ctx, onCopyClick, canCopy }: MemoDocProps): DocLinesProps<MemoLine> {
  const lines = draft.lines;
  const code = draft.currency;
  const h = lineHelpers<MemoLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate, uoms: m.inv.uoms });
  const { itemOf, patch, err, lineKind, uomLabel, uomOptions } = h;
  const whOf = (whCode: string) => m.inv.warehouses.find((w) => w.code === whCode);
  const taxRate = (l: MemoLine) => ctx.rateOf(l.taxCode);

  const taxOptions = (current: string) => taxCodeOptions(m.tax.codes, 'Purchase', current);
  const blanketOptions = BLANKET_AGREEMENTS.filter((b) => b.vendorId === draft.vendorId).map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` }));

  const pickItem = (l: MemoLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) { patch(l.id, { itemId: '' }); return; }
    const { invoicedQty: _i, returnedQty: _r, id: _id, ...base } = lineFromItem(item, { postingDate: draft.postingDate }, ctx, m, { quantity: l.quantity });
    patch(l.id, { ...base, countryOfOriginCode: item.countryOfOriginCode } as Partial<MemoLine>);
  };
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const blank = newMemoLine();
    const { invoicedQty: _i, returnedQty: _r, id: _id, ...base } = lineFromItem(item, { postingDate: draft.postingDate }, ctx, m, { quantity: 1 });
    return { ...blank, ...base, countryOfOriginCode: item.countryOfOriginCode } as MemoLine;
  };
  const changeUom = (l: MemoLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!item || !itemsPerUnit) return;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit, ...(ctx.fx ? linePricing(item, { ...l, uomCode }, { postingDate: draft.postingDate }, ctx) : {}) });
  };
  const changeWarehouse = (l: MemoLine, warehouse: string) => {
    const item = itemOf(l);
    patch(l.id, { warehouse, binId: item && warehouse ? defaultBin(item, warehouse, m) : '' });
  };

  const cols = purchCols<MemoLine>({
    patch, readOnly: ctx.readOnly, currency: code, fx: ctx.fx,
    lineNet,
    priceAfterDisc: priceAfterDiscount,
    grossAfterDisc: (l) => priceAfterDiscount(l) * (1 + taxRate(l) / 100),
    taxAmount: (l) => round2((lineNet(l) * taxRate(l)) / 100),
    taxOptions: (l) => taxOptions(l.taxCode),
    vendorOptions: [],
    warehouseOptions: m.inv.warehouses.filter((w) => holdsStock(w)).map((w) => ({ value: w.code, label: w.code })),
    blanketOptions,
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
    unitCost: (l) => l.unitCostLc || itemOf(l)?.itemCost || 0,
    warrantyText: (l) => { const w = itemOf(l)?.warrantyTemplate; return w ? (m.inv.warranties.find((x) => x.id === w)?.name ?? w) : 'None'; },
    qtyHint: (l) => {
      if (l.baseType === 'APINV') {
        const il = m.invoices.find((i) => i.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId);
        return il ? <Text variant="small" tone="muted">{il.quantity} billed · {returnableQty(il)} left to return</Text> : null;
      }
      if (l.baseType === 'GRET') {
        const r = m.returns.find((x) => x.id === l.baseId);
        const rl = r?.lines.find((x) => x.id === l.baseLineId);
        return r && rl ? <Text variant="small" tone="muted">{returnOpenQty(rl, r)} of {rl.quantity} left to credit on the return</Text> : null;
      }
      return null;
    },
    warehouseStocked: (l) => Boolean(itemOf(l)?.inventoryItem),
    // A line that doesn't send stock back shows "No stock moves"; a copied line shows where it leaves from, read-only.
    warehouseNote: (l) => {
      if (!sendsStock(l, m.items)) return 'No stock moves';
      if (l.baseType) return `${l.warehouse}${l.binId ? ` · ${binCodeOf(m.inv.bins, l.binId, ctx.readOnly ? l.binCode : '')}` : ''}`;
      return null;
    },
    onWarehouse: changeWarehouse,
    bin: {
      show: (l) => Boolean(whOf(l.warehouse)?.binEnabled),
      options: (l) => { const wh = whOf(l.warehouse); return wh ? binOptions(m.inv.bins, wh, l.binId, ctx.readOnly ? l.binCode : '') : []; },
      onChange: (l, binId) => patch(l.id, { binId }),
      invalid: (l) => Boolean(err(l, 'bin')),
    },
    baseDoc: (l) => baseLink(l) ?? null,
  });

  // The credit memo's own column: send the goods back, or adjust the price only. Locked once added.
  const returnGoodsColumn: PrefColumn<MemoLine> = {
    key: 'returnGoods', header: 'Return goods', optional: false,
    cell: (l) => {
      const item = itemOf(l);
      if (!item) return null;
      if (l.baseType === 'GRET') return <Text variant="small" tone="muted">Returned on {l.baseDocNo}</Text>;
      if (!item.inventoryItem) return <Text variant="small" tone="muted">Not stocked</Text>;
      return (
        <Checkbox aria-label={`Return the goods on ${l.itemNo}`} checked={l.returnGoods} disabled={ctx.readOnly} onChange={(e) => patch(l.id, { returnGoods: e.currentTarget.checked })}>
          {l.returnGoods ? 'Send back' : 'Price only'}
        </Checkbox>
      );
    },
  };

  const columns = [
    ...pick(cols, [
      ['type', 'hide'], ['qty', 'always'], ['uomName', 'hide'], ['itemsPerUnit', 'hide'], ['inventoryUom', 'hide'],
      ['warehouse', 'hide'], ['inventoryQty', 'hide'], ['priceList', 'hide'],
      ['unitPrice', 'always'], ['discount', 'hide'], ['priceAfterDisc', 'hide'],
      ['tax', 'hide'], ['taxAmount', 'hide'], ['gross', 'hide'], ['total', 'always'], ['grossTotalLc', 'hide'],
      ['returnReason', 'always'],
      ['countryOfOrigin', 'hide'], ['warranty', 'hide'], ['unitCost', 'hide'], ['department', 'hide'],
      ['name', 'hide'], ['bpCatalogNo', 'hide'], ['requisition', 'hide'],
      ['baseDoc', 'hide'], ['blanket', 'hide'], ['freeText', 'hide'],
    ]),
    returnGoodsColumn,
  ];

  return {
    prefsKey: 'apcm',
    columns,
    rows: lines,
    icon: 'list_alt',
    title: 'Contents',
    description: errors.lines ?? `What the vendor credits, in ${code}. Lines from an invoice send the goods back or adjust the price only; lines from a goods return just credit it.`,
    sortableKeys: ['item'],
    sortValue: (l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof MemoLine] ?? '')).toLowerCase(),
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
        {draft.vendorId ? 'Copy from an A/P invoice or a goods return, or add lines.' : 'Pick a vendor first.'}
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
