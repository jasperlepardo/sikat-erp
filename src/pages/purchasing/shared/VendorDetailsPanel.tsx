import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Button, CardField, FormField, Icon, IconButton, Panel, PanelHeader, Select, SidePanel, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../components/form/fields';
import { blankPostalAddress, formatAddress, type PostalAddress } from '../../../mocks/address';
import { contactName, newAddress, type Partner, type PartnerAddress } from '../../../mocks/partners';
import { savePartner } from '../../../services/partners';
import type { Currency } from '../../../mocks/currencies';
import { AddressFields } from '../../../components/form/AddressFields';
import { AddressPanel } from '../../partners/detail/addresses';
import { EditPanel } from '../../partners/detail/EditPanel';
import type { VendorAddressField, VendorAddressOption } from './vendorAddresses';

const CUSTOM = '__custom__';
const locationIcon = <Icon size={16}>location_on</Icon>;

/** The draft fields every vendor document shares; address keys are read dynamically by config. */
interface VendorDraftBase {
  contactId: string;
  vendorRef: string;
  currency: string;
}

interface VendorDetailsPanelProps<D extends VendorDraftBase> {
  draft: D;
  update: (patch: Partial<D>) => void;
  vendor: Partner | undefined;
  currencies: Currency[];
  /** The whole panel is read-only (document closed/cancelled). */
  readOnly: boolean;
  open: boolean;
  onClose: () => void;
  onVendorSaved?: (v: Partner) => void;
  contactHint?: string;
  vendorRefHint?: string;
  vendorRefError?: string;
  /** Currency field config — docs differ on when it locks and why. */
  currency: { disabled: boolean; tooltip: ReactNode; error?: ReactNode; onChange?: (currency: string) => Partial<D> };
  addresses: VendorAddressField[];
  /** Muted note under the address pickers (e.g. "New addresses are saved to … right away"). */
  addressNote?: ReactNode;
}

