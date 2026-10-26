import { Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Flags, Section, bind } from '../../../../components/form/fields';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { SALES_SETTINGS } from '../../../../mocks/salesOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { ArSectionProps } from './types';

export function ArShipmentCard({ draft, update, ctx, m }: ArSectionProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="route" title="Shipment & collection">
        <FieldStack>
          {h.lookup('shippingType', 'Shipping type', activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType), { clearable: true })}
          {SALES_SETTINGS.multiLanguageSupport ? h.pick('language', 'Language', LANGUAGES) : null}
          {h.text('trackingNo', 'Tracking no.', { hint: 'Carried over from the delivery when copied.' })}
        </FieldStack>
        <Flags>{h.check('blockDunning', 'Block dunning letters')}</Flags>
        <Text variant="small" tone="muted">Leaves the invoice out of dunning letters — for a disputed or on-hold invoice.</Text>
      </Section>
    </fieldset>
  );
}
