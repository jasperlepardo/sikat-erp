import { useState } from 'react';
import { Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { RowMenu } from '../../../components/form/RowMenu';
import { COUNTRIES, PH_PROVINCES } from '../../../mocks/masters';
import { newAddress, type PartnerAddress } from '../../../mocks/partners';
import { EditPanel } from './EditPanel';
import { Fields, Flags, Section, bind, type Draft, type Errors } from './fields';

const mapUrl = (a: PartnerAddress) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([addressLine(a), a.zip, a.country].filter(Boolean).join(', '))}`;

export const addressLine = (a: PartnerAddress) =>
  [[a.streetNo, a.street].filter(Boolean).join(' '), a.block, a.city, a.province].filter(Boolean).join(', ');

/** Problems that block saving an address (same messages as the partner form's validation). */
export function addressProblems(a: PartnerAddress): Errors {
  const e: Errors = {};
  if (!a.label.trim()) e[`address:${a.id}:label`] = 'Every address needs an Address ID.';
  if (!a.country) e[`address:${a.id}:country`] = 'Every address needs a country.';
  return e;
}

/** Addresses as cards in the side column; adding and editing happen in `AddressPanel`. */
export function AddressesCards({
  draft,
  update,
  onOpen,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onOpen: (address: PartnerAddress, isNew: boolean) => void;
}) {
  const remove = (a: PartnerAddress) => {
    const addresses = draft.addresses.filter((x) => x.id !== a.id);
    update({
      addresses,
      defaultBillToId: draft.defaultBillToId === a.id ? (addresses.find((x) => x.isBilling)?.id ?? '') : draft.defaultBillToId,
      defaultShipToId: draft.defaultShipToId === a.id ? (addresses.find((x) => x.isShipping)?.id ?? '') : draft.defaultShipToId,
    });
  };

  return (
    <Section
      icon="location_on"
      title={`Addresses${draft.addresses.length ? ` · ${draft.addresses.length}` : ''}`}
      actions={
        <Link
          aria-label="New address"
          leadingIcon={<Icon size={20}>add</Icon>}
          onClick={() => onOpen(newAddress({ label: draft.addresses.length ? '' : 'Main office' }), true)}
        >
          New
        </Link>
      }
    >
      {draft.addresses.length ? (
        <List.Group>
          {draft.addresses.map((a) => {
            const isDefaultBill = a.id === draft.defaultBillToId;
            const isDefaultShip = a.id === draft.defaultShipToId;
            const tags = [a.isBilling && 'Billing', a.isShipping && 'Shipping'].filter(Boolean).join(' · ');
            return (
              <List.Card
                key={a.id}
                title={a.label || 'Untitled address'}
                icon={<Icon size={16}>location_on</Icon>}
                badge={(isDefaultBill || isDefaultShip) ? <Icon size={12}>star</Icon> : undefined}
                fields={[
                  tags ? { label: 'Used as', value: tags } : null,
                  { label: 'Street', value: [[a.streetNo, a.street].filter(Boolean).join(' '), a.building].filter(Boolean).join(', ') },
                  { label: 'Barangay', value: a.block },
                  { label: 'City', value: a.city },
                  { label: 'Province', value: [a.province, a.zip].filter(Boolean) },
                  { label: 'Country', value: a.country },
                ].filter((x): x is NonNullable<typeof x> => !!x && (Array.isArray(x.value) ? x.value.length > 0 : !!x.value))}
                actions={
                  <RowMenu
                    label={`Actions for ${a.label || 'address'}`}
                    items={[
                      { label: 'Edit', icon: 'edit', onSelect: () => onOpen(a, false) },
                      { label: 'Set as default billing', icon: 'receipt_long', disabled: isDefaultBill || !a.isBilling, onSelect: () => update({ defaultBillToId: a.id }) },
                      { label: 'Set as default shipping', icon: 'local_shipping', disabled: isDefaultShip || !a.isShipping, onSelect: () => update({ defaultShipToId: a.id }) },
                      { label: 'Show on map', icon: 'map', onSelect: () => window.open(mapUrl(a), '_blank', 'noopener') },
                      { label: 'Remove', icon: 'delete', onSelect: () => remove(a) },
                    ]}
                  />
                }
              />
            );
          })}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">
          No addresses yet.
        </Text>
      )}
    </Section>
  );
}

/** Add or edit one address in a side panel. Done checks Address ID and country first. */
export function AddressPanel({
  value,
  isNew,
  errors: formErrors,
  onDone,
  onCancel,
}: {
  value: PartnerAddress;
  isNew: boolean;
  /** The partner form's own errors, so a problem found on Save shows here too. */
  errors: Errors;
  onDone: (address: PartnerAddress) => void;
  onCancel: () => void;
}) {
  const [address, setAddress] = useState(value);
  const [errors, setErrors] = useState<Errors>(formErrors);
  const f = bind(address, (p: Partial<PartnerAddress>) => {
    setAddress((a) => ({ ...a, ...p }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !Object.keys(p).some((f) => k.endsWith(`:${f}`)))));
  });
  const err = (field: string) => errors[`address:${address.id}:${field}`];
  const done = () => {
    const found = addressProblems(address);
    setErrors(found);
    if (!Object.keys(found).length) onDone(address);
  };

  return (
    <EditPanel
      icon="location_on"
      title={isNew ? 'New address' : (value.label || 'Untitled address')}
      onCancel={onCancel}
      onDone={done}
    >
      <Section icon="location_on" title="Address">
        <Fields>
          {f.text('label', 'Address ID', {
            required: true,
            error: err('label'),
            hint: 'The name picked on documents, e.g. "Main office".',
          })}
          {f.pick('country', 'Country/Region', COUNTRIES, { required: true, error: err('country') })}
          {f.text('name2', 'Address name 2')}
          {f.text('name3', 'Address name 3')}
          {f.text('streetNo', 'Street no.')}
          {f.text('street', 'Street / PO box')}
          {f.text('building', 'Building / floor / room')}
          {f.text('block', 'Barangay')}
          {f.text('city', 'City / municipality')}
          {address.country === 'Philippines'
            ? f.pick('province', 'Province', PH_PROVINCES)
            : f.text('province', 'State / province')}
          {f.text('zip', 'ZIP code')}
        </Fields>
        <Link href={mapUrl(address)} target="_blank" rel="noreferrer">
          Show location on map
        </Link>
      </Section>
      <Section icon="sell" title="Usage">
        <Flags>
          {f.check('isBilling', 'Billing address')}
          {f.check('isShipping', 'Shipping address')}
        </Flags>
      </Section>
    </EditPanel>
  );
}
