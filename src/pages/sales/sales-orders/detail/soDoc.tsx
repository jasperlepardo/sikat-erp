import { Icon, IconButton, Link, Select, TableStatus, Text, Tooltip } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../../components/form/docLines/DocLines';
import { pick } from '../../../../components/form/docLines/pick';
import type { PrefColumn } from '../../../../components/form/columnPrefs';
import { salesCols } from '../../shared/salesCols';
import { lineHelpers, itemConfig } from '../../shared/salesLineHelpers';
import { itemsPerUom } from '../../../../mocks/items';
import type { SoLine } from '../../../../mocks/salesOrders';
import type { BlanketAgreement, BaLine } from '../../../../mocks/blanketAgreements';
import { lineNet, lineTax, openQty, priceAfterDiscount } from '../../../../services/salesOrders';
import { baNumber, openQty as baOpenQty } from '../../../../services/blanketAgreements';
import { isPriceListValid } from '../../../../services/priceLists';
import { formatAmount } from '../../../../services/format';
import { warehouseOptions } from '../../../inventory/transfers/TransferLines';
import { editTaxCode } from '../../../../services/taxRecalc';
import { taxCodeOptions } from '../../../../services/taxCodeOptions';
import { BA_LIST_PATH } from '../../paths';
import { availableIn, lineFromItem, linePricing, shortages, type SoTabProps } from './types';

