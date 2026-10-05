/**
 * The companies the navbar switcher moves between (our own legal entities, not business
 * partners). Each has the address documents use as ours, e.g. a service-only PO's Ship To.
 */
import { blankPostalAddress, type PostalAddress } from './address';

export interface Company {
  id: string;
  name: string;
  address: PostalAddress;
  active: boolean;
}

export const SEED_COMPANIES: Company[] = [
  {
    id: 'sikat',
    name: 'Power Mac Center, Inc.',
    // Head office per a maps listing ("Power Mac Center - Head Office"). Not confirmed against the
    // SEC/BIR registration — the demo uses it as the registered address.
    address: blankPostalAddress({
      addressLine: 'Kapitolyo Bldg., 7A 2nd St.', block: 'Kapitolyo', city: 'City of Pasig', zip: '1600',
      province: 'Metro Manila', provinceCode: '1300', cityCode: '137403', barangayCode: '137403009',
    }),
    active: true,
  },
];
