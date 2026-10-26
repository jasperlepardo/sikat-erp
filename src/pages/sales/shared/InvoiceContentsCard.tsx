import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Card, Checkbox, Combobox, Icon, Link, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { MasterLookup } from '../../../components/form/MasterLookup';
import { newArLine, type ArLine } from '../../../mocks/arInvoices';
import { newRiLine, type RiLine } from '../../../mocks/reserveInvoices';
import type { Delivery } from '../../../mocks/deliveries';
import { itemUnits, itemsPerUom } from '../../../mocks/items';
import type { SalesOrder } from '../../../mocks/salesOrders';
import { accountText } from '../../../mocks/chartOfAccounts';
import { customerWithholds, shipsStock } from '../../../services/arInvoices';
import { dnInventoryQty, dnNumber } from '../../../services/deliveries';
import { formatAmount } from '../../../services/format';
import { isValidToday } from '../../../services/items';
import { isPriceListValid, priceListName } from '../../../services/priceLists';
import { lineNet, lineTax, openQty, priceAfterDiscount, soNumber } from '../../../services/salesOrders';
import { priceListDef } from '../../settings/masterDefs';
import { warehouseOptions } from '../../inventory/transfers/TransferLines';
import { CopyPanel, type CopySourceType } from '../../purchasing/shared/CopyPanel';
import { asSoDraft } from '../deliveries/detail/types';
import { lineFromItem, linePricing, proposedServiceTaxCode } from '../sales-orders/detail/types';
import type { ArSectionProps } from '../invoices/detail/types';
import type { RiSectionProps } from '../reserve-invoices/detail/types';
import { editTaxCode, lineAtc } from '../../../services/taxRecalc';
import { DN_LIST_PATH, SO_LIST_PATH } from '../paths';
import { taxCodeOptions } from '../../../services/taxCodeOptions';
import { activeOptions } from '../../../services/inventoryMasters';
import { round2 } from '../../../services/num';

const num = (v: string) => (v === '' ? 0 : Number(v));

export type CopyPick = { kind: 'DN'; doc: Delivery } | { kind: 'SO'; doc: SalesOrder };
/** A reserve invoice copies from sales orders only. */
export type CopyPickRi = { kind: 'SO'; doc: SalesOrder };

/** A line of either invoice: A/R lines can come from a delivery; reserve invoice lines track what's still to deliver. */
type Line = Omit<ArLine, 'shippedGoods'> & { shippedGoods?: boolean; openQtyForIt?: number };
type Picks = { lineId: string; qty: number }[];
type Props =
  | (ArSectionProps & { kind: 'AR'; onCopy: (from: CopyPick, picks: Picks) => void; cardFooter?: ReactNode })
  | (RiSectionProps & { kind: 'RI'; onCopy: (from: CopyPickRi, picks: Picks) => void; cardFooter?: ReactNode });

const GROUPS = { warehouse: 'Warehouse', priceListId: 'Price list', gross: 'Gross price', tax: 'Tax', wtax: 'WTax liable', commission: 'Commission', openQty: 'Open for delivery', base: 'Base document' } as const;
type Group = keyof typeof GROUPS;

/**
 * The Contents of an A/R invoice (`kind="AR"`) or a reserve invoice (`"RI"`). They differ in where
 * stock goes: an A/R invoice ships now (or bills a delivery that did); a reserve invoice bills first
 * and its delivery ships later, so its lines carry what's still open for delivery.
 */
