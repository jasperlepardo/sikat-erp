import { Text } from '@jasperlepardo/sikat-design-system';
import { type PurchDocProps } from '../../shared/PurchDoc';
import { purchCols, pick } from '../../shared/purchCols';
import { lineHelpers, itemConfig } from '../../shared/purchLineHelpers';
import { summaryTypeHeader, purchFooter } from '../../shared/purchChrome';
import { departmentDef, priceListDef } from '../../../settings/masterDefs';
import { PR_SUMMARY_TYPES, type PrLine, type PrSummaryType } from '../../../../mocks/purchaseRequests';
import { itemsPerUom } from '../../../../mocks/items';
import { holdsStock } from '../../../../mocks/itemMasters';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { activeOptions } from '../../../../services/inventoryMasters';
import { stockTotals } from '../../../../services/items';
import { expenseAccountFor } from '../../../../services/goodsReceipts';
import { inventoryAccountFor } from '../../../../services/inventoryTransfers';
import { copiedQty, lineNet, priceAfterDiscount, inventoryQty, prTotals, summarizeLines } from '../../../../services/purchaseRequests';
import { infoPrice, lineFromItem, type PrTabProps } from './types';

/** Builds the Purchase Request contents descriptor for the shared <PurchDoc>. */
export function prDoc({ draft, update, errors, m, ctx }: PrTabProps): PurchDocProps<PrLine> {
  const lines = draft.lines;
  const totals = prTotals(draft, ctx.rateOf);
  // "By Item" collapses the grid to one read-only row per item; the footer totals stay off the real lines.
  const summarized = draft.summaryType === 'By Item';
  // Once the request is added (open or closed), the lines are fixed — show plain read-only cells.
  const ro = ctx.added || summarized;
  const viewRows = summarized ? summarizeLines(lines) : lines;
  const h = lineHelpers<PrLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate, uoms: m.inv.uoms });
  const { itemOf, patch, err, lineKind, uomLabel, uomOptions } = h;

  // An item's G/L account is derived from its item master / item group, never typed.
  const glAccountOf = (l: PrLine) => {
    const it = itemOf(l);
    return !it ? '' : it.inventoryItem ? inventoryAccountFor(it, l.warehouse, m.inv.groups) : expenseAccountFor(it, m.inv.groups);
  };
  const grossAfterDisc = (l: PrLine) => priceAfterDiscount(l) * (1 + ctx.rateOf(l.taxCode) / 100);

  // Stock at the line's warehouse; every warehouse when the line has none.
  const stockAt = (l: PrLine) => {
    const item = itemOf(l);
    if (!item) return null;
    if (!l.warehouse) return stockTotals(item);
    const wh = item.warehouses.find((w) => w.code === l.warehouse);
    return { inStock: wh?.inStock ?? 0, committed: wh?.committed ?? 0, ordered: wh?.ordered ?? 0 };
  };

  const taxOptions = (current: string) =>
    activeOptions(m.tax.codes.filter((c) => c.direction === 'Purchase'), (c) => c.code, (c) => c.name, current);

  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    return item ? lineFromItem(item, draft, m, { requiredDate: draft.requiredDate }) : undefined;
  };

  // The info price follows the unit: re-read from the last-purchase list, else scale by the unit size.
  const changeUom = (l: PrLine, uomCode: string) => {
    const item = itemOf(l);
    const ipu = item ? (itemsPerUom(item, uomCode) ?? 1) : 1;
    const listed = item ? infoPrice(item, uomCode, draft.postingDate) : 0;
    const scaled = Math.round((l.unitPrice / (l.itemsPerUnit || 1)) * ipu * 100) / 100;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: ipu, unitPrice: listed || scaled });
  };

  // All column rendering lives in the shared registry; PR supplies its data/services here
  // and picks which columns + default visibility.
  const cols = purchCols<PrLine>({
    patch, readOnly: ro, currency: 'PHP',
    lineNet,
    priceAfterDisc: priceAfterDiscount,
    grossAfterDisc,
    taxAmount: (l) => Math.round(lineNet(l) * ctx.rateOf(l.taxCode)) / 100,
    taxOptions: (l) => taxOptions(l.taxCode),
    vendorOptions: m.vendors.filter((v) => v.status !== 'Inactive').map((v) => ({ value: v.id, label: v.name })),
    warehouseOptions: m.inv.warehouses.filter((w) => holdsStock(w)).map((w) => ({ value: w.code, label: `${w.code} ${w.name}` })),
    blanketOptions: [],
    uomOptions, uomLabel,
    priceListDef, departmentDef,
    changeUom,
    changePriceList: (l, id) => patch(l.id, { priceListId: id }),
    // Quantity drives the open qty (what's left to convert to a PO/quotation).
    onQty: (l, q) => { const open = Math.max(0, q - (l.quantity - l.openQty)); patch(l.id, { quantity: q, openQty: open }); },
    copiedQty,
    invalid: (l, f) => Boolean(err(l, f)),
    lineKind,
    stockAt,
    inventoryQty,
    glAccountText: (l) => { const code = glAccountOf(l); return code ? accountText(code, m.inv.accounts) : ''; },
  });

  const columns = pick(cols, [
    ['type', 'hide'], ['qty', 'always'], ['openQty', 'hide'],
    ['inventoryQty', 'hide'], ['inStock', 'hide'], ['committed', 'hide'], ['ordered', 'hide'],
    ['priceList', 'hide'], ['unitPrice', 'always'], ['discount', 'hide'], ['priceAfterDisc', 'hide'],
    ['tax', 'hide'], ['taxAmount', 'hide'], ['gross', 'hide'], ['total', 'always'],
    ['requiredDate', 'hide'], ['vendor', 'hide'], ['warehouse', 'hide'], ['glAccount', 'hide'],
    ['department', 'hide'], ['freeText', 'hide'], ['requisition', 'hide'], ['returnReason', 'hide'],
    ['lineStatus', 'hide'],
  ]);

  return {
    prefsKey: 'pr',
    columns,
    rows: viewRows,
    icon: 'list_alt',
    title: 'Contents',
    description: errors.lines ?? 'Items or services requested — informational prices only, not binding. Amounts in PHP.',
    sortableKeys: ['item'],
    sortValue: (l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof PrLine] ?? '')).toLowerCase(),
    readOnly: ro,
    // Copied lines stay: an RFQ or PO already points at them.
    onRemove: (picked) => update({ lines: lines.filter((l) => !picked.includes(l) || copiedQty(l) > 0) }),
    item: itemConfig(h, {
      onPick: (l, id) => {
        if (!id) { patch(l.id, { itemId: '', itemNo: '', description: '' }); return; }
        const found = m.items.find((i) => i.id === id);
        if (!found) return;
        const line = lineFromItem(found, draft, m, { id: l.id, quantity: l.quantity, openQty: l.quantity });
        update({ lines: lines.map((x) => (x.id === l.id ? line : x)) });
      },
      fromItem,
      canChange: (l) => copiedQty(l) === 0,
      errorText: (l) => err(l, 'item'),
      width: 'min-w-52',
    }),
    empty: <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>No lines yet — search above to add one.</Text>,
    header: summaryTypeHeader({
      options: PR_SUMMARY_TYPES,
      value: draft.summaryType,
      onChange: (v) => update({ summaryType: v as PrSummaryType }),
      disabled: ctx.readOnly,
      summarized,
    }),
    footer: purchFooter({
      totals: { ...totals, rounding: 0 },
      currency: 'PHP',
      readOnly: ro,
      freight: { value: draft.freight, onChange: (v) => update({ freight: v }) },
      totalLabel: 'Total payment due (estimate)',
    }),
  };
}
