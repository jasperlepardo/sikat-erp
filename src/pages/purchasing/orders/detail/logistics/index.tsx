import { useState } from 'react';
import { countryName } from '../../../../services/partnerMasters';
import { createPortal } from 'react-dom';
import { Button, CardField, Icon, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, Section, bind } from '../../../../components/form/fields';
import { blankPostalAddress, type PostalAddress } from '../../../../mocks/address';
import { newAddress, type PartnerAddress } from '../../../../mocks/partners';
import { LANGUAGES } from '../../../../mocks/purchaseOrders';
import { getPurchasingSettings } from '../../../../services/purchaseOrders';
import { receivesFromVendors } from '../../../../mocks/itemMasters';
import { activeOptions } from '../../../../services/inventoryMasters';
import { savePartner } from '../../../../services/partners';
import { AddressFields } from '../../../../components/form/AddressFields';
import { AddressPanel } from '../../../partners/detail/AddressesTab';
import { EditPanel } from '../../../partners/detail/EditPanel';
import { defaultShipTo, formatAddress, type PoTabProps } from './types';

type AddressKey = 'shipTo' | 'billTo';
const OURS = 'ours';
const WH_PREFIX = 'wh:';

function addressFields(a: PostalAddress) {
  const line = [a.addressLine, a.block, a.city, a.countryCode === 'PH' ? a.province : countryName(a.countryCode), a.zip].filter(Boolean).join(', ');
  return line ? [{ label: 'Address', value: line }] : [];
}

const locationIcon = <Icon size={16}>location_on</Icon>;

export function LogisticsTab({ draft, update, m, ctx, onVendorSaved }: PoTabProps) {
  const f = bind(draft, update);
  const warehouses = [...new Set(draft.lines.map((l) => l.warehouse).filter(Boolean))];
  const ours = defaultShipTo(draft.lines, m);
  const vendor = ctx.vendor;
  const [adding, setAdding] = useState<{ field: AddressKey; address: PartnerAddress } | null>(null);
  const [editingAddr, setEditingAddr] = useState<{ field: AddressKey; address: PostalAddress; entityName: string } | null>(null);

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
    {
      value: OURS,
      label: `${m.company.name}${ours === companyText ? ' (default)' : ''}`,
      icon: locationIcon,
      fields: addressFields(m.company.address),
    },
    // Vendors ship to warehouses; stores restock by transfer.
    ...m.inv.warehouses
      .filter((w) => (w.active && receivesFromVendors(w)) || whText(w.code) === current)
      .map((w) => ({
        value: `${WH_PREFIX}${w.code}`,
        label: `${w.name}${ours === formatAddress(w.address, w.name) ? ' (default)' : ''}`,
        icon: locationIcon,
        fields: addressFields(w.address),
      })),
  ];

  const vendorCardOptions = (defaultId: string | undefined, tag: string): CardFieldOption[] =>
    vendorAddresses.map((a) => ({
      value: a.id,
      label: `${a.label || 'Untitled address'} · ${vendor?.name}${a.id === defaultId ? ` (${tag})` : ''}`,
      icon: locationIcon,
      fields: addressFields(a),
    }));

  const baseShipOptions: CardFieldOption[] = [
    ...ourOptions(draft.shipTo),
    ...vendorCardOptions(vendor?.defaultShipToId, "vendor's ship-to"),
  ];
  // Bill to is ours: the registered address (the default, as BIR invoices carry it) or an office.
  const baseBillOptions: CardFieldOption[] = [
    { value: OURS, label: `${m.company.name} (default)`, icon: locationIcon, fields: addressFields(m.company.address) },
    ...m.inv.warehouses
      .filter((w) => w.type === 'office' && (w.active || whText(w.code) === draft.billTo))
      .map((w) => ({ value: `${WH_PREFIX}${w.code}`, label: w.name, icon: locationIcon, fields: addressFields(w.address) })),
  ];

  const findPicked = (current: string, options: CardFieldOption[]) =>
    options.find((o) => resolveAddr(o.value) === current)?.value ?? '';

  // When the address text has been manually edited and no longer matches a known
  // option, inject a pseudo-option so the card view still shows.
  const CUSTOM = '__custom__';
  const customOption = (text: string, base: CardFieldOption[]): CardFieldOption | null => {
    if (!text || findPicked(text, base)) return null;
    const lines = text.split('\n').filter(Boolean);
    return {
      value: CUSTOM,
      label: lines[0] ?? 'Custom address',
      icon: locationIcon,
      fields: lines.slice(1).map((line) => ({ label: '', value: line })),
    };
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
    onVendorSaved(saved);
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
    <div className="flex flex-col gap-2">
      <Section icon="local_shipping" title="Addresses">
        <Fields>
          <CardField
            label="Ship to"
            options={shipOptions}
            value={shipPicked}
            onValueChange={(v) => fill('shipTo', v)}
            onEdit={() => openEdit('shipTo')}
            placeholder="Select a delivery address"
            readOnly={ctx.readOnly}
            footer={canAddShip ? (
              <Button
                type="button"
                size="small"
                variant="ghost"
                onClick={() => setAdding({ field: 'shipTo', address: newAddress() })}
              >
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
      <Section icon="route" title="Delivery">
        <Fields>
          {f.lookup(
            'shippingType',
            'Shipping type',
            [{ value: '', label: '— None —' }, ...activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType)],
            { hint: 'Defaults from the vendor.' },
          )}
          {getPurchasingSettings().multiLanguageSupport
            ? f.pick('language', 'Language', LANGUAGES, { hint: "Prints the PO in the vendor's language." })
            : null}
        </Fields>
        <Flags>
          {f.check('splitByWarehouse', 'Split purchase order', { disabled: ctx.added })}
          {f.check('approved', 'Approved')}
        </Flags>
        <Text variant="small" tone="muted" className="mt-2">
          {ctx.added
            ? 'Split applies when a PO is added.'
            : draft.splitByWarehouse && warehouses.length > 1
              ? `Adding creates ${warehouses.length} POs, one per warehouse (${warehouses.join(', ')}).`
              : 'Split purchase order creates one PO per warehouse when lines go to several.'}{' '}
          Unapproved POs are saved as Not Confirmed and cannot be received until approved.
        </Text>
      </Section>
    </div>
  );
}
