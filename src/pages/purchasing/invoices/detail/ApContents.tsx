import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Card, Checkbox, Combobox, Icon, Link, Radio, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { MasterLookup } from '../../../../components/form/MasterLookup';
import { countryDef } from '../../../settings/masterDefs';
import { Section } from '../../../../components/form/fields';
import { newApLine, type ApLine } from '../../../../mocks/apInvoices';
import { BLANKET_AGREEMENTS } from '../../../../mocks/purchaseOrders';
import { itemUnits, itemsPerUom } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import { formatDate } from '../../../../services/dates';
import { movesStock } from '../../../../services/apInvoices';
import { grInventoryQty, grNumber, grOpenQty, invoiceableReceipts, receivablePos } from '../../../../services/goodsReceipts';
import { activeOptions } from '../../../../services/inventoryMasters';
import { isValidToday } from '../../../../services/items';
import { lineNet, openQty, poNumber } from '../../../../services/purchaseOrders';
import { binOptions } from '../../../inventory/transfers/TransferLines';
import { EditPanel } from '../../../partners/detail/EditPanel';
import { defaultBin, lineFromItem, linePricing, linesFromPo } from '../../receipts/detail/types';
import { baseHref, linesFromReceipt, toApLine, type ApSectionProps } from './types';

const GROUPS = {
  details: 'Item details',
  references: 'References',
} as const;
type Group = keyof typeof GROUPS;