export function InvoiceContentsCard(props: Props) {
  const { kind, errors, m, ctx, cardFooter } = props;
  const ar = kind === 'AR';
  // One line shape for both: the props' draft and update, seen through it.
  const draft = props.draft as Omit<Props['draft'], 'lines'> & { lines: Line[] };
  const update = props.update as (patch: { lines: Line[] }) => void;
  const newLine = (patch: Partial<Line>): Line => (ar ? newArLine(patch as Partial<Line>) : newRiLine(patch as Partial<RiLine>));
  const deliveries = props.kind === 'AR' ? props.m.deliveries : [];
  const [copying, setCopying] = useState(false);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const withholds = customerWithholds(ctx.customer);
  // Until changed, WTax liable shows when the customer withholds (it can be picked after the table loads).
  const [picked, setShown] = useState<Group[] | null>(null);
  const shown = picked ?? (withholds ? ['wtax' as Group] : []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const service = draft.docType === 'Service';
  const is = (g: Group) => shown.includes(g) || (service && g === 'tax');
  const lines = draft.lines;
  const shownLines = lines.filter((l) => (service ? true : !!l.itemId));
  const ro = ctx.readOnly;
  const itemOf = (l: Line) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<Line>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: Line, f: string) => errors[`line:${l.id}:${f}`];
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const rate = (l: Line) => ctx.rateOf(l.taxCode);
  const taxOf = (l: Line) => lineTax(l, rate(l), 0);
  const so = asSoDraft(draft as never);
  const taxOptions = (current: string) => taxCodeOptions(m.tax.codes, 'Sales', current);
  const revenueOptions = (current: string) => activeOptions(m.accounts.filter((a) => a.drawer === 'Revenue' && !a.title && !a.contra), (a) => a.code, (a) => `${a.code} ${a.name}`, current);

  // Copy From: this customer's open deliveries with something left to bill (A/R only), and open orders with something left to ship.
  const mine = (c: { customerId: string; currency: string }) => (!draft.customerId || c.customerId === draft.customerId) && (!ctx.based || c.currency === draft.currency);
  const taken = new Set(lines.map((l) => l.baseLineId).filter(Boolean));
  const dns = deliveries.filter((d) => d.status === 'Open' && mine(d) && d.lines.some((l) => l.quantity > l.invoicedQty));
  const sos = m.orders.filter((o) => o.status === 'Open' && o.docType === draft.docType && mine(o) && o.lines.some((l) => openQty(l) > 0));
  const sources: CopySourceType<'DN' | 'SO'>[] = [
    ...(ar ? [{
      key: 'DN' as const,
      label: 'Deliveries',
      totalHeader: 'Shipped',
      qtyHeader: 'Bill',
      hint: 'Bills what was shipped, at the delivery’s price. The stock already went out with the delivery.',
      docs: dns.map((d) => ({
        id: d.id,
        label: `${dnNumber(d)} · ${d.customerName}`,
        description: `Shipped ${d.postingDate}${d.orderNumber ? ` · order ${d.orderNumber}` : ''}`,
        lines: d.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: l.quantity - l.invoicedQty })),
      })),
    }] : []),
    {
      key: 'SO',
      label: 'Sales orders',
      totalHeader: 'Ordered',
      qtyHeader: ar ? 'Bill' : 'Invoice',
      hint: ar
        ? 'Bills straight from the order with no delivery: adding the invoice also ships the stock.'
        : 'Posts revenue immediately; stock is relieved when the delivery is created later.',
      docs: sos.map((o) => ({
        id: o.id,
        label: `${soNumber(o)} · ${o.customerName}`,
        description: o.deliveryDate ? `Due ${o.deliveryDate}` : 'No delivery date',
        lines: o.lines.map((l) => ({ id: l.id, itemNo: l.itemNo || l.description, name: l.description, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
      })),
    },
  ];

  // Sales items valid on the posting date.
  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.salesItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({ value: i.id, label: <div className="flex flex-col gap-0.5"><span className="text-xs opacity-60">{i.itemNo}</span><span>{i.description || i.name}</span></div>, text: `${i.itemNo} ${i.name} ${i.description}` }));
  const fromItem = (itemId: string, base: Partial<Line>) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const s = lineFromItem(item, so, ctx, m, { quantity: base.quantity ?? 1 });
    return newLine({ ...s, ...(base.id ? { id: base.id } : {}), baseType: '', baseId: '', baseLineId: '', baseDocNo: '', baseRow: 0, wtaxLiable: withholds, ...(ar ? {} : { openQtyForIt: base.quantity ?? 1 }) });
  };
  const pickItem = (l: Line, itemId: string | null) => {
    const line = itemId ? fromItem(itemId, { id: l.id, quantity: l.quantity }) : undefined;
    patch(l.id, line ?? { itemId: '' });
  };
  /** Re-run pricing after a change, unless the price was typed over or comes from the base document. */
  const reprice = (l: Line, change: Partial<Line>) => {
    const item = itemOf(l);
    if (!item || l.baseId || !ctx.fx || l.priceSource === 'Manual') return patch(l.id, change);
    patch(l.id, { ...change, ...linePricing(item, { ...l, ...change }, so, ctx) });
  };
  /** Gross Price after Disc.: typing it back-calculates the unit price, keeping the discount. */
  const grossAfter = (l: Line) => round2(l.unitPrice * (1 - l.discountPct / 100) * (1 + rate(l) / 100));
  const setGrossAfter = (l: Line, gross: number) => {
    const net = gross / (1 + rate(l) / 100);
    patch(l.id, { unitPrice: round2(l.discountPct < 100 ? net / (1 - l.discountPct / 100) : net), priceSource: 'Manual' });
  };

  const col = (key: string, header: ReactNode, cell: (l: Line) => ReactNode, group?: Group, align?: 'start' | 'end'): TableColumn<Line> & { group?: Group } => ({ key, header, cell, group, ...(align ? { align } : {}) });

  const taxCol = col('tax', 'Tax code', (l) => {
    if (ro) return (
      <div className="flex flex-col gap-0.5">
        <Text variant="small">{l.taxCode} ({rate(l)}%){ar && lineAtc(l, m.tax.codes, true) ? ` · ${lineAtc(l, m.tax.codes, true)}` : ''}</Text>
        <Text variant="small" tone="muted">Tax PHP {lc(taxOf(l))}</Text>
      </div>
    );
    return (
      <div className="flex w-32 flex-col gap-1">
        <Combobox aria-label="Tax code" invalid={Boolean(err(l, 'taxCode'))} options={taxOptions(l.taxCode)} value={l.taxCode || null} onValueChange={(v) => patch(l.id, editTaxCode(v ?? ''))} />
        <Text variant="small" tone="muted">Tax PHP {lc(taxOf(l))}</Text>
      </div>
    );
  }, 'tax', 'end');
  const totalCol = col('totals', 'Total (LC)', (l) => (
    <Text variant="small" className="whitespace-nowrap tabular-nums">PHP {lc(lineNet(l))}</Text>
  ), undefined, 'end');
  const wtaxCol = col('wtax', 'WTax', (l) => (
    <Checkbox aria-label={`WTax liable ${l.itemNo || l.description}`} disabled={ro || !withholds} checked={l.wtaxLiable} onChange={(e) => patch(l.id, { wtaxLiable: e.currentTarget.checked })} />
  ), 'wtax');

  const openQtyCol = col('openQtyForIt', 'Open for delivery', (l) => {
    const item = itemOf(l);
    if (!item || !item.inventoryItem) return null;
    return (
      <Text variant="small" className="whitespace-nowrap tabular-nums">
        {(l.openQtyForIt ?? 0).toLocaleString('en-PH')} {l.uomCode}
      </Text>
    );
  }, 'openQty', 'end');

  const itemColumns = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      if (!item || (editing.has(l.id) && !ro)) {
        return (
          <div className="flex w-64 flex-col gap-1">
            {item ? (
              <TextField aria-label="Item description" value={l.description} onChange={(e) => patch(l.id, { description: e.currentTarget.value })} />
            ) : (
              <Combobox aria-label="Item No." placeholder="Search items" options={itemOptions(l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(v) => pickItem(l, v)} />
            )}
            {item ? (
              <Link intent="primary" onClick={() => setEditing((s) => { const n = new Set(s); n.delete(l.id); return n; })}>
                Done
              </Link>
            ) : null}
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-1 whitespace-normal">
          <div className="flex flex-col">
            <Text variant="caption" className="wrap-break-word">{l.itemNo}</Text>
            <Text variant="small" className="wrap-break-word">{l.description}</Text>
          </div>
          {ro ? null : (
            <div className="flex gap-3">
              <Link intent="primary" onClick={() => setEditing((s) => new Set(s).add(l.id))}>
                Edit
              </Link>
              {/* A copied line stays its base document's item. */}
              {l.baseId ? null : (
                <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', description: '' })}>
                  Change
                </Link>
              )}
            </div>
          )}
        </div>
      );
    }),
    col('qty', 'Qty / UoM', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      if (ro) return (
        <Text variant="small" className="whitespace-nowrap tabular-nums">
          {l.quantity.toLocaleString('en-PH')} {l.uomCode}
        </Text>
      );
      return (
        <div className="flex w-40 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Quantity" type="number" min={0} invalid={Boolean(err(l, 'quantity'))} value={String(l.quantity)} onChange={(e) => reprice(l, { quantity: num(e.currentTarget.value), ...(ar ? {} : { openQtyForIt: num(e.currentTarget.value) }) })} />
          {l.baseId ? null : (
            <Select aria-label="UoM code" options={itemUnits(item, 'sales').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(uomCode) => reprice(l, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit: itemsPerUom(item, uomCode) ?? 1 })} />
          )}
          <Text variant="small" tone="muted">
            {l.uomCode}
            {l.uomCode === item.inventoryUom ? ' · inventory UoM' : ` · ${l.itemsPerUnit} ${item.inventoryUom} each`}
          </Text>
        </div>
      );
    }, undefined, 'end'),
    col('warehouse', 'Whse', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      if (!item.inventoryItem) return <Text variant="small" tone="muted">Not stocked</Text>;
      if (ar && !shipsStock(l as ArLine, m.items)) return <Text variant="small" tone="muted">{l.warehouse} · shipped</Text>;
      if (ro) return <Text variant="small">{l.warehouse || '—'}</Text>;
      const inWhse = item.warehouses.find((w) => w.code === l.warehouse)?.inStock ?? 0;
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <Combobox aria-label="Warehouse" invalid={Boolean(err(l, 'warehouse'))} options={warehouseOptions(m.inv.warehouses, l.warehouse)} value={l.warehouse || null} onValueChange={(v) => patch(l.id, { warehouse: v ?? '' })} />
          {ar ? (
            <Text variant="small" tone={dnInventoryQty(l) > inWhse ? 'danger' : 'muted'}>{inWhse} {item.inventoryUom} in stock · ships now</Text>
          ) : (
            <Text variant="small" tone="muted">Ships from here when delivery is created</Text>
          )}
        </div>
      );
    }, 'warehouse'),
    col('priceListId', 'Price list', (l) => {
      if (!itemOf(l)) return null;
      if (l.baseId || ro) return <Text variant="small">{priceListName(l.priceListId) || '—'}</Text>;
      return <MasterLookup def={priceListDef} fieldProps={{ 'aria-label': 'Price list', className: 'w-40' }} where={(r) => isPriceListValid(r, draft.postingDate)} value={l.priceListId} onChange={(v) => reprice({ ...l, priceSource: '' }, { priceListId: v })} />;
    }, 'priceListId'),
    col('pricing', 'Unit price / Discount', (l) => {
      if (!itemOf(l)) return null;
      if (ro) return (
        <div className="flex flex-col whitespace-nowrap tabular-nums">
          <Text variant="small">{draft.currency} {formatAmount(l.discountPct ? priceAfterDiscount(l) : l.unitPrice)}</Text>
          {l.discountPct ? <Text variant="small" tone="muted" className="line-through">{draft.currency} {formatAmount(l.unitPrice)}</Text> : null}
        </div>
      );
      return (
        <div className="flex w-44 shrink-0 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Unit price" type="number" min={0} prefix={draft.currency} invalid={Boolean(err(l, 'unitPrice'))} value={String(l.unitPrice)} onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value), priceSource: 'Manual' })} />
          <TextField aria-label="Discount %" type="number" min={0} suffix="%" value={String(l.discountPct)} onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)), priceSource: 'Manual' })} />
          <Text variant="small" tone="muted">
            {l.priceSource || '—'}
            {l.priceSource === 'Manual' && !l.baseId ? (
              <>
                {' · '}
                <Link intent="primary" onClick={() => reprice({ ...l, priceSource: '' }, {})}>
                  Reprice
                </Link>
              </>
            ) : null}
          </Text>
        </div>
      );
    }, undefined, 'end'),
    col('gross', 'Gross after disc.', (l) => {
      if (!itemOf(l)) return null;
      if (ro) return <Text variant="small" className="whitespace-nowrap tabular-nums">{draft.currency} {formatAmount(grossAfter(l))}</Text>;
      return <TextField aria-label="Gross price after discount" type="number" min={0} prefix={draft.currency} className="w-40" value={String(grossAfter(l))} onChange={(e) => setGrossAfter(l, num(e.currentTarget.value))} />;
    }, 'gross', 'end'),
    taxCol,
    totalCol,
    wtaxCol,
    col('commission', 'Comm. %', (l) => {
      if (!itemOf(l)) return null;
      if (ro) return <Text variant="small" className="tabular-nums">{l.commissionPct ? `${l.commissionPct}%` : '—'}</Text>;
      return <TextField aria-label="Commission %" type="number" min={0} suffix="%" className="w-24" value={String(l.commissionPct)} onChange={(e) => patch(l.id, { commissionPct: Math.min(100, num(e.currentTarget.value)) })} />;
    }, 'commission', 'end'),
    ...(ar ? [] : [openQtyCol]),
    col('base', 'Base document', (l) => {
      if (!l.baseId) return <Text variant="small" tone="muted">—</Text>;
      const path = l.baseType === 'DN' ? DN_LIST_PATH : SO_LIST_PATH;
      return (
        <div className="flex flex-col whitespace-nowrap">
          <Link intent="primary" href={`#${path}/${l.baseId}`}>{l.baseDocNo}</Link>
          <Text variant="small" tone="muted">{l.baseType === 'DN' ? 'Delivery' : 'Sales order'} · row {l.baseRow}</Text>
        </div>
      );
    }, 'base'),
  ];

  const serviceColumns = [
    col('description', 'Description', (l) =>
      ro ? <Text variant="small" className="whitespace-normal">{l.description}</Text> : <TextField aria-label="Description" className="w-72" invalid={Boolean(err(l, 'description'))} value={l.description} onChange={(e) => patch(l.id, { description: e.currentTarget.value })} />,
    ),
    col('glAccount', 'G/L account', (l) =>
      ro ? <Text variant="small">{l.glAccount ? accountText(l.glAccount, m.accounts) : '—'}</Text> : <div className="w-60"><Combobox aria-label="G/L account" invalid={Boolean(err(l, 'glAccount'))} options={revenueOptions(l.glAccount)} value={l.glAccount || null} onValueChange={(v) => patch(l.id, { glAccount: v ?? '' })} /></div>,
    ),
    col('amount', 'Amount', (l) =>
      ro ? <Text variant="small" className="whitespace-nowrap tabular-nums">{draft.currency} {formatAmount(l.unitPrice)}</Text> : <TextField aria-label="Amount" type="number" min={0} prefix={draft.currency} className="w-40" invalid={Boolean(err(l, 'unitPrice'))} value={String(l.unitPrice)} onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value), quantity: 1, priceSource: 'Manual' })} />,
    undefined, 'end'),
    taxCol,
    totalCol,
    wtaxCol,
  ];

  const columns: TableColumn<Line>[] = (service ? serviceColumns : itemColumns).filter((c) => !c.group || is(c.group));
  const groups = (Object.keys(GROUPS) as Group[]).filter((g) => (!service || g === 'wtax') && (g !== 'openQty' || !ar));

  const copyButton = (
    <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!dns.length && !sos.length} onClick={() => setCopying(true)}>
      Copy from
    </Button>
  );
  const addRow = ro ? undefined : service ? (
    <div className="flex items-center justify-between gap-2">
      <Link leadingIcon={<Icon size={20}>add</Icon>} disabled={!draft.customerId} onClick={() => update({ lines: [...lines, newLine({ taxCode: proposedServiceTaxCode(ctx.customer, m, draft.postingDate), glAccount: '4030', priceSource: 'Manual', wtaxLiable: withholds })] })}>
        Add service line
      </Link>
      {copyButton}
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <Combobox
          key={addKey}
          aria-label="Search items to add a line"
          placeholder={draft.customerId ? 'Search items to add a line…' : 'Pick a customer to add items'}
          disabled={!draft.customerId}
          options={itemOptions('')}
          value={null}
          onValueChange={(id) => {
            const line = id ? fromItem(id, {}) : undefined;
            if (!line) return;
            update({ lines: [...shownLines, line] });
            setAddKey((k) => k + 1);
          }}
        />
      </div>
      {copyButton}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {settingsOpen ? (
        <Card>
          <Card.Header icon={<Icon size={24}>tune</Icon>}>Columns</Card.Header>
          <Card.Content>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {groups.map((g) => (
                <Checkbox key={g} checked={shown.includes(g)} onChange={(e) => setShown(e.currentTarget.checked ? [...shown, g] : shown.filter((x) => x !== g))}>
                  {GROUPS[g]}
                </Checkbox>
              ))}
            </div>
          </Card.Content>
        </Card>
      ) : null}
      {errors.lines ? <Text variant="small" tone="danger">{errors.lines}</Text> : null}
      <div className={ro ? '[&_.sikat-table__row:hover>.sikat-table__td]:[box-shadow:none]' : undefined}>
        <DataTable
          noPagination
          rows={shownLines}
          getRowId={(l) => l.id}
          columns={columns}
          unsortable={columns.map((c) => c.key)}
          onRemove={ro ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
          onColumnSettings={() => setSettingsOpen(!settingsOpen)}
          empty={<Text variant="small" tone="muted">No lines yet.</Text>}
          spanRow={addRow}
          cardFooter={cardFooter}
        />
      </div>
      {copying
        ? createPortal(
            <CopyPanel
              sources={sources}
              taken={taken}
              onCancel={() => setCopying(false)}
              onCopy={(type, docId, picks) => {
                setCopying(false);
                if (type === 'DN') {
                  const doc = deliveries.find((d) => d.id === docId);
                  if (doc && props.kind === 'AR') props.onCopy({ kind: 'DN', doc }, picks);
                } else {
                  const doc = m.orders.find((o) => o.id === docId);
                  if (doc) props.onCopy({ kind: 'SO', doc }, picks);
                }
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
