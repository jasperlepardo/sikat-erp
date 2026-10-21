import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, CardField, FormField, Icon, Select, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { blankPostalAddress, type PostalAddress } from '../../../../mocks/address';
import { contactName, newAddress, type Partner, type PartnerAddress } from '../../../../mocks/partners';
import { savePartner } from '../../../../services/partners';
import { countryName } from '../../../../services/partnerMasters';
import { AddressFields } from '../../../../components/form/AddressFields';
import { AddressPanel } from '../../../partners/detail/addresses';
import { EditPanel } from '../../../partners/detail/EditPanel';
import { ALL_CURRENCIES, defaultShipTo, formatAddress, type PoSectionProps } from './types';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { PartnerAvatar } from '../../../../components/PartnerAvatar';

type AddressKey = 'shipTo' | 'billTo';
const OURS = 'ours';
const WH_PREFIX = 'wh:';
const CUSTOM = '__custom__';

function addressFields(a: PostalAddress) {
  const line = [a.addressLine, a.block, a.city, a.countryCode === 'PH' ? a.province : countryName(a.countryCode), a.zip].filter(Boolean).join(', ');
  return line ? [{ label: 'Address', value: line }] : [];
}

const locationIcon = <Icon size={16}>location_on</Icon>;

interface VendorCardProps extends PoSectionProps {
  pickVendor: (id: string | null) => void;
  onNewVendor: () => void;
  onVendorSaved?: (v: Partner) => void;
}

