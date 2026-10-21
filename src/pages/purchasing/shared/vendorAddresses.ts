import { formatAddress, type PostalAddress } from '../../../mocks/address';
import type { Partner, PartnerAddress } from '../../../mocks/partners';
import type { Company } from '../../../mocks/companies';
import type { InventoryMasters } from '../../../services/inventoryMasters';
import { receivesFromVendors } from '../../../mocks/itemMasters';
import { countryName } from '../../../services/partnerMasters';

/** One address choice offered on a vendor document (company, a warehouse, or a vendor address). */
export interface VendorAddressOption {
  /** Stable, unique-within-the-field key for the picker. */
  value: string;
  label: string;
  fields: { label: string; value: string }[];
  /** The formatted address text stored in the draft when this option is picked. */
  text: string;
  /** The underlying address for inline editing; omitted for a free-typed custom address. */
  postal?: { address: PostalAddress; entityName: string };
}

/** One address CardField on the vendor details panel (ship-to, pay-to, bill-to…). */
export interface VendorAddressField {
  /** The draft key the picked address text is stored under. */
  key: string;
  label: string;
  placeholder: string;
  /** Show the "+ New address" footer (saves to the vendor). */
  allowNew?: boolean;
  /** Build the options, given the currently-stored text (so a stale match can stay selectable). */
  options: (current: string) => VendorAddressOption[];
}

function addressLines(a: PostalAddress) {
  const line = [a.addressLine, a.block, a.city, a.countryCode === 'PH' ? a.province : countryName(a.countryCode), a.zip].filter(Boolean).join(', ');
  return line ? [{ label: 'Address', value: line }] : [];
}

const tagged = (label: string, tag?: string) => (tag ? `${label} (${tag})` : label);

/** The buyer company's own address. */
export function companyOption(company: { name: string; address: PostalAddress }, tag?: string): VendorAddressOption {
  return {
    value: 'ours',
    label: tagged(company.name, tag),
    fields: addressLines(company.address),
    text: formatAddress(company.address, company.name),
    postal: { address: company.address, entityName: company.name },
  };
}

/** A warehouse address. */
export function warehouseOption(wh: { code: string; name: string; address: PostalAddress }, tag?: string): VendorAddressOption {
  return {
    value: `wh:${wh.code}`,
    label: tagged(wh.name, tag),
    fields: addressLines(wh.address),
    text: formatAddress(wh.address, wh.name),
    postal: { address: wh.address, entityName: wh.name },
  };
}

/** An address from the vendor's own address book. */
export function vendorAddressOption(a: PartnerAddress, vendorName: string, tag?: string): VendorAddressOption {
  return {
    value: `v:${a.id}`,
    label: tagged(`${a.label || 'Untitled address'} · ${vendorName}`, tag),
    fields: addressLines(a),
    text: formatAddress(a, vendorName),
    postal: { address: a, entityName: vendorName },
  };
}

/**
 * Ship-to / pay-to pickers for "receiving" vendor documents (goods receipts, A/P invoices,
 * reserve invoices): ship to the buyer company (and, optionally, a receiving warehouse), pay
 * to one of the vendor's addresses. No address adding — these documents don't edit the
 * vendor's address book.
 */
export function receivingVendorAddressFields(
  m: { company: Company; inv: InventoryMasters },
  vendor: Partner,
  opts: { includeWarehouses?: boolean; shipPlaceholder?: string; payPlaceholder?: string } = {},
): VendorAddressField[] {
  const { includeWarehouses = true, shipPlaceholder = 'Where the goods were received', payPlaceholder = 'Vendor address for invoicing and payment' } = opts;
  const whText = (code: string) => {
    const wh = m.inv.warehouses.find((w) => w.code === code);
    return wh ? formatAddress(wh.address, wh.name) : '';
  };
  const vendorAddrs = vendor.addresses ?? [];
  return [
    {
      key: 'shipTo',
      label: 'Ship to',
      placeholder: shipPlaceholder,
      options: (current) => [
        companyOption(m.company),
        ...(includeWarehouses
          ? m.inv.warehouses
              .filter((w) => (w.active && receivesFromVendors(w)) || whText(w.code) === current)
              .map((w) => warehouseOption(w))
          : []),
      ],
    },
    {
      key: 'payTo',
      label: 'Pay to',
      placeholder: payPlaceholder,
      options: () => vendorAddrs.map((a) => vendorAddressOption(a, vendor.name, a.id === vendor.defaultBillToId ? 'default bill-to' : undefined)),
    },
  ];
}
