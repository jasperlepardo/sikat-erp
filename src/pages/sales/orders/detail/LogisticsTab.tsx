import { CardField, FormField, Icon, Select, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { countryName } from '../../../../services/partnerMasters';
import { Fields, Flags, Section, bind } from '../../../../components/form/fields';
import { formatAddress, type PostalAddress } from '../../../../mocks/address';
import { contactName, type PartnerAddress } from '../../../../mocks/partners';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { SALES_SETTINGS } from '../../../../mocks/salesOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import type { SoTabProps } from './types';

const locationIcon = <Icon size={16}>location_on</Icon>;

function addressFields(a: PostalAddress): { label: string; value: string }[] {
  return [
    { label: 'Address', value: a.addressLine },
    { label: 'Barangay', value: a.block },
    { label: 'City', value: a.city },
    ...(a.countryCode === 'PH' ? [{ label: 'Province', value: a.province }] : []),
    { label: 'ZIP code', value: a.zip },
    ...(a.countryCode !== 'PH' ? [{ label: 'Country', value: countryName(a.countryCode) }] : []),
  ].filter((x) => !!x.value);
}

export function LogisticsTab({ draft, update, m, ctx }: SoTabProps) {
  const f = bind(draft, update);
  const customer = ctx.customer;
  const addresses = customer?.addresses ?? [];
  const text = (a: PartnerAddress) => formatAddress(a, customer?.name);

  /** The customer's addresses, plus the text on the order when it's been edited or the address is gone. */
  const options = (current: string, defaultId: string | undefined, tag: string): CardFieldOption[] => {
    const known: CardFieldOption[] = addresses.map((a) => ({
      value: a.id,
      label: `${a.label || 'Untitled address'}${a.id === defaultId ? ` (${tag})` : ''}`,
      icon: locationIcon,
      fields: addressFields(a),
    }));
    if (!current || addresses.some((a) => text(a) === current)) return known;
    const lines = current.split('\n').filter(Boolean);
    return [{ value: '__custom__', label: lines[0] ?? 'Address on this order', icon: locationIcon, fields: lines.slice(1).map((value) => ({ label: '', value })) }, ...known];
  };
  const picked = (current: string) => addresses.find((a) => text(a) === current)?.id ?? (current ? '__custom__' : '');
  const fill = (field: 'shipTo' | 'billTo', id: string) => {
    const a = addresses.find((x) => x.id === id);
    if (a) update({ [field]: text(a) });
  };

  return (
    <div className="flex flex-col gap-2">
      <Section icon="local_shipping" title="Addresses">
        <Fields>
          <CardField
            label="Ship to"
            options={options(draft.shipTo, customer?.defaultShipToId, 'default ship-to')}
            value={picked(draft.shipTo)}
            onValueChange={(v) => fill('shipTo', v)}
            placeholder={customer ? 'Select a delivery address' : 'Pick a customer first'}
            readOnly={ctx.readOnly}
          />
          <CardField
            label="Bill to"
            options={options(draft.billTo, customer?.defaultBillToId, 'default bill-to')}
            value={picked(draft.billTo)}
            onValueChange={(v) => fill('billTo', v)}
            placeholder={customer ? 'Select a billing address' : 'Pick a customer first'}
            readOnly={ctx.readOnly}
          />
        </Fields>
        {customer && !addresses.length ? (
          <Text variant="small" tone="muted">
            {customer.name} has no addresses yet — add them on the customer record.
          </Text>
        ) : null}
      </Section>

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
