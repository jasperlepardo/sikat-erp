import { Text } from '@jasperlepardo/sikat-design-system';
import { FieldOrientationCtx, Form, Flags, Section, bind } from '../../../../components/form/fields';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { SALES_SETTINGS } from '../../../../mocks/salesOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { ArSectionProps } from './types';

export function ArShipmentCard({ draft, update, ctx, m }: ArSectionProps) {
  const h = bind(draft, update);
  return (
    <Section icon="route" title="Shipment & collection">
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
          {h.lookup('shippingType', 'Shipping type', activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType), { clearable: true, readOnly: ctx.readOnly })}
          {SALES_SETTINGS.multiLanguageSupport ? h.pick('language', 'Language', LANGUAGES, { readOnly: ctx.readOnly }) : null}
          {h.text('trackingNo', 'Tracking no.', { hint: 'Carried over from the delivery when copied.', readOnly: ctx.readOnly })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
      <Flags>{h.check('blockDunning', 'Block dunning letters', { readOnly: ctx.readOnly })}</Flags>
      <Text variant="small" tone="muted">Leaves the invoice out of dunning letters — for a disputed or on-hold invoice.</Text>
    </Section>
  );
}
