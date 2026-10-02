import { Text } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import type { ItemWarehouse } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import type { TabProps } from './types';

const qty = (n: number) => n.toLocaleString('en-PH');

type StockStatus = 'inStock' | 'committed' | 'ordered' | 'available';
const available = (w: ItemWarehouse) => w.inStock - w.committed + w.ordered;
const STATUSES: { key: StockStatus; title: string; icon: string; hint: string }[] = [
  { key: 'inStock', title: 'In stock', icon: 'inventory_2', hint: 'On hand now.' },
  { key: 'committed', title: 'Committed', icon: 'assignment', hint: 'On open sales and production orders.' },
  { key: 'ordered', title: 'Ordered', icon: 'local_shipping', hint: 'On open purchase orders.' },
  { key: 'available', title: 'Available', icon: 'task_alt', hint: 'In stock − committed + ordered.' },
];

/** One stock status: the total across warehouses, then each warehouse's share. */
function StockCard({
  status,
  rows,
  uom,
  warehouseName,
}: {
  status: (typeof STATUSES)[number];
  rows: ItemWarehouse[];
  uom: string;
  warehouseName: (code: string) => string;
}) {
  const value = (w: ItemWarehouse) => (status.key === 'available' ? available(w) : w[status.key]);
  const total = rows.reduce((n, w) => n + value(w), 0);
  // Bars compare warehouses within the card; negatives (overcommitted) show no bar.
  const largest = Math.max(0, ...rows.map(value));
  return (
    <Section icon={status.icon} title={status.title}>
      <div className="flex flex-col gap-1">
        <p className={`text-3xl font-semibold tabular-nums ${total < 0 ? 'text-danger' : 'text-heading'}`}>
          {qty(total)} <span className="text-base font-normal text-muted">{uom}</span>
        </p>
        <Text variant="small" tone="muted">
          {status.hint}
        </Text>
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-3">
          {rows.map((w) => {
            const v = value(w);
            return (
              <li key={w.code} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-body" title={warehouseName(w.code)}>
                    {w.code} <span className="text-muted">· {warehouseName(w.code)}</span>
                  </span>
                  <span className={`tabular-nums ${v < 0 ? 'text-danger' : v === 0 ? 'text-muted' : 'text-heading'}`}>{qty(v)}</span>
                </div>
                <div className="h-1 rounded-full bg-[var(--color-border-default)]">
                  {v > 0 && largest > 0 ? (
                    <div className="h-1 rounded-full bg-[var(--color-text-primary)]" style={{ width: `${(v / largest) * 100}%` }} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Text variant="small" tone="muted">
          Not stocked in any warehouse yet.
        </Text>
      )}
    </Section>
  );
}

export function InventoryTab({ draft, update, errors, inv }: TabProps) {
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

  const uom = draft.inventoryUom;
  const standard = draft.valuationMethod === 'Standard Price';
  const warehouseOf = (code: string) => inv.warehouses.find((x) => x.code === code);
  const warehouseName = (code: string) => warehouseOf(code)?.name ?? 'Unknown warehouse';

  return (
    <>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-4">
        {STATUSES.map((status) => (
          <StockCard key={status.key} status={status} rows={draft.warehouses} uom={uom} warehouseName={warehouseName} />
        ))}
      </div>

      <Section icon="low_priority" title="Cost & stock levels">
        <Fields>
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
          {f.num('minStock', 'Minimum stock', { suffix: uom, hint: 'Below this, the item is flagged and MRP suggests a reorder.' })}
          {f.num('maxStock', 'Maximum stock', { suffix: uom, error: errors.maxStock, hint: 'MRP won’t replenish above this.' })}
          {f.num('minOrderQty', 'Minimum order quantity', { suffix: uom })}
          {f.num('cycleCountDays', 'Cycle count period', { suffix: 'days', hint: 'How often to count this item.' })}
        </Fields>
      </Section>
    </>
  );
}