const num = (v: string) => (v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function ApContents({ draft, update, errors, m, ctx, onCopy }: ApSectionProps & { onCopy: (lines: ApLine[]) => void }) {
  const [shown, setShown] = useState<Group[]>(['references']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const lines = draft.lines;
  const itemOf = (l: ApLine) => m.items.find((i) => i.id === l.itemId);
  const patch = (id: string, p: Partial<ApLine>) => update({ lines: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const err = (l: ApLine, field: string) => errors[`line:${l.id}:${field}`];
  const is = (g: Group) => shown.includes(g);
  const sameCurrency = <T extends { currency: string }>(docs: T[]) => (ctx.based ? docs.filter((d) => d.currency === draft.currency) : docs);
  const receipts = draft.vendorId ? sameCurrency(invoiceableReceipts(m.receipts, draft.vendorId)) : [];
  const orders = draft.vendorId ? sameCurrency(receivablePos(m.orders, draft.vendorId)) : [];

  const itemOptions = (current: string) =>
    m.items
      .filter((i) => i.id === current || (i.purchaseItem && isValidToday(i, draft.postingDate)))
      .map((i) => ({
        value: i.id,
        label: (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-60">{i.itemNo}</span>
            <span>{i.name}</span>
          </div>
        ),
        text: `${i.itemNo} ${i.description}`,
      }));
  const taxOptions = m.tax.codes.filter((c) => c.direction === 'Purchase' && c.active).map((c) => ({ value: c.code, label: `${c.code} (${ctx.rateOf(c.code)}%)` }));
  const blanketOptions = [
    { value: '', label: '— None —' },
    ...BLANKET_AGREEMENTS.filter((b) => b.vendorId === draft.vendorId && b.validTo >= draft.postingDate).map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` })),
  ];

  const pickItem = (l: ApLine, itemId: string | null) => {
    const item = m.items.find((i) => i.id === itemId);
    patch(l.id, item ? toApLine(lineFromItem(item, draft, ctx, m, { id: l.id, quantity: l.quantity }), { baseType: '' }, m.items, draft.vendorId) : { itemId: '' });
  };
  const changeUom = (l: ApLine, uomCode: string) => {
    const item = itemOf(l);
    const itemsPerUnit = item ? itemsPerUom(item, uomCode) : undefined;
    if (!item || !itemsPerUnit) return;
    patch(l.id, { uomCode, uomName: m.inv.uoms.find((u) => u.code === uomCode)?.name ?? uomCode, itemsPerUnit, ...(ctx.fx ? linePricing(item, { ...l, uomCode }, draft, ctx) : {}) });
  };

  const col = (key: string, header: string, cell: (l: ApLine) => ReactNode, group?: Group): TableColumn<ApLine> & { group?: Group } => ({ key, header, cell, group });
  const columns = [
    col('item', 'Item / Description', (l) => {
      const item = itemOf(l);
      return (
        <div className="flex w-60 flex-col gap-1">
          {item ? (
            <>
              <div className="flex flex-col">
                <Text variant="caption">{item.itemNo}</Text>
                <Text variant="small">{l.name}</Text>
                <Text variant="small" tone="muted">{l.description}</Text>
              </div>
              {!ctx.readOnly && !l.baseType ? (
                <Link intent="primary" onClick={() => patch(l.id, { itemId: '', itemNo: '', name: '', description: '' })}>Change</Link>
              ) : null}
            </>
          ) : (
            <Combobox aria-label="Item No." placeholder="Search items" options={itemOptions(l.itemId)} value={l.itemId || null} invalid={Boolean(err(l, 'item'))} onValueChange={(v) => pickItem(l, v)} />
          )}
        </div>
      );
    }),
    col('qty', 'Qty / UoM', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      const gr = l.baseType === 'GRPO' ? m.receipts.find((r) => r.id === l.baseId) : undefined;
      const gl = gr?.lines.find((x) => x.id === l.baseLineId);
      const pl = l.baseType === 'PO' ? m.orders.find((p) => p.id === l.baseId)?.lines.find((x) => x.id === l.baseLineId) : undefined;
      return (
        <div className="flex w-32 flex-col gap-1">
          <TextField aria-label="Quantity" type="number" min={0} invalid={Boolean(err(l, 'quantity'))} value={String(l.quantity)} onChange={(e) => patch(l.id, { quantity: num(e.currentTarget.value) })} />
          {l.baseType || ctx.readOnly ? (
            <Text variant="small" tone="muted">{l.uomCode}</Text>
          ) : (
            <Combobox aria-label="UoM code" options={itemUnits(item, 'purchase').map((u) => ({ value: u.uom, label: u.uom }))} value={l.uomCode} onValueChange={(v) => v && changeUom(l, v)} />
          )}
          {!ctx.readOnly && gr && gl ? <Text variant="small" tone="muted">{grOpenQty(gl, gr)} of {gl.quantity} left to bill on the receipt</Text> : null}
          {!ctx.readOnly && pl ? <Text variant="small" tone="muted">{openQty(pl)} of {pl.quantity} open on the PO</Text> : null}
        </div>
      );
    }),
    col('warehouse', 'Whse / Bin', (l) => {
      const item = itemOf(l);
      if (!item) return null;
      if (!item.inventoryItem) return <span className="text-muted">Not stocked</span>;
      if (!movesStock(l, m.items)) return <Text variant="small" tone="muted">Received in {l.warehouse}</Text>;
      const wh = m.inv.warehouses.find((w) => w.code === l.warehouse);
      return (
        <div className="flex w-44 flex-col gap-1">
          <Combobox
            aria-label="Warehouse"
            invalid={Boolean(err(l, 'warehouse'))}
            options={activeOptions(m.inv.warehouses, (w) => w.code, (w) => w.code, l.warehouse)}
            value={l.warehouse}
            onValueChange={(warehouse) => patch(l.id, { warehouse: warehouse ?? '', bin: warehouse ? defaultBin(item, warehouse, m) : '' })}
          />
          {wh?.binEnabled ? (
            <Combobox aria-label="Bin location" invalid={Boolean(err(l, 'bin'))} options={binOptions(m.inv.bins, wh, l.bin)} value={l.bin} onValueChange={(bin) => patch(l.id, { bin: bin ?? '' })} />
          ) : null}
          <Text variant="small" tone="muted">Received with this invoice</Text>
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
    col('totalLc', 'Total (LC)', (l) => (l.itemId ? <span className="whitespace-nowrap">PHP {formatAmount(lineNet(l) * ctx.fx)}</span> : null)),
    col('inventoryQty', 'Qty (inventory UoM)', (l) => (itemOf(l) ? `${grInventoryQty(l).toLocaleString('en-PH')} ${itemOf(l)!.inventoryUom}` : null), 'details'),
    col('bpCatalogNo', 'BP catalog no.', (l) => (l.itemId ? <TextField aria-label="BP catalog no." className="w-36" value={l.bpCatalogNo} onChange={(e) => patch(l.id, { bpCatalogNo: e.currentTarget.value })} /> : null), 'details'),
    col('countryOfOrigin', 'Country of origin', (l) =>
      l.itemId ? (
        <MasterLookup def={countryDef} fieldProps={{ 'aria-label': 'Country of origin', className: 'w-40' }} clearable value={l.countryOfOrigin} onChange={(countryOfOrigin) => patch(l.id, { countryOfOrigin })} />
      ) : null, 'details'),
    col('unitCost', 'Unit cost price', (l) => (itemOf(l) ? <span className="whitespace-nowrap">PHP {formatAmount(itemOf(l)!.itemCost)}</span> : null), 'details'),
    col('base', 'Base document', (l) =>
      l.baseType ? <Link intent="primary" href={baseHref(l)}>{l.baseType === 'GRPO' ? 'Receipt' : 'PO'} {l.baseDocNo}</Link> : l.itemId ? <span className="text-muted">—</span> : null, 'references'),
    col('blanketAgreement', 'Blanket agreement', (l) =>
      l.itemId ? <Combobox aria-label="Blanket agreement" className="w-48" options={blanketOptions} value={l.blanketAgreement} onValueChange={(blanketAgreement) => patch(l.id, { blanketAgreement: blanketAgreement ?? '' })} /> : null, 'references'),
    col('freeText', 'Free text', (l) => (l.itemId ? <TextField aria-label="Free text" className="w-48" value={l.freeText} onChange={(e) => patch(l.id, { freeText: e.currentTarget.value })} /> : null), 'references'),
  ].filter((c) => !c.group || is(c.group));

  return (
    <>
      <DataTable
        variant="card"
        noPagination
        icon="list_alt"
        title="Contents"
        description={
          errors.lines ??
          `What the vendor billed, in the purchasing unit. Prices are in ${draft.currency}${draft.currency === 'PHP' ? '' : `; totals in PHP at ${ctx.fx ? `${ctx.fx} (${ctx.fxSource}, ${formatDate(ctx.fxDate)})` : '—'}`}.`
        }
        rows={lines}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={columns.map((c) => c.key).filter((k) => k !== 'item')}
        sortValue={(l, key) => (key === 'item' ? l.itemNo : String(l[key as keyof ApLine] ?? '')).toLowerCase()}
        onRemove={ctx.readOnly ? undefined : (picked) => update({ lines: lines.filter((l) => !picked.includes(l)) })}
        onColumnSettings={() => setSettingsOpen(!settingsOpen)}
        actions={
          ctx.readOnly ? null : (
            <div className="flex gap-1">
              <Button type="button" size="small" intent="default" variant="solid" leadingIcon={<Icon size={16}>content_copy</Icon>} disabled={!receipts.length && !orders.length} onClick={() => setCopying(true)}>
                Copy from
              </Button>
              <Button type="button" size="small" intent="primary" variant="solid" aria-label="Add line" leadingIcon={<Icon size={16}>add</Icon>} disabled={!draft.vendorId} onClick={() => update({ lines: [...lines, newApLine()] })}>
                Add line
              </Button>
            </div>
          )
        }
        empty={
          <Text variant="small" tone={errors.lines ? 'danger' : 'muted'}>
            {!draft.vendorId
              ? 'Pick a vendor first, then copy from its goods receipts or purchase orders, or add lines.'
              : receipts.length || orders.length
                ? `${draft.vendorName} has ${receipts.length} receipt${receipts.length === 1 ? '' : 's'} to bill and ${orders.length} open PO${orders.length === 1 ? '' : 's'} — use Copy from, or add lines by hand.`
                : 'Nothing from this vendor to bill. Add lines by hand.'}
          </Text>
        }
      >
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
      </DataTable>
      {copying
        ? createPortal(
            <CopyPanel
              sources={{
                GRPO: receipts.map((gr) => ({
                  id: gr.id,
                  label: `Receipt ${grNumber(gr)}`,
                  description: `Received ${formatDate(gr.postingDate)} · ${gr.currency}${gr.orderNumber ? ` · PO ${gr.orderNumber}` : ''}`,
                  lines: gr.lines.map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: grOpenQty(l, gr) })),
                })),
                PO: orders.map((po) => ({
                  id: po.id,
                  label: `PO ${poNumber(po)}`,
                  description: `Delivery ${formatDate(po.deliveryDate)} · ${po.currency} · not yet received — billing it receives the stock`,
                  lines: po.lines.filter((l) => l.status === 'Open').map((l) => ({ id: l.id, itemNo: l.itemNo, name: l.name, warehouse: l.warehouse, total: `${l.quantity} ${l.uomCode}`, open: openQty(l) })),
                })),
              }}
              taken={new Set(lines.map((l) => l.baseLineId).filter(Boolean))}
              onCancel={() => setCopying(false)}
              onCopy={(type, docId, picks) => {
                if (type === 'GRPO') {
                  const gr = receipts.find((r) => r.id === docId)!;
                  onCopy(linesFromReceipt(gr, picks, m.items));
                } else {
                  const po = orders.find((p) => p.id === docId)!;
                  onCopy(linesFromPo(po, picks, m).map((l) => toApLine(l, { baseType: 'PO' }, m.items, po.vendorId)));
                }
                setCopying(false);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

interface CopySource {
  id: string;
  label: string;
  description: string;
  lines: { id: string; itemNo: string; name: string; warehouse: string; total: string; open: number }[];
}

/**
 * Copy From › Goods Receipt PO / Purchase Orders: pick the document type, then a document; its
 * open lines come ticked at their open quantity. Lines already on the invoice aren't offered again.
 */
function CopyPanel({
  sources,
  taken,
  onCancel,
  onCopy,
}: {
  sources: Record<'GRPO' | 'PO', CopySource[]>;
  taken: Set<string>;
  onCancel: () => void;
  onCopy: (type: 'GRPO' | 'PO', docId: string, picks: { lineId: string; qty: number }[]) => void;
}) {
  const [type, setType] = useState<'GRPO' | 'PO'>(sources.GRPO.length ? 'GRPO' : 'PO');
  const [docId, setDocId] = useState(sources[type][0]?.id ?? '');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const doc = sources[type].find((d) => d.id === docId);
  const open = (doc?.lines ?? []).filter((l) => l.open > 0 && !taken.has(l.id));
  const picks = open.filter((l) => !unticked.has(l.id)).map((l) => ({ lineId: l.id, qty: qty[l.id] ?? l.open }));
  const reset = () => {
    setQty({});
    setUnticked(new Set());
  };

  const columns: TableColumn<(typeof open)[number]>[] = [
    {
      key: 'pick',
      header: '',
      cell: (l) => (
        <Checkbox
          aria-label={`Bill ${l.itemNo}`}
          checked={!unticked.has(l.id)}
          onChange={(e) => {
            const next = new Set(unticked);
            if (e.currentTarget.checked) next.delete(l.id);
            else next.add(l.id);
            setUnticked(next);
          }}
        />
      ),
    },
    { key: 'item', header: 'Item', cell: (l) => <div className="flex flex-col"><Text variant="caption">{l.itemNo}</Text><Text variant="small">{l.name}</Text></div> },
    { key: 'warehouse', header: 'Whse', cell: (l) => l.warehouse || '—' },
    { key: 'total', header: type === 'GRPO' ? 'Received' : 'Ordered', cell: (l) => l.total },
    {
      key: 'bill',
      header: 'Bill',
      cell: (l) => (
        <TextField aria-label={`Quantity to bill of ${l.itemNo}`} type="number" min={0} className="w-24" suffix={`/ ${l.open}`} value={String(qty[l.id] ?? l.open)} onChange={(e) => setQty({ ...qty, [l.id]: Math.min(l.open, num(e.currentTarget.value)) })} />
      ),
    },
  ];

  return (
    <EditPanel icon="content_copy" title="Copy from" onCancel={onCancel} onDone={() => (doc && picks.length ? onCopy(type, doc.id, picks.filter((p) => p.qty > 0)) : onCancel())}>
      <Section icon="description" title="Base document">
        <div className="flex flex-wrap gap-6" role="radiogroup" aria-label="Copy from">
          {(['GRPO', 'PO'] as const).map((t) => (
            <Radio
              key={t}
              name="ap-copy-from"
              checked={type === t}
              disabled={!sources[t].length}
              onChange={() => {
                setType(t);
                setDocId(sources[t][0]?.id ?? '');
                reset();
              }}
            >
              {t === 'GRPO' ? `Goods receipts (${sources.GRPO.length})` : `Purchase orders (${sources.PO.length})`}
            </Radio>
          ))}
        </div>
        <Combobox
          aria-label="Document"
          options={sources[type].map((d) => ({ value: d.id, label: d.label, description: d.description, text: d.label }))}
          value={docId || null}
          onValueChange={(v) => {
            setDocId(v ?? '');
            reset();
          }}
        />
        <Text variant="small" tone="muted">
          {type === 'GRPO'
            ? 'Bill what was received: the usual three-way match. Only receipts with quantity still to bill are listed.'
            : "Bill straight from a PO when nothing was received on a receipt — the invoice receives the stock too."}
        </Text>
      </Section>
      <DataTable
        icon="list_alt"
        title="Open lines"
        description={open.length ? `${picks.length} of ${open.length} line${open.length === 1 ? '' : 's'} ticked.` : undefined}
        rows={open}
        getRowId={(l) => l.id}
        columns={columns}
        unsortable={['pick', 'bill']}
        noPagination
        empty={<Text variant="small" tone="muted">Every open line of this document is already on the invoice.</Text>}
      />
    </EditPanel>
  );
}
