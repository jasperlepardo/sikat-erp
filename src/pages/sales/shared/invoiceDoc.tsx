import { Button, Icon, Link, Text } from '@jasperlepardo/sikat-design-system';
import { type DocLinesProps } from '../../../components/form/docLines/DocLines';
import { pick, type Vis } from '../../../components/form/docLines/pick';
import { salesCols } from './salesCols';
import { lineHelpers, itemConfig } from './salesLineHelpers';
import { itemsPerUom } from '../../../mocks/items';
import { newArLine, type ArLine } from '../../../mocks/arInvoices';
import { newRiLine, type RiLine } from '../../../mocks/reserveInvoices';
import type { Delivery } from '../../../mocks/deliveries';
import type { SalesOrder } from '../../../mocks/salesOrders';
import { accountText } from '../../../mocks/chartOfAccounts';
import { customerWithholds, shipsStock } from '../../../services/arInvoices';
import { dnInventoryQty } from '../../../services/deliveries';
import { lineNet, lineTax, priceAfterDiscount } from '../../../services/salesOrders';
import { isPriceListValid } from '../../../services/priceLists';
import { warehouseOptions } from '../../inventory/transfers/TransferLines';
import { editTaxCode, lineAtc } from '../../../services/taxRecalc';
import { taxCodeOptions } from '../../../services/taxCodeOptions';
import { activeOptions } from '../../../services/inventoryMasters';
import { formatAmount } from '../../../services/format';
import { round2 } from '../../../services/num';
import { DN_LIST_PATH, SO_LIST_PATH } from '../paths';
import { asSoDraft } from '../deliveries/detail/types';
import { lineFromItem, linePricing, proposedServiceTaxCode } from '../sales-orders/detail/types';
import type { ArSectionProps } from '../invoices/detail/types';
import type { RiSectionProps } from '../reserve-invoices/detail/types';

/** A line of either invoice: A/R lines can come from a delivery; reserve-invoice lines track what's still to deliver. */
export type InvoiceLine = Omit<ArLine, 'shippedGoods'> & { shippedGoods?: boolean; openQtyForIt?: number };

/** What an A/R invoice copies from — a delivery or a sales order. */
export type CopyPick = { kind: 'DN'; doc: Delivery } | { kind: 'SO'; doc: SalesOrder };
/** A reserve invoice copies from sales orders only. */
export type CopyPickRi = { kind: 'SO'; doc: SalesOrder };

export type InvoiceDocProps =
  | (ArSectionProps & { kind: 'AR'; onCopyClick: () => void; canCopy: boolean })
  | (RiSectionProps & { kind: 'RI'; onCopyClick: () => void; canCopy: boolean });

