import type { ReactNode } from 'react';
import { CardField, Link, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Fields, Section } from '../../../components/form/fields';
import type { Partner } from '../../../mocks/partners';
import { PartnerAvatar } from '../../../components/PartnerAvatar';

const ALL_CURRENCIES = 'All currencies';

interface VendorCardProps {
  vendors: Partner[];
  vendorId: string;
  /** The picked vendor, when found; its name becomes the link that opens the details panel. */
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
  onOpenDetails: () => void;
}

/** A purchasing document's vendor: picked as a card; the selected name links to the vendor details side panel. */
export function VendorCard({ vendors, vendorId, vendor, readOnly, added = false, locked, error, hint, tooltip, pickVendor, onNewVendor, onOpenDetails }: VendorCardProps) {
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
                    // The title opens the vendor details side panel; in dropdown rows it flattens to plain text.
                    texts: [
                      { variant: 'small' as const, children: <Link onClick={(e) => { e.stopPropagation(); onOpenDetails(); }}>{v.name}</Link> },
                      ...(detail ? [{ variant: 'caption' as const, children: detail }] : []),
                    ],
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
        </Fields>
      </Section>
    </fieldset>
  );
}
