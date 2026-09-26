import { useState } from 'react';
import { Badge, Button, Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { COUNTRIES, PH_PROVINCES } from '../../../mocks/masters';
import { newAddress, type AddressType, type PartnerAddress } from '../../../mocks/partners';
import type { TabProps } from './GeneralTab';
import { Fields, Section, bind, type Errors } from './fields';

const TYPE_LABEL: Record<AddressType, string> = { bill: 'Bill to', ship: 'Ship to' };
const defaultKey = { bill: 'defaultBillToId', ship: 'defaultShipToId' } as const;

export const addressLine = (a: PartnerAddress) =>
  [[a.streetNo, a.street].filter(Boolean).join(' '), a.block, a.city, a.province].filter(Boolean).join(', ');

export function AddressesTab({ draft, update, errors }: TabProps) {
  const [selectedId, setSelectedId] = useState(draft.defaultBillToId || draft.addresses[0]?.id);
  const selected = draft.addresses.find((a) => a.id === selectedId);

  const add = (type: AddressType, copyFrom?: PartnerAddress) => {
    const a = copyFrom
      ? { ...copyFrom, id: newAddress(type).id, type }
      : newAddress(type, { label: draft.addresses.some((x) => x.type === type) ? '' : 'Main office' });
    const key = defaultKey[type];
    update({ addresses: [...draft.addresses, a], [key]: draft[key] || a.id });
    setSelectedId(a.id);
  };
  const patch = (id: string, p: Partial<PartnerAddress>) =>
    update({ addresses: draft.addresses.map((a) => (a.id === id ? { ...a, ...p } : a)) });
  const remove = (a: PartnerAddress) => {
    const addresses = draft.addresses.filter((x) => x.id !== a.id);
    const key = defaultKey[a.type];
    update({
      addresses,
      [key]: draft[key] === a.id ? (addresses.find((x) => x.type === a.type)?.id ?? '') : draft[key],
    });
    setSelectedId(addresses[0]?.id);
  };

  return (
    <div className="grid gap-2 lg:grid-cols-[320px_1fr]">
      <div className="flex flex-col gap-2">
        {(['bill', 'ship'] as const).map((type) => {
          const rows = draft.addresses.filter((a) => a.type === type);
          return (
            <Section
              key={type}
              icon={type === 'bill' ? 'receipt_long' : 'local_shipping'}
              title={TYPE_LABEL[type]}
              actions={
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  aria-label={`New ${TYPE_LABEL[type].toLowerCase()} address`}
                  leadingIcon={<Icon size={16}>add</Icon>}
                  onClick={() => add(type)}
                >
                  New
                </Button>
              }
            >
              {rows.length ? (
                <List.Group divider>
                  {rows.map((a) => (
                    <List.Item
                      key={a.id}
                      variant="stacked"
                      title={
                        <span className={a.id === selectedId ? 'font-semibold text-primary' : undefined}>
                          {a.label || 'Untitled address'}
                        </span>
                      }
                      content={addressLine(a) || '—'}
                      trailing={a.id === draft[defaultKey[type]] ? <Badge intent="primary">Default</Badge> : undefined}
                      aria-current={a.id === selectedId || undefined}
                      onClick={() => setSelectedId(a.id)}
                    />
                  ))}
                </List.Group>
              ) : (
                <Text variant="small" tone="muted">
                  No {TYPE_LABEL[type].toLowerCase()} address. At least one is recommended.
                </Text>
              )}
            </Section>
          );
        })}
      </div>

      {selected ? (
        <AddressEditor
          key={selected.id}
          address={selected}
          errors={errors}
          isDefault={selected.id === draft[defaultKey[selected.type]]}
          onChange={(p) => patch(selected.id, p)}
          onSetDefault={() => update({ [defaultKey[selected.type]]: selected.id })}
          onCopy={() => add(selected.type === 'bill' ? 'ship' : 'bill', selected)}
          onRemove={() => remove(selected)}
        />
      ) : (
        <Section icon="add_location" title="No address selected">
          <Button type="button" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => add('bill')}>
            Add a bill-to address
          </Button>
        </Section>
      )}
    </div>
  );
}

function AddressEditor({
  address,
  errors,
  isDefault,
  onChange,
  onSetDefault,
  onCopy,
  onRemove,
}: {
  address: PartnerAddress;
  errors: Errors;
  isDefault: boolean;
  onChange: (p: Partial<PartnerAddress>) => void;
  onSetDefault: () => void;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const f = bind(address, onChange);
  const err = (field: string) => errors[`address:${address.id}:${field}`];
  const mapQuery = encodeURIComponent([addressLine(address), address.zip, address.country].filter(Boolean).join(', '));
  const other = address.type === 'bill' ? 'ship to' : 'bill to';

  return (
    <Section
      icon="location_on"
      title={`${TYPE_LABEL[address.type]} · ${address.label || 'Untitled address'}`}
      actions={
        <div className="flex gap-1">
          <Button type="button" size="small" variant="ghost" disabled={isDefault} onClick={onSetDefault}>
            {isDefault ? 'Default' : 'Set as default'}
          </Button>
          <Button type="button" size="small" variant="ghost" onClick={onCopy}>
            Copy to {other}
          </Button>
          <Button type="button" size="small" variant="ghost" intent="danger" onClick={onRemove}>
            Remove
          </Button>
        </div>
      }
    >
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
      <Link href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer">
        Show location on map
      </Link>
    </Section>
  );
}
