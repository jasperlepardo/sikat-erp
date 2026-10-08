import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Card,
  Combobox,
  Icon,
  Table,
  TableLink,
  TableStatus,
  TableSubcontent,
  Tabs,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { CtxFormField, FieldStack, ReadOnly, Section, type Errors } from '../../../../components/form/fields';
import { addressSummary } from '../../../../mocks/address';
import type { ItemWarehouse } from '../../../../mocks/items';
import type { Partner } from '../../../../mocks/partners';
import { holdsStock, receivesFromVendors } from '../../../../mocks/itemMasters';
import type { InventoryMasters } from '../../../../services/inventoryMasters';
import { binsOf } from '../../../../services/binLocations';
import { useAsync } from '../../../../services/useAsync';
import { layerHistory, type CostLayer } from '../../../../services/costLayers';
import { formatAmount } from '../../../../services/format';
import { grNumber, listGoodsReceipts } from '../../../../services/goodsReceipts';
import { GR_LIST_PATH } from '../../../purchasing/receipts/detail/GoodsReceiptDetail';
import { EditPanel } from '../../../partners/detail/EditPanel';
import { vendorOptions, type Draft } from './types';
import { listWarehouseDocuments, type WarehouseDocument } from './warehouseDocuments';

const qty = (n: number) => n.toLocaleString('en-PH');
export const binErrorKey = (code: string) => `wh:${code}:bin`;

/** Add a warehouse to the item, or edit its preferred vendor and default bin. */
export function WarehousePanel({
  value,
  isNew,
  draft,
  inv,
  vendors,
  onDone,
  onCancel,
}: {
  value: ItemWarehouse;
  isNew: boolean;
  draft: Draft;
  inv: InventoryMasters;
  vendors: Partner[];
  onDone: (row: ItemWarehouse) => void;
  onCancel: () => void;
}) {
  const [row, setRow] = useState(value);
  const [errors, setErrors] = useState<Errors>({});
  const wh = inv.warehouses.find((w) => w.code === row.code);
  const free = inv.warehouses.filter((w) => w.active && holdsStock(w) && !draft.warehouses.some((x) => x.code === w.code));

  const done = () => {
    const e: Errors = {};
    if (!row.code) e.code = 'Pick a warehouse.';
    if (wh?.binEnabled && !row.defaultBin) e.defaultBin = `${wh.code} uses bins — pick a default bin.`;
    setErrors(e);
    // Only locations vendors deliver to keep a preferred vendor.
    if (!Object.keys(e).length) onDone(wh && !receivesFromVendors(wh) ? { ...row, preferredVendorId: '' } : row);
  };

  return (
    <EditPanel icon="warehouse" title={isNew ? 'Add warehouse' : `${row.code} · ${wh?.name ?? ''}`} onCancel={onCancel} onDone={done}>
      <Section icon="warehouse" title="Warehouse">
        <FieldStack>
          {isNew ? (
            <CtxFormField label="Warehouse" required error={errors.code}>
              {(p) => (
                <Combobox
                  {...p}
                  options={free.map((w) => ({ value: w.code, label: `${w.code} · ${w.name}` }))}
                  placeholder="Pick a warehouse"
                  value={row.code || null}
                  onValueChange={(code) => setRow({ ...row, code: code ?? '', defaultBin: '' })}
                />
              )}
            </CtxFormField>
          ) : (
            <ReadOnly
              label="Warehouse"
              value={`${row.code} · ${wh?.name ?? 'Unknown warehouse'}`}
              hint="Fixed once added. Remove it and add another warehouse to change it."
            />
          )}
          <ReadOnly
            label="Address"
            value={addressSummary(wh?.address) || '—'}
            hint={wh ? 'Edit it in Inventory › Warehouses & Bins.' : 'Pick a warehouse first.'}
          />
          {wh && !receivesFromVendors(wh) ? (
            <ReadOnly
              label="Preferred vendor"
              value="None"
              hint={`${wh.code} is restocked by inventory transfer, not bought into. Set the preferred vendor on the warehouse that supplies it.`}
            />
          ) : (
            <CtxFormField label="Preferred vendor" tooltip="MRP routes this warehouse’s replenishment to this vendor.">
              {(p) => (
                <Combobox
                  {...p}
                  options={vendorOptions(vendors).filter((o) => o.value)}
                  placeholder="None"
                  clearable
                  value={row.preferredVendorId || null}
                  onValueChange={(v) => setRow({ ...row, preferredVendorId: v ?? '' })}
                />
              )}
            </CtxFormField>
          )}
          {wh?.binEnabled ? (
            <CtxFormField label="Default bin" required error={errors.defaultBin} tooltip="Receipts and picks default to this bin.">
              {(p) => (
                <Combobox
                  {...p}
                  options={binsOf(inv.bins, wh.code, row.defaultBin).map((b) => ({
                    value: b.code,
                    label: b.code,
                    subLabel: b.description || undefined,
                  }))}
                  placeholder="Pick a bin"
                  value={row.defaultBin || null}
                  onValueChange={(v) => setRow({ ...row, defaultBin: v ?? '' })}
                />
              )}
            </CtxFormField>
          ) : (
            <ReadOnly
              label="Default bin"
              value={wh ? 'No bin management' : '—'}
              hint={
                wh
                  ? `${wh.code} doesn’t use bins. Turn on bin management in Inventory › Warehouses & Bins.`
                  : 'Pick a warehouse first.'
              }
            />
          )}
        </FieldStack>
        {!isNew ? (
          <Text variant="small" tone="muted">
            Stock here: {qty(row.inStock)} in stock, {qty(row.committed)} committed, {qty(row.ordered)} ordered.
          </Text>
        ) : null}
      </Section>
      {!isNew && draft.id && draft.valuationMethod === 'FIFO' ? <CostLayers itemId={draft.id} warehouse={row.code} uom={draft.inventoryUom} /> : null}
      {!isNew && draft.id ? <WarehouseTransactions itemId={draft.id} warehouse={row.code} uom={draft.inventoryUom} /> : null}
    </EditPanel>
  );
}

