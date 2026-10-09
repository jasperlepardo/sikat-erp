import { useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Combobox,
  Icon,
  Link,
  Radio,
  Select,
  TableStatus,
  Text,
  TextField,
  DatePicker,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { priceListDef } from '../../../settings/masterDefs';
import { isPriceListValid } from '../../../../services/priceLists';
import {
  BLANKET_AGREEMENTS,
  DEPARTMENTS,
  PRICE_MODES,
  newPoLine,
  type PoLine,
  type PriceMode,
} from '../../../../mocks/purchaseOrders';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import { activeOptions } from '../../../../services/inventoryMasters';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { isValidToday, stockTotals } from '../../../../services/items';
import { grossPrice, inventoryQty, lineNet, openQty, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { linePricing, lineFromItem, type PoTabProps } from './types';
import { formatDate } from '../../../../services/dates';

/** Optional column groups (the table's column settings). Item, quantity, price, tax and totals always show. */
const GROUPS = {
  quantities: 'Quantities & UoM',
  pricing: 'Pricing',
  delivery: 'Delivery & status',
  references: 'References',
} as const;
type Group = keyof typeof GROUPS;

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function ContentsTab({ draft, update, errors, m, ctx }: PoTabProps) {
  const [shown, setShown] = useState<Group[]>(['delivery']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Set<string>>(new Set());
  const lines = draft.lines;
  const itemOf = (l: PoLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<PoLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  /** Switch the line to another of the item's units: factor and price for that unit from the item. */
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

  // Purchase items valid on the posting date — the shared item picker's rules.
  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.purchaseItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({
        value: i.id,
        label: (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-60">{i.itemNo}</span>
            <span>{i.name}</span>
            <span className="text-xs opacity-60">{i.description}</span>
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
  const changePriceList = (l: PoLine, priceListId: string) => {
    const item = itemOf(l);
    const priced = item && ctx.fx ? linePricing(item, { ...l, priceListId }, draft, ctx) : undefined;
    patch(l.id, { priceListId, ...(priced ? { unitPrice: priced.unitPrice, discountPct: priced.discountPct } : {}) });
  };
  /**
   * A new quantity can reach another volume tier or special price break. The unit price stays as
   * entered unless a special price sets it (its breaks can be fixed prices).
   */
  const changeQuantity = (l: PoLine, quantity: number) => {
    const item = itemOf(l);
    const p = item && linePricing(item, { ...l, quantity }, draft, ctx);
    patch(l.id, { quantity, ...(p ? { discountPct: p.discountPct, ...(p.source.kind === 'special' && ctx.fx ? { unitPrice: p.unitPrice } : {}) } : {}) });
  };
  /** Where the line's discount came from, while it's still the one the rules give. */
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
              {isEditingItem ? (
                <>
                  <Text variant="caption">{item.itemNo}</Text>
                  <TextField
                    aria-label="Item name"
                    placeholder="Item name"
                    value={l.name}
                    onChange={(e) => patch(l.id, { name: e.currentTarget.value })}
                  />
                  <TextField
                    aria-label="Description"
                    placeholder="Description"
                    value={l.description}
                    onChange={(e) => patch(l.id, { description: e.currentTarget.value })}
                  />
                </>
              ) : (
                // Item no., name and description read as one block; the links sit 4px below.
                <div className="flex flex-col">
                  <Text variant="caption">{item.itemNo}</Text>
                  <Text variant="small">{l.name}</Text>
                  <Text variant="small" tone="muted">{l.description}</Text>
                </div>
              )}
              <div className="flex gap-3">
                <Link intent="primary" onClick={toggleEdit}>{isEditingItem ? 'Done' : 'Edit'}</Link>
                <Link intent="primary" onClick={() => {
                  patch(l.id, { itemId: '', itemNo: '', name: '', description: '' });
                  setEditingItem((prev) => { const next = new Set(prev); next.delete(l.id); return next; });
                }}>Change</Link>
              </div>
            </>
          ) : (
            <Combobox
              aria-label="Item No."
              placeholder="Search items"
              options={itemOptions(l.itemId)}
              value={l.itemId || null}
              invalid={Boolean(err(l, 'item'))}
              onValueChange={(v) => pickItem(l, v)}
            />
          )}
          {l.bpCatalogNo ? (
            <Text variant="small" tone="muted">
              Vendor catalog no. {l.bpCatalogNo}
            </Text>
          ) : null}
        </div>
      );
    }),
    col('qty', 'Qty / UoM', (l) => {
      if (!l.itemId) return null;
      const item = itemOf(l);
      const available = item?.inventoryItem ? stockTotals(item).available : undefined;
      const short = item && available !== undefined && available < item.minStock;
      return (
        <div className="flex flex-col gap-1 w-32 whitespace-normal">
          <TextField
            aria-label="Quantity"
            type="number"
            min={0}
            invalid={Boolean(err(l, 'quantity'))}
            value={String(l.quantity)}
            onChange={(e) => changeQuantity(l, num(e.currentTarget.value))}
          />
          {!item || l.receivedQty > 0 ? (
            <Text variant="small" tone="muted">{l.uomCode}</Text>
          ) : (
            <Combobox
              aria-label="UoM code"
              options={itemUnits(item, 'purchase').map((u) => ({ value: u.uom, label: u.uom }))}
              value={l.uomCode}
              onValueChange={(v) => v && changeUom(l, v)}
            />
          )}
          {short ? (
            <Text variant="small" tone="muted">
              Below min: {available} available, min {item.minStock}
            </Text>
          ) : null}
        </div>
      );
    }),
    col('uomName', 'UoM name', (l) => {
      if (!l.itemId) return null;
      return itemOf(l) ? l.uomName : <TextField aria-label="UoM name" className="w-28" value={l.uomName} onChange={(e) => patch(l.id, { uomName: e.currentTarget.value })} />;
    }, 'quantities'),
    col('itemsPerUnit', 'Items per unit', (l) => {
      if (!l.itemId) return null;
      return itemOf(l) ? String(l.itemsPerUnit) : (
        <TextField aria-label="Items per unit" type="number" min={1} className="w-24" value={String(l.itemsPerUnit)} onChange={(e) => patch(l.id, { itemsPerUnit: num(e.currentTarget.value) })} />
      );
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
      return item && !item.inventoryItem ? (
        <span className="text-muted">Not stocked</span>
      ) : (
        <Combobox
          aria-label="Warehouse"
          className="w-32"
          invalid={Boolean(err(l, 'warehouse'))}
          options={activeOptions(m.inv.warehouses.filter((w) => receivesFromVendors(w) || w.code === l.warehouse), (w) => w.code, (w) => w.code, l.warehouse)}
          value={l.warehouse}
          onValueChange={(warehouse) => patch(l.id, { warehouse: warehouse ?? '' })}
        />
      );
    }),
    col('priceListId', 'Price list', (l) => l.itemId ? (
      <MasterLookup def={priceListDef} fieldProps={{ 'aria-label': 'Price list', className: 'w-44' }} where={(r) => isPriceListValid(r, draft.postingDate)} value={l.priceListId} onChange={(v) => changePriceList(l, v)} />
    ) : null, 'pricing'),
    col('pricing', 'Unit price / Tax / Discount', (l) => {
      if (!l.itemId) return null;
      const rate = ctx.rateOf(l.taxCode);
      return (
        <div className="flex flex-col gap-1 w-44">
          {showNet ? (
            <TextField
              aria-label="Unit price"
              type="number"
              min={0}
              prefix={draft.currency}
              invalid={Boolean(err(l, 'unitPrice'))}
              value={String(l.unitPrice)}
              onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value) })}
            />
          ) : null}
          {showGross ? (
            <TextField
              aria-label="Gross price"
              type="number"
              min={0}
              prefix={draft.currency}
              value={String(round2(grossPrice(l, rate)))}
              onChange={(e) => patch(l.id, { unitPrice: round2(num(e.currentTarget.value) / (1 + rate / 100)) })}
            />
          ) : null}
          <Combobox
            aria-label="Tax code"
            invalid={Boolean(err(l, 'taxCode'))}
            options={taxOptions}
            value={l.taxCode}
            onValueChange={(taxCode) => patch(l.id, { taxCode: taxCode ?? '' })}
          />
          <TextField
            aria-label="Discount %"
            type="number"
            min={0}
            suffix="%"
            value={String(l.discountPct)}
            onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)) })}
          />
          {discountSource(l) ? (
            <Text variant="small" tone="muted">
              {discountSource(l)}
            </Text>
          ) : null}
        </div>
      );
    }),
    col('priceAfterDiscount', 'Price after discount', (l) => l.itemId ? formatAmount(priceAfterDiscount(l)) : null, 'pricing'),
    col('totalLc', 'Total (LC)', (l) => l.itemId ? <span className="whitespace-nowrap">PHP {lc(lineNet(l))}</span> : null),
    col('grossTotalLc', 'Gross total (LC)', (l) => l.itemId ? (
      <span className="whitespace-nowrap">PHP {lc(lineNet(l) * (1 + ctx.rateOf(l.taxCode) / 100))}</span>
    ) : null, 'pricing'),
    col('deliveryDate', 'Del. date', (l) => l.itemId ? (
      <DatePicker
        aria-label="Line delivery date"
        className="w-fit"
        invalid={Boolean(err(l, 'deliveryDate'))}
        value={l.deliveryDate || null}
        onValueChange={(v) => patch(l.id, { deliveryDate: v ?? '' })}
      />
    ) : null, 'delivery'),
    col('status', 'Row status', (l) => l.itemId ? (
      <TableStatus intent={l.status === 'Open' ? 'primary' : 'success'}>{l.status}</TableStatus>
    ) : null, 'delivery'),
    col('blanketAgreement', 'Blanket agreement', (l) => l.itemId ? (
      <Combobox aria-label="Blanket agreement" className="w-48" options={blanketOptions} value={l.blanketAgreement} onValueChange={(blanketAgreement) => patch(l.id, { blanketAgreement: blanketAgreement ?? '' })} />
    ) : null, 'references'),
    col('bpCatalogNo', 'BP catalog no.', (l) => l.itemId ? (
      <TextField aria-label="BP catalog no." className="w-36" value={l.bpCatalogNo} onChange={(e) => patch(l.id, { bpCatalogNo: e.currentTarget.value })} />
    ) : null, 'references'),
    col('mfrNo', 'Mfr no.', (l) => l.itemId ? (
      <TextField aria-label="Mfr no." className="w-36" value={l.mfrNo} onChange={(e) => patch(l.id, { mfrNo: e.currentTarget.value })} />
    ) : null, 'references'),
    col('requisitionSlipNo', 'Requisition slip no.', (l) => l.itemId ? (
      <TextField aria-label="Requisition slip no." className="w-36" value={l.requisitionSlipNo} onChange={(e) => patch(l.id, { requisitionSlipNo: e.currentTarget.value })} />
    ) : null, 'references'),
    col('department', 'Department', (l) => l.itemId ? (
      <Select aria-label="Department" className="w-40" options={[{ value: '', label: '— None —' }, ...asOptions(DEPARTMENTS)]} value={l.department} onValueChange={(department) => patch(l.id, { department })} />
    ) : null, 'references'),
    col('freeText', 'Free text', (l) => l.itemId ? (
      <TextField aria-label="Free text" className="w-48" value={l.freeText} onChange={(e) => patch(l.id, { freeText: e.currentTarget.value })} />
    ) : null, 'references'),
  ].filter((c) => !c.group || is(c.group));

  return (
    <div className="flex flex-col gap-2">
      {getPurchasingSettings().separateNetGrossPriceMode ? (
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
        variant="card"
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
        onRemove={ctx.readOnly ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
        onColumnSettings={() => setSettingsOpen(!settingsOpen)}
        actions={
          ctx.readOnly ? null : (
            <Button
              type="button"
              size="small"
              intent="primary"
              variant="solid"
              aria-label="Add line"
              leadingIcon={<Icon size={16}>add</Icon>}
              disabled={!draft.vendorId}
              onClick={() => update({ lines: [...lines, newPoLine({ deliveryDate: draft.deliveryDate, warehouse: '' })] })}
            >
              Add line
            </Button>
          )
        }
        empty={
          <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
            {draft.vendorId ? 'No lines yet. Add a line and pick an item.' : 'Pick a vendor first, then add lines.'}
          </Text>
        }
      >
        {getPurchasingSettings().separateNetGrossPriceMode ? (
          <div className="flex flex-wrap items-center gap-6" role="radiogroup" aria-label="Price mode">
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
      </DataTable>
    </div>
  );
}