/** Builds the A/R Invoice (`kind="AR"`) or Reserve Invoice (`"RI"`) contents descriptor for <DocLines>. */
export function invoiceDoc(props: InvoiceDocProps): DocLinesProps<InvoiceLine> {
  const { kind, errors, m, ctx, onCopyClick, canCopy } = props;
  const ar = kind === 'AR';
  const draft = props.draft as unknown as { docType: string; currency: string; postingDate: string; customerId: string; lines: InvoiceLine[] };
  const update = props.update as (patch: { lines: InvoiceLine[] }) => void;
  const newLine = (patch: Partial<InvoiceLine>): InvoiceLine => (ar ? newArLine(patch as Partial<InvoiceLine>) : newRiLine(patch as Partial<RiLine>));
  const withholds = customerWithholds(ctx.customer);
  const service = draft.docType === 'Service';
  const ro = ctx.readOnly;
  const lines = draft.lines;
  const so = asSoDraft(draft as never);

  const h = lineHelpers<InvoiceLine>({ items: m.items, lines, update, errors, postingDate: draft.postingDate });
  const { itemOf, patch, err } = h;
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const rate = (l: InvoiceLine) => ctx.rateOf(l.taxCode);
  const taxOf = (l: InvoiceLine) => lineTax(l, rate(l), 0);
  const revenueOptions = (current: string) => activeOptions(m.accounts.filter((a) => a.drawer === 'Revenue' && !a.title && !a.contra), (a) => a.code, (a) => `${a.code} ${a.name}`, current);

  const fromItem = (itemId: string, base: Partial<InvoiceLine>) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const s = lineFromItem(item, so, ctx, m, { quantity: base.quantity ?? 1 });
    return newLine({ ...s, ...(base.id ? { id: base.id } : {}), baseType: '', baseId: '', baseLineId: '', baseDocNo: '', baseRow: 0, wtaxLiable: withholds, ...(ar ? {} : { openQtyForIt: base.quantity ?? 1 }) });
  };
  /** Re-run pricing after a change, unless the price was typed over or comes from the base document. */
  const reprice = (l: InvoiceLine, change: Partial<InvoiceLine>) => {
    const item = itemOf(l);
    if (!item || l.baseId || !ctx.fx || l.priceSource === 'Manual') return patch(l.id, change);
    patch(l.id, { ...change, ...linePricing(item, { ...l, ...change }, so, ctx) });
  };
  const grossAfter = (l: InvoiceLine) => round2(l.unitPrice * (1 - l.discountPct / 100) * (1 + rate(l) / 100));
  const setGrossAfter = (l: InvoiceLine, gross: number) => {
    const net = gross / (1 + rate(l) / 100);
    patch(l.id, { unitPrice: round2(l.discountPct < 100 ? net / (1 - l.discountPct / 100) : net), priceSource: 'Manual' });
  };

  const cols = salesCols<InvoiceLine>({
    patch,
    readOnly: ro,
    currency: draft.currency,
    fx: ctx.fx,
    invalid: (l, f) => Boolean(err(l, f)),
    lineKind: (l) => { const it = itemOf(l); return it ? (it.inventoryItem ? 'Item' : 'Service') : ''; },
    taxAmount: taxOf,
    rendered: service ? () => true : undefined,
    qty: (l) => l.quantity,
    onQty: (l, quantity) => reprice(l, { quantity, ...(ar ? {} : { openQtyForIt: quantity }) }),
    uomValue: (l) => l.uomCode,
    uomOptions: h.uomOptions,
    changeUom: (l, uomCode) => { const item = itemOf(l); reprice(l, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: item ? itemsPerUom(item, uomCode) ?? 1 : 1 }); },
    uomDisabled: (l) => Boolean(l.baseId),
    qtyNote: (l) => {
      if (ro) return null;
      const item = itemOf(l);
      if (!item) return null;
      return <Text variant="small" tone="muted">{l.uomCode}{l.uomCode === item.inventoryUom ? ' · inventory UoM' : ` · ${l.itemsPerUnit} ${item.inventoryUom} each`}</Text>;
    },
    unitPrice: (l) => l.unitPrice,
    onUnitPrice: (l, v) => patch(l.id, { unitPrice: v, priceSource: 'Manual' }),
    discountPct: (l) => l.discountPct,
    onDiscount: (l, v) => patch(l.id, { discountPct: v, priceSource: 'Manual' }),
    priceAfterDisc: priceAfterDiscount,
    priceSourceLabel: (l) => l.priceSource || '—',
    repriceLink: (l) => (l.priceSource === 'Manual' && !l.baseId ? <>{' · '}<Link intent="primary" onClick={() => reprice({ ...l, priceSource: '' }, {})}>Reprice</Link></> : null),
    priceListValue: (l) => l.priceListId,
    changePriceList: (l, id) => reprice({ ...l, priceSource: '' }, { priceListId: id }),
    priceListWhere: (r) => isPriceListValid(r, draft.postingDate),
    priceListLocked: (l) => Boolean(l.baseId),
    lineNet,
    warehouse: {
      blank: (l) => {
        const item = itemOf(l);
        if (!item) return undefined;
        if (!item.inventoryItem) return <Text variant="small" tone="muted">Not stocked</Text>;
        if (ar && !shipsStock(l as ArLine, m.items)) return <Text variant="small" tone="muted">{l.warehouse} · shipped</Text>;
        return undefined;
      },
      options: (l) => warehouseOptions(m.inv.warehouses, l.warehouse),
      value: (l) => l.warehouse,
      onChange: (l, v) => patch(l.id, { warehouse: v }),
      invalid: (l) => Boolean(err(l, 'warehouse')),
      note: (l) => {
        const item = itemOf(l);
        if (!item) return null;
        if (!ar) return <Text variant="small" tone="muted">Ships from here when delivery is created</Text>;
        const inWhse = item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0;
        return <Text variant="small" tone={dnInventoryQty(l) > inWhse ? 'danger' : 'muted'}>{inWhse} {item.inventoryUom} in stock · ships now</Text>;
      },
    },
    gross: { get: grossAfter, onChange: setGrossAfter },
    tax: {
      options: (l) => taxCodeOptions(m.tax.codes, 'Sales', l.taxCode),
      value: (l) => l.taxCode,
      onChange: (l, v) => patch(l.id, editTaxCode(v)),
      invalid: (l) => Boolean(err(l, 'taxCode')),
      note: (l) => <Text variant="small" tone="muted">Tax PHP {lc(taxOf(l))}</Text>,
      roText: (l) => `${l.taxCode} (${rate(l)}%)${ar && lineAtc(l, m.tax.codes, true) ? ` · ${lineAtc(l, m.tax.codes, true)}` : ''}`,
    },
    wtax: { checked: (l) => Boolean(l.wtaxLiable), disabled: ro || !withholds, onChange: (l, on) => patch(l.id, { wtaxLiable: on }) },
    commission: { value: (l) => l.commissionPct ?? 0, onChange: (l, v) => patch(l.id, { commissionPct: v }) },
    openForDelivery: (l) => {
      const item = itemOf(l);
      if (!item || !item.inventoryItem) return null;
      return `${(l.openQtyForIt ?? 0).toLocaleString('en-PH')} ${l.uomCode}`;
    },
    baseDoc: (l) => {
      if (!l.baseId) return null;
      const path = l.baseType === 'DN' ? DN_LIST_PATH : SO_LIST_PATH;
      return { href: `#${path}/${l.baseId}`, label: l.baseDocNo, sub: `${l.baseType === 'DN' ? 'Delivery' : 'Sales order'} · row ${l.baseRow}` };
    },
    serviceDescription: { value: (l) => l.description, onChange: (l, v) => patch(l.id, { description: v }), invalid: (l) => Boolean(err(l, 'description')) },
    glAccount: { options: revenueOptions, value: (l) => l.glAccount ?? '', onChange: (l, v) => patch(l.id, { glAccount: v }), text: (l) => (l.glAccount ? accountText(l.glAccount, m.accounts) : ''), invalid: (l) => Boolean(err(l, 'glAccount')) },
    serviceAmount: { value: (l) => l.unitPrice, onChange: (l, v) => patch(l.id, { unitPrice: v, quantity: 1, priceSource: 'Manual' }), invalid: (l) => Boolean(err(l, 'unitPrice')) },
  });

  const wtaxVis: Vis = withholds ? 'opt' : 'hide';
  const columns = service
    ? pick(cols, [['description', 'always'], ['glAccount', 'always'], ['amount', 'always'], ['tax', 'always'], ['total', 'always'], ['wtax', wtaxVis]])
    : pick(cols, [
        ['qty', 'always'], ['warehouse', 'hide'], ['priceList', 'hide'], ['pricing', 'always'], ['gross', 'hide'],
        ['tax', 'hide'], ['total', 'always'], ['wtax', wtaxVis], ...(ar ? [['commission', 'hide'] as [string, Vis]] : [['openForDelivery', 'hide'] as [string, Vis]]), ['baseDoc', 'hide'],
        // Info / catalog columns (hidden).
        ['type', 'hide'], ['uomName', 'hide'], ['itemsPerUnit', 'hide'],
        ['priceSource', 'hide'], ['priceAfterDisc', 'hide'], ['taxAmount', 'hide'], ['grossTotalLc', 'hide'],
        ['countryOfOrigin', 'hide'],
      ]);

  const copyButton = (
    <div className="flex justify-end px-2">
      <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!canCopy} onClick={onCopyClick}>
        Copy from
      </Button>
    </div>
  );

  const base: DocLinesProps<InvoiceLine> = {
    prefsKey: ar ? 'ar-si' : 'ri-si',
    cardHeader: true,
    columns,
    rows: service ? lines : lines.filter((l) => !!l.itemId),
    icon: 'list_alt',
    title: 'Contents',
    description: errors.lines ?? `Items billed, in the sales unit. Prices are in ${draft.currency}.`,
    sortableKeys: ['item'],
    sortValue: (l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof InvoiceLine] ?? '')).toLowerCase(),
    readOnly: ro,
    onRemove: (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) }),
    empty: <Text variant="small" tone="muted">No lines yet.</Text>,
    header: ro ? undefined : copyButton,
  };

  if (service) {
    return {
      ...base,
      addRow: ro ? undefined : (
        <Link leadingIcon={<Icon size={20}>add</Icon>} disabled={!draft.customerId} onClick={() => update({ lines: [...lines, newLine({ taxCode: proposedServiceTaxCode(ctx.customer, m, draft.postingDate), glAccount: '4030', priceSource: 'Manual', wtaxLiable: withholds })] })}>
          Add service line
        </Link>
      ),
    };
  }

  return {
    ...base,
    item: itemConfig(h, {
      onPick: (l, id) => { const line = id ? fromItem(id, { id: l.id, quantity: l.quantity }) : undefined; patch(l.id, line ?? { itemId: '', itemNo: '', description: '' }); },
      fromItem: (id) => fromItem(id, {}),
      canChange: (l) => !l.baseId,
      errorText: (l) => err(l, 'item'),
      addDisabled: !draft.customerId,
      addPlaceholder: draft.customerId ? 'Search items to add a line…' : 'Pick a customer to add items',
    }),
  };
}
