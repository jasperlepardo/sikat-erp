import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, CardField, Icon, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { blankPostalAddress, type PostalAddress } from '../../../../mocks/address';
import { newAddress, type PartnerAddress } from '../../../../mocks/partners';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { activeOptions } from '../../../../services/inventoryMasters';
import { savePartner } from '../../../../services/partners';
import { countryName } from '../../../../services/partnerMasters';
import { AddressFields } from '../../../../components/form/AddressFields';
import { AddressPanel } from '../../../partners/detail/AddressesTab';
import { EditPanel } from '../../../partners/detail/EditPanel';
import { formatAddress, type RfqTabProps } from './types';

type AddressKey = 'shipTo' | 'payTo';
const OURS = 'ours';
const WH_PREFIX = 'wh:';
const VENDOR_PREFIX = 'v:';

function addressFields(a: PostalAddress) {
  const line = [a.addressLine, a.block, a.city, a.countryCode === 'PH' ? a.province : countryName(a.countryCode), a.zip].filter(Boolean).join(', ');
  return line ? [{ label: 'Address', value: line }] : [];
}

const locationIcon = <Icon size={16}>location_on</Icon>;

export function LogisticsTab({ draft, update, m, ctx, onVendorSaved }: RfqTabProps) {
  const f = bind(draft, update);
  const vendor = ctx.vendor;
  const [adding, setAdding] = useState<{ field: AddressKey; address: PartnerAddress } | null>(null);
  const [editingAddr, setEditingAddr] = useState<{ field: AddressKey; address: PostalAddress; entityName: string } | null>(null);

  const vendorAddresses = vendor?.addresses ?? [];
  const companyText = formatAddress(m.company.address, m.company.name);
  const vendorText = (a: PartnerAddress) => formatAddress(a, vendor?.name);
  const whText = (code: string) => {
    const wh = m.inv.warehouses.find((w) => w.code === code);
    return wh ? formatAddress(wh.address, wh.name) : '';
  };

  const resolveShip = (value: string): string => {
    if (value === OURS) return companyText;
    if (value.startsWith(WH_PREFIX)) return whText(value.slice(WH_PREFIX.length));
    if (value.startsWith(VENDOR_PREFIX)) return vendorText(vendorAddresses.find((a) => a.id === value.slice(VENDOR_PREFIX.length))!);
    return '';
  };
  const resolvePayTo = (value: string): string => {
    if (value.startsWith(VENDOR_PREFIX)) return vendorText(vendorAddresses.find((a) => a.id === value.slice(VENDOR_PREFIX.length))!);
    return '';
  };

  // Ship To: our warehouses + vendor's own ship-to addresses
  const shipOptions: CardFieldOption[] = [
    {
      value: OURS,
      label: m.company.name,
      icon: locationIcon,
      fields: addressFields(m.company.address),
    },
    ...m.inv.warehouses
      .filter((w) => w.active && receivesFromVendors(w))
      .map((w) => ({
        value: `${WH_PREFIX}${w.code}`,
        label: w.name,
        icon: locationIcon,
        fields: addressFields(w.address),
      })),
    ...vendorAddresses.map((a) => ({
      value: `${VENDOR_PREFIX}${a.id}`,
      label: `${a.label || 'Untitled address'} · ${vendor?.name}`,
      icon: locationIcon,
      fields: addressFields(a),
    })),
  ];

  // Pay To: vendor's bill-to addresses (where we send payment)
  const payToOptions: CardFieldOption[] = vendorAddresses.map((a) => ({
    value: `${VENDOR_PREFIX}${a.id}`,
    label: `${a.label || 'Untitled address'} · ${vendor?.name}`,
    icon: locationIcon,
    fields: addressFields(a),
  }));

  const CUSTOM = '__custom__';
  const customOption = (text: string, base: CardFieldOption[]): CardFieldOption | null => {
    if (!text) return null;
    const known = base.find((o) => resolveShip(o.value) === text || resolvePayTo(o.value) === text || (o.value === OURS && text === companyText));
    if (known) return null;
    const lines = text.split('\n').filter(Boolean);
    return { value: CUSTOM, label: lines[0] ?? 'Custom address', icon: locationIcon, fields: lines.slice(1).map((l) => ({ label: '', value: l })) };
  };

  const shipCustom = customOption(draft.shipTo, shipOptions);
  const payCustom = customOption(draft.payTo, payToOptions);
  const allShipOptions = shipCustom ? [shipCustom, ...shipOptions] : shipOptions;
  const allPayOptions = payCustom ? [payCustom, ...payToOptions] : payToOptions;

  const findPicked = (text: string, options: CardFieldOption[], resolve: (v: string) => string) =>
    options.find((o) => resolve(o.value) === text || (o.value === OURS && text === companyText))?.value ?? (text ? CUSTOM : '');

  const shipPicked = shipCustom ? CUSTOM : findPicked(draft.shipTo, shipOptions, resolveShip);
  const payPicked = payCustom ? CUSTOM : findPicked(draft.payTo, payToOptions, resolvePayTo);

  const fillShip = (value: string) => {
    if (!value || value === CUSTOM) { update({ shipTo: '' }); return; }
    update({ shipTo: value === OURS ? companyText : (value.startsWith(WH_PREFIX) ? whText(value.slice(WH_PREFIX.length)) : vendorText(vendorAddresses.find((a) => a.id === value.slice(VENDOR_PREFIX.length))!)) });
  };
  const fillPay = (value: string) => {
    if (!value || value === CUSTOM) { update({ payTo: '' }); return; }
    update({ payTo: vendorText(vendorAddresses.find((a) => a.id === value.slice(VENDOR_PREFIX.length))!) });
  };

  const openEdit = (field: AddressKey) => {
    const text = field === 'shipTo' ? draft.shipTo : draft.payTo;
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

  const addVendorAddress = async (a: PartnerAddress, picks: Partial<Record<string, boolean>>) => {
    if (!vendor || !adding) return;
    const saved = await savePartner({
      ...vendor,
      addresses: [...vendor.addresses, a],
      defaultBillToId: picks.defaultBillToId ? a.id : vendor.defaultBillToId,
      defaultShipToId: picks.defaultShipToId ? a.id : vendor.defaultShipToId,
    });
    onVendorSaved(saved);
    update({ [adding.field]: vendorText(a) });
    setAdding(null);
  };

  const holder = (id: string) => (id ? vendorAddresses.find((a) => a.id === id)?.label || 'another address' : undefined);
  const canAdd = !!vendor && !ctx.readOnly;

  return (
    <div className="flex flex-col gap-2">
      <Section icon="local_shipping" title="Addresses">
        <Fields>
          <CardField
            label="Ship to"
            options={allShipOptions}
            value={shipPicked}
            onValueChange={fillShip}
            onEdit={() => openEdit('shipTo')}
            placeholder="Select a delivery address"
            readOnly={ctx.readOnly}
            footer={
              canAdd ? (
                <Button type="button" size="small" variant="ghost" onClick={() => setAdding({ field: 'shipTo', address: newAddress() })}>
                  + New address
                </Button>
              ) : undefined
            }
          />
          <CardField
            label="Pay to"
            options={allPayOptions}
            value={payPicked}
            onValueChange={fillPay}
            onEdit={() => openEdit('payTo')}
            placeholder="Select vendor payment address"
            readOnly={ctx.readOnly}
            footer={
              canAdd ? (
                <Button type="button" size="small" variant="ghost" onClick={() => setAdding({ field: 'payTo', address: newAddress() })}>
                  + New address
                </Button>
              ) : undefined
            }
          />
        </Fields>
        {vendor && canAdd ? (
          <Text variant="small" tone="muted">
            New addresses are saved to {vendor.name} right away.
          </Text>
        ) : null}
      </Section>

      {editingAddr
        ? createPortal(
            <EditPanel
              icon="location_on"
              title={editingAddr.field === 'shipTo' ? 'Edit ship-to address' : 'Edit pay-to address'}
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
                  Changes apply to this RFQ only and won't affect the address book.
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
                { key: 'defaultBillToId', label: "Vendor's default bill-to address", checked: !vendor.defaultBillToId, holder: holder(vendor.defaultBillToId) },
                { key: 'defaultShipToId', label: "Vendor's default ship-to address", checked: !vendor.defaultShipToId, holder: holder(vendor.defaultShipToId) },
              ]}
              onDone={addVendorAddress}
              onCancel={() => setAdding(null)}
            />,
            document.body,
          )
        : null}

      <Section icon="route" title="Delivery">
        <Fields>
          {f.lookup(
            'shippingType',
            'Shipping type',
            [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)],
            { hint: 'Defaults from the vendor.' },
          )}
          {f.pick('language', 'Language', LANGUAGES, { hint: "Language for the printed RFQ document." })}
        </Fields>
      </Section>
    </div>
  );
}
