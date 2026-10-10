import { useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Combobox,
  Icon,
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
import { newPrLine, type PrLine } from '../../../../mocks/purchaseRequests';
import { DEPARTMENTS } from '../../../../mocks/purchaseOrders';
import { itemsPerUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import { activeOptions } from '../../../../services/inventoryMasters';
import { isValidToday, stockTotals } from '../../../../services/items';
import { lineNet, openQty, priceAfterDiscount, inventoryQty } from '../../../../services/purchaseRequests';
import { lineFromItem, type PrTabProps } from './types';

const GROUPS = {
  quantities: 'Stock quantities',
  pricing: 'Pricing detail',
  references: 'Vendor & dates',
  details: 'Details',
} as const;
type Group = keyof typeof GROUPS;

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
const num = (v: string) => (v === '' ? 0 : Number(v));

export function ContentsTab({ draft, update, errors, m, ctx }: PrTabProps) {
  const [shown, setShown] = useState<Group[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const lines = draft.lines;
  const itemOf = (l: PrLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<PrLine>) =>
    update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });

  const is = (g: Group) => shown.includes(g);
  const err = (l: PrLine, field: string) => errors[`line:${l.id}:${field}`];

  const itemOptions = (current: string) =>
    m.items
      .filter(
        (i) =>
          i.id === current ||
          (i.purchaseItem && isValidToday(i, draft.postingDate)),
      )
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

  const warehouseOptions = (current: string) =>
    activeOptions(m.inv.warehouses, (w) => w.code, (w) => `${w.code} ${w.name}`, current);

  const changeUom = (l: PrLine, uomCode: string) => {
    const item = itemOf(l);
    const ipu = item ? (itemsPerUom(item, uomCode) ?? 1) : 1;
    patch(l.id, {
      uomCode,
      uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode,
      itemsPerUnit: ipu,
    });
  };

  const uomOptions = (l: PrLine) => {
    const item = itemOf(l);
    if (!item) return [{ value: l.uomCode, label: l.uomName || l.uomCode }];
    const codes = [item.inventoryUom, item.purchasingUom, ...item.uoms.map((u) => u.uom)].filter(Boolean);
    const opts = m.inv.uoms.filter((u) => u.active && codes.includes(u.code)).map((u) => ({ value: u.code, label: u.name }));
    return opts.length ? opts : [{ value: l.uomCode, label: l.uomName || l.uomCode }];
  };

  const columns: (TableColumn<PrLine> & { group?: Group })[] = [
    {
      key: 'item',
      header: 'Item',
      cell: (l) => {
        const item = itemOf(l);
        return (
          <div className="flex min-w-52 flex-col gap-1 whitespace-normal">
            {item ? (
              <>
                <Text variant="caption">{item.itemNo}</Text>
                <Text variant="small">{item.name}</Text>
                <Text variant="small" tone="muted">{l.itemDescription}</Text>
                <button
                  type="button"
                  className="text-left text-xs text-primary-default hover:underline"
                  onClick={() => patch(l.id, { itemId: '', itemNo: '', itemDescription: '' })}
                >
                  Change
                </button>
              </>
            ) : (
              <>
                <Combobox
                  aria-label="Item"
                  placeholder="Search items"
                  options={itemOptions(l.itemId)}
                  value={l.itemId || null}
                  invalid={Boolean(err(l, 'item'))}
                  onValueChange={(id) => {
                    if (!id) return;
                    const found = m.items.find((i) => i.id === id);
                    if (!found) return;
                    const line = lineFromItem(found, draft, m, {
                      id: l.id,
                      requiredQty: l.requiredQty,
                      openQty: l.requiredQty,
                    });
                    update({ lines: lines.map((x) => (x.id === l.id ? line : x)) });
                  }}
                />
                {err(l, 'item') && <Text variant="small" tone="danger">{err(l, 'item')}</Text>}
              </>
            )}
          </div>
        );
      },
    },
    {
      key: 'qty',
      header: 'Req. qty',
      cell: (l) => (
        <div className="w-24">
          <TextField
            aria-label="Required qty"
            type="number"
            min={0}
            value={String(l.requiredQty)}
            invalid={Boolean(err(l, 'quantity'))}
            onChange={(e) => {
              const qty = num(e.currentTarget.value);
              const open = Math.max(0, qty - (l.requiredQty - l.openQty));
              patch(l.id, { requiredQty: qty, openQty: open });
            }}
            disabled={ctx.readOnly}
          />
          {err(l, 'quantity') && <Text variant="small" tone="danger">{err(l, 'quantity')}</Text>}
        </div>
      ),
    },
    {
      key: 'openQty',
      header: 'Open qty',
      cell: (l) => <span className="text-sm tabular-nums">{openQty(l)}</span>,
    },
    {
      key: 'uom',
      header: 'UoM',
      cell: (l) => (
        <Select
          aria-label="UoM"
          className="w-24"
          options={uomOptions(l)}
          value={l.uomCode}
          onValueChange={(v) => v && changeUom(l, v)}
          disabled={ctx.readOnly}
        />
      ),
    },
    {
      key: 'infoPrice',
      header: 'Info price',
      cell: (l) => (
        <TextField
          aria-label="Info price"
          type="number"
          min={0}
          className="w-28"
          prefix="PHP"
          value={String(l.infoPrice)}
          onChange={(e) => patch(l.id, { infoPrice: num(e.currentTarget.value) })}
          disabled={ctx.readOnly}
        />
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      cell: (l) => (
        <div className="min-w-28">
          <Select
            aria-label="Warehouse"
            options={[{ value: '', label: '— None —' }, ...warehouseOptions(l.warehouse)]}
            value={l.warehouse}
            onValueChange={(v) => patch(l.id, { warehouse: v ?? '' })}
            disabled={ctx.readOnly}
          />
          {err(l, 'warehouse') && <Text variant="small" tone="danger">{err(l, 'warehouse')}</Text>}
        </div>
      ),
    },
    {
      key: 'taxCode',
      header: 'Tax code',
      cell: (l) => (
        <div className="min-w-24">
          <Select
            aria-label="Tax code"
            options={[{ value: '', label: '— None —' }, ...taxOptions]}
            value={l.taxCode}
            onValueChange={(v) => patch(l.id, { taxCode: v ?? '' })}
            disabled={ctx.readOnly}
          />
          {err(l, 'taxCode') && <Text variant="small" tone="danger">{err(l, 'taxCode')}</Text>}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total (PHP)',
      cell: (l) => (
        <span className="whitespace-nowrap text-sm tabular-nums">{formatAmount(lineNet(l))}</span>
      ),
    },
    ...(is('quantities')
      ? ([
          {
            key: 'inStock',
            header: 'In stock',
            cell: (l: PrLine) => {
              const item = itemOf(l);
              const s = item ? stockTotals(item) : null;
              return <span className="text-sm tabular-nums">{s ? formatAmount(s.inStock) : '—'}</span>;
            },
          },
          {
            key: 'committed',
            header: 'Committed',
            cell: (l: PrLine) => {
              const item = itemOf(l);
              const s = item ? stockTotals(item) : null;
              return <span className="text-sm tabular-nums">{s ? formatAmount(s.committed) : '—'}</span>;
            },
          },
          {
            key: 'ordered',
            header: 'On order',
            cell: (l: PrLine) => {
              const item = itemOf(l);
              const s = item ? stockTotals(item) : null;
              return <span className="text-sm tabular-nums">{s ? formatAmount(s.ordered) : '—'}</span>;
            },
          },
          {
            key: 'inventoryQty',
            header: 'Qty (inv. UoM)',
            cell: (l: PrLine) => (
              <span className="text-sm tabular-nums">{formatAmount(inventoryQty(l))}</span>
            ),
          },
        ] as TableColumn<PrLine>[])
      : []),
    ...(is('pricing')
      ? ([
          {
            key: 'discountPct',
            header: 'Disc. %',
            cell: (l: PrLine) => (
              <TextField
                aria-label="Discount %"
                type="number"
                min={0}
                max={100}
                className="w-20"
                suffix="%"
                value={String(l.discountPct)}
                onChange={(e) =>
                  patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)) })
                }
                disabled={ctx.readOnly}
              />
            ),
          },
          {
            key: 'priceAfterDisc',
            header: 'Price after disc.',
            cell: (l: PrLine) => (
              <span className="text-sm tabular-nums">{formatAmount(priceAfterDiscount(l))}</span>
            ),
          },
        ] as TableColumn<PrLine>[])
      : []),
    ...(is('references')
      ? ([
          {
            key: 'requiredDate',
            header: 'Required date',
            cell: (l: PrLine) => (
              <DatePicker
                aria-label="Required date"
                className="w-36"
                value={l.requiredDate}
                onValueChange={(v) => patch(l.id, { requiredDate: v ?? '' })}
                disabled={ctx.readOnly}
              />
            ),
          },
          {
            key: 'vendorName',
            header: 'Preferred vendor',
            cell: (l: PrLine) => (
              <TextField
                aria-label="Preferred vendor"
                className="min-w-36"
                placeholder="Vendor name"
                value={l.vendorName}
                onChange={(e) => patch(l.id, { vendorName: e.currentTarget.value })}
                disabled={ctx.readOnly}
              />
            ),
          },
        ] as TableColumn<PrLine>[])
      : []),
    ...(is('details')
      ? ([
          {
            key: 'department',
            header: 'Department',
            cell: (l: PrLine) => (
              <Select
                aria-label="Department"
                className="min-w-32"
                options={[{ value: '', label: '— None —' }, ...asOptions(DEPARTMENTS)]}
                value={l.department}
                onValueChange={(v) => patch(l.id, { department: v ?? '' })}
                disabled={ctx.readOnly}
              />
            ),
          },
          {
            key: 'priceList',
            header: 'Price list',
            cell: (l: PrLine) => (
              <MasterLookup
                def={priceListDef}
                value={l.priceListId}
                onChange={(v) => patch(l.id, { priceListId: v })}
                disabled={ctx.readOnly}
              />
            ),
          },
          {
            key: 'freeText',
            header: 'Free text',
            cell: (l: PrLine) => (
              <TextField
                aria-label="Free text"
                className="min-w-40"
                value={l.freeText}
                onChange={(e) => patch(l.id, { freeText: e.currentTarget.value })}
                disabled={ctx.readOnly}
              />
            ),
          },
        ] as TableColumn<PrLine>[])
      : []),
    {
      key: 'lineStatus',
      header: 'Status',
      cell: (l) => (
        <TableStatus intent={l.status === 'Open' ? 'primary' : 'success'}>{l.status}</TableStatus>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      {settingsOpen ? (
        <Card>
          <Card.Header icon={<Icon size={24}>tune</Icon>}>Column groups</Card.Header>
          <Card.Content>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {(Object.entries(GROUPS) as [Group, string][]).map(([key, label]) => (
                <Checkbox
                  key={key}
                  checked={is(key)}
                  onChange={(e) =>
                    setShown(e.currentTarget.checked ? [...shown, key] : shown.filter((x) => x !== key))
                  }
                >
                  {label}
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
          errors.lines
            ? errors.lines
            : 'Items or services requested — informational prices only, not binding.'
        }
        rows={lines}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
        sortValue={(l, key) =>
          (key === 'item' ? l.itemNo : String(l[key as keyof PrLine] ?? '')).toLowerCase()
        }
        onRemove={
          ctx.readOnly
            ? undefined
            : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })
        }
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
              onClick={() =>
                update({ lines: [...lines, newPrLine({ requiredDate: draft.requiredDate })] })
              }
            >
              Add line
            </Button>
          )
        }
        empty={
          <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
            No lines yet — click Add line to start.
          </Text>
        }
      />
    </div>
  );
}
