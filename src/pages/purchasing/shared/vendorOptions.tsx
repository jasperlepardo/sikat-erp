import type { CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { PartnerAvatar } from '../../../components/PartnerAvatar';
import type { Partner } from '../../../mocks/partners';
import { ALL_CURRENCIES } from '../purchase-orders/detail/types';

const vendorHref = (id: string) => `#/purchasing/vendors/${id}`;

/** A vendor as a Vendor-field card: avatar, code, currency and TIN, linked to the vendor record. */
const vendorOption = (v: Partner): CardFieldOption => ({
  value: v.id,
  label: v.name,
  icon: <PartnerAvatar partner={v} size={36} />,
  fields: [
    { label: 'Code', value: v.code },
    ...(v.currency && v.currency !== ALL_CURRENCIES ? [{ label: 'Currency', value: v.currency }] : []),
    ...(v.tin ? [{ label: 'TIN', value: v.tin }] : []),
  ],
  href: vendorHref(v.id),
});

/** Active vendors to pick from, keeping `currentId` selectable even once it's inactive. */
export const vendorOptions = (vendors: readonly Partner[], currentId: string): CardFieldOption[] =>
  vendors.filter((v) => v.status !== 'Inactive' || v.id === currentId).map(vendorOption);

/**
 * The vendor a locked document names, from the name and code stamped on it rather than the live
 * record, so a later rename doesn't rewrite it. The avatar's shape still comes from the record.
 */
export function stampedVendorOption(
  doc: { vendorId: string; vendorName: string; vendorCode: string },
  vendor: Partner | undefined,
  currency?: string,
): CardFieldOption {
  return {
    value: doc.vendorId,
    label: doc.vendorName,
    icon: <PartnerAvatar partner={{ name: doc.vendorName, businessType: vendor?.businessType ?? '' }} size={36} />,
    fields: [
      { label: 'Code', value: doc.vendorCode },
      ...(currency ? [{ label: 'Currency', value: currency }] : []),
    ],
    href: vendorHref(doc.vendorId),
  };
}
