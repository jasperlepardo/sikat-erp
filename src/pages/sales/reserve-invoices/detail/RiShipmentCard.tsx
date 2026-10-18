import { Text } from '@jasperlepardo/sikat-design-system';
import { FieldStack, Flags, Section, bind } from '../../../../components/form/fields';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { SALES_SETTINGS } from '../../../../mocks/salesOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { RiSectionProps } from './types';

export function RiShipmentCard({ draft, update, ctx, m }: RiSectionProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="route" title="Shipment & collection">
        <FieldStack>
          {h.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)])}
          {SALES_SETTINGS.multiLanguageSupport ? h.pick('language', 'Language', LANGUAGES) : null}
          {h.text('trackingNo', 'Tracking no.', { hint: 'Pre-fill when the delivery date is known.' })}
        </FieldStack>
        <Flags>
          {h.check('blockDunning', 'Block dunning letters')}
          {h.check('allowPartialDelivery', 'Allow partial delivery')}
        </Flags>
        <Text variant="small" tone="muted">Block dunning leaves the invoice out of dunning letters — for a disputed or on-hold invoice. Allow partial delivery lets the delivery cover the reserve invoice in parts.</Text>
      </Section>
    </fieldset>
  );
}