export function PoVendorCard({ draft, update, errors, m, ctx, pickVendor, onNewVendor, onVendorSaved }: VendorCardProps) {
  const h = bind(draft, update);
  const { vendor } = ctx;
  const received = draft.lines.some((l) => l.receivedQty > 0);
  const currencyEditable = !ctx.readOnly && !received;
  const [adding, setAdding] = useState<{ field: AddressKey; address: PartnerAddress } | null>(null);
  const [editingAddr, setEditingAddr] = useState<{ field: AddressKey; address: PostalAddress; entityName: string } | null>(null);

  const ours = defaultShipTo(draft.lines, m);
  const vendorAddresses = vendor?.addresses ?? [];
  const vendorText = (a: PartnerAddress) => formatAddress(a, vendor?.name);
  const companyText = formatAddress(m.company.address, m.company.name);
  const whText = (code: string) => {
    const wh = m.inv.warehouses.find((w) => w.code === code);
    return wh ? formatAddress(wh.address, wh.name) : '';
  };

  const resolveAddr = (value: string): string => {
    if (value === OURS) return companyText;
    if (value.startsWith(WH_PREFIX)) return whText(value.slice(WH_PREFIX.length));
    return vendorText(vendorAddresses.find((a) => a.id === value)!);
  };

  const ourOptions = (current: string): CardFieldOption[] => [
    { value: OURS, label: `${m.company.name}${ours === companyText ? ' (default)' : ''}`, icon: locationIcon, fields: addressFields(m.company.address) },
    ...m.inv.warehouses
      .filter((w) => (w.active && receivesFromVendors(w)) || whText(w.code) === current)
      .map((w) => ({ value: `${WH_PREFIX}${w.code}`, label: `${w.name}${ours === formatAddress(w.address, w.name) ? ' (default)' : ''}`, icon: locationIcon, fields: addressFields(w.address) })),
  ];
  const vendorCardOptions = (defaultId: string | undefined, tag: string): CardFieldOption[] =>
    vendorAddresses.map((a) => ({
      value: a.id,
      label: `${a.label || 'Untitled address'} · ${vendor?.name}${a.id === defaultId ? ` (${tag})` : ''}`,
      icon: locationIcon,
      fields: addressFields(a),
    }));

  const baseShipOptions: CardFieldOption[] = [...ourOptions(draft.shipTo), ...vendorCardOptions(vendor?.defaultShipToId, "vendor's ship-to")];
  const baseBillOptions: CardFieldOption[] = [
    { value: OURS, label: `${m.company.name} (default)`, icon: locationIcon, fields: addressFields(m.company.address) },
    ...m.inv.warehouses
      .filter((w) => w.type === 'office' && (w.active || whText(w.code) === draft.billTo))
      .map((w) => ({ value: `${WH_PREFIX}${w.code}`, label: w.name, icon: locationIcon, fields: addressFields(w.address) })),
  ];

  const findPicked = (current: string, options: CardFieldOption[]) =>
    options.find((o) => resolveAddr(o.value) === current)?.value ?? '';

  const customOption = (text: string, base: CardFieldOption[]): CardFieldOption | null => {
    if (!text || findPicked(text, base)) return null;
    const lines = text.split('\n').filter(Boolean);
    return { value: CUSTOM, label: lines[0] ?? 'Custom address', icon: locationIcon, fields: lines.slice(1).map((line) => ({ label: '', value: line })) };
  };

  const shipCustom = customOption(draft.shipTo, baseShipOptions);
  const billCustom = customOption(draft.billTo, baseBillOptions);
  const shipOptions = shipCustom ? [shipCustom, ...baseShipOptions] : baseShipOptions;
  const billOptions = billCustom ? [billCustom, ...baseBillOptions] : baseBillOptions;
  const shipPicked = shipCustom ? CUSTOM : findPicked(draft.shipTo, shipOptions);
  const billPicked = billCustom ? CUSTOM : findPicked(draft.billTo, billOptions);

  const fill = (field: AddressKey, value: string) => {
    if (!value || value === CUSTOM) { update({ [field]: '' }); return; }
    update({ [field]: resolveAddr(value) });
  };

  const addAddress = async (a: PartnerAddress, picks: Partial<Record<string, boolean>>) => {
    if (!vendor || !adding) return;
    const saved = await savePartner({
      ...vendor,
      addresses: [...vendor.addresses, a],
      defaultBillToId: picks.defaultBillToId ? a.id : vendor.defaultBillToId,
      defaultShipToId: picks.defaultShipToId ? a.id : vendor.defaultShipToId,
    });
    onVendorSaved?.(saved);
    update({ [adding.field]: vendorText(a) });
    setAdding(null);
  };
  const openEdit = (field: AddressKey) => {
    const text = field === 'shipTo' ? draft.shipTo : draft.billTo;
    let address: PostalAddress = blankPostalAddress();
    let entityName = '';
    if (text === companyText) { address = m.company.address; entityName = m.company.name; }
    else {
      const wh = m.inv.warehouses.find((w) => whText(w.code) === text);
      if (wh) { address = wh.address; entityName = wh.name; }
      else {
        const va = vendorAddresses.find((a) => vendorText(a) === text);
        if (va) { address = va; entityName = vendor?.name ?? ''; }
      }
    }
    setEditingAddr({ field, address, entityName });
  };
  const saveEdit = (address: PostalAddress) => {
    if (!editingAddr) return;
    update({ [editingAddr.field]: formatAddress(address, editingAddr.entityName) });
    setEditingAddr(null);
  };

  const holder = (id: string) => (id ? vendorAddresses.find((a) => a.id === id)?.label || 'another address' : undefined);
  const canAddShip = !!vendor && !ctx.readOnly;

  return (
    <>
      <fieldset disabled={ctx.readOnly} className="contents">
        <Section icon="storefront" title="Vendor">
          <Fields>
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
                    icon: <PartnerAvatar partner={v} size={36} />,
                    fields: [
                      { label: 'Code', value: v.code },
                      ...(v.currency && v.currency !== ALL_CURRENCIES ? [{ label: 'Currency', value: v.currency }] : []),
                      ...(v.tin ? [{ label: 'TIN', value: v.tin }] : []),
                    ],
                    href: `#/purchasing/vendors/${v.id}`,
                  }))}
                value={draft.vendorId}
                onValueChange={(id) => pickVendor(id || null)}
                readOnly={!!(vendor && ctx.added)}
                footer={
                  <button
                    type="button"
                    className="w-full cursor-pointer rounded-xl px-4 py-2 text-left text-sm font-medium hover:bg-primary-subtle"
                    style={{ color: 'var(--color-text-primary)' }}
                    onClick={onNewVendor}
                  >
                    + Create new vendor
                  </button>
                }
              />
              {errors.vendorId && <Text variant="small" tone="danger">{errors.vendorId}</Text>}
            </div>
            {h.lookup(
              'contactId',
              'Contact person',
              [{ value: '', label: '— None —' }, ...(vendor?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))],
              { hint: !vendor ? 'Pick a vendor first.' : "Defaults to the vendor's default contact.", disabled: !vendor },
            )}
            {h.text('vendorRef', 'Vendor ref. no.', {
              error: errors.vendorRef,
              hint: "The vendor's own reference, e.g. their sales order no.",
            })}
            <FormField
              label="Currency"
              required
              error={errors.currency}
              tooltip={
                received
                  ? 'Locked: goods were already received on this PO.'
                  : vendor && vendor.currency !== ALL_CURRENCIES
                  ? `Defaults to the vendor's currency. You can override it before receiving goods.`
                  : 'Pick the document currency for this order.'
              }
            >
              {(p) => (
                <Select
                  {...p}
                  disabled={!currencyEditable}
                  options={m.currencies.filter((c) => c.active || c.code === draft.currency).map((c) => ({ value: c.code, label: c.code }))}
                  value={draft.currency}
                  onValueChange={(currency) => currency && update({ currency, currencyView: 'BP' })}
                />
              )}
            </FormField>
            <CardField
              label="Ship to"
              options={shipOptions}
              value={shipPicked}
              onValueChange={(v) => fill('shipTo', v)}
              onEdit={() => openEdit('shipTo')}
              placeholder="Select a delivery address"
              readOnly={ctx.readOnly}
              footer={canAddShip ? (
                <Button type="button" size="small" variant="ghost" onClick={() => setAdding({ field: 'shipTo', address: newAddress() })}>
                  + New address
                </Button>
              ) : undefined}
            />
            <CardField
              label="Bill to"
              options={billOptions}
              value={billPicked}
              onValueChange={(v) => fill('billTo', v)}
              onEdit={() => openEdit('billTo')}
              placeholder="Select a billing address"
              readOnly={ctx.readOnly}
            />
          </Fields>
          {vendor && canAddShip ? (
            <Text variant="small" tone="muted">
              New ship-to addresses are saved to {vendor.name} right away, so later documents can pick them too.
            </Text>
          ) : null}
        </Section>
      </fieldset>
      {editingAddr
        ? createPortal(
            <EditPanel
              icon="location_on"
              title={editingAddr.field === 'shipTo' ? 'Edit ship-to address' : 'Edit bill-to address'}
              onCancel={() => setEditingAddr(null)}
              onDone={() => saveEdit(editingAddr.address)}
            >
              <Section icon="location_on" title="Address">
                <AddressFields
                  value={editingAddr.address}
                  onChange={(p) => setEditingAddr({ ...editingAddr, address: { ...editingAddr.address, ...p } })}
                  stack
                />
                <Text variant="small" tone="muted">
                  Changes apply to this PO only and won't affect the address book.
                </Text>
              </Section>
            </EditPanel>,
            document.body,
          )
        : null}
      {adding && vendor
        ? createPortal(
            <AddressPanel
              value={adding.address}
              isNew
              errors={{}}
              defaults={[
                { key: 'defaultBillToId', label: "Vendor's default bill-to (mailing) address", checked: !vendor.defaultBillToId, holder: holder(vendor.defaultBillToId) },
                { key: 'defaultShipToId', label: "Vendor's default ship-to address", checked: !vendor.defaultShipToId, holder: holder(vendor.defaultShipToId) },
              ]}
              onDone={addAddress}
              onCancel={() => setAdding(null)}
            />,
            document.body,
          )
        : null}
    </>
  );
}
