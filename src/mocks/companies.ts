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
    name: 'Sikat Tech Inc.',
    address: blankPostalAddress({
      addressLine: 'Unit 1203, Tektite East Tower, Exchange Road', block: 'San Antonio', city: 'City of Pasig', zip: '1605',
      province: 'Metro Manila', provinceCode: '1300', cityCode: '137403', barangayCode: '137403019',
    }),
    active: true,
  },
  {
    id: 'acme',
    name: 'Acme Corp',
    address: blankPostalAddress({
      addressLine: '18F, One World Place, 32nd Street', block: 'Fort Bonifacio', city: 'City of Taguig', zip: '1634',
      province: 'Metro Manila', provinceCode: '1300', cityCode: '137607', barangayCode: '137607020',
    }),
    active: true,
  },
];
