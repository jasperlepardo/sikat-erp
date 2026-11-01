import { FieldOrientationCtx, Form, Section, bind } from '../../../../components/form/fields';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { RfqTabProps } from './types';

export function RfqDeliveryCard({ draft, update, m }: RfqTabProps) {
  const f = bind(draft, update);
  return (
    <Section icon="route" title="Delivery">
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
          {f.lookup(
            'shippingType',
            'Shipping type',
            activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType),
            { clearable: true, hint: 'Defaults from the vendor.' },
          )}
          {f.pick('language', 'Language', LANGUAGES, { hint: 'Language for the printed RFQ document.' })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
