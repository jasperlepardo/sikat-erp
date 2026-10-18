import { useState } from 'react';
import {
  Card,
  Checkbox,
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
import { formatDate } from '../../../../services/dates';
import { isValidToday } from '../../../../services/items';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { lineNet, rfqTotals } from '../../../../services/rfqs';
import { type RfqLine } from '../../../../mocks/rfqs';
import { PurchTotalsFooter } from '../../shared/PurchTotalsFooter';
import { blanketOptions, lineFromItem, linePricing, type RfqTabProps } from './types';

const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

const GROUPS = {
  quantities: 'UoM details',
  quoted: 'Quoted quantities & dates',
  references: 'References',
} as const;
type Group = keyof typeof GROUPS;

export function RfqLinesCard({ draft, update, errors, m, ctx }: RfqTabProps) {
  const [shown, setShown] = useState<Group[]>(['quoted']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const lines = draft.lines;
  const linesLocked = ctx.readOnly || ctx.added;
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = rfqTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const showFreight = getPurchasingSettings().manageFreightInDocuments;
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
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    return item ? lineFromItem(item, draft, ctx, m, { requiredDate: draft.requiredDate }) : undefined;
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
            <span>{i.description || i.name}</span>
          </div>
        ),
        text: `${i.itemNo} ${i.description}`,
      }));

  const taxOptions = m.tax.codes
    .filter((c) => c.direction === 'Purchase' && c.active)
    .map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));

  const ba = blanketOptions(draft.vendorId, draft.postingDate);
  const col = (key: string, header: string, cell: (l: RfqLine) => React.ReactNode, group?: Group): TableColumn<RfqLine> & { group?: Group } => ({ key, header, cell, group });

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
              {isEditing && !linesLocked ? (
                <>
                  <Text variant="caption">{item.itemNo}</Text>
                  <TextField aria-label="Description" placeholder="Description" value={l.description} onChange={(e) => patch(l.id, { description: e.currentTarget.value })} />
                </>
              ) : (
                <div className="flex flex-col">
                  <Text variant="caption">{item.itemNo}</Text>
                  <Text variant="small">{l.description || item.name}</Text>
                </div>
              )}
              {linesLocked ? null : (
                <div className="flex gap-3">
                  <Link intent="primary" onClick={toggleEdit}>{isEditing ? 'Done' : 'Edit'}</Link>
                  <Link intent="primary" onClick={() => { patch(l.id, { itemId: '', itemNo: '', description: '' }); setEditingItem((prev) => { const next = new Set(prev); next.delete(l.id); return next; }); }}>Change</Link>
                </div>
              )}
            </>
          ) : (
            <Combobox aria-label="Item No." placeholder="Search items" options={itemOptions(l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(v) => pickItem(l, v)} />
          )}
        </div>
      );
    }),
    col('requiredQty', 'Required qty / UoM', (l) => {
      if (!l.itemId) return null;
      const item = itemOf(l);
      if (linesLocked) return <Text variant="small" className="whitespace-nowrap tabular-nums">{l.requiredQty.toLocaleString('en-PH')} {l.uomCode}</Text>;
      return (
        <div className="flex flex-col gap-1 w-32">
          <TextField aria-label="Required quantity" type="number" min={0} invalid={Boolean(err(l, 'requiredQty'))} value={String(l.requiredQty)} onChange={(e) => patch(l.id, { requiredQty: num(e.currentTarget.value) })} />
          {!item ? (
            <Text variant="small" tone="muted">{l.uomCode}</Text>
          ) : (
            <Combobox aria-label="UoM code" options={itemUnits(item, 'purchase').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(v) => v && changeUom(l, v)} />
          )}
        </div>
      );
    }),
    col('quotedQty', 'Quoted qty', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small" className="whitespace-nowrap tabular-nums">{l.quotedQty.toLocaleString('en-PH')}</Text>;
      return <TextField aria-label="Quoted quantity" type="number" min={0} className="w-24" value={String(l.quotedQty)} onChange={(e) => patch(l.id, { quotedQty: num(e.currentTarget.value) })} />;
    }, 'quoted'),
    col('requiredDate', 'Required date', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small">{l.requiredDate ? formatDate(l.requiredDate) : '—'}</Text>;
      return <DatePicker aria-label="Required date" className="w-36" value={l.requiredDate || null} onValueChange={(v) => patch(l.id, { requiredDate: v ?? '' })} />;
    }),
    col('quotedDate', 'Quoted date', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small">{l.quotedDate ? formatDate(l.quotedDate) : '—'}</Text>;
      return <DatePicker aria-label="Quoted date" className="w-36" value={l.quotedDate || null} onValueChange={(v) => patch(l.id, { quotedDate: v ?? '' })} />;
    }, 'quoted'),
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
    col('priceListId', 'Price list', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) {
        const pl = priceListDef.collection.snapshot().find((p) => p.id === l.priceListId);
        return <Text variant="small">{pl ? priceListDef.label(pl) : '—'}</Text>;
      }
      return <MasterLookup def={priceListDef} fieldProps={{ 'aria-label': 'Price list', className: 'w-44' }} where={(r) => isPriceListValid(r, draft.postingDate)} value={l.priceListId} onChange={(v) => changePriceList(l, v)} />;
    }),
    col('pricing', 'Unit price / Tax / Discount', (l) => {
      if (!l.itemId) return null;
      const taxLabel = taxOptions.find((t) => t.value === l.taxCode)?.label ?? l.taxCode;
      if (linesLocked) return (
        <div className="flex flex-col gap-0.5 whitespace-nowrap tabular-nums">
          <Text variant="small">{draft.currency} {formatAmount(l.discountPct ? l.unitPrice * (1 - l.discountPct / 100) : l.unitPrice)}</Text>
          {l.discountPct ? <Text variant="small" tone="muted" className="line-through">{draft.currency} {formatAmount(l.unitPrice)}</Text> : null}
          <Text variant="small" tone="muted">{taxLabel}</Text>
        </div>
      );
      return (
        <div className="flex flex-col gap-1 w-44">
          <TextField aria-label="Unit price" type="number" min={0} prefix={draft.currency} invalid={Boolean(err(l, 'unitPrice'))} value={String(l.unitPrice)} onChange={(e) => patch(l.id, { unitPrice: num(e.currentTarget.value) })} />
          <Combobox aria-label="Tax code" invalid={Boolean(err(l, 'taxCode'))} options={taxOptions} value={l.taxCode} onValueChange={(v) => patch(l.id, { taxCode: v ?? '' })} />
          <TextField aria-label="Discount %" type="number" min={0} max={100} suffix="%" value={String(l.discountPct)} onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)) })} />
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
          <Text variant="small">{draft.currency} {formatAmount(net + tax)}</Text>
          {draft.currency !== 'PHP' && ctx.fx ? <Text variant="small" tone="muted">PHP {formatAmount((net + tax) * ctx.fx)}</Text> : null}
        </div>
      );
    }),
    col('blanketAgreement', 'Blanket agreement', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small">{l.blanketAgreement || '—'}</Text>;
      return <Select aria-label="Blanket agreement" className="w-48" options={ba} value={l.blanketAgreement} onValueChange={(v) => patch(l.id, { blanketAgreement: v })} />;
    }, 'references'),
    col('requisitionSlipNo', 'Requisition slip no.', (l) => {
      if (!l.itemId) return null;
      if (linesLocked) return <Text variant="small">{l.requisitionSlipNo || '—'}</Text>;
      return <TextField aria-label="Requisition slip no." className="w-36" value={l.requisitionSlipNo} onChange={(e) => patch(l.id, { requisitionSlipNo: e.currentTarget.value })} />;
    }, 'references'),
  ];

  const visibleColumns = columns.filter((c) => !c.group || is(c.group));

  return (
    <div className="flex flex-col gap-2">
      {settingsOpen ? (
        <Card>
          <Card.Header icon={<Icon size={24}>tune</Icon>}>Columns</Card.Header>
          <Card.Content>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {(Object.keys(GROUPS) as Group[]).map((g) => (
                <Checkbox key={g} checked={is(g)} onChange={(e) => setShown(e.currentTarget.checked ? [...shown, g] : shown.filter((x) => x !== g))}>
                  {GROUPS[g]}
                </Checkbox>
              ))}
            </div>
          </Card.Content>
        </Card>
      ) : null}
      <DataTable
        icon="format_list_bulleted"
        title="Lines"
        rows={lines}
        getRowId={(l) => l.id}
        columns={visibleColumns}
        unsortable={['item', 'requiredQty', 'quotedQty', 'requiredDate', 'quotedDate', 'uomName', 'itemsPerUnit', 'priceListId', 'pricing', 'total', 'blanketAgreement', 'requisitionSlipNo']}
        noPagination
        onRemove={linesLocked ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
        onColumnSettings={() => setSettingsOpen(!settingsOpen)}
        spanRow={linesLocked ? undefined : (
          <Combobox
            key={addKey}
            aria-label="Search items to add a line"
            placeholder="Search items to add a line…"
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
        empty={<Text variant="small" tone="muted">No lines — search above to add items.</Text>}
        cardFooter={
          <PurchTotalsFooter
            totals={totals}
            currency={draft.currency}
            readOnly={linesLocked}
            discountPct={draft.discountPct}
            onDiscountChange={(discountPct) => update({ discountPct })}
            freightInput={showFreight ? (
              <TextField
                aria-label={`Freight (${draft.currency}, net)`}
                type="number"
                min={0}
                className="w-32"
                prefix={draft.currency}
                value={String(draft.freight)}
                onChange={(e) => update({ freight: Number(e.currentTarget.value) })}
              />
            ) : undefined}
            fx={draft.currency !== 'PHP' && ctx.fx ? { rate: ctx.fx, source: formatDate(ctx.fxDate) } : undefined}
          />
        }
      />
    </div>
  );
}
