import { Button, Select, Table, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { WAREHOUSES, warehouseLabel } from '../../../../mocks/itemMasters';
import { newItemWarehouse, type ItemWarehouse } from '../../../../mocks/items';
import { stockTotals } from '../../../../services/items';
import { formatAmount } from '../../../../services/format';
import { vendorOptions, type TabProps } from './types';

const qty = (n: number) => n.toLocaleString('en-PH');

export function InventoryTab({ draft, update, errors, vendors }: TabProps) {
  const f = bind(draft, update);
  if (!draft.inventoryItem) {
    return (
      <Section icon="inventory_2" title="Inventory data">
        <Text variant="small" tone="muted">
          Not an inventory item, so no stock is kept. Turn on Inventory item on the General tab to track stock.
        </Text>
      </Section>
    );
  }

  const totals = stockTotals(draft);
  const uom = draft.inventoryUom;
  const standard = draft.valuationMethod === 'Standard Price';
  const missing = WAREHOUSES.filter((w) => !draft.warehouses.some((x) => x.code === w.code));
  const patchRow = (code: string, p: Partial<ItemWarehouse>) =>
    update({ warehouses: draft.warehouses.map((w) => (w.code === code ? { ...w, ...p } : w)) });

  const columns: TableColumn<ItemWarehouse>[] = [
    { key: 'code', header: 'Warehouse', cell: (w) => warehouseLabel(w.code) },
    { key: 'inStock', header: 'In stock', cell: (w) => qty(w.inStock) },
    { key: 'committed', header: 'Committed', cell: (w) => qty(w.committed) },
    { key: 'ordered', header: 'Ordered', cell: (w) => qty(w.ordered) },
    {
      key: 'available',
      header: 'Available',
      cell: (w) => {
        const a = w.inStock - w.committed + w.ordered;
        return <span className={a < 0 ? 'text-danger' : undefined}>{qty(a)}</span>;
      },
    },
    {
      key: 'preferredVendorId',
      header: 'Preferred vendor',
      cell: (w) => (
        <Select
          aria-label={`Preferred vendor for ${w.code}`}
          options={vendorOptions(vendors)}
          value={w.preferredVendorId}
          onValueChange={(v) => patchRow(w.code, { preferredVendorId: v })}
        />
      ),
    },
    {
      key: 'defaultBin',
      header: 'Default bin',
      cell: (w) => {
        const wh = WAREHOUSES.find((x) => x.code === w.code);
        if (!wh?.binEnabled) return <span className="text-muted">No bins</span>;
        const error = errors[`wh:${w.code}:bin`];
        return (
          <div>
            <Select
              aria-label={`Default bin in ${w.code}`}
              options={wh.bins.map((b) => ({ value: b, label: b }))}
              placeholder="Pick a bin"
              invalid={!!error}
              value={w.defaultBin}
              onValueChange={(v) => patchRow(w.code, { defaultBin: v })}
            />
            {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
          </div>
        );
      },
    },
    {
      key: 'remove',
      header: 'Remove',
      srOnlyHeader: true,
      cell: (w) => (
        <Button
          type="button"
          size="small"
          variant="ghost"
          intent="danger"
          disabled={w.inStock + w.committed + w.ordered > 0}
          title={w.inStock + w.committed + w.ordered > 0 ? 'Has stock or open documents' : undefined}
          onClick={() => update({ warehouses: draft.warehouses.filter((x) => x.code !== w.code) })}
        >
          Remove
        </Button>
      ),
    },
  ];

  return (
    <>
      <Section icon="stacks" title={`Stock · in ${uom}`}>
        <Fields cols={3}>
          <ReadOnly label="In stock" value={qty(totals.inStock)} hint="All warehouses." />
          <ReadOnly label="Committed" value={qty(totals.committed)} hint="On open sales and production orders." />
          <ReadOnly label="Ordered" value={qty(totals.ordered)} hint="On open purchase orders." />
          <ReadOnly
            label="Available"
            value={<span className={totals.available < 0 ? 'text-danger' : undefined}>{qty(totals.available)}</span>}
            hint="In stock − committed + ordered."
          />
          {standard
            ? f.num('itemCost', `Item cost per ${uom}`, {
                prefix: 'PHP',
                hint: 'Standard price: the fixed cost for every movement. Use Inventory revaluation to restate stock.',
              })
            : [
                <ReadOnly
                  key="cost"
                  label={`Item cost per ${uom}`}
                  value={`PHP ${formatAmount(draft.itemCost)}`}
                  hint={`${draft.valuationMethod}: recalculated from receipts.`}
                />,
              ]}
        </Fields>
      </Section>

      <Section icon="low_priority" title="Stock levels">
        <Fields>
          {f.num('minStock', 'Minimum stock', { suffix: uom, hint: 'Below this, the item is flagged and MRP suggests a reorder.' })}
          {f.num('maxStock', 'Maximum stock', { suffix: uom, error: errors.maxStock, hint: 'MRP won’t replenish above this.' })}
          {f.num('minOrderQty', 'Minimum order quantity', { suffix: uom })}
          {f.num('cycleCountDays', 'Cycle count period', { suffix: 'days', hint: 'How often to count this item.' })}
        </Fields>
      </Section>

      <Section
        icon="warehouse"
        title="Warehouses"
        actions={
          missing.length ? (
            <Select
              aria-label="Add warehouse"
              placeholder="Add warehouse…"
              options={missing.map((w) => ({ value: w.code, label: `${w.code} · ${w.name}` }))}
              value=""
              onValueChange={(code) => update({ warehouses: [...draft.warehouses, newItemWarehouse(code)] })}
            />
          ) : undefined
        }
      >
        {draft.warehouses.length ? (
          <Table caption="Stock by warehouse" columns={columns} rows={draft.warehouses} getRowId={(w) => w.code} />
        ) : (
          <Text variant="small" tone="muted">
            Not stocked in any warehouse yet.
          </Text>
        )}
      </Section>
    </>
  );
}
