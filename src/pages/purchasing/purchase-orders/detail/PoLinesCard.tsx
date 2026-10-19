import { useState } from 'react';
import {
  Card,
  Checkbox,
  Combobox,
  Icon,
  Link,
  Radio,
  TableStatus,
  Text,
  TextField,
  DatePicker,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { departmentDef, priceListDef } from '../../../settings/masterDefs';
import { nameIn } from '../../../../services/partnerMasters';
import { departments } from '../../../../services/peopleMasters';
import { isPriceListValid } from '../../../../services/priceLists';
import {
  BLANKET_AGREEMENTS,
  PRICE_MODES,
  newPoLine,
  type PoLine,
  type PriceMode,
} from '../../../../mocks/purchaseOrders';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import { formatDate } from '../../../../services/dates';
import { activeOptions } from '../../../../services/inventoryMasters';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { isValidToday, stockTotals } from '../../../../services/items';
import { getPurchasingSettings, grossPrice, inventoryQty, lineNet, openQty, poTotals, poWithholding, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { linePricing, lineFromItem, viewCurrency, type PoTabProps } from './types';
import { PurchTotalsFooter, PurchTotalNote, PurchTotalRow } from '../../shared/PurchTotalsFooter';

/** Optional column groups (the table's column settings). Item, quantity, price and totals always show. */
const GROUPS = {
  quantities: 'Quantities & UoM',
  pricing: 'Pricing',
  warehouse: 'Warehouse',
  priceListId: 'Price list',
  tax: 'Tax',
  delivery: 'Delivery & status',
  references: 'References',
} as const;
type Group = keyof typeof GROUPS;

const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

const WITHHELD_LABEL: Record<string, string> = {
  'Expanded (EWT)': 'EWT',
  'Final (FWT)': 'Final tax',
  'Withholding VAT': 'VAT',
  'Percentage tax': 'Percentage tax',
};

export function PoLinesCard({ draft, update, errors, m, ctx }: PoTabProps) {
  const [shown, setShown] = useState<Group[]>(['delivery']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const lines = draft.lines;
  const linesLocked = ctx.readOnly || ctx.added;
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = poTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const withholdingLines = poWithholding(draft, ctx.vendor, m.items, m.tax, draft.postingDate);
  const withholdingTotal = withholdingLines.filter((w) => w.deducted).reduce((s, w) => s + w.amount, 0);
  const view = viewCurrency(draft, ctx, m);
  const showFreight = getPurchasingSettings().manageFreightInDocuments;
  const showRounding = getPurchasingSettings().roundingMethod === 'By Currency';
  const vTotals = {
    beforeDiscount: view.convert(totals.beforeDiscount),
    discount: view.convert(totals.discount),
    freight: view.convert(totals.freight),
    rounding: view.convert(totals.rounding),
    tax: view.convert(totals.tax),
    total: view.convert(totals.total),
    reverseCharge: totals.reverseCharge ? view.convert(totals.reverseCharge) : undefined,
  };
  const itemOf = (l: PoLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<PoLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const changeUom = (l: PoLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!itemsPerUnit) return;
    const priced = item && ctx.fx ? linePricing(item, { ...l, uomCode }, draft, ctx) : undefined;
    patch(l.id, {
      uomCode,
      uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode,
      itemsPerUnit,
      ...(priced
        ? { unitPrice: priced.unitPrice, discountPct: priced.discountPct }
        : { unitPrice: round2((l.unitPrice / (l.itemsPerUnit || 1)) * itemsPerUnit) }),
    });
  };
  const lc = (n: number) => formatAmount(n * ctx.fx);
  const showNet = draft.priceMode !== 'Gross';
  const showGross = draft.priceMode !== 'Net';
  const is = (g: Group) => shown.includes(g);
  const err = (l: PoLine, field: string) => errors[`line:${l.id}:${field}`];

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.purchaseItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({
        value: i.id,
        label: (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-60">{i.itemNo}</span>
            <span>{i.description || i.name}</span>
          </div>
        ),
        text: `${i.itemNo} ${i.description}`,
      }));
  const taxOptions = m.tax.codes
    .filter((c) => c.direction === 'Purchase' && c.active)
    .map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));
  const blanketOptions = [
    { value: '', label: '— None —' },
    ...BLANKET_AGREEMENTS.filter((b) => b.vendorId === draft.vendorId && b.validTo >= draft.postingDate).map((b) => ({
      value: b.no,
      label: `${b.no} · ${b.description}`,
    })),
  ];

  const pickItem = (l: PoLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? lineFromItem(item, draft, ctx, m, { id: l.id, quantity: l.quantity, deliveryDate: l.deliveryDate || draft.deliveryDate }) : { itemId: '' });
  };
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const blank = newPoLine({ deliveryDate: draft.deliveryDate, warehouse: '' });
    return { ...blank, ...lineFromItem(item, draft, ctx, m, { id: blank.id, quantity: 1, deliveryDate: draft.deliveryDate, warehouse: '' }) } as PoLine;
  };
  const changePriceList = (l: PoLine, priceListId: string) => {
    const item = itemOf(l);
    const priced = item && ctx.fx ? linePricing(item, { ...l, priceListId }, draft, ctx) : undefined;
    patch(l.id, { priceListId, ...(priced ? { unitPrice: priced.unitPrice, discountPct: priced.discountPct } : {}) });
  };
  const changeQuantity = (l: PoLine, quantity: number) => {
    const item = itemOf(l);
    const p = item && linePricing(item, { ...l, quantity }, draft, ctx);
    patch(l.id, { quantity, ...(p ? { discountPct: p.discountPct, ...(p.source.kind === 'special' && ctx.fx ? { unitPrice: p.unitPrice } : {}) } : {}) });
  };
  const discountSource = (l: PoLine) => {
    const item = itemOf(l);
    const p = item && linePricing(item, l, draft, ctx);
    return p && p.source.kind !== 'list' && p.discountPct === l.discountPct && (p.source.kind !== 'special' || p.unitPrice === l.unitPrice) ? p.source.label : undefined;
  };

  const col = (key: string, header: string, cell: (l: PoLine) => React.ReactNode, group?: Group): TableColumn<PoLine> & { group?: Group } => ({
    key,
    header,
    cell,
    group,
  });

  const columns = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      const isEditingItem = editingItem.has(l.id);
      const toggleEdit = () => setEditingItem((prev) => {
        const next = new Set(prev);
        next.has(l.id) ? next.delete(l.id) : next.add(l.id);
        return next;
      });
      return (
        <div className="flex flex-col gap-1 w-64 whitespace-normal">
          {item ? (
            <>
              {isEditingItem && !linesLocked ? (
                <>
                  <Text variant="caption">{item.itemNo}</Text>
                  <TextField aria-label="Item name" placeholder="Item name" value={l.name} onChange={(e) => patch(l.id, { name: e.currentTarget.value })} />
                  <TextField aria-label="Description" placeholder="Description" value={l.description} onChange={(e) => patch(l.id, { description: e.currentTarget.value })} />
                </>
              ) : (
                <div className="flex flex-col">
                  <Text variant="caption">{item.itemNo}</Text>
                  <Text variant="small">{l.name}</Text>
                  <Text variant="small" tone="muted">{l.description}</Text>
                </div>
              )}
              {linesLocked ? null : (
                <div className="flex gap-3">
                  <Link intent="primary" onClick={toggleEdit}>{isEditingItem ? 'Done' : 'Edit'}</Link>
                  <Link intent="primary" onClick={() => {
                    patch(l.id, { itemId: '', itemNo: '', name: '', description: '' });
                    setEditingItem((prev) => { const next = new Set(prev); next.delete(l.id); return next; });
                  }}>Change</Link>
                </div>
              )}
            </>
          ) : (
            <Combobox aria-label="Item No." placeholder="Search items" options={itemOptions(l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(v) => pickItem(l, v)} />
          )}
          {l.bpCatalogNo ? <Text variant="small" tone="muted">Vendor catalog no. {l.bpCatalogNo}</Text> : null}
        </div>
      );
    }),
    col('qty', 'Qty / UoM', (l) => {
      if (!l.itemId) return null;
      const item = itemOf(l);
      const available = item?.inventoryItem ? stockTotals(item).available : undefined;
      const short = item && available !== undefined && available < item.minStock;
      if (linesLocked) return (
        <Text variant="small" className="whitespace-nowrap tabular-nums">{l.quantity.toLocaleString('en-PH')} {l.uomCode}</Text>
      );
      return (
        <div className="flex flex-col gap-1 w-32 whitespace-normal">
          <TextField aria-label="Quantity" type="number" min={0} invalid={Boolean(err(l, 'quantity'))} value={String(l.quantity)} onChange={(e) => changeQuantity(l, num(e.currentTarget.value))} />
          {!item || l.receivedQty > 0 ? (
            <Text variant="small" tone="muted">{l.uomCode}</Text>
          ) : (
            <Combobox aria-label="UoM code" options={itemUnits(item, 'purchase').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(v) => v && changeUom(l, v)} />
          )}
          {short ? <Text variant="small" tone="muted">Below min: {available} available, min {item.minStock}</Text> : null}
        </div>
      );
    }),
    col('uomName', 'UoM name', (l) => {
      if (!l.itemId) return null;
      if (linesLocked || itemOf(l)) return <Text variant="small">{l.uomName}</Text>;
      return <TextField aria-label="UoM name" className="w-28" value={l.uomName} onChange={(e) => patch(l.id, { uomName: e.currentTarget.value })} />;
    }, 'quantities'),
    col('itemsPerUnit', 'Items per unit', (l) => {
      if (!l.itemId) return null;
      if (linesLocked || itemOf(l)) return <Text variant="small">{l.itemsPerUnit}</Text>;
      return <TextField aria-label="Items per unit" type="number" min={1} className="w-24" value={String(l.itemsPerUnit)} onChange={(e) => patch(l.id, { itemsPerUnit: num(e.currentTarget.value) })} />;
    }, 'quantities'),
    col('inventoryUom', 'Inventory UoM', (l) => l.itemId ? (l.itemsPerUnit === 1 ? 'Yes' : 'No') : null, 'quantities'),
    col('inventoryQty', 'Qty (inventory UoM)', (l) => {
      if (!l.itemId) return null;
      const item = itemOf(l);
      return `${inventoryQty(l).toLocaleString('en-PH')} ${item?.inventoryUom ?? ''}`;
    }, 'quantities'),
    col('openQty', 'Open qty', (l) => l.itemId ? openQty(l).toLocaleString('en-PH') : null, 'quantities'),
    col('warehouse', 'Whse', (l) => {
      if (!l.itemId) return null;
      const item = itemOf(l);
      if (!item?.inventoryItem) return <span className="text-muted">Not stocked</span>;
      if (linesLocked) return <Text variant="small">{l.warehouse || '—'}</Text>;
      return (
        <Combobox
          aria-label="Warehouse"
          className="w-32"
          invalid={Boolean(err(l, 'warehouse'))}
          options={activeOptions(m.inv.warehouses.filter((w) => receivesFromVendors(w) || w.code === l.warehouse), (w) => w.code, (w) => w.code, l.warehouse)}
          value={l.warehouse}
          onValueChange={(warehouse) => patch(l.id, { warehouse: warehouse ?? '' })}
        />
      );
    }, 'warehouse'),
    col('priceListId', 'Price list', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) {
        const pl = priceListDef.collection.snapshot().find((p) => p.id === l.priceListId);
        return <Text variant="small">{pl ? priceListDef.label(pl) : '—'}</Text>;
      }
      return <MasterLookup def={priceListDef} fieldProps={{ 'aria-label': 'Price list', className: 'w-44' }} where={(r) => isPriceListValid(r, draft.postingDate)} value={l.priceListId} onChange={(v) => changePriceList(l, v)} />;
    }, 'priceListId'),
    col('pricing', 'Unit price / Discount', (l) => {
      if (!l.itemId) return null;
      const rate = ctx.rateOf(l.taxCode);
      if (linesLocked) return (
        <div className="flex flex-col gap-0.5 whitespace-nowrap tabular-nums">
          <Text variant="small">{draft.currency} {formatAmount(l.discountPct ? priceAfterDiscount(l) : l.unitPrice)}</Text>
          {l.discountPct ? <Text variant="small" tone="muted" className="line-through">{draft.currency} {formatAmount(l.unitPrice)}</Text> : null}
        </div>
      );
      return (
        <div className="flex flex-col gap-1 w-44">
          {showNet ? <TextField aria-label="Unit price" type="number" min={0} prefix={draft.currency} invalid={Boolean(err(l, 'unitPrice'))} value={String(l.unitPrice)} onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value) })} /> : null}
          {showGross ? <TextField aria-label="Gross price" type="number" min={0} prefix={draft.currency} value={String(round2(grossPrice(l, rate)))} onChange={(e) => patch(l.id, { unitPrice: round2(num(e.currentTarget.value) / (1 + rate / 100)) })} /> : null}
          <TextField aria-label="Discount %" type="number" min={0} suffix="%" value={String(l.discountPct)} onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)) })} />
          {discountSource(l) ? <Text variant="small" tone="muted">{discountSource(l)}</Text> : null}
        </div>
      );
    }),
    col('taxCode', 'Tax code', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small">{l.taxCode}</Text>;
      return <Combobox aria-label="Tax code" invalid={Boolean(err(l, 'taxCode'))} options={taxOptions} value={l.taxCode} onValueChange={(taxCode) => patch(l.id, { taxCode: taxCode ?? '' })} />;
    }, 'tax'),
    col('priceAfterDiscount', 'Price after discount', (l) => l.itemId ? formatAmount(priceAfterDiscount(l)) : null, 'pricing'),
    col('totalLc', 'Total (LC)', (l) => l.itemId ? <span className="whitespace-nowrap">PHP {lc(lineNet(l))}</span> : null),
    col('grossTotalLc', 'Gross total (LC)', (l) => l.itemId ? (
      <span className="whitespace-nowrap">PHP {lc(lineNet(l) * (1 + ctx.rateOf(l.taxCode) / 100))}</span>
    ) : null, 'pricing'),
    col('deliveryDate', 'Del. date', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small">{l.deliveryDate ? formatDate(l.deliveryDate) : '—'}</Text>;
      return <DatePicker aria-label="Line delivery date" className="w-fit" invalid={Boolean(err(l, 'deliveryDate'))} value={l.deliveryDate || null} onValueChange={(v) => patch(l.id, { deliveryDate: v ?? '' })} />;
    }, 'delivery'),
    col('status', 'Row status', (l) => l.itemId ? (
      <TableStatus intent={l.status === 'Open' ? 'primary' : 'success'}>{l.status}</TableStatus>
    ) : null, 'delivery'),
    col('blanketAgreement', 'Blanket agreement', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small">{l.blanketAgreement || '—'}</Text>;
      return <Combobox aria-label="Blanket agreement" className="w-48" options={blanketOptions} value={l.blanketAgreement} onValueChange={(blanketAgreement) => patch(l.id, { blanketAgreement: blanketAgreement ?? '' })} />;
    }, 'references'),
    col('bpCatalogNo', 'BP catalog no.', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small">{l.bpCatalogNo || '—'}</Text>;
      return <TextField aria-label="BP catalog no." className="w-36" value={l.bpCatalogNo} onChange={(e) => patch(l.id, { bpCatalogNo: e.currentTarget.value })} />;
    }, 'references'),
    col('mfrNo', 'Mfr no.', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small">{l.mfrNo || '—'}</Text>;
      return <TextField aria-label="Mfr no." className="w-36" value={l.mfrNo} onChange={(e) => patch(l.id, { mfrNo: e.currentTarget.value })} />;
    }, 'references'),
    col('requisitionSlipNo', 'Requisition slip no.', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small">{l.requisitionSlipNo || '—'}</Text>;
      return <TextField aria-label="Requisition slip no." className="w-36" value={l.requisitionSlipNo} onChange={(e) => patch(l.id, { requisitionSlipNo: e.currentTarget.value })} />;
    }, 'references'),
    col('department', 'Department', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small">{l.departmentId ? nameIn(departments, l.departmentId) : '—'}</Text>;
      return <MasterLookup def={departmentDef} fieldProps={{ 'aria-label': 'Department', className: 'w-40' }} value={l.departmentId} onChange={(departmentId) => patch(l.id, { departmentId })} placeholder="None" clearable />;
    }, 'references'),
    col('freeText', 'Free text', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small">{l.freeText || '—'}</Text>;
      return <TextField aria-label="Free text" className="w-48" value={l.freeText} onChange={(e) => patch(l.id, { freeText: e.currentTarget.value })} />;
    }, 'references'),
  ].filter((c) => !c.group || is(c.group));

  return (
    <div className="flex flex-col gap-2">
      {getPurchasingSettings().separateNetGrossPriceMode && !linesLocked ? (
        <div className="flex flex-wrap items-center gap-6 px-2" role="radiogroup" aria-label="Price mode">
          <Text variant="small" tone="muted">
            Price mode
          </Text>
          {PRICE_MODES.map((mode: PriceMode) => (
            <Radio key={mode} name="po-price-mode" checked={draft.priceMode === mode} onChange={() => update({ priceMode: mode })}>
              {mode}
            </Radio>
          ))}
          <Text variant="small" tone="muted">
            {draft.priceMode === 'Net'
              ? 'Enter net prices; gross is calculated.'
              : draft.priceMode === 'Gross'
                ? 'Enter prices including tax; net is calculated.'
                : 'Edit either price; the other follows.'}
          </Text>
        </div>
      ) : null}

      {settingsOpen ? (
        <Card>
          <Card.Header icon={<Icon size={24}>tune</Icon>}>Columns</Card.Header>
          <Card.Content>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {(Object.keys(GROUPS) as Group[]).map((g) => (
                <Checkbox
                  key={g}
                  checked={is(g)}
                  onChange={(e) => setShown(e.currentTarget.checked ? [...shown, g] : shown.filter((x) => x !== g))}
                >
                  {GROUPS[g]}
                </Checkbox>
              ))}
            </div>
          </Card.Content>
        </Card>
      ) : null}

      <DataTable
        noPagination
        icon="list_alt"
        title="Contents"
        description={
          errors.lines ??
          `Items to order, in the purchasing unit. Prices are in ${draft.currency}${draft.currency === 'PHP' ? '' : `; totals in PHP at ${ctx.fx ? `${ctx.fx} (${ctx.fxSource}, ${formatDate(ctx.fxDate)})` : '—'}`}.`
        }
        rows={lines}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
        sortValue={(l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof PoLine] ?? '')).toLowerCase()}
        onRemove={linesLocked ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
        onColumnSettings={() => setSettingsOpen(!settingsOpen)}
        spanRow={linesLocked ? undefined : (
          <Combobox
            key={addKey}
            aria-label="Search items to add a line"
            placeholder={draft.vendorId ? 'Search items to add a line…' : 'Pick a vendor to add items'}
            disabled={!draft.vendorId}
            options={itemOptions('')}
            value={null}
            onValueChange={(id) => {
              const line = id ? fromItem(id) : undefined;
              if (!line) return;
              update({ lines: [...lines, line] });
              setAddKey((k) => k + 1);
            }}
          />
        )}
        empty={
          <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
            {draft.vendorId ? 'No lines yet. Search above to add one.' : 'Pick a vendor first, then add lines.'}
          </Text>
        }
        cardFooter={
          <PurchTotalsFooter
            totals={vTotals}
            currency={view.code}
            readOnly={linesLocked}
            discountPct={draft.discountPct}
            onDiscountChange={(discountPct) => update({ discountPct })}
            freightInput={showFreight ? (
              <div className="flex gap-1">
                <TextField
                  aria-label={`Freight (${draft.currency}, net)`}
                  type="number"
                  min={0}
                  className="w-32"
                  prefix={draft.currency}
                  value={String(draft.freight)}
                  onChange={(e) => update({ freight: Number(e.currentTarget.value) })}
                />
                <Combobox
                  aria-label="Freight tax code"
                  className="w-28"
                  options={m.tax.codes.filter((c) => c.direction === 'Purchase' && c.active).map((c) => ({ value: c.code, label: c.code }))}
                  value={draft.freightTaxCode}
                  onValueChange={(freightTaxCode) => update({ freightTaxCode: freightTaxCode ?? '' })}
                />
              </div>
            ) : undefined}
            roundingLabel={showRounding ? `Rounding (${docCurrency?.rounding ?? 'No rounding'})` : undefined}
            extraRows={<>
              {withholdingLines.filter((w) => w.deducted).map((w) => (
                <PurchTotalRow
                  key={w.atc}
                  label={`${WITHHELD_LABEL[w.kind] ?? 'Tax'} withheld — ${w.atc} (${w.rate}%)`}
                  value={-view.convert(w.amount)}
                  code={view.code}
                />
              ))}
              {withholdingLines.filter((w) => !w.deducted).map((w) => (
                <PurchTotalNote key={w.atc}>
                  VAT withheld — {w.atc} ({w.rate}%): {view.code} {formatAmount(view.convert(w.amount))} remitted by you on BIR 1600-VT, not deducted from the vendor.
                </PurchTotalNote>
              ))}
              <PurchTotalRow label="Net payment due" value={view.convert(totals.total - withholdingTotal)} code={view.code} strong />
              {draft.currency !== 'PHP' && draft.currencyView === 'BP' && ctx.fx ? (
                <PurchTotalNote>
                  ≈ PHP {formatAmount(totals.total * ctx.fx)} at {ctx.fx} ({formatDate(ctx.fxDate)} rate).
                </PurchTotalNote>
              ) : null}
            </>}
          />
        }
      />
    </div>
  );
}
