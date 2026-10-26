import { useState, type ReactNode } from 'react';
import { Button, Combobox, Icon, Link, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { useColumnPrefs, type PrefColumn } from '../../../../components/form/columnPrefs';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { textCol } from '../../shared/purchColumns';
import { newDprLine, type DprLine } from '../../../../mocks/apDownPayments';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import { BLANKET_AGREEMENTS } from '../../../../mocks/purchaseOrders';
import { formatAmount } from '../../../../services/format';
import { dprTotals } from '../../../../services/apDownPayments';
import { isValidToday } from '../../../../services/items';
import { lineNet } from '../../../../services/purchaseOrders';
import { determineWithholding } from '../../../../services/taxDetermination';
import { countryDef } from '../../../settings/masterDefs';
import { PurchTotalsFooter, PurchTotalNote, PurchTotalRow } from '../../shared/PurchTotalsFooter';
import { lineFromItem, linePricing } from '../../goods-receipts/detail/types';
import type { DprSectionProps } from './types';
import { LineItemText } from '../../../../components/form/LineItemText';
import { editTaxCode } from '../../../../services/taxRecalc';

const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The down payment request's Contents: what the advance is for. No stock moves, so no warehouse. */
export function DprLinesCard({
  draft,
  update,
  errors,
  m,
  ctx,
  onCopy,
  canCopy,
}: DprSectionProps & { onCopy: () => void; canCopy: boolean }) {
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const { lines, currency: code, postingDate, vendorId } = draft;
  const readOnly = ctx.readOnly;
  const totals = dprTotals(draft, ctx.rateOf, ctx.isReverseCharge);
  const balance = Math.round((totals.total - draft.appliedAmount) * 100) / 100;
  const onChange = (next: DprLine[]) => update({ lines: next });
  const itemOf = (l: DprLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<DprLine>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const err = (l: DprLine, f: string) => errors[`line:${l.id}:${f}`];
  const taxOptions =m.tax.codes.filter((c) => c.direction === 'Purchase' && c.active).map((c) => ({ value: c.code, label: c.name }));
  const blanketOptions = [{ value: '', label: '— None —' }, ...BLANKET_AGREEMENTS.filter((b) => b.vendorId === vendorId).map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` }))];
  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.purchaseItem && isValidToday(i, postingDate)))
      .map((i) => ({ value: i.id, label: <div className="flex flex-col gap-0.5"><span className="text-xs opacity-60">{i.itemNo}</span><span>{i.description || i.name}</span></div>, text: `${i.itemNo} ${i.description}` }));

  const pickItem = (l: DprLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return patch(l.id, { itemId: '' });
    const { invoicedQty: _i, returnedQty: _r, id: _id, ...base } = lineFromItem(item, { postingDate }, ctx, m, { quantity: l.quantity });
    patch(l.id, { ...base, warehouse: '', binId: '', countryOfOriginCode: item.countryOfOriginCode, bpCatalogNo: item.vendors.find((v) => v.vendorId === vendorId)?.vendorItemNo ?? '' });
  };
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    if (!item) return undefined;
    const { invoicedQty: _i, returnedQty: _r, id: _id, ...base } = lineFromItem(item, { postingDate }, ctx, m, { quantity: 1 });
    return newDprLine({ ...base, warehouse: '', binId: '', countryOfOriginCode: item.countryOfOriginCode, bpCatalogNo: item.vendors.find((v) => v.vendorId === vendorId)?.vendorItemNo ?? '' });
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

  const col = (key: string, header: string, cell: (l: DprLine) => ReactNode, opts?: { optional?: boolean; defaultHidden?: boolean }): PrefColumn<DprLine> => ({ key, header, cell, ...opts });
  const allColumns: PrefColumn<DprLine>[] = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      if (!item) return (
        <Combobox aria-label="Item No." className="w-60" placeholder="Search items" options={itemOptions(l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(v) => pickItem(l, v)} />
      );
      if (editing.has(l.id) && !readOnly) return (
        <div className="flex w-60 flex-col gap-1">
          <Text variant="caption">{item.itemNo}</Text>
          <TextField aria-label="Item description" value={l.description} onChange={(e) => patch(l.id, { description: e.currentTarget.value })} />
          <Link intent="primary" onClick={() => setEditing((s) => { const n = new Set(s); n.delete(l.id); return n; })}>Done</Link>
        </div>
      );
      return (
        <div className="flex w-60 flex-col gap-1 whitespace-normal">
          <LineItemText itemNo={item.itemNo} description={l.description} name={l.name} />
          {readOnly ? null : (
            <div className="flex gap-3">
              <Link intent="primary" onClick={() => setEditing((s) => new Set(s).add(l.id))}>Edit</Link>
              {l.baseType ? null : <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', name: '', description: '' })}>Change</Link>}
            </div>
          )}
        </div>
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
          <TextField aria-label="Unit price" type="number" min={0} prefix={code} invalid={Boolean(err(l, 'unitPrice'))} value={String(l.unitPrice)} onChange={(e) => patch(l.id, { unitPrice: round2(num(e.currentTarget.value)) })} />
          <Combobox aria-label="Tax code" invalid={Boolean(err(l, 'taxCode'))} options={taxOptions} value={l.taxCode} onValueChange={(taxCode) => patch(l.id, editTaxCode(taxCode ?? ''))} />
          <TextField aria-label="Discount %" type="number" min={0} suffix="%" value={String(l.discountPct)} onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)) })} />
        </div>
      ) : null,
    ),
    col('totalLc', 'Total (LC)', (l) => (l.itemId ? <span className="whitespace-nowrap">PHP {formatAmount(lineNet(l) * ctx.fx)}</span> : null)),
    col('countryOfOriginCode', 'Country of origin', (l) => (l.itemId ? <MasterLookup def={countryDef} fieldProps={{ 'aria-label': 'Country of origin', className: 'w-40' }} clearable value={l.countryOfOriginCode} onChange={(countryOfOriginCode) => patch(l.id, { countryOfOriginCode })} /> : null), { optional: true, defaultHidden: true }),
    col('warranty', 'Warranty', (l) => {
      const w = itemOf(l)?.warrantyTemplate;
      return l.itemId ? <Text variant="small" tone={w ? 'default' : 'muted'}>{w ? m.inv.warranties.find((x) => x.id === w)?.name ?? w : 'None'}</Text> : null;
    }, { optional: true, defaultHidden: true }),
    col('unitCost', 'Unit cost price', (l) => (itemOf(l) ? <span className="whitespace-nowrap">PHP {formatAmount(itemOf(l)!.itemCost)}</span> : null), { optional: true, defaultHidden: true }),
    col('wt', 'WT code / rate', (l) => {
      const wt = withholdingOf(l);
      return l.itemId ? <Text variant="small">{wt.length ? wt.map((w) => `${w.atc} (${w.rate}%)`).join(', ') : 'None'}</Text> : null;
    }, { optional: true, defaultHidden: true }),
    col('wtBase', 'Taxable amount', (l) => (l.itemId && withholdingOf(l).length ? <span className="tabular-nums">{formatAmount(lineNet(l))}</span> : null), { optional: true, defaultHidden: true }),
    col('base', 'Base document', (l) => (l.baseType ? <Link intent="primary" href={`#/purchasing/purchase-orders/${l.baseId}`}>PO {l.baseDocNo}</Link> : l.itemId ? <span className="text-muted">—</span> : null), { optional: true }),
    col('blanketAgreement', 'Blanket agreement', (l) => (l.itemId ? <Combobox aria-label="Blanket agreement" className="w-48" options={blanketOptions} value={l.blanketAgreement} onValueChange={(blanketAgreement) => patch(l.id, { blanketAgreement: blanketAgreement ?? '' })} /> : null), { optional: true }),
    textCol({ key: 'freeText', header: 'Free text', width: 'w-48', readOnly: readOnly, defaultHidden: false, get: (l: DprLine) => l.freeText, onChange: (l, v) => patch(l.id, { freeText: v }) }),
  ];
  const prefs = useColumnPrefs('dpr', allColumns);
  const columns = prefs.columns;

  return (
    <>
      <DataTable
      noPagination
      icon="list_alt"
      title="Contents"
      description={errors.lines ?? `What the advance is for, at the full order price in ${code}. The DPM % in the totals sets how much of it is requested now.`}
      rows={lines}
      getRowId={(l) => l.id}
      columns={columns}
      unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
      sortValue={(l, key) => (key === 'item' ? l.itemNo : String((l as unknown as Record<string, unknown>)[key] ?? '')).toLowerCase()}
      onRemove={readOnly ? undefined : (picked) => onChange(lines.filter((l) => !picked.includes(l)))}
      columnMenu={prefs.menu}
      spanRow={readOnly ? undefined : (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Combobox
              key={addKey}
              aria-label="Search items to add a line"
              placeholder={vendorId ? 'Search items to add a line…' : 'Pick a vendor to add items'}
              disabled={!vendorId}
              options={itemOptions('')}
              value={null}
              onValueChange={(id) => {
                const line = id ? fromItem(id) : undefined;
                if (!line) return;
                onChange([...lines, line]);
                setAddKey((k) => k + 1);
              }}
            />
          </div>
          <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!canCopy} onClick={onCopy}>Copy from PO</Button>
        </div>
      )}
      empty={<Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>{vendorId ? 'Search above to add a line, or copy from an open PO.' : 'Pick a vendor first.'}</Text>}
      cardFooter={
        <PurchTotalsFooter
          totals={{ ...totals, freight: 0, rounding: 0 }}
          currency={code}
          readOnly={readOnly}
          discountPct={draft.discountPct}
          onDiscountChange={(discountPct) => update({ discountPct })}
          midRows={<PurchTotalRow label={`Down payment (${draft.dpmPct}%)`} value={totals.dpm} code={code} />}
          extraRows={<>
            <PurchTotalRow label="Applied amount" value={-draft.appliedAmount} code={code} />
            <PurchTotalRow label="Balance due" value={balance} code={code} strong />
            {ctx.readOnly && draft.appliedAmount ? (
              <PurchTotalNote>Drawn on A/P invoices: {code} {formatAmount(draft.drawnAmount)} of {formatAmount(draft.appliedAmount)} paid.</PurchTotalNote>
            ) : null}
          </>}
        />
      }
      />
    </>
  );
}
