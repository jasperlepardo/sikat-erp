import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Combobox, Icon, Link, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { useColumnPrefs, type PrefColumn } from '../../../../components/form/columnPrefs';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { textCol } from '../../shared/purchColumns';
import { countryDef } from '../../../settings/masterDefs';
import { type ApRiLine } from '../../../../mocks/apReserveInvoices';
import { BLANKET_AGREEMENTS } from '../../../../mocks/purchaseOrders';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import { formatDate } from '../../../../services/dates';
import { apRiTotals } from '../../../../services/apReserveInvoices';
import { getPurchasingSettings, lineNet, openQty, poNumber, poWithholding } from '../../../../services/purchaseOrders';
import { isValidToday } from '../../../../services/items';
import { PurchTotalsFooter, PurchTotalNote, PurchTotalRow } from '../../shared/PurchTotalsFooter';
import { CopyPanel } from '../../shared/CopyPanel';
import { riLineFromItem, riLinesFromPo, type ApriSectionProps } from './types';

const WITHHELD_LABEL: Record<string, string> = {
  'Expanded (EWT)': 'EWT',
  'Final (FWT)': 'Final tax',
  'Withholding VAT': 'VAT',
  'Percentage tax': 'Percentage tax',
};

const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function ApriContentsCard({
  draft,
  update,
  errors,
  m,
  ctx,
  onCopy,
}: ApriSectionProps & { onCopy: (lines: ApRiLine[]) => void }) {
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [addKey, setAddKey] = useState(0);
  const [copying, setCopying] = useState(false);

  const lines = draft.lines;
  const code = draft.currency;
  const docCurrency = m.currencies.find((c) => c.code === code);
  const totals = apRiTotals(draft, ctx.rateOf, docCurrency?.rounding, ctx.isReverseCharge);
  const withholding = poWithholding(
    draft as Parameters<typeof poWithholding>[0],
    ctx.vendor,
    m.items,
    m.tax,
    draft.postingDate,
  );
  const balance = round2(totals.total - draft.appliedAmount);

  const showFreight = getPurchasingSettings().manageFreightInDocuments;
  const showRounding = getPurchasingSettings().roundingMethod === 'By Currency';

  const itemOf = (l: ApRiLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<ApRiLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: ApRiLine, field: string) => errors[`line:${l.id}:${field}`];

  const orders = draft.vendorId
    ? m.orders.filter(
        (po) =>
          po.vendorId === draft.vendorId &&
          po.status === 'Open' &&
          (!ctx.based || po.currency === draft.currency),
      )
    : [];

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
    ...BLANKET_AGREEMENTS.filter((b) => b.vendorId === draft.vendorId && b.validTo >= draft.postingDate).map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` })),
  ];

  const pickItem = (l: ApRiLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? riLineFromItem(item, draft, ctx, m, { id: l.id, quantity: l.quantity }) : { itemId: '' });
  };
  const fromItem = (itemId: string) => {
    const item = m.items.find((i) => i.id === itemId);
    return item ? riLineFromItem(item, draft, ctx, m, { quantity: 1 }) : undefined;
  };
  const changeUom = (l: ApRiLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!item || !itemsPerUnit) return;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit });
  };

  const col = (
    key: string,
    header: string,
    cell: (l: ApRiLine) => ReactNode,
    opts?: { optional?: boolean; defaultHidden?: boolean },
  ): PrefColumn<ApRiLine> => ({ key, header, cell, ...opts });

  const allColumns: PrefColumn<ApRiLine>[] = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      if (!item)
        return (
          <div className="flex w-60 flex-col gap-1">
            <Combobox aria-label="Item No." placeholder="Search items" options={itemOptions(l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(v) => pickItem(l, v)} />
          </div>
        );
      if (editing.has(l.id) && !ctx.readOnly)
        return (
          <div className="flex w-60 flex-col gap-1">
            <Text variant="caption">{item.itemNo}</Text>
            <TextField aria-label="Item description" value={l.description} onChange={(e) => patch(l.id, { description: e.currentTarget.value })} />
            <Link intent="primary" onClick={() => setEditing((s) => { const n = new Set(s); n.delete(l.id); return n; })}>Done</Link>
          </div>
        );
      return (
        <div className="flex w-60 flex-col gap-1 whitespace-normal">
          <div className="flex flex-col">
            <Text variant="caption">{item.itemNo}</Text>
            <Text variant="small">{l.name}</Text>
            <Text variant="small" tone="muted">{l.description}</Text>
          </div>
          {ctx.readOnly ? null : (
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
      const pl = l.baseType === 'PO' ? m.orders.find((p) => p.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId) : undefined;
      return (
        <div className="flex w-32 flex-col gap-1 whitespace-normal">
          <TextField aria-label="Quantity" type="number" min={0} invalid={Boolean(err(l, 'quantity'))} value={String(l.quantity)} onChange={(e) => patch(l.id, { quantity: num(e.currentTarget.value) })} />
          {l.baseType || ctx.readOnly ? (
            <Text variant="small" tone="muted">{l.uomCode}</Text>
          ) : (
            <Combobox aria-label="UoM code" options={itemUnits(item, 'purchase').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(v) => v && changeUom(l, v)} />
          )}
          {!ctx.readOnly && pl ? <Text variant="small" tone="muted">{openQty(pl)} of {pl.quantity} open on the PO</Text> : null}
        </div>
      );
    }),
    col('pricing', 'Unit price / Tax / Discount', (l) =>
      l.itemId ? (
        <div className="flex w-44 flex-col gap-1">
          <TextField aria-label="Unit price" type="number" min={0} prefix={draft.currency} invalid={Boolean(err(l, 'unitPrice'))} value={String(l.unitPrice)} onChange={(e) => patch(l.id, { unitPrice: round2(num(e.currentTarget.value)) })} />
          <Combobox aria-label="Tax code" invalid={Boolean(err(l, 'taxCode'))} options={taxOptions} value={l.taxCode} onValueChange={(taxCode) => patch(l.id, { taxCode: taxCode ?? '' })} />
          <TextField aria-label="Discount %" type="number" min={0} suffix="%" value={String(l.discountPct)} onChange={(e) => patch(l.id, { discountPct: Math.min(100, num(e.currentTarget.value)) })} />
        </div>
      ) : null,
    ),
    col('totalLc', 'Total (LC)', (l) =>
      l.itemId ? <span className="whitespace-nowrap">PHP {formatAmount(lineNet(l) * ctx.fx)}</span> : null,
    ),
    textCol({ key: 'bpCatalogNo', header: 'BP catalog no.', width: 'w-36', readOnly: ctx.readOnly, get: (l: ApRiLine) => l.bpCatalogNo, onChange: (l, v) => patch(l.id, { bpCatalogNo: v }) }),
    col(
      'countryOfOriginCode',
      'Country of origin',
      (l) =>
        l.itemId ? (
          <MasterLookup def={countryDef} fieldProps={{ 'aria-label': 'Country of origin', className: 'w-40' }} clearable value={l.countryOfOriginCode} onChange={(countryOfOriginCode) => patch(l.id, { countryOfOriginCode })} />
        ) : null,
      { optional: true, defaultHidden: true },
    ),
    col(
      'base',
      'Base document',
      (l) =>
        l.baseType ? (
          <Link intent="primary" href={`#/purchasing/purchase-orders/${l.baseId}`}>
            PO {l.baseDocNo}
          </Link>
        ) : l.itemId ? (
          <span className="text-muted">—</span>
        ) : null,
      { optional: true },
    ),
    col(
      'blanketAgreement',
      'Blanket agreement',
      (l) =>
        l.itemId ? (
          <Combobox aria-label="Blanket agreement" className="w-48" options={blanketOptions} value={l.blanketAgreement} onValueChange={(blanketAgreement) => patch(l.id, { blanketAgreement: blanketAgreement ?? '' })} />
        ) : null,
      { optional: true },
    ),
    textCol({ key: 'freeText', header: 'Free text', width: 'w-48', readOnly: ctx.readOnly, defaultHidden: false, get: (l: ApRiLine) => l.freeText, onChange: (l, v) => patch(l.id, { freeText: v }) }),
  ];
  const prefs = useColumnPrefs('apri', allColumns);
  const columns = prefs.columns;

  return (
    <>
      {prefs.settings}
      <DataTable
        noPagination
        icon="list_alt"
        title="Contents"
        description={
          errors.lines ??
          `What the vendor billed ahead of delivery, in the purchasing unit. Prices are in ${draft.currency}${draft.currency === 'PHP' ? '' : `; totals in PHP at ${ctx.fx ? `${ctx.fx} (${ctx.fxSource}, ${formatDate(ctx.fxDate)})` : '—'}`}. No stock movement until the Goods Receipt is created.`
        }
        rows={lines}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
        sortValue={(l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof ApRiLine] ?? '')).toLowerCase()}
        onRemove={ctx.readOnly ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
        onColumnSettings={prefs.toggleSettings}
        spanRow={
          ctx.readOnly ? undefined : (
            <div className="flex items-center gap-2">
              <div className="flex-1">
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
              </div>
              <Button type="button" size="small" variant="outline" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!orders.length} onClick={() => setCopying(true)}>
                Copy from
              </Button>
            </div>
          )
        }
        empty={
          <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
            {!draft.vendorId
              ? 'Pick a vendor first, then copy from its purchase orders or add lines.'
              : orders.length
                ? `${draft.vendorName} has ${orders.length} open PO${orders.length === 1 ? '' : 's'} — use Copy from, or add lines by hand.`
                : 'No open POs from this vendor. Add lines by hand.'}
          </Text>
        }
        cardFooter={
          <PurchTotalsFooter
            totals={totals}
            currency={code}
            readOnly={ctx.readOnly}
            discountPct={draft.discountPct}
            onDiscountChange={(discountPct) => update({ discountPct })}
            freightInput={
              showFreight ? (
                <div className="flex gap-1">
                  <TextField aria-label={`Freight (${code}, net)`} type="number" min={0} className="w-32" prefix={code} value={String(draft.freight)} onChange={(e) => update({ freight: Number(e.currentTarget.value) })} />
                  <Combobox
                    aria-label="Freight tax code"
                    className="w-28"
                    options={m.tax.codes.filter((c) => c.direction === 'Purchase' && c.active).map((c) => ({ value: c.code, label: c.code }))}
                    value={draft.freightTaxCode}
                    onValueChange={(freightTaxCode) => update({ freightTaxCode: freightTaxCode ?? '' })}
                  />
                </div>
              ) : undefined
            }
            roundingLabel={showRounding ? `Rounding (${docCurrency?.rounding ?? 'No rounding'})` : undefined}
            extraRows={
              <>
                {withholding
                  .filter((w) => w.deducted)
                  .map((w) => (
                    <PurchTotalRow key={w.atc} label={`${WITHHELD_LABEL[w.kind] ?? 'Tax'} withheld — ${w.atc} (${w.rate}%)`} value={-w.amount} code={code} />
                  ))}
                {withholding
                  .filter((w) => !w.deducted)
                  .map((w) => (
                    <PurchTotalNote key={w.atc}>
                      VAT withheld — {w.atc} ({w.rate}%): {code} {formatAmount(w.amount)} remitted by you on BIR 1600-VT, not deducted from the vendor.
                    </PurchTotalNote>
                  ))}
                <PurchTotalRow label="Applied amount" value={-draft.appliedAmount} code={code} />
                <PurchTotalRow label="Balance due" value={balance} code={code} strong />
                {code !== 'PHP' ? (
                  <PurchTotalNote>
                    ≈ PHP {formatAmount(balance * ctx.fx)} at {ctx.fx ? `${ctx.fx} (${ctx.fxSource})` : '—'}.
                  </PurchTotalNote>
                ) : null}
              </>
            }
          />
        }
      />
      {copying
        ? createPortal(
            <CopyPanel
              sources={[
                {
                  key: 'PO' as const,
                  label: 'Purchase orders',
                  totalHeader: 'Ordered',
                  qtyHeader: 'Invoice',
                  hint: 'Bill from an open PO. Goods are received later when you create a Goods Receipt referencing this invoice.',
                  docs: orders.map((po) => ({
                    id: po.id,
                    label: `PO ${poNumber(po)}`,
                    description: `Delivery ${formatDate(po.deliveryDate)} · ${po.currency}`,
                    lines: po.lines
                      .filter((l) => l.status === 'Open')
                      .map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
                  })),
                },
              ]}
              taken={new Set(lines.map((l) => l.baseLineId).filter(Boolean))}
              onCancel={() => setCopying(false)}
              onCopy={(_type, docId, picks) => {
                const po = orders.find((p) => p.id === docId)!;
                onCopy(riLinesFromPo(po, picks, m));
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