/** The vendor side panel on a purchasing document: contact, document currency, and configurable delivery/billing addresses. */
export function VendorDetailsPanel<D extends VendorDraftBase>({
  draft, update, vendor, currencies, readOnly, open, onClose, onVendorSaved,
  contactHint = "Defaults to the vendor's default contact.", vendorRefHint, vendorRefError, currency, addresses, addressNote,
}: VendorDetailsPanelProps<D>) {
  const navigate = useNavigate();
  // Bind the three shared fields through the base type; address keys are handled dynamically below.
  const h = bind<VendorDraftBase>(draft, update as (patch: Partial<VendorDraftBase>) => void);
  const [adding, setAdding] = useState<{ key: string; address: PartnerAddress } | null>(null);
  const [editing, setEditing] = useState<{ key: string; label: string; address: PostalAddress; entityName: string } | null>(null);

  if (!open || !vendor) return null;

  const currentText = (key: string) => (draft[key as keyof D] as unknown as string) ?? '';
  const setField = (key: string, value: string) => update({ [key]: value } as Partial<D>);
  const canAdd = !readOnly;

  const addVendorAddress = async (a: PartnerAddress, picks: Partial<Record<string, boolean>>) => {
    if (!adding) return;
    const saved = await savePartner({
      ...vendor,
      addresses: [...vendor.addresses, a],
      defaultBillToId: picks.defaultBillToId ? a.id : vendor.defaultBillToId,
      defaultShipToId: picks.defaultShipToId ? a.id : vendor.defaultShipToId,
    });
    onVendorSaved?.(saved);
    setField(adding.key, formatAddress(a, vendor.name));
    setAdding(null);
  };
  const saveEdit = (address: PostalAddress) => {
    if (!editing) return;
    setField(editing.key, formatAddress(address, editing.entityName));
    setEditing(null);
  };
  const holder = (id: string) => (id ? vendor.addresses.find((a) => a.id === id)?.label || 'another address' : undefined);

  return (
    <>
      <SidePanel overlay onOverlayClick={onClose}>
        <PanelHeader
          type="details"
          icon="storefront"
          iconIntent="default"
          iconShape="rounded"
          iconSize={32}
          iconVariant="outline"
          title={vendor.name}
          actions={
            <>
              <IconButton type="button" intent="default" variant="link" label={`Open vendor ${vendor.code}`} onClick={() => navigate(`/purchasing/vendors/${vendor.id}`)}>
                <Icon size={20}>open_in_new</Icon>
              </IconButton>
              <IconButton type="button" intent="default" variant="link" label="Close" onClick={onClose}>
                <Icon size={20}>close</Icon>
              </IconButton>
            </>
          }
        />
        <Panel.Body>
          <fieldset disabled={readOnly} className="contents">
            <Section icon="person" title="Contact">
              <Fields cols={1}>
                {h.lookup(
                  'contactId',
                  'Contact person',
                  (vendor.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) })),
                  { clearable: true, hint: contactHint },
                )}
                {h.text('vendorRef', 'Vendor ref. no.', { hint: vendorRefHint, error: vendorRefError })}
                <FormField label="Currency" required error={currency.error} tooltip={currency.tooltip}>
                  {(p) => (
                    <Select
                      {...p}
                      disabled={currency.disabled}
                      options={currencies.filter((c) => c.active || c.code === draft.currency).map((c) => ({ value: c.code, label: c.code }))}
                      value={draft.currency}
                      onValueChange={(cur) => cur && update(currency.onChange ? currency.onChange(cur) : ({ currency: cur } as Partial<D>))}
                    />
                  )}
                </FormField>
              </Fields>
            </Section>
            {addresses.length > 0 ? (
            <Section icon="local_shipping" title="Delivery & billing">
              <Fields cols={1}>
                {addresses.map((field) => {
                  const cur = currentText(field.key);
                  const opts = field.options(cur);
                  const matched = opts.find((o) => o.text === cur);
                  const custom: VendorAddressOption | null = cur && !matched
                    ? (() => {
                        const lines = cur.split('\n').filter(Boolean);
                        return { value: CUSTOM, label: lines[0] ?? 'Custom address', fields: lines.slice(1).map((l) => ({ label: '', value: l })), text: cur };
                      })()
                    : null;
                  const all = custom ? [custom, ...opts] : opts;
                  const cardOptions: CardFieldOption[] = all.map((o) => ({ value: o.value, label: o.label, icon: locationIcon, fields: o.fields }));
                  const picked = custom ? CUSTOM : (matched?.value ?? '');
                  const onPick = (value: string) => {
                    if (!value || value === CUSTOM) { setField(field.key, ''); return; }
                    const o = all.find((x) => x.value === value);
                    if (o) setField(field.key, o.text);
                  };
                  const onEdit = () => {
                    const o = opts.find((x) => x.text === cur);
                    setEditing({ key: field.key, label: field.label, address: o?.postal?.address ?? blankPostalAddress(), entityName: o?.postal?.entityName ?? '' });
                  };
                  return (
                    <CardField
                      key={field.key}
                      label={field.label}
                      options={cardOptions}
                      value={picked}
                      onValueChange={onPick}
                      onEdit={onEdit}
                      placeholder={field.placeholder}
                      readOnly={readOnly}
                      footer={field.allowNew && canAdd ? (
                        <Button type="button" size="small" variant="ghost" onClick={() => setAdding({ key: field.key, address: newAddress() })}>
                          + New address
                        </Button>
                      ) : undefined}
                    />
                  );
                })}
                {addressNote && canAdd ? <Text variant="small" tone="muted">{addressNote}</Text> : null}
              </Fields>
            </Section>
            ) : null}
          </fieldset>
        </Panel.Body>
      </SidePanel>
      {editing
        ? createPortal(
            <EditPanel
              icon="location_on"
              title={`Edit ${editing.label.toLowerCase()} address`}
              onCancel={() => setEditing(null)}
              onDone={() => saveEdit(editing.address)}
            >
              <Section icon="location_on" title="Address">
                <AddressFields value={editing.address} onChange={(p) => setEditing({ ...editing, address: { ...editing.address, ...p } })} stack />
                <Text variant="small" tone="muted">Changes apply to this document only and won't affect the address book.</Text>
              </Section>
            </EditPanel>,
            document.body,
          )
        : null}
      {adding
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
    </>
  );
}
