import { useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Combobox,
  Icon,
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
import {
  BLANKET_AGREEMENTS,
  DEPARTMENTS,
  PRICE_MODES,
  PURCHASING_SETTINGS,
  newPoLine,
  type PoLine,
  type PriceMode,
} from '../../../../mocks/purchaseOrders';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import { activeOptions } from '../../../../services/inventoryMasters';
import { isValidToday, stockTotals } from '../../../../services/items';
import { grossPrice, inventoryQty, lineNet, openQty, priceAfterDiscount } from '../../../../services/purchaseOrders';
import { listPrice, lineFromItem, type PoTabProps } from './types';

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
  const lines = draft.lines;
  const itemOf = (l: PoLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<PoLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  /** Switch the line to another of the item's units: factor from the item, price rescaled to the new unit. */
  const changeUom = (l: PoLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!itemsPerUnit) return;
    patch(l.id, {
      uomCode,
      uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode,
      itemsPerUnit,
      unitPrice: round2((l.unitPrice / (l.itemsPerUnit || 1)) * itemsPerUnit),
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
      .map((i) => ({ value: i.id, label: `${i.itemNo} · ${i.description}`, text: `${i.itemNo} ${i.description}` }));
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
  const changePriceList = (l: PoLine, priceList: string) => {
    const item = itemOf(l);
    patch(l.id, { priceList, ...(item && ctx.fx ? { unitPrice: round2(listPrice(item, priceList) / ctx.fx) } : {}) });
  };

  const col = (key: string, header: string, cell: (l: PoLine) => React.ReactNode, group?: Group): TableColumn<PoLine> & { group?: Group } => ({
    key,
    header,
    cell,
    group,
  });

  const columns = [
    col('itemNo', 'Item No.', (l) => (
      <div className="min-w-64">
        <Combobox
          aria-label="Item No."
          placeholder="Search items"
          options={itemOptions(l.itemId)}
          value={l.itemId || null}
          invalid={Boolean(err(l, 'item'))}
          onValueChange={(v) => pickItem(l, v)}
        />
        {l.bpCatalogNo ? (
          <Text variant="small" tone="muted">
            Vendor catalog no. {l.bpCatalogNo}
          </Text>
        ) : null}
      </div>
    )),
    col('description', 'Item description', (l) => (
      <TextField
        aria-label="Item description"
        className="min-w-56"
        value={l.description}
        onChange={(e) => patch(l.id, { description: e.currentTarget.value })}
      />
    )),
    col('quantity', 'Quantity', (l) => {
      const item = itemOf(l);
      const available = item?.inventoryItem ? stockTotals(item).available : undefined;
      const short = item && available !== undefined && available < item.minStock;
      return (
        <div className="w-28">
          <TextField
            aria-label="Quantity"
            type="number"
            min={0}
            invalid={Boolean(err(l, 'quantity'))}
            value={String(l.quantity)}
            onChange={(e) => patch(l.id, { quantity: num(e.currentTarget.value) })}
          />
          {short ? (
            <Text variant="small" tone="muted">
              Below min: {available} available, min {item.minStock}
            </Text>
          ) : null}
        </div>
      );
    }),
    col('uomCode', 'UoM code', (l) => {
      const item = itemOf(l);
      // Any of the item's purchasing units, until goods are received.
      if (!item || l.receivedQty > 0) return l.uomCode;
      return (
        <Combobox
          aria-label="UoM code"
          className="w-28"
          options={itemUnits(item, 'purchase').map((u) => ({ value: u.uom, label: u.uom }))}
          value={l.uomCode}
          onValueChange={(v) => v && changeUom(l, v)}
        />
      );
    }),
    col('uomName', 'UoM name', (l) =>
      itemOf(l) ? (
        l.uomName
      ) : (
        // No item: the name is editable on the line.
        <TextField aria-label="UoM name" className="w-28" value={l.uomName} onChange={(e) => patch(l.id, { uomName: e.currentTarget.value })} />
      ), 'quantities'),
    col('itemsPerUnit', 'Items per unit', (l) =>
      itemOf(l) ? (
        String(l.itemsPerUnit)
      ) : (
        <TextField
          aria-label="Items per unit"
          type="number"
          min={1}
          className="w-24"
          value={String(l.itemsPerUnit)}
          onChange={(e) => patch(l.id, { itemsPerUnit: num(e.currentTarget.value) })}
        />
      ), 'quantities'),
    col('inventoryUom', 'Inventory UoM', (l) => (l.itemsPerUnit === 1 ? 'Yes' : 'No'), 'quantities'),
    col('inventoryQty', 'Qty (inventory UoM)', (l) => {
      const item = itemOf(l);
      return `${inventoryQty(l).toLocaleString('en-PH')} ${item?.inventoryUom ?? ''}`;
    }, 'quantities'),
    col('openQty', 'Open qty', (l) => openQty(l).toLocaleString('en-PH'), 'quantities'),
    col('warehouse', 'Whse', (l) => {
      const item = itemOf(l);
      return item && !item.inventoryItem ? (
        <span className="text-muted">Not stocked</span>
      ) : (
        <Combobox
          aria-label="Warehouse"
          className="w-32"
          invalid={Boolean(err(l, 'warehouse'))}
          options={activeOptions(m.inv.warehouses, (w) => w.code, (w) => w.code, l.warehouse)}
          value={l.warehouse}
          onValueChange={(warehouse) => patch(l.id, { warehouse: warehouse ?? '' })}
        />
      );
    }),
    col('priceList', 'Price list', (l) => (
      <MasterLookup def={priceListDef} fieldProps={{ 'aria-label': 'Price list', className: 'w-44' }} value={l.priceList} onChange={(v) => changePriceList(l, v)} />
    ), 'pricing'),
    ...(showNet
      ? [
          col('unitPrice', 'Unit price', (l) => (
            <TextField
              aria-label="Unit price"
              type="number"
              min={0}
              className="w-32"
              prefix={draft.currency}
              invalid={Boolean(err(l, 'unitPrice'))}
              value={String(l.unitPrice)}
              onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value) })}
            />
          )),
        ]
      : []),
    ...(showGross
      ? [
          col('grossPrice', 'Gross price', (l) => {
            const rate = ctx.rateOf(l.taxCode);
            return (
              <TextField
                aria-label="Gross price"
                type="number"
                min={0}
                className="w-32"
                prefix={draft.currency}
                value={String(round2(grossPrice(l, rate)))}
                onChange={(e) => patch(l.id, { unitPrice: round2(num(e.currentTarget.value) / (1 + rate / 100)) })}
              />
            );
          }),
        ]
      : []),
    col('discountPct', 'Discount %', (l) => (
      <TextField
        aria-label="Discount %"
        type="number"
        min={0}
        className="w-24"
        value={String(l.discountPct)}
        onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)) })}
      />
    )),
    col('priceAfterDiscount', 'Price after discount', (l) => formatAmount(priceAfterDiscount(l)), 'pricing'),
    col('taxCode', 'Tax code', (l) => (
      <Combobox
        aria-label="Tax code"
        className="w-32"
        invalid={Boolean(err(l, 'taxCode'))}
        options={taxOptions}
        value={l.taxCode}
        onValueChange={(taxCode) => patch(l.id, { taxCode: taxCode ?? '' })}
      />
    )),
    col('totalLc', 'Total (LC)', (l) => <span className="whitespace-nowrap">PHP {lc(lineNet(l))}</span>),
    col('grossTotalLc', 'Gross total (LC)', (l) => (
      <span className="whitespace-nowrap">PHP {lc(lineNet(l) * (1 + ctx.rateOf(l.taxCode) / 100))}</span>
    ), 'pricing'),
    col('deliveryDate', 'Del. date', (l) => (
      <DatePicker
        aria-label="Line delivery date"
        className="w-40"
        invalid={Boolean(err(l, 'deliveryDate'))}
        value={l.deliveryDate || null}
        onValueChange={(v) => patch(l.id, { deliveryDate: v ?? '' })}
      />
    ), 'delivery'),
    col('status', 'Row status', (l) => (
      <TableStatus intent={l.status === 'Open' ? 'primary' : 'success'}>{l.status}</TableStatus>
    ), 'delivery'),
    col('blanketAgreement', 'Blanket agreement', (l) => (
      <Combobox
        aria-label="Blanket agreement"
        className="w-48"
        options={blanketOptions}
        value={l.blanketAgreement}
        onValueChange={(blanketAgreement) => patch(l.id, { blanketAgreement: blanketAgreement ?? '' })}
      />
    ), 'references'),
    col('bpCatalogNo', 'BP catalog no.', (l) => (
      <TextField aria-label="BP catalog no." className="w-36" value={l.bpCatalogNo} onChange={(e) => patch(l.id, { bpCatalogNo: e.currentTarget.value })} />
    ), 'references'),
    col('mfrNo', 'Mfr no.', (l) => (
      <TextField aria-label="Mfr no." className="w-36" value={l.mfrNo} onChange={(e) => patch(l.id, { mfrNo: e.currentTarget.value })} />
    ), 'references'),
    col('requisitionSlipNo', 'Requisition slip no.', (l) => (
      <TextField
        aria-label="Requisition slip no."
        className="w-36"
        value={l.requisitionSlipNo}
        onChange={(e) => patch(l.id, { requisitionSlipNo: e.currentTarget.value })}
      />
    ), 'references'),
    col('department', 'Department', (l) => (
      <Select aria-label="Department" className="w-40" options={asOptions(DEPARTMENTS)} value={l.department} onValueChange={(department) => patch(l.id, { department })} />
    ), 'references'),
    col('freeText', 'Free text', (l) => (
      <TextField aria-label="Free text" className="w-48" value={l.freeText} onChange={(e) => patch(l.id, { freeText: e.currentTarget.value })} />
    ), 'references'),
  ].filter((c) => !c.group || is(c.group));

  return (
    <div className="flex flex-col gap-2">
      {PURCHASING_SETTINGS.separateNetGrossPriceMode ? (
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
        icon="list_alt"
        title="Contents"
        description={
          errors.lines ??
          `Items to order, in the purchasing unit. Prices are in ${draft.currency}${draft.currency === 'PHP' ? '' : `; totals in PHP at ${ctx.fx || '—'}`}.`
        }
        rows={lines}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={columns.map((c) => c.key).filter((k) => k !== 'itemNo' && k !== 'description')}
        sortValue={(l, key) => String(l[key as keyof PoLine] ?? '').toLowerCase()}
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
      />
    </div>
  );
}
