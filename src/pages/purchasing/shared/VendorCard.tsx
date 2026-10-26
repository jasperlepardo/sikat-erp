import type { ReactNode } from 'react';
import { CardField, FormField, Icon, Link, Select, Text, TextField, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section } from '../../../components/form/fields';
import type { Partner } from '../../../mocks/partners';
import type { Currency } from '../../../mocks/currencies';
import { contactName } from '../../../mocks/partners';
import { PartnerAvatar } from '../../../components/PartnerAvatar';

const ALL_CURRENCIES = 'All currencies';

export interface VendorCardProps {
  vendors: Partner[];
  vendorId: string;
  vendor: Partner | undefined;
  /** The whole card is read-only (document closed/cancelled). */
  readOnly: boolean;
  /** The vendor can't change any more (added, or set by the copied document). */
  added?: boolean;
  /** Force the picker locked, overriding the default `vendor && added` rule. */
  locked?: boolean;
  error?: string;
  hint?: string;
  tooltip?: ReactNode;
  pickVendor: (id: string | null) => void;
  /** When provided, a "+ Create new vendor" footer appears in the picker. */
  onNewVendor?: () => void;
  onOpenDetails?: () => void;

  // ── Optional extended fields (sheet: Contact Person, Vendor Ref, Currency, Phone, Email) ──

  /** Contact person field: pass draft, update and errors to enable it. */
  contact?: {
    contactId: string;
    onChange: (id: string) => void;
    hint?: string;
  };

  /** Vendor Ref. No. field. */
  vendorRef?: {
    value: string;
    onChange: (v: string) => void;
    hint?: string;
    error?: string;
  };

  /**
   * Currency field. When `readOnly: true` renders a read-only value (BP currency on PBA);
   * when `readOnly: false` renders a Select (local currency on CM and other docs).
   */
  currency?: {
    value: string;
    readOnly: boolean;
    currencies?: Currency[];
    onChange?: (code: string) => void;
    tooltip?: ReactNode;
    error?: string;
  };

  /** Read-only telephone / email pulled from the vendor record (PBA). */
  phone?: string;
  email?: string;
}

/** A purchasing document's vendor card — picker plus optional Contact Person, Vendor Ref, Currency, Phone and Email. */
export function VendorCard({
  vendors, vendorId, vendor, readOnly, added = false, locked, error, hint, tooltip,
  pickVendor, onNewVendor, onOpenDetails,
  contact, vendorRef, currency, phone, email,
}: VendorCardProps) {
  const pickerLocked = locked ?? !!(vendor && added);

  return (
    <fieldset disabled={readOnly} className="contents">
      <Section icon="storefront" title="Vendor">
        <Fields>
          <div className="md:col-span-2">
            <CardField
              label="Vendor"
              required
              placeholder="Search vendors"
              tooltip={tooltip}
              hint={hint}
              options={vendors
                .filter((v) => v.status !== 'Inactive' || v.id === vendorId)
                .map((v): CardFieldOption => {
                  const detail = [v.code, v.currency && v.currency !== ALL_CURRENCIES ? v.currency : '', v.tin ?? ''].filter(Boolean).join(' · ');
                  return {
                    value: v.id,
                    label: v.name,
                    icon: <PartnerAvatar partner={v} size={36} />,
                    texts: onOpenDetails ? [
                      { variant: 'small' as const, children: <Link onClick={(e) => { e.stopPropagation(); onOpenDetails(); }}>{v.name}</Link> },
                      ...(detail ? [{ variant: 'caption' as const, children: detail }] : []),
                    ] : undefined,
                    fields: onOpenDetails ? undefined : [
                      { label: 'Code', value: v.code },
                      ...(v.currency && v.currency !== ALL_CURRENCIES ? [{ label: 'Currency', value: v.currency }] : []),
                      ...(v.tin ? [{ label: 'TIN', value: v.tin }] : []),
                    ],
                    href: onOpenDetails ? undefined : `#/purchasing/vendors/${v.id}`,
                  };
                })}
              value={vendorId}
              onValueChange={(id) => pickVendor(id || null)}
              readOnly={pickerLocked}
              footer={onNewVendor ? (
                <button
                  type="button"
                  className="w-full cursor-pointer rounded-xl px-4 py-2 text-left text-sm font-medium hover:bg-primary-subtle"
                  style={{ color: 'var(--color-text-primary)' }}
                  onClick={onNewVendor}
                >
                  + Create new vendor
                </button>
              ) : undefined}
            />
            {error && <Text variant="small" tone="danger">{error}</Text>}
          </div>

          {contact ? (
            <CardField
              label="Contact person"
              options={(vendor?.contacts ?? [])
                .filter((c) => c.active || c.id === contact.contactId)
                .map((c): CardFieldOption => ({
                  value: c.id,
                  label: contactName(c),
                  icon: <Icon size={16}>person</Icon>,
                  fields: [
                    ...(c.position ? [{ label: 'Position', value: c.position }] : []),
                    ...(c.mobile || c.tel1 ? [{ label: 'Phone', value: c.mobile || c.tel1 || '' }] : []),
                    ...(c.email ? [{ label: 'Email', value: c.email }] : []),
                  ],
                }))}
              value={contact.contactId}
              onValueChange={(id) => contact.onChange(id ?? '')}
              placeholder={vendor ? 'Select a contact person' : 'Pick a vendor first'}
              readOnly={readOnly || !vendor}
              hint={contact.hint}
            />
          ) : null}

          {vendorRef ? (
            <FormField label="Vendor ref. no." hint={vendorRef.hint} error={vendorRef.error}>
              {(p) => <TextField {...p} value={vendorRef.value} disabled={readOnly} onChange={(e) => vendorRef.onChange(e.currentTarget.value)} />}
            </FormField>
          ) : null}

          {currency ? (
            currency.readOnly ? (
              <ReadOnly label="BP currency" value={currency.value} hint="Set by the vendor." />
            ) : (
              <FormField label="Currency" required error={currency.error} tooltip={currency.tooltip}>
                {(p) => (
                  <Select
                    {...p}
                    disabled={readOnly}
                    options={(currency.currencies ?? []).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                    value={currency.value}
                    onValueChange={(code) => currency.onChange?.(code ?? '')}
                  />
                )}
              </FormField>
            )
          ) : null}

          {phone !== undefined ? <ReadOnly label="Telephone no." value={phone || '—'} hint="From the vendor record." /> : null}
          {email !== undefined ? <ReadOnly label="E-mail" value={email || '—'} hint="From the vendor record." /> : null}
        </Fields>
      </Section>
    </fieldset>
  );
}

