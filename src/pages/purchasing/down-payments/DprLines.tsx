import { useState, type ReactNode } from 'react';
import { Button, Card, Checkbox, Combobox, Icon, Link, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../components/form/DataTable';
import { MasterLookup } from '../../../components/form/MasterLookup';
import { newDprLine, type DprLine } from '../../../mocks/apDownPayments';
import { itemUnits, itemsPerUom } from '../../../mocks/items';
import { BLANKET_AGREEMENTS } from '../../../mocks/purchaseOrders';
import { formatAmount } from '../../../services/format';
import { isValidToday } from '../../../services/items';
import { lineNet } from '../../../services/purchaseOrders';
import { determineWithholding } from '../../../services/taxDetermination';
import { countryDef } from '../../settings/masterDefs';
import { lineFromItem, linePricing, type GrContext } from '../receipts/detail/types';
import type { PoMasters } from '../orders/detail/types';

const GROUPS = { details: 'Item details', withholding: 'Withholding', references: 'References' } as const;
type Group = keyof typeof GROUPS;
const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The down payment request's Contents: what the advance is for. No stock moves, so no warehouse. */
export function DprLines({
  lines,
  onChange,
  errors,
  m,
  ctx,
  currency,
  postingDate,
  vendorId,
  onCopy,
  canCopy,
}: {
  lines: DprLine[];
  onChange: (lines: DprLine[]) => void;
  errors: Record<string, string>;
  m: PoMasters;
  ctx: GrContext;
  currency: string;
  postingDate: string;
  vendorId: string;
  onCopy: () => void;
  canCopy: boolean;
}) {
  const [shown, setShown] = useState<Group[]>(['references']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const readOnly = ctx.readOnly;
  const itemOf = (l: DprLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<DprLine>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const err = (l: DprLine, f: string) => errors[`line:${l.id}:${f}`];
  const is = (g: Group) => shown.includes(g);
  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Purchase' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));
  const blanketOptions = [{ value: '', label: '— None —' }, ...BLANKET_AGREEMENTS.filter((b) => b.vendorId === vendorId).map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` }))];
  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.purchaseItem && isValidToday(i, postingDate)))
      .map((i) => ({ value: i.id, label: <div className="flex flex-col gap-0.5"><span className="text-xs opacity-60">{i.itemNo}</span><span>{i.name}</span></div>, text: `${i.itemNo} ${i.description}` }));

  const pickItem = (l: DprLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return patch(l.id, { itemId: '' });
    const { invoicedQty: _i, returnedQty: _r, id: _id, ...base } = lineFromItem(item, { postingDate }, ctx, m, { quantity: l.quantity });
    patch(l.id, { ...base, warehouse: '', binId: '', countryOfOriginCode: item.countryOfOriginCode, bpCatalogNo: item.vendors.find((v) => v.vendorId === vendorId)?.vendorItemNo ?? '' });
  };
  const changeUom = (l: DprLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!item || !itemsPerUnit) return;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit, ...(ctx.fx ? linePricing(item, { ...l, uomCode }, { postingDate }, ctx) : {}) });
  };
  const withholdingOf = (l: DprLine) => {
    const item = itemOf(l);
    return item && ctx.vendor ? determineWithholding(item, ctx.vendor, m.tax, postingDate).withholding : [];
  };

  const col = (key: string, header: string, cell: (l: DprLine) => ReactNode, group?: Group): TableColumn<DprLine> & { group?: Group } => ({ key, header, cell, group });
  const columns = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      return item ? (
        <div className="flex w-60 flex-col whitespace-normal">
          <Text variant="caption">{item.itemNo}</Text>
          <Text variant="small">{l.name}</Text>
          <Text variant="small" tone="muted">{l.description}</Text>
          {!readOnly && !l.baseType ? <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', name: '', description: '' })}>Change</Link> : null}
        </div>
      ) : (
        <Combobox aria-label="Item No." className="w-60" placeholder="Search items" options={itemOptions(l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(v) => pickItem(l, v)} />
      );
    }),
    col('qty', 'Qty / UoM', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      return (
        <div className="flex w-32 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Quantity" type="number" min={0} invalid={Boolean(err(l, 'quantity'))} value={String(l.quantity)} onChange={(e) => patch(l.id, { quantity: num(e.currentTarget.value) })} />
          {l.baseType || readOnly ? <Text variant="small" tone="muted">{l.uomCode}</Text> : <Combobox aria-label="UoM code" options={itemUnits(item, 'purchase').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(v) => v && changeUom(l, v)} />}
        </div>
      );
    }),
    col('pricing', 'Unit price / Tax / Discount', (l) =>
      l.itemId ? (
        <div className="flex w-44 flex-col gap-1">
          <TextField aria-label="Unit price" type="number" min={0} prefix={currency} invalid={Boolean(err(l, 'unitPrice'))} value={String(l.unitPrice)} onChange={(e) => patch(l.id, { unitPrice: round2(num(e.currentTarget.value)) })} />
          <Combobox aria-label="Tax code" invalid={Boolean(err(l, 'taxCode'))} options={taxOptions} value={l.taxCode} onValueChange={(taxCode) => patch(l.id, { taxCode: taxCode ?? '' })} />
          <TextField aria-label="Discount %" type="number" min={0} suffix="%" value={String(l.discountPct)} onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)) })} />
        </div>
      ) : null,
    ),
    col('totalLc', 'Total (LC)', (l) => (l.itemId ? <span className="whitespace-nowrap">PHP {formatAmount(lineNet(l) * ctx.fx)}</span> : null)),
    col('countryOfOriginCode', 'Country of origin', (l) => (l.itemId ? <MasterLookup def={countryDef} fieldProps={{ 'aria-label': 'Country of origin', className: 'w-40' }} clearable value={l.countryOfOriginCode} onChange={(countryOfOriginCode) => patch(l.id, { countryOfOriginCode })} /> : null), 'details'),
    col('warranty', 'Warranty', (l) => {
      const w = itemOf(l)?.warrantyTemplate;
      return l.itemId ? <Text variant="small" tone={w ? 'default' : 'muted'}>{w ? m.inv.warranties.find((x) => x.id === w)?.name ?? w : 'None'}</Text> : null;
    }, 'details'),
    col('unitCost', 'Unit cost price', (l) => (itemOf(l) ? <span className="whitespace-nowrap">PHP {formatAmount(itemOf(l)!.itemCost)}</span> : null), 'details'),
    col('wt', 'WT code / rate', (l) => {
      const wt = withholdingOf(l);
      return l.itemId ? <Text variant="small">{wt.length ? wt.map((w) => `${w.atc} (${w.rate}%)`).join(', ') : 'None'}</Text> : null;
    }, 'withholding'),
    col('wtBase', 'Taxable amount', (l) => (l.itemId && withholdingOf(l).length ? <span className="tabular-nums">{formatAmount(lineNet(l))}</span> : null), 'withholding'),
    col('base', 'Base document', (l) => (l.baseType ? <Link intent="primary" href={`#/purchasing/purchase-orders/${l.baseId}`}>PO {l.baseDocNo}</Link> : l.itemId ? <span className="text-muted">—</span> : null), 'references'),
    col('blanketAgreement', 'Blanket agreement', (l) => (l.itemId ? <Combobox aria-label="Blanket agreement" className="w-48" options={blanketOptions} value={l.blanketAgreement} onValueChange={(blanketAgreement) => patch(l.id, { blanketAgreement: blanketAgreement ?? '' })} /> : null), 'references'),
    col('freeText', 'Free text', (l) => (l.itemId ? <TextField aria-label="Free text" className="w-48" value={l.freeText} onChange={(e) => patch(l.id, { freeText: e.currentTarget.value })} /> : null), 'references'),
  ].filter((c) => !c.group || is(c.group));

  return (
    <DataTable
      variant="card"
      noPagination
      icon="list_alt"
      title="Contents"
      description={errors.lines ?? `What the advance is for, at the full order price in ${currency}. The DPM % in the totals sets how much of it is requested now.`}
      rows={lines}
      getRowId={(l) => l.id}
      columns={columns}
      unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
      sortValue={(l, key) => (key === 'item' ? l.itemNo : String((l as unknown as Record<string, unknown>)[key] ?? '')).toLowerCase()}
      onRemove={readOnly ? undefined : (picked) => onChange(lines.filter((l) => !picked.includes(l)))}
      onColumnSettings={() => setSettingsOpen(!settingsOpen)}
      actions={
        readOnly ? null : (
          <div className="flex gap-1">
            <Button type="button" size="small" intent="default" variant="solid" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!canCopy} onClick={onCopy}>Copy from PO</Button>
            <Button type="button" size="small" intent="primary" variant="solid" leadingIcon={<Icon size={16}>add</Icon>} disabled={!vendorId} onClick={() => onChange([...lines, newDprLine()])}>Add line</Button>
          </div>
        )
      }
      empty={<Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>{vendorId ? 'Copy from an open purchase order, or add lines.' : 'Pick a vendor first.'}</Text>}
    >
      {settingsOpen ? (
        <Card>
          <Card.Header icon={<Icon size={24}>tune</Icon>}>Columns</Card.Header>
          <Card.Content>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {(Object.keys(GROUPS) as Group[]).map((g) => (
                <Checkbox key={g} checked={is(g)} onChange={(e) => setShown(e.currentTarget.checked ? [...shown, g] : shown.filter((x) => x !== g))}>{GROUPS[g]}</Checkbox>
              ))}
            </div>
          </Card.Content>
        </Card>
      ) : null}
    </DataTable>
  );
}
