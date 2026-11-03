import { FieldOrientationCtx, Form, Section, bind } from '../../../../components/form/fields';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { QtTabProps } from './types';

export function QtDeliveryCard({ draft, update, ctx, m }: QtTabProps) {
  const f = bind(draft, update);
  return (
    <Section icon="route" title="Delivery">
      <FieldOrientationCtx.Provider value="stacked">
        <Form.Group orientation="stacked">
          {f.lookup(
            'shippingType',
            'Shipping type',
            activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType),
            { clearable: true, hint: 'Defaults from the customer.', readOnly: ctx.readOnly },
          )}
          {f.pick('language', 'Language', LANGUAGES, { hint: 'Language for the printed quotation.', readOnly: ctx.readOnly })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