/** Builds the Sales Order Item-tab contents descriptor for the shared <DocLines>. */
export function soDoc({ draft, update, errors, m, ctx, agreements }: SoTabProps & { agreements: BlanketAgreement[] }): DocLinesProps<SoLine> {
  const lines = draft.lines;
  const linesLocked = ctx.readOnly || draft.status !== 'Draft';
  const h = lineHelpers<SoLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate });
  const { itemOf, patch, err } = h;
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const taxOf = (l: SoLine) => lineTax(l, ctx.rateOf(l.taxCode), 0);
  const short = new Set(linesLocked ? [] : shortages(draft, m, ctx.ownCommitted).map((s) => `${s.item.id}@${s.warehouse}`));
  const isShort = (l: SoLine) => short.has(`${l.itemId}@${l.warehouse}`);

  const customerAgreements = agreements.filter((ba) => ba.customerId === draft.customerId && ba.status !== 'Closed' && ba.status !== 'Terminated');

  const reprice = (l: SoLine, change: Partial<SoLine>) => {
    const item = itemOf(l);
    if (!item || !ctx.fx || l.priceSource === 'Manual') return patch(l.id, change);
    patch(l.id, { ...change, ...linePricing(item, { ...l, ...change }, draft, ctx) });
  };
  const fromItem = (itemId: string, base: Partial<SoLine>) => {
    const item = m.items.find((i) => i.id === itemId);
    return item ? lineFromItem(item, draft, ctx, m, base) : undefined;
  };

  /** The blanket-agreement picker / linked-agreement chip shown under the item cell. */
  const agreementHint = (l: SoLine) => {
    const matching: Array<{ ba: BlanketAgreement; baLine: BaLine; n: number }> = [];
    for (const ba of customerAgreements) {
      ba.lines.forEach((baLine, idx) => { if (baLine.itemId === l.itemId && baLine.rowStatus === 'Open') matching.push({ ba, baLine, n: idx + 1 }); });
    }
    const linkedBa = l.agreementId ? customerAgreements.find((ba) => ba.id === l.agreementId) : undefined;
    const linkedN = linkedBa ? linkedBa.lines.findIndex((bl) => bl.id === l.agreementLineId) + 1 : 0;
    if (!matching.length && !l.agreementId) return null;

    const pickAgreementLine = (combined: string | null) => {
      if (!combined) { patch(l.id, { agreementId: '', agreementLineId: '' }); return; }
      const [baId, baLineId] = combined.split('::');
      const ba = customerAgreements.find((b) => b.id === baId);
      const baLine = ba?.lines.find((bl) => bl.id === baLineId);
      if (!ba || !baLine) return;
      patch(l.id, { agreementId: baId, agreementLineId: baLineId, ...(!ba.ignorePrices ? { unitPrice: baLine.unitPrice, priceSource: `Agreement ${baNumber(ba)}` } : {}) });
    };

    return (
      <div className="flex items-center gap-1">
        {l.agreementId && linkedBa ? (
          <>
            <Link intent="primary" href={`#${BA_LIST_PATH}/${linkedBa.docNum ? baNumber(linkedBa) : linkedBa.id}`}><Text variant="caption">{baNumber(linkedBa)} &middot; Line {linkedN}</Text></Link>
            {!linesLocked && (
              <IconButton type="button" size="small" intent="default" variant="link" label="Unlink agreement" onClick={() => patch(l.id, { agreementId: '', agreementLineId: '' })}><Icon size={14}>close</Icon></IconButton>
            )}
          </>
        ) : !linesLocked ? (
          <Select aria-label="Link to agreement" placeholder="Link to agreement..." options={matching.map(({ ba, baLine, n }) => ({ value: `${ba.id}::${baLine.id}`, label: `${baNumber(ba)} · Line ${n} (${baOpenQty(baLine)} open)` }))} value={undefined} onValueChange={(v) => pickAgreementLine(v ?? null)} />
        ) : null}
      </div>
    );
  };

  const cols = salesCols<SoLine>({
    readOnly: linesLocked,
    currency: draft.currency,
    fx: ctx.fx,
    invalid: (l, f) => Boolean(err(l, f)),
    lineKind: (l) => { const it = itemOf(l); return it ? (it.inventoryItem ? 'Item' : 'Service') : ''; },
    itemName: (l) => itemOf(l)?.name ?? '',
    taxAmount: taxOf,
    qty: (l) => l.quantity,
    onQty: (l, quantity) => reprice(l, { quantity }),
    uomValue: (l) => l.uomCode,
    uomOptions: h.uomOptions,
    changeUom: (l, uomCode) => { const item = itemOf(l); reprice(l, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: item ? itemsPerUom(item, uomCode) ?? 1 : 1 }); },
    uomDisabled: (l) => l.deliveredQty > 0,
    qtyTrailing: (l) => (isShort(l) ? <Tooltip message="Not enough stock" icon="warning" /> : null),
    unitPrice: (l) => l.unitPrice,
    onUnitPrice: (l, v) => patch(l.id, { unitPrice: v, priceSource: 'Manual' }),
    discountPct: (l) => l.discountPct,
    onDiscount: (l, v) => patch(l.id, { discountPct: v, priceSource: 'Manual' }),
    priceAfterDisc: priceAfterDiscount,
    priceSourceLabel: (l) => l.priceSource || '—',
    repriceLink: (l) => (l.priceSource === 'Manual' ? <>{' · '}<Link intent="primary" onClick={() => reprice({ ...l, priceSource: '' }, {})}>Reprice</Link></> : null),
    priceListValue: (l) => l.priceListId,
    changePriceList: (l, id) => reprice(l, { priceListId: id }),
    priceListWhere: (r) => isPriceListValid(r, draft.postingDate),
    lineNet,
    warehouse: {
      blank: (l) => (!itemOf(l)?.inventoryItem ? <Text variant="small" tone="muted">Not stocked</Text> : undefined),
      options: (l) => warehouseOptions(m.inv.warehouses, l.warehouse),
      value: (l) => l.warehouse,
      onChange: (l, v) => patch(l.id, { warehouse: v }),
      invalid: (l) => Boolean(err(l, 'warehouse')),
      note: (l) => {
        const item = itemOf(l);
        if (!item) return null;
        const avail = availableIn(item, l.warehouse, ctx.ownCommitted);
        return <Text variant="small" tone={openQty(l) > 0 && isShort(l) ? 'danger' : 'muted'}>{avail} {item.inventoryUom} available</Text>;
      },
    },
    tax: {
      options: (l) => taxCodeOptions(m.tax.codes, 'Sales', l.taxCode),
      value: (l) => l.taxCode,
      onChange: (l, v) => reprice(l, editTaxCode(v)),
      invalid: (l) => Boolean(err(l, 'taxCode')),
      note: (l) => <Text variant="small" tone="muted">Tax PHP {lc(taxOf(l))}</Text>,
      roText: (l) => `${l.taxCode} (${ctx.rateOf(l.taxCode)}%)`,
    },
    deliveredOpen: (l) => (
      <>
        <Text variant="small">{l.deliveredQty} / {openQty(l)}</Text>
        <TableStatus intent={l.status === 'Open' ? 'primary' : 'success'}>{l.status}</TableStatus>
      </>
    ),
  });

  const columns = pick(cols, [
    ['qty', 'always'], ['warehouse', 'hide'], ['priceList', 'hide'], ['pricing', 'always'], ['tax', 'hide'], ['total', 'always'], ['delivery', 'hide'],
    // Info / catalog columns (hidden).
    ['type', 'hide'], ['name', 'hide'], ['uomName', 'hide'], ['itemsPerUnit', 'hide'], ['inventoryUom', 'hide'],
    ['priceSource', 'hide'], ['priceAfterDisc', 'hide'], ['taxAmount', 'hide'], ['grossTotalLc', 'hide'],
    // SAP workbook long-tail / UDF placeholders (hidden) — row-for-row parity.
    ['summaryType', 'hide'], ['rowNo', 'hide'], ['distrRule', 'hide'], ['cogsDistrRule', 'hide'],
    ['blanketAgreementNo', 'hide'], ['allowProcmnt', 'hide'], ['warranty', 'hide'], ['serialNo', 'hide'],
    ['unitCostPrice', 'hide'], ['priceForReport', 'hide'], ['customerDescription', 'hide'], ['amountInPrintout', 'hide'],
    ['moveRow', 'hide'], ['wWTCode', 'hide'], ['wVTVendor', 'hide'], ['wTaxDefined', 'hide'], ['wtaxRate', 'hide'],
    ['xSupplierName', 'hide'], ['xAddress', 'hide'], ['xTINumber', 'hide'], ['xCardType', 'hide'], ['countryOfOrigin', 'hide'],
    ['standardItemId', 'hide'], ['commodityClass', 'hide'],
  ]);

  return {
    prefsKey: 'so',
    columns,
    rows: lines,
    icon: 'list_alt',
    title: 'Contents',
    description: errors.lines,
    sortableKeys: ['item'],
    readOnly: linesLocked,
    // Keep already-delivered lines even if selected for removal.
    onRemove: (picked) => update({ lines: lines.filter((l) => !picked.includes(l) || l.deliveredQty > 0) }),
    item: itemConfig(h, {
      onPick: (l, id) => { const line = id ? fromItem(id, { id: l.id, quantity: l.quantity }) : undefined; patch(l.id, line ?? { itemId: '', itemNo: '', description: '' }); },
      fromItem: (id) => fromItem(id, {}),
      errorText: (l) => err(l, 'item'),
      hint: agreementHint,
      addDisabled: !draft.customerId,
      addPlaceholder: draft.customerId ? 'Search items to add a line…' : 'Pick a customer to add items',
    }),
    empty: <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>No lines yet.</Text>,
  };
}

/** Builds the Sales Order Delivery-tab contents descriptor — a read-only Ordered / Delivered view. */
export function soDeliveryDoc({ draft }: SoTabProps): DocLinesProps<SoLine> {
  const columns: PrefColumn<SoLine>[] = [
    { key: 'item', header: 'Item / Description', cell: (l) => <div className="flex flex-col"><Text variant="caption">{l.itemNo}</Text><Text variant="small">{l.description}</Text></div> },
    { key: 'ordered', header: 'Ordered', align: 'end', cell: (l) => <Text variant="small" className="whitespace-nowrap tabular-nums">{l.quantity.toLocaleString('en-PH')} {l.uomCode}</Text> },
    { key: 'delivered', header: 'Delivered', align: 'end', cell: (l) => <Text variant="small" className="whitespace-nowrap tabular-nums">{l.deliveredQty ? `${l.deliveredQty.toLocaleString('en-PH')} ${l.uomCode}` : '—'}</Text> },
  ];
  return {
    prefsKey: 'so-delivery',
    columns,
    rows: draft.lines.filter((l) => !!l.itemId),
    icon: 'local_shipping',
    title: 'Contents',
    readOnly: true,
    empty: <Text variant="small" tone="muted">No deliveries yet.</Text>,
  };
}
