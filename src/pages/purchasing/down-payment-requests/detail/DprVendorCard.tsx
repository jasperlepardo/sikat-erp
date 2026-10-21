import { CardField, FormField, Icon, Select, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { vendorOptions, stampedVendorOption } from '../../shared/vendorOptions';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { contactName } from '../../../../mocks/partners';
import { formatAddress, type PostalAddress } from '../../../../mocks/address';
import { countryName } from '../../../../services/partnerMasters';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import type { DprSectionProps } from './types';

interface DprVendorCardProps extends DprSectionProps {
  pickVendor: (id: string | null) => void;
}

const locationIcon = <Icon size={16}>location_on</Icon>;

function addressFields(a: PostalAddress) {
  const line = [a.addressLine, a.block, a.city, a.countryCode === 'PH' ? a.province : countryName(a.countryCode), a.zip].filter(Boolean).join(', ');
  return line ? [{ label: 'Address', value: line }] : [];
}

const option = (name: string, a: PostalAddress, tag = ''): CardFieldOption => ({
  value: formatAddress(a, name),
  label: `${name}${tag}`,
  icon: locationIcon,
  fields: addressFields(a),
});

const withCurrent = (options: CardFieldOption[], current: string) =>
  !current || options.some((o) => o.value === current)
    ? options
    : [{ value: current, label: current.split('\n')[0], icon: locationIcon, fields: current.split('\n').slice(1).map((value) => ({ label: '', value })) }, ...options];

export function DprVendorCard({ draft, update, errors, m, ctx, pickVendor }: DprVendorCardProps) {
  const h = bind(draft, update);
  const { vendor } = ctx;

  const shipOptions = [
    option(m.company.name, m.company.address),
    ...m.inv.warehouses.filter((w) => (w.active && receivesFromVendors(w)) || formatAddress(w.address, w.name) === draft.shipTo).map((w) => option(w.name, w.address)),
  ];
  const payOptions = (vendor?.addresses ?? []).map((a) =>
    option(vendor!.name, a, ` · ${a.label || 'Untitled address'}${a.id === vendor?.defaultBillToId ? ' (default bill-to)' : ''}`),
  );

  // Posted, or based on another document: the vendor is fixed.
  const vendorLocked = !!vendor && (ctx.readOnly || ctx.based);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="storefront" title="Vendor">
        <Fields>
          <div className="md:col-span-2">
            <CardField
              label="Vendor"
              required
              placeholder="Search vendors"
              options={vendorLocked ? [stampedVendorOption(draft, vendor, draft.currency)] : vendorOptions(m.vendors, draft.vendorId)}
              value={draft.vendorId}
              onValueChange={(id) => pickVendor(id || null)}
              readOnly={vendorLocked}
              error={errors.vendorId}
            />
          </div>
          {h.lookup('contactId', 'Contact person', [{ value: '', label: '— None —' }, ...(vendor?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))], { disabled: !vendor })}
          {h.text('vendorRef', 'Vendor ref. no.', { hint: "The vendor's proforma or billing no." })}
          <FormField label="Currency" required error={errors.currency} className="md:col-span-2">
            {(p) => <Select {...p} disabled={ctx.readOnly || ctx.based} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={draft.currency} onValueChange={(currency) => update({ currency })} />}
          </FormField>
          <CardField
            label="Ship to"
            options={withCurrent(shipOptions, draft.shipTo)}
            value={draft.shipTo}
            onValueChange={(shipTo) => update({ shipTo })}
            placeholder="Where the goods will be received"
            readOnly={ctx.readOnly}
          />
          <CardField
            label="Pay to"
            options={withCurrent(payOptions, draft.payTo)}
            value={draft.payTo}
            onValueChange={(payTo) => update({ payTo })}
            placeholder={vendor ? 'Vendor address for payment' : 'Pick a vendor first'}
            readOnly={ctx.readOnly || !vendor}
          />
        </Fields>
      </Section>
    </fieldset>
  );
}
