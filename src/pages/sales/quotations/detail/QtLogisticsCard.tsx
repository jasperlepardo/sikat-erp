import { Fields, Section, bind } from '../../../../components/form/fields';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { QtTabProps } from './types';

/** Shipping type; ship-to and bill-to are in the customer panel, as on the sales order. */
export function QtLogisticsCard({ draft, update, ctx, m }: QtTabProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="local_shipping" title="Logistics">
        <Fields cols={1}>
          {h.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)])}
        </Fields>
      </Section>
    </fieldset>
  );
}
