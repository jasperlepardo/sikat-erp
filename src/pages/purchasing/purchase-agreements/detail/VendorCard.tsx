import { CardField, Icon, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { contactName } from '../../../../mocks/partners';
import type { PbaDraft, PbaMasters } from './types';

interface Props {
  draft: PbaDraft;
  update: (patch: Partial<PbaDraft>) => void;
  errors: Errors;
  m: PbaMasters;
  added: boolean;
  readOnly: boolean;
}

export function VendorCard({ draft, update, errors, m, added, readOnly }: Props) {
  const f = bind(draft, update);
  const vendor = m.vendors.find((v) => v.id === draft.vendorId);

  const pickVendor = (vendorId: string | null) => {
    const v = m.vendors.find((x) => x.id === vendorId);
    if (!v) {
      update({ vendorId: '', vendorCode: '', vendorName: '', contactId: '', currency: 'PHP', phone: '', email: '' });
      return;
    }
    const phoneChannel = v.contactChannels.find((ch) => ch.type === 'Phone' || ch.type === 'Mobile');
    const emailChannel = v.contactChannels.find((ch) => ch.type === 'Email');
    update({
      vendorId: v.id,
      vendorCode: v.code,
      vendorName: v.name,
      contactId: v.defaultContactId,
      currency: v.currency === 'All currencies' ? 'PHP' : v.currency,
      phone: phoneChannel?.value ?? '',
      email: emailChannel?.value ?? '',
      paymentTermId: v.vendorPaymentTermId,
    });
  };

  return (
    <Section icon="local_shipping" title="Vendor">
      <Fields cols={2}>
        <div className="md:col-span-2">
          <CardField
            label="Vendor"
            required
            placeholder="Search vendors"
            options={m.vendors
              .filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId)
              .map((v): CardFieldOption => ({
                value: v.id,
                label: v.name,
                icon: <Icon size={16}>local_shipping</Icon>,
                fields: [
                  { label: 'Code', value: v.code },
                  ...(v.tin ? [{ label: 'TIN', value: v.tin }] : []),
                ],
                href: `#/purchasing/vendors/${v.id}`,
              }))}
            value={draft.vendorId}
            onValueChange={(id) => pickVendor(id || null)}
            readOnly={!!(vendor && added)}
          />
          {errors.vendorId && <Text variant="small" tone="danger">{errors.vendorId}</Text>}
        </div>

        <CardField
          label="Contact person"
          options={(vendor?.contacts ?? [])
            .filter((c) => c.active || c.id === draft.contactId)
            .map((c) => ({
              value: c.id,
              label: contactName(c),
              icon: <Icon size={16}>person</Icon>,
              fields: [
                ...(c.position ? [{ label: 'Position', value: c.position }] : []),
                ...(c.mobile || c.tel1 ? [{ label: 'Phone', value: c.mobile || c.tel1 }] : []),
                ...(c.email ? [{ label: 'Email', value: c.email }] : []),
              ],
            }))}
          value={draft.contactId}
          onValueChange={(contactId) => update({ contactId: contactId ?? '' })}
          placeholder={vendor ? 'Select a contact person' : 'Pick a vendor first'}
          readOnly={readOnly || !vendor}
        />

        {f.text('vendorRef', 'Vendor ref. no.', { hint: "The vendor's own reference for this agreement." })}
        <ReadOnly label="BP currency" value={draft.currency} hint="Set by the vendor." />
        <ReadOnly label="Telephone no." value={draft.phone || '—'} hint="From the vendor record." />
        <ReadOnly label="E-mail" value={draft.email || '—'} hint="From the vendor record." />
      </Fields>
    </Section>
  );
}