const EFFECT_LABEL: Record<WarehouseDocument['effect'], string> = { in: 'in', out: 'out', committed: 'committed', ordered: 'ordered' };

/**
 * The documents that move or reserve the item's stock in one warehouse: orders (Committed,
 * Ordered) and movements (receipts, returns, deliveries, transfers). Open shows what's live now.
 */
function WarehouseTransactions({ itemId, warehouse, uom }: { itemId: string; warehouse: string; uom: string }) {
  const navigate = useNavigate();
  const docs = useAsync(() => listWarehouseDocuments(itemId, warehouse), [itemId, warehouse]);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  if (!docs) return <Text tone="muted">Loading transactions…</Text>;

  // Open: orders still reserving stock. Movements are history, so they show under All.
  const open = docs.filter((d) => d.live && (d.effect === 'committed' || d.effect === 'ordered'));
  const rows = filter === 'open' ? open : docs;
  const amount = (d: WarehouseDocument) => {
    const sign = d.effect === 'in' ? '+' : d.effect === 'out' ? '−' : '';
    return (
      <span className={`whitespace-nowrap tabular-nums ${d.live ? '' : 'text-muted'}`}>
        {sign}
        {qty(d.quantity)} {uom} {EFFECT_LABEL[d.effect]}
        {d.unitCost ? <span className="text-muted"> @ ₱{formatAmount(d.unitCost)}</span> : null}
      </span>
    );
  };
  const columns: TableColumn<WarehouseDocument>[] = [
    {
      key: 'number',
      header: 'Document',
      cell: (d) => (
        <TableSubcontent subcopy={[d.type, d.subcopy].filter(Boolean).join(' · ')}>
          {d.href ? <TableLink onClick={() => navigate(d.href)}>{d.number}</TableLink> : d.number}
        </TableSubcontent>
      ),
    },
    { key: 'date', header: 'Date', cell: (d) => <span className="whitespace-nowrap">{d.date}</span> },
    { key: 'status', header: 'Status', cell: (d) => (d.status ? <TableStatus intent={d.intent}>{d.status}</TableStatus> : null) },
    { key: 'quantity', header: 'Quantity', cell: amount },
  ];

  return (
    <Card>
      <Card.Header icon={<Icon size={24}>receipt_long</Icon>}>Transactions</Card.Header>
      <Card.Content>
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as 'open' | 'all')}
          items={[
            { value: 'open', label: 'Open orders', badge: String(open.length) },
            { value: 'all', label: 'All', badge: String(docs.length) },
          ]}
        />
      </Card.Content>
      {rows.length ? (
        // FIFO deliveries and returns expand to the batches their units came out of.
        <Table caption={`Transactions in ${warehouse}`} columns={columns} rows={rows} getRowId={(d) => d.id} getSubRows={(d) => d.batches} layout="scroll" />
      ) : (
        <Card.Content>
          <Text variant="small" tone="muted">
            {filter === 'open' ? 'No open purchase or sales orders here.' : 'No documents for this item here yet.'}
          </Text>
        </Card.Content>
      )}
    </Card>
  );
}

