/**
 * A postal address, shared by business partner addresses, warehouses and the company. For a
 * Philippine address the province, city and barangay come from the PSGC (services/locations.ts).
 */
export interface PostalAddress {
  street: string;
  streetNo: string;
  building: string;
  /** Barangay (SAP "Block"); district or neighborhood abroad. */
  block: string;
  city: string;
  zip: string;
  /** County / district, for foreign address formats. */
  county: string;
  /** Province (SAP "State"). */
  province: string;
  /** PSGC codes of the province, city and barangay picked for a Philippine address ('' when typed). */
  provinceCode: string;
  cityCode: string;
  barangayCode: string;
  country: string;
}

export const blankPostalAddress = (patch: Partial<PostalAddress> = {}): PostalAddress => ({
  street: '',
  streetNo: '',
  building: '',
  block: '',
  city: '',
  zip: '',
  county: '',
  province: '',
  provinceCode: '',
  cityCode: '',
  barangayCode: '',
  country: 'Philippines',
  ...patch,
});

/** An address as printed on documents; the last line is the province at home, the country abroad. */
export const formatAddress = (a?: PostalAddress, name = '') =>
  a
    ? [
        name,
        [a.building, [a.streetNo, a.street].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        [a.block, a.city].filter(Boolean).join(', '),
        [a.zip, a.country === 'Philippines' ? a.province : a.country].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join('\n')
    : '';

/** One line, for lists: "Ugong, City of Pasig, Metro Manila". */
export const addressSummary = (a?: PostalAddress) =>
  a ? [a.block, a.city, a.country === 'Philippines' ? a.province : a.country].filter(Boolean).join(', ') : '';
