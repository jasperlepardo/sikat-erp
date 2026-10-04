import { Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { PLANNING_METHODS, PROCUREMENT_METHODS } from '../../../../mocks/itemMasters';
import type { TabProps } from './types';

/** What MRP would suggest for a raw need, applying this item's order rules. */
export function mrpSuggestion(need: number, d: TabProps['draft']) {
  let q = Math.max(need, d.mrpMinOrderQty || 0);
  if (d.orderMultiple > 0) q = Math.ceil(q / d.orderMultiple) * d.orderMultiple;
  const orders = d.maxOrderQty > 0 ? Math.ceil(q / d.maxOrderQty) : 1;
  return { quantity: q, orders };
}

export function PlanningTab({ draft, update }: TabProps) {
  const f = bind(draft, update);
  const planned = draft.planningMethod !== 'None';
  const example = mrpSuggestion(14, draft);
  const uom = draft.inventoryUom;

  return (
    <>
      <Section icon="event_repeat" title="Planning">
        <Fields>
          {f.pick('planningMethod', 'Planning method', PLANNING_METHODS, {
            required: true,
            hint: 'MRP: planned from demand. MPS: master schedule. None: replenish by hand.',
          })}
          {f.pick('procurementMethod', 'Procurement method', PROCUREMENT_METHODS, {
            required: planned,
            disabled: !planned,
            hint: !planned ? 'Set a planning method first.' : draft.procurementMethod === 'Make' ? 'Replenished by production orders (needs a BOM).' : 'Replenished by purchase orders.',
          })}
          {f.num('leadTimeDays', 'Lead time', {
            suffix: 'days',
            disabled: !planned,
            hint: !planned ? 'Set a planning method first.' : draft.procurementMethod === 'Make' ? 'Production release to receipt.' : 'PO to arrival.',
          })}
          {f.num('toleranceDays', 'Tolerance', { suffix: 'days', disabled: !planned, hint: !planned ? 'Set a planning method first.' : 'Early/late days that don’t trigger rescheduling.' })}
          {f.num('horizonDays', 'Planning horizon', { suffix: 'days', disabled: !planned, hint: 'Set a planning method first.' })}
        </Fields>
      </Section>

      <Section icon="rule" title="Order rules">
        <Fields cols={3}>
          {f.num('orderMultiple', 'Order multiple', { suffix: uom, disabled: !planned, hint: 'Set a planning method first.' })}
          {f.num('mrpMinOrderQty', 'Minimum order quantity', { suffix: uom, disabled: !planned, hint: 'Set a planning method first.' })}
          {f.num('maxOrderQty', 'Maximum order quantity', { suffix: uom, disabled: !planned, hint: !planned ? 'Set a planning method first.' : 'Larger needs split into several orders.' })}
        </Fields>
        {planned ? (
          <Text variant="small" tone="muted">
            Example: a need for 14 {uom} becomes a suggestion for {example.quantity} {uom}
            {example.orders > 1 ? `, split into ${example.orders} orders` : ''}.
          </Text>
        ) : null}
      </Section>
    </>
  );
}
