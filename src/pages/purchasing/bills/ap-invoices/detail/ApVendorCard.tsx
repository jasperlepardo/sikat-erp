import { CardField, Combobox, FormField, Icon, Select, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../../components/form/fields';
import { contactName } from '../../../../../mocks/partners';
import { formatAddress, type PostalAddress } from '../../../../../mocks/address';
import { countryName } from '../../../../../services/partnerMasters';
import { receivesFromVendors } from '../../../../../mocks/itemMasters';
import type { ApSectionProps } from './types';

interface ApVendorCardProps extends ApSectionProps {
  pickVendor: (id: string | null) => void;
}

const ALL_CURRENCIES = 'All currencies';
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

export function ApVendorCard({ draft, update, errors, m, ctx, pickVendor }: ApVendorCardProps) {
  const h = bind(draft, update);
  const { vendor } = ctx;
  const allCurrencies = vendor?.currency === ALL_CURRENCIES;

  const shipOptions = [
    option(m.company.name, m.company.address),
    ...m.inv.warehouses.filter((w) => (w.active && receivesFromVendors(w)) || formatAddress(w.address, w.name) === draft.shipTo).map((w) => option(w.name, w.address)),
  ];
  const payOptions = (vendor?.addresses ?? []).map((a) =>
    option(vendor!.name, a, ` · ${a.label || 'Untitled address'}${a.id === vendor?.defaultBillToId ? ' (default bill-to)' : ''}`),
  );

  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="storefront" title="Vendor">
        <Fields>
          <div className="md:col-span-2">
            {vendor && (ctx.readOnly || ctx.based) ? (
              <ReadOnly label="Vendor" value={draft.vendorName} description={`${draft.vendorCode} · ${draft.currency}`} hint={!ctx.readOnly ? 'Locked while lines copied from its documents are on the invoice.' : undefined} />
            ) : (
              <FormField label="Vendor" required error={errors.vendorId} tooltip="Only vendors are listed. Picking one fills the name, contact, currency, terms and control account.">
                {(p) => (
                  <Combobox
                    {...p}
                    placeholder="Search vendors"
                    options={m.vendors
                      .filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId)
                      .map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, description: v.currency, text: `${v.code} ${v.name}` }))}
                    value={draft.vendorId || null}
                    onValueChange={pickVendor}
                  />
                )}
              </FormField>
            )}
          </div>
          {h.lookup(
            'contactId',
            'Contact person',
            [{ value: '', label: '— None —' }, ...(vendor?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))],
            { hint: !vendor ? 'Pick a vendor first.' : "Defaults to the vendor's default contact.", disabled: !vendor },
          )}
          {h.text('vendorRef', 'Vendor ref. no.', { error: errors.vendorRef, hint: "The vendor's invoice no. — checked against their other bills so it isn't entered twice." })}
          <FormField
            label="Currency"
            required
            error={errors.currency}
            className="md:col-span-2"
            tooltip={ctx.based ? 'Locked to the currency of the documents the lines came from.' : allCurrencies ? 'This vendor takes all currencies — pick the document currency.' : `Defaults to the vendor's currency (${vendor?.currency ?? '—'}).`}
          >
            {(p) => (
              <Select {...p} disabled={ctx.readOnly || ctx.based} options={m.currencies.filter((c) => c.active || c.code === draft.currency).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={draft.currency} onValueChange={(currency) => update({ currency })} />
            )}
          </FormField>
          <CardField
            label="Ship to"
            options={withCurrent(shipOptions, draft.shipTo)}
            value={draft.shipTo}
            onValueChange={(shipTo) => update({ shipTo })}
            placeholder="Where the goods were received"
            readOnly={ctx.readOnly}
          />
          <CardField
            label="Pay to"
            options={withCurrent(payOptions, draft.payTo)}
            value={draft.payTo}
            onValueChange={(payTo) => update({ payTo })}
            placeholder={vendor ? 'Vendor address for invoicing and payment' : 'Pick a vendor first'}
            readOnly={ctx.readOnly || !vendor}
          />
        </Fields>
      </Section>
    </fieldset>
  );
}
