import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { QtTabProps } from './types';

export function QtDeliveryCard({ draft, update, ctx, m }: QtTabProps) {
  const f = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="route" title="Delivery">
        <FieldStack>
          {f.lookup(
            'shippingType',
            'Shipping type',
            activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType),
            { clearable: true, hint: 'Defaults from the customer.' },
          )}
          {f.pick('language', 'Language', LANGUAGES, { hint: 'Language for the printed quotation.' })}
        </FieldStack>
      </Section>
    </fieldset>
  );
}
