import { seedCountryName } from './masters';

/**
 * A postal address, shared by business partner addresses, warehouses and the company. For a
 * Philippine address the province, city and barangay come from the PSGC (services/locations.ts).
 */
export interface PostalAddress {
  /** Free-text address line (street number, street name, building/unit). */
  addressLine: string;
  /** Barangay name (PH) or district/neighborhood (abroad). */
  block: string;
  city: string;
  zip: string;
  /** Province (PH) or state/province abroad. */
  province: string;
  /** PSGC codes of the province, city and barangay picked for a Philippine address ('' when typed). */
  provinceCode: string;
  cityCode: string;
  barangayCode: string;
  countryCode: string;
}

export const blankPostalAddress = (patch: Partial<PostalAddress> = {}): PostalAddress => ({
  addressLine: '',
  block: '',
  city: '',
  zip: '',
  province: '',
  provinceCode: '',
  cityCode: '',
  barangayCode: '',
  countryCode: 'PH',
  ...patch,
});

/** An address as printed on documents; the last line is the province at home, the country abroad. */
export const formatAddress = (a?: PostalAddress, name = '') =>
  a
    ? [
        name,
        a.addressLine,
        [a.block, a.city].filter(Boolean).join(', '),
        [a.zip, a.countryCode === 'PH' ? a.province : seedCountryName(a.countryCode)].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join('\n')
    : '';

/** One line, for lists: "Ugong, City of Pasig, Metro Manila". */
export const addressSummary = (a?: PostalAddress) =>
  a ? [a.block, a.city, a.countryCode === 'PH' ? a.province : seedCountryName(a.countryCode)].filter(Boolean).join(', ') : '';
