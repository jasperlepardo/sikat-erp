import { useState } from 'react';
import {
  Button,
  Card,
  Combobox,
  Icon,
  Link,
  Select,
  Text,
  TextField,
  DatePicker,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { priceListDef } from '../../../settings/masterDefs';
import { isPriceListValid } from '../../../../services/priceLists';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import { isValidToday } from '../../../../services/items';
import { lineNet } from '../../../../services/rfqs';
import { newRfqLine, type RfqLine } from '../../../../mocks/rfqs';
import { blanketOptions, lineFromItem, linePricing, type RfqTabProps } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

const GROUPS = {
  quantities: 'UoM details',
  quoted: 'Quoted quantities & dates',
  references: 'References',
} as const;
type Group = keyof typeof GROUPS;

export function ContentsTab({ draft, update, errors, m, ctx }: RfqTabProps) {
  const [shown, setShown] = useState<Group[]>(['quoted']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Set<string>>(new Set());
  const lines = draft.lines;
  const itemOf = (l: RfqLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<RfqLine>) =>
    update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const is = (g: Group) => shown.includes(g);
  const err = (l: RfqLine, field: string) => errors[`line:${l.id}:${field}`];

  const changeUom = (l: RfqLine, uomCode: string) => {
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

  const pickItem = (l: RfqLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? lineFromItem(item, draft, ctx, m, { id: l.id, requiredQty: l.requiredQty }) : { itemId: '' });
  };

  const changePriceList = (l: RfqLine, priceListId: string) => {
    const item = itemOf(l);
    const priced = item && ctx.fx ? linePricing(item, { ...l, priceListId }, draft, ctx) : undefined;
    patch(l.id, { priceListId, ...(priced ? { unitPrice: priced.unitPrice, discountPct: priced.discountPct } : {}) });
  };

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

  const ba = blanketOptions(draft.vendorId, draft.postingDate);
  const grouped = Object.entries(GROUPS) as [Group, string][];

  const col = (
    key: string,
    header: string,
    cell: (l: RfqLine) => React.ReactNode,
    group?: Group,
  ): TableColumn<RfqLine> & { group?: Group } => ({ key, header, cell, group });

  const columns = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      const isEditing = editingItem.has(l.id);
      const toggleEdit = () =>
        setEditingItem((prev) => {
          const next = new Set(prev);
          next.has(l.id) ? next.delete(l.id) : next.add(l.id);
          return next;
        });
      return (
        <div className="flex flex-col gap-1 w-64 whitespace-normal">
          {item ? (
            <>
              {isEditing ? (
                <>
                  <Text variant="caption">{item.itemNo}</Text>
                  <TextField
                    aria-label="Description"
                    placeholder="Description"
                    value={l.description}
                    onChange={(e) => patch(l.id, { description: e.currentTarget.value })}
                  />
                </>
              ) : (
                <div className="flex flex-col">
                  <Text variant="caption">{item.itemNo}</Text>
                  <Text variant="small">{l.description || item.name}</Text>
                </div>
              )}
              <div className="flex gap-3">
                <Link intent="primary" onClick={toggleEdit}>
                  {isEditing ? 'Done' : 'Edit'}
                </Link>
                <Link
                  intent="primary"
                  onClick={() => {
                    patch(l.id, { itemId: '', itemNo: '', description: '' });
                    setEditingItem((prev) => {
                      const next = new Set(prev);
                      next.delete(l.id);
                      return next;
                    });
                  }}
                >
                  Change
                </Link>
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
        </div>
      );
    }),
    col('requiredQty', 'Required qty / UoM', (l) => {
      if (!l.itemId) return null;
      const item = itemOf(l);
      return (
        <div className="flex flex-col gap-1 w-32">
          <TextField
            aria-label="Required quantity"
            type="number"
            min={0}
            invalid={Boolean(err(l, 'requiredQty'))}
            value={String(l.requiredQty)}
            onChange={(e) => patch(l.id, { requiredQty: num(e.currentTarget.value) })}
          />
          {!item ? (
            <Text variant="small" tone="muted">
              {l.uomCode}
            </Text>
          ) : (
            <Combobox
              aria-label="UoM code"
              options={itemUnits(item, 'purchase').map((u) => ({ value: u.uom, label: u.uom }))}
              value={l.uomCode}
              onValueChange={(v) => v && changeUom(l, v)}
            />
          )}
        </div>
      );
    }),
    col(
      'quotedQty',
      'Quoted qty',
      (l) =>
        l.itemId ? (
          <TextField
            aria-label="Quoted quantity"
            type="number"
            min={0}
            className="w-24"
            value={String(l.quotedQty)}
            onChange={(e) => patch(l.id, { quotedQty: num(e.currentTarget.value) })}
          />
        ) : null,
      'quoted',
    ),
    col('requiredDate', 'Required date', (l) =>
      l.itemId ? (
        <DatePicker
          aria-label="Required date"
          className="w-36"
          value={l.requiredDate || null}
          onValueChange={(v) => patch(l.id, { requiredDate: v ?? '' })}
        />
      ) : null,
    ),
    col(
      'quotedDate',
      'Quoted date',
      (l) =>
        l.itemId ? (
          <DatePicker
            aria-label="Quoted date"
            className="w-36"
            value={l.quotedDate || null}
            onValueChange={(v) => patch(l.id, { quotedDate: v ?? '' })}
          />
        ) : null,
      'quoted',
    ),
    col(
      'uomName',
      'UoM name',
      (l) => {
        if (!l.itemId) return null;
        return itemOf(l) ? (
          l.uomName
        ) : (
          <TextField
            aria-label="UoM name"
            className="w-28"
            value={l.uomName}
            onChange={(e) => patch(l.id, { uomName: e.currentTarget.value })}
          />
        );
      },
      'quantities',
    ),
    col(
      'itemsPerUnit',
      'Items per unit',
      (l) => {
        if (!l.itemId) return null;
        return itemOf(l) ? (
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
        );
      },
      'quantities',
    ),
    col('priceListId', 'Price list', (l) =>
      l.itemId ? (
        <MasterLookup
          def={priceListDef}
          fieldProps={{ 'aria-label': 'Price list', className: 'w-44' }}
          where={(r) => isPriceListValid(r, draft.postingDate)}
          value={l.priceListId}
          onChange={(v) => changePriceList(l, v)}
        />
      ) : null,
    ),
    col('pricing', 'Unit price / Tax / Discount', (l) => {
      if (!l.itemId) return null;
      return (
        <div className="flex flex-col gap-1 w-44">
          <TextField
            aria-label="Unit price"
            type="number"
            min={0}
            prefix={draft.currency}
            invalid={Boolean(err(l, 'unitPrice'))}
            value={String(l.unitPrice)}
            onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value) })}
          />
          <Combobox
            aria-label="Tax code"
            invalid={Boolean(err(l, 'taxCode'))}
            options={taxOptions}
            value={l.taxCode}
            onValueChange={(v) => patch(l.id, { taxCode: v ?? '' })}
          />
          <TextField
            aria-label="Discount %"
            type="number"
            min={0}
            max={100}
            suffix="%"
            value={String(l.discountPct)}
            onChange={(e) =>
              patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)) })
            }
          />
        </div>
      );
    }),
    col('total', 'Total [LC]', (l) => {
      if (!l.itemId) return null;
      const net = lineNet(l);
      const rate = ctx.rateOf(l.taxCode);
      const tax = ctx.isReverseCharge(l.taxCode) ? 0 : round2((net * rate) / 100);
      return (
        <div className="flex flex-col items-end gap-0.5 tabular-nums">
          <Text variant="small">
            {draft.currency} {formatAmount(net + tax)}
          </Text>
          {draft.currency !== 'PHP' && ctx.fx ? (
            <Text variant="small" tone="muted">
              PHP {formatAmount((net + tax) * ctx.fx)}
            </Text>
          ) : null}
        </div>
      );
    }),
    col(
      'blanketAgreement',
      'Blanket agreement',
      (l) =>
        l.itemId ? (
          <Select
            aria-label="Blanket agreement"
            className="w-48"
            options={ba}
            value={l.blanketAgreement}
            onValueChange={(v) => patch(l.id, { blanketAgreement: v })}
          />
        ) : null,
      'references',
    ),
    col(
      'requisitionSlipNo',
      'Requisition slip no.',
      (l) =>
        l.itemId ? (
          <TextField
            aria-label="Requisition slip no."
            className="w-36"
            value={l.requisitionSlipNo}
            onChange={(e) => patch(l.id, { requisitionSlipNo: e.currentTarget.value })}
          />
        ) : null,
      'references',
    ),
  ];

  const visibleColumns = columns.filter((c) => !c.group || is(c.group));

  return (
    <div className="relative">
      <DataTable
        icon="format_list_bulleted"
        title="Lines"
        rows={lines}
        getRowId={(l) => l.id}
        columns={visibleColumns}
        unsortable={[
          'item', 'requiredQty', 'quotedQty', 'requiredDate', 'quotedDate',
          'uomName', 'itemsPerUnit', 'priceListId', 'pricing', 'total',
          'blanketAgreement', 'requisitionSlipNo',
        ]}
        onRemove={ctx.readOnly ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
        actions={
          ctx.readOnly ? null : (
            <div className="flex gap-2 items-center relative">
              <Button
                type="button"
                size="small"
                intent="primary"
                variant="solid"
                aria-label="Add line"
                leadingIcon={<Icon size={16}>add</Icon>}
                onClick={() =>
                  update({
                    lines: [
                      ...lines,
                      newRfqLine({ requiredDate: draft.requiredDate }),
                    ],
                  })
                }
              >
                Add line
              </Button>
              <Button
                type="button"
                size="small"
                variant="ghost"
                aria-label="Column settings"
                leadingIcon={<Icon size={16}>settings</Icon>}
                onClick={() => setSettingsOpen((v) => !v)}
              >
                Columns
              </Button>
              {settingsOpen && (
                <Card className="absolute z-10 right-0 top-full mt-1 p-3 shadow-lg">
                  <div className="flex flex-col gap-2">
                    {grouped.map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={is(key)}
                          onChange={(e) =>
                            setShown((s) =>
                              e.target.checked ? [...s, key] : s.filter((g) => g !== key),
                            )
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )
        }
        empty={
          <Text variant="small" tone="muted">
            No lines — add items to request quotes.
          </Text>
        }
      />
    </div>
  );
}
