import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { SALES_SETTINGS } from '../../../../mocks/salesOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { DnSectionProps } from './types';

export function DnShipmentCard({ draft, update, ctx, m }: DnSectionProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="route" title="Shipment">
        <FieldStack>
          {h.lookup('shippingType', 'Shipping type', activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType), { clearable: true })}
          {SALES_SETTINGS.multiLanguageSupport ? h.pick('language', 'Language', LANGUAGES) : null}
          {h.text('trackingNo', 'Tracking no.', { placeholder: 'e.g. LBC-7710-2290-14', hint: "The courier's tracking number; printed on the delivery note." })}
          {h.text('stampNo', 'Stamp no.', { hint: 'Customs or regulatory stamp reference, where one applies.' })}
          {h.text('pickPackRemarks', 'Pick and pack remarks', { hint: 'Printed on the picking and packing documents.' })}
        </FieldStack>
      </Section>
    </fieldset>
  );
}
