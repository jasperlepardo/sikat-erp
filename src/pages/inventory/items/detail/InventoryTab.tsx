import { Text } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatAmount } from '../../../../services/format';
import type { TabProps } from './types';

export function InventoryTab({ draft, update, errors }: TabProps) {
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

  return (
    <>
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
