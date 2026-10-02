import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Combobox, FormField, Text, Textarea } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, Section, bind } from '../../../../components/form/fields';
import { newAddress, type PartnerAddress } from '../../../../mocks/partners';
import { LANGUAGES, PURCHASING_SETTINGS } from '../../../../mocks/purchaseOrders';
import { activeOptions } from '../../../../services/inventoryMasters';
import { savePartner } from '../../../../services/partners';
import { AddressPanel } from '../../../partners/detail/AddressesTab';
import { defaultShipTo, formatAddress, type PoTabProps } from './types';

type AddressKey = 'shipTo' | 'payTo';
const OURS = 'ours';

/**
 * One document address: a dropdown picks it (the vendor's addresses, or ours for ship-to), the
 * address shows under it, and "Edit for this PO" changes the copy on this PO only. "+ New
 * address" adds one to the vendor.
 */
function AddressField({
  label,
  hint,
  options,
  picked,
  text,
  canAdd,
  readOnly,
  onPick,
  onText,
  onNew,
}: {
  label: string;
  hint: string;
  options: { value: string; label: string }[];
  /** The option whose address matches the text ('' when edited or empty). */
  picked: string;
  text: string;
  canAdd: boolean;
  readOnly: boolean;
  onPick: (value: string) => void;
  onText: (text: string) => void;
  onNew: () => void;
}) {
  // Bumped to remount (and so close) the dropdown after its footer is used.
  const [mount, setMount] = useState(0);
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <FormField label={label} tooltip={hint}>
        {(p) => (
          <Combobox
            key={mount}
            {...p}
            options={options}
            placeholder={text ? 'Edited for this PO' : 'None'}
            value={picked || null}
            onValueChange={(v) => {
              if (!v) return;
              setEditing(false);
              onPick(v);
            }}
            footer={
              canAdd ? (
                <div className="border-t border-[var(--color-border-default)] pt-1">
                  <button
                    type="button"
                    className="w-full cursor-pointer rounded-xl px-4 py-2 text-left text-sm font-medium hover:bg-[var(--color-bg-primary-subtle)]"
                    style={{ color: 'var(--color-text-primary)' }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setMount((m) => m + 1);
                      onNew();
                    }}
                  >
                    + New address
                  </button>
                </div>
              ) : undefined
            }
          />
        )}
      </FormField>
      {editing ? (
        <Textarea aria-label={`${label} for this PO`} rows={5} value={text} onChange={(e) => onText(e.currentTarget.value)} />
      ) : (
        <p className="whitespace-pre-line px-2 text-sm text-body">{text || '—'}</p>
      )}
      {!readOnly ? (
        <div>
          <Button type="button" size="small" variant="ghost" onClick={() => setEditing(!editing)}>
            {editing ? 'Done editing' : 'Edit for this PO'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function LogisticsTab({ draft, update, m, ctx, onVendorSaved }: PoTabProps) {
  const f = bind(draft, update);
  const warehouses = [...new Set(draft.lines.map((l) => l.warehouse).filter(Boolean))];
  const ours = defaultShipTo(draft.lines, m);
  const vendor = ctx.vendor;
  const [adding, setAdding] = useState<{ field: AddressKey; address: PartnerAddress } | null>(null);

  const vendorAddresses = vendor?.addresses ?? [];
  const text = (a: PartnerAddress) => formatAddress(a, vendor?.name);
  const vendorOptions = (defaultId: string | undefined, tag: string) =>
    vendorAddresses.map((a) => ({
      value: a.id,
      label: `${a.label || 'Untitled address'} · ${vendor?.name}${a.id === defaultId ? ` (${tag})` : ''}`,
    }));
  // Ours first: goods come to our warehouse (or office, for services) unless they're drop-shipped.
  const shipOptions = [
    ...(ours ? [{ value: OURS, label: `${ours.split('\n')[0]} (default)` }] : []),
    ...vendorOptions(vendor?.defaultShipToId, 'vendor’s ship-to'),
  ];
  const payOptions = vendorOptions(vendor?.defaultBillToId, 'default bill-to');
  const picked = (current: string, options: { value: string }[]) =>
    options.find((o) => (o.value === OURS ? ours : text(vendorAddresses.find((a) => a.id === o.value)!)) === current)?.value ?? '';
  const shipPicked = picked(draft.shipTo, shipOptions);
  const payPicked = picked(draft.payTo, payOptions);
  const fill = (field: AddressKey, value: string) =>
    update({ [field]: value === OURS ? ours : text(vendorAddresses.find((a) => a.id === value)!) });

  // A new address goes straight onto the vendor record, then fills the field it was added from.
  const addAddress = async (a: PartnerAddress, picks: Partial<Record<string, boolean>>) => {
    if (!vendor || !adding) return;
    const saved = await savePartner({
      ...vendor,
      addresses: [...vendor.addresses, a],
      defaultBillToId: picks.defaultBillToId ? a.id : vendor.defaultBillToId,
      defaultShipToId: picks.defaultShipToId ? a.id : vendor.defaultShipToId,
    });
    onVendorSaved(saved);
    update({ [adding.field]: formatAddress(a, saved.name) });
    setAdding(null);
  };
  const holder = (id: string) => (id ? vendorAddresses.find((a) => a.id === id)?.label || 'another address' : undefined);
  const canAdd = !!vendor && !ctx.readOnly;

  return (
    <div className="flex flex-col gap-2">
      <Section icon="local_shipping" title="Addresses">
        <Fields>
          <AddressField
              label="Ship to"
              hint="Where the goods are delivered: the line warehouse’s address, or the company address when the PO only has services. Pick a vendor address to drop-ship."
              options={shipOptions}
              picked={shipPicked}
              text={draft.shipTo}
              canAdd={canAdd}
              readOnly={ctx.readOnly}
              onPick={(v) => fill('shipTo', v)}
              onText={(shipTo) => update({ shipTo })}
              onNew={() => setAdding({ field: 'shipTo', address: newAddress() })}
            />
          <AddressField
              label="Pay to"
              hint="One of the vendor’s addresses. Starts on its default bill-to."
              options={payOptions}
              picked={payPicked}
              text={draft.payTo}
              canAdd={canAdd}
              readOnly={ctx.readOnly}
              onPick={(v) => fill('payTo', v)}
              onText={(payTo) => update({ payTo })}
              onNew={() => setAdding({ field: 'payTo', address: newAddress() })}
            />
        </Fields>
        {vendor ? (
          <Text variant="small" tone="muted">
            New addresses are saved to {vendor.name} right away, so later documents can pick them too.
          </Text>
        ) : (
          <Text variant="small" tone="muted">Pick a vendor to fill these from its addresses.</Text>
        )}
      </Section>
      {/* In a portal, outside the PO's <form>, so Enter in a panel field doesn't save the PO. */}
      {adding && vendor
        ? createPortal(
            <AddressPanel
              value={adding.address}
              isNew
              errors={{}}
              defaults={[
                { key: 'defaultBillToId', label: 'Vendor’s default bill-to (mailing) address', checked: !vendor.defaultBillToId, holder: holder(vendor.defaultBillToId) },
                { key: 'defaultShipToId', label: 'Vendor’s default ship-to address', checked: !vendor.defaultShipToId, holder: holder(vendor.defaultShipToId) },
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
          {PURCHASING_SETTINGS.multiLanguageSupport
            ? f.pick('language', 'Language', LANGUAGES, { hint: 'Prints the PO in the vendor’s language.' })
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
          Unapproved POs are saved as Not Confirmed and can’t be received until approved.
        </Text>
      </Section>
    </div>
  );
}