/**
 * The item's FIFO batches in one warehouse, oldest first: what each came in at, how much is left,
 * and which one the next sale or transfer takes from. Layers carry their receipt through transfers,
 * so a store shows the batch its stock was bought in.
 */
function CostLayers({ itemId, warehouse, uom }: { itemId: string; warehouse: string; uom: string }) {
  const navigate = useNavigate();
  const data = useAsync(async () => ({ layers: await layerHistory(itemId, warehouse), receipts: await listGoodsReceipts() }), [itemId, warehouse]);
  if (!data) return <Text tone="muted">Loading cost layers…</Text>;
  const { layers, receipts } = data;
  const open = layers.filter((l) => l.qty > 0);
  const onHand = open.reduce((n, l) => n + l.qty, 0);
  const value = open.reduce((n, l) => n + l.qty * l.unitCost, 0);
  const next = open[0];
  const batch = (l: CostLayer) => {
    const gr = receipts.find((r) => r.id === l.receiptId);
    if (gr) return <TableLink onClick={() => navigate(`${GR_LIST_PATH}/${gr.id}`)}>{grNumber(gr)}</TableLink>;
    return l.receiptId === 'opening' ? 'Opening stock' : 'Stock count';
  };
  const columns: TableColumn<CostLayer>[] = [
    {
      key: 'receivedOn',
      header: 'Batch',
      cell: (l) => (
        <TableSubcontent subcopy={l.sourceId.startsWith('tr-') ? `Received ${l.receivedOn} · transferred in` : `Received ${l.receivedOn}`}>
          {batch(l)}
        </TableSubcontent>
      ),
    },
    { key: 'unitCost', header: 'Unit cost', cell: (l) => <span className="whitespace-nowrap tabular-nums">₱{formatAmount(l.unitCost)}</span> },
    { key: 'receivedQty', header: 'In', cell: (l) => <span className="tabular-nums">{qty(l.receivedQty ?? l.qty)}</span> },
    {
      key: 'qty',
      header: 'Left',
      cell: (l) => (
        <span className={`whitespace-nowrap tabular-nums ${l.qty ? '' : 'text-muted'}`}>
          {qty(l.qty)} {uom}
          {l === next ? <span className="text-muted"> · next out</span> : null}
        </span>
      ),
    },
    { key: 'value', header: 'Value', cell: (l) => <span className={`whitespace-nowrap tabular-nums ${l.qty ? '' : 'text-muted'}`}>₱{formatAmount(l.qty * l.unitCost)}</span> },
  ];

  return (
    <Card>
      <Card.Header icon={<Icon size={24}>layers</Icon>}>Cost layers (FIFO)</Card.Header>
      <Card.Content>
        <Text variant="small" tone="muted">
          {onHand
            ? `${qty(onHand)} ${uom} on hand worth ₱${formatAmount(value)} (₱${formatAmount(value / onHand)} each on average). Sales and transfers take the oldest batch first.`
            : 'Nothing on hand here. Used-up batches stay listed for reference.'}
        </Text>
      </Card.Content>
      {layers.length ? (
        <Table caption={`Cost layers in ${warehouse}`} columns={columns} rows={layers} getRowId={(l) => l.id} layout="scroll" />
      ) : (
        <Card.Content>
          <Text variant="small" tone="muted">No batches here yet.</Text>
        </Card.Content>
      )}
    </Card>
  );
}
