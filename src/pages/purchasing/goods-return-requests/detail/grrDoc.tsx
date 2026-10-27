import { Button, Icon, Text } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../components/form/docLines/DocLines';
import { purchCols, pick } from '../../shared/purchCols';
import { costAccountOptions, lineHelpers, lineGlAccount, itemConfig } from '../../shared/purchLineHelpers';
import { countryDef, departmentDef, priceListDef, warrantyTemplateDef } from '../../../settings/masterDefs';
import { newGrrLine, type GrrLine } from '../../../../mocks/goodsReturnRequests';
import { itemsPerUom } from '../../../../mocks/items';
import { holdsStock } from '../../../../mocks/itemMasters';
import { lineNet, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { taxCodeOptions } from '../../../../services/taxCodeOptions';
import type { GrrSectionProps } from './types';

/** Props grrDoc needs beyond section spread: the Copy-from toolbar, panel hosted in detail. */
export interface GrrDocProps extends GrrSectionProps {
  onCopyClick: () => void;
  canCopy: boolean;
}

/** Builds the Goods Return Request contents descriptor for <DocLines>. */
export function grrDoc({ draft, update, errors, m, onCopyClick, canCopy }: GrrDocProps): DocLinesProps<GrrLine> {
  const lines = draft.lines;
  const readOnly = draft.status === 'Closed';

  const h = lineHelpers<GrrLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate, uoms: m.inv.uoms });
  const { itemOf, patch, err, lineKind, uomLabel, uomOptions } = h;
  const taxOptions = (current: string) => taxCodeOptions(m.tax.codes, 'Purchase', current);

  const pickItem = (l: GrrLine, itemId: string | null) => {
    if (!itemId) { patch(l.id, { itemId: '', itemNo: '', description: '' }); return; }
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return;
    const uomCode = item.purchasingUom ?? item.inventoryUom ?? 'pc';
    const uom = m.inv.uoms.find((u) => u.code === uomCode);
    patch(l.id, {
      itemId: item.id, itemNo: item.itemNo, description: item.description || item.name,
      uomCode, uomName: uom?.name ?? uomCode, itemsPerUnit: itemsPerUom(item, uomCode) ?? 1,
      warehouse: item.inventoryItem ? (item.warehouses[0]?.code ?? '') : '',
      countryOfOriginCode: item.countryOfOriginCode ?? '', warrantyTemplateId: item.warrantyTemplate ?? '', glAccount: '',
    });
  };
  const fromItem = (itemId: string): GrrLine | undefined => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const uomCode = item.purchasingUom ?? item.inventoryUom ?? 'pc';
    const uom = m.inv.uoms.find((u) => u.code === uomCode);
    return newGrrLine({
      itemId: item.id, itemNo: item.itemNo, description: item.description || item.name,
      uomCode, uomName: uom?.name ?? uomCode, itemsPerUnit: itemsPerUom(item, uomCode) ?? 1,
      warehouse: item.inventoryItem ? (item.warehouses[0]?.code ?? '') : '',
      countryOfOriginCode: item.countryOfOriginCode ?? '', warrantyTemplateId: item.warrantyTemplate ?? '', glAccount: '',
      quantity: 1, openQty: 1,
    });
  };
  const changeUom = (l: GrrLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!item || !itemsPerUnit) return;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit });
  };

  const cols = purchCols<GrrLine>({
    patch, readOnly, currency: draft.currency,
    glAccountOf: (l) => lineGlAccount(itemOf(l), l, m.inv),
    glAccountOptions: (l) => costAccountOptions(m.inv.accounts, l.glAccount),
    lineNet,
    priceAfterDisc: priceAfterDiscount,
    grossAfterDisc: priceAfterDiscount,
    taxAmount: () => 0,
    taxOptions: (l) => taxOptions(l.taxCode),
    vendorOptions: [],
    warehouseOptions: m.inv.warehouses.filter((w) => holdsStock(w)).map((w) => ({ value: w.code, label: w.code })),
    uomOptions, uomLabel,
    priceListDef, departmentDef, countryDef,
    changeUom,
    changePriceList: (l, priceListId) => patch(l.id, { priceListId }),
    onQty: (l, quantity) => {
      const open = Math.max(0, quantity - (l.quantity - l.openQty));
      patch(l.id, { quantity, openQty: open });
    },
    copiedQty: (l) => Math.max(0, l.quantity - l.openQty),
    invalid: (l, f) => Boolean(err(l, f)),
    lineKind,
    unitCost: (l) => itemOf(l)?.itemCost ?? 0,
    warrantyDef: warrantyTemplateDef,
    itemWarranty: (l) => itemOf(l)?.warrantyTemplate ?? '',
    warehouseStocked: (l) => Boolean(itemOf(l)?.inventoryItem),
  });

  const columns = pick(cols, [
    // Shown by default: the SAP B1 v10 Contents fields, in its order (plus the return reason).
    ['type', 'opt'], ['qty', 'always'], ['unitPrice', 'always'], ['discount', 'opt'], ['tax', 'opt'],
    ['total', 'always'], ['returnReason', 'always'], ['warehouse', 'opt'], ['glAccount', 'opt'], ['countryOfOrigin', 'opt'],
    ['warranty', 'opt'], ['unitCost', 'opt'],
    // Everything else, in the column chooser.
    ['uomName', 'hide'], ['itemsPerUnit', 'hide'], ['department', 'hide'], ['freeText', 'hide'], ['requisition', 'hide'],
    ['lineStatus', 'hide'],
  ]);

  return {
    prefsKey: 'grr',
    cardHeader: true,
    columns,
    rows: lines,
    icon: 'list_alt',
    title: 'Contents',
    description: errors.lines ?? 'Items to send back. No stock movement until the request is converted to a Goods Return.',
    sortableKeys: ['item'],
    sortValue: (l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof GrrLine] ?? '')).toLowerCase(),
    readOnly,
    onRemove: (picked) => update({ lines: lines.filter((l) => !picked.includes(l) || l.openQty < l.quantity) }),
    item: itemConfig(h, {
      resolve: (l) => { const it = itemOf(l); return it ? { itemNo: it.itemNo, name: it.name } : null; },
      onPick: pickItem,
      fromItem,
      addDisabled: !draft.vendorId,
      addPlaceholder: draft.vendorId ? 'Search items to add a line…' : 'Pick a vendor first',
    }),
    empty: (
      <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
        {draft.vendorId ? 'Add lines for items to return, or copy from a goods receipt or invoice.' : 'Pick a vendor first.'}
      </Text>
    ),
    header: readOnly ? undefined : (
      <div className="flex justify-end px-2">
        <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!canCopy} onClick={onCopyClick}>
          Copy from
        </Button>
      </div>
    ),
  };
}
