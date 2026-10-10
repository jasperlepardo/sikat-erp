import { FormField, Select, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, Section, bind } from '../../../../components/form/fields';
import { contactName } from '../../../../mocks/partners';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { SALES_SETTINGS } from '../../../../mocks/salesOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { SoTabProps } from './types';

export function LogisticsTab({ draft, update, m, ctx }: SoTabProps) {
  const f = bind(draft, update);
  const customer = ctx.customer;

  return (
    <div className="flex flex-col gap-2">
      <Section icon="route" title="Delivery">
        <Fields>
          {f.lookup('shippingType', 'Shipping type', [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)], {
            hint: 'Defaults from the customer.',
          })}
          {SALES_SETTINGS.multiLanguageSupport ? f.pick('language', 'Language', LANGUAGES, { hint: 'Prints the order in this language.' }) : null}
          {f.text('pickPackRemarks', 'Pick and pack remarks', { hint: 'Printed on the picking sheet for the warehouse.' })}
        </Fields>
        <Flags>
          {f.check('printPickingSheet', 'Print picking sheet')}
          {f.check('allowPartialDelivery', 'Allow partial delivery')}
          {f.check('approved', 'Approved')}
        </Flags>
        <Text variant="small" tone="muted">
          {draft.allowPartialDelivery ? 'Lines can be delivered in parts.' : 'Each line must be delivered in full in one go.'} Defaults from the customer.
        </Text>
      </Section>

      <Section icon="storefront" title="BP channel">
        <Fields>
          {f.text('bpChannelName', 'BP channel name', { placeholder: 'e.g. Lazada, Shopee, Apple online store', hint: 'The marketplace or channel the order came through.' })}
          <FormField label="BP channel contact" tooltip="A contact person on the customer for the channel.">
            {(p) => (
              <Select
                {...p}
                disabled={ctx.readOnly || !customer}
                options={[{ value: '', label: '— None —' }, ...(customer?.contacts ?? []).map((c) => ({ value: c.id, label: contactName(c) }))]}
                value={draft.bpChannelContact}
                onValueChange={(bpChannelContact) => update({ bpChannelContact })}
              />
            )}
          </FormField>
        </Fields>
      </Section>
    </div>
  );
}
