import { Text } from '@jasperlepardo/sikat-design-system';
import { FieldOrientationCtx, Form, Flags, Section, bind } from '../../../../components/form/fields';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { SALES_SETTINGS } from '../../../../mocks/salesOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { RiSectionProps } from './types';

export function RiShipmentCard({ draft, update, ctx, m }: RiSectionProps) {
  const h = bind(draft, update);
  return (
    <Section icon="route" title="Shipment & collection">
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
          {h.lookup('shippingType', 'Shipping type', activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType), { clearable: true, readOnly: ctx.readOnly })}
          {SALES_SETTINGS.multiLanguageSupport ? h.pick('language', 'Language', LANGUAGES, { readOnly: ctx.readOnly }) : null}
          {h.text('trackingNo', 'Tracking no.', { hint: 'Pre-fill when the delivery date is known.', readOnly: ctx.readOnly })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
      <Flags>
        {h.check('blockDunning', 'Block dunning letters', { readOnly: ctx.readOnly })}
        {h.check('allowPartialDelivery', 'Allow partial delivery', { readOnly: ctx.readOnly })}
      </Flags>
      <Text variant="small" tone="muted">Block dunning leaves the invoice out of dunning letters — for a disputed or on-hold invoice. Allow partial delivery lets the delivery cover the reserve invoice in parts.</Text>
    </Section>
  );
}
