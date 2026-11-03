import { FieldOrientationCtx, Form, Section, bind } from '../../../../components/form/fields';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { SALES_SETTINGS } from '../../../../mocks/salesOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { DnSectionProps } from './types';

export function DnShipmentCard({ draft, update, ctx, m }: DnSectionProps) {
  const h = bind(draft, update);
  return (
    <Section icon="route" title="Shipment">
      <FieldOrientationCtx.Provider value="stacked">
        <Form.Group orientation="stacked">
          {h.lookup('shippingType', 'Shipping type', activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType), { clearable: true, readOnly: ctx.readOnly })}
          {SALES_SETTINGS.multiLanguageSupport ? h.pick('language', 'Language', LANGUAGES, { readOnly: ctx.readOnly }) : null}
          {h.text('trackingNo', 'Tracking no.', { placeholder: 'e.g. LBC-7710-2290-14', hint: "The courier's tracking number; printed on the delivery note.", readOnly: ctx.readOnly })}
          {h.text('stampNo', 'Stamp no.', { hint: 'Customs or regulatory stamp reference, where one applies.', readOnly: ctx.readOnly })}
          {h.text('pickPackRemarks', 'Pick and pack remarks', { hint: 'Printed on the picking and packing documents.', readOnly: ctx.readOnly })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
