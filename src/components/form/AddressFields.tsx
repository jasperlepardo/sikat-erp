import { bind } from './fields';
import { PhLocationFields } from './PhLocationFields';
import type { PostalAddress } from '../../mocks/address';
import { PHILIPPINES } from '../../services/locations';
import { countryDef } from '../../pages/settings/masterDefs';

/**
 * Country, street lines, location and ZIP of one address, for any record that holds a
 * `PostalAddress` (partner addresses, warehouses). Render inside `Fields`. Philippine
 * addresses pick province → city → barangay from the PSGC; others are typed.
 */
export function AddressFields({
  value,
  onChange,
  countryError,
}: {
  value: PostalAddress;
  onChange: (patch: Partial<PostalAddress>) => void;
  countryError?: string;
}) {
  // Province, city and barangay belong to a country: switching country starts them fresh.
  const f = bind(value, (p: Partial<PostalAddress>) =>
    p.country !== undefined && p.country !== value.country
      ? onChange({ country: p.country, province: '', provinceCode: '', city: '', cityCode: '', block: '', barangayCode: '', county: '' })
      : onChange(p),
  );
  return (
    <>
      {f.master('country', 'Country/Region', countryDef, { required: true, error: countryError })}
      {f.text('streetNo', 'Street no.', { placeholder: 'e.g. 123' })}
      {f.text('street', 'Street / PO box', { placeholder: 'e.g. Ayala Avenue' })}
      {f.text('building', 'Building / floor / room', { placeholder: 'e.g. Tower 1, 5F, Unit 502' })}
      {value.country === PHILIPPINES ? (
        <PhLocationFields value={value} onChange={onChange} />
      ) : (
        <>
          {f.text('province', 'State / province', { placeholder: 'e.g. California' })}
          {f.text('county', 'County / district', { placeholder: 'e.g. Orange County' })}
          {f.text('city', 'City', { placeholder: 'e.g. San Francisco' })}
          {f.text('block', 'District / neighborhood')}
        </>
      )}
      {f.text('zip', 'ZIP code', { placeholder: 'e.g. 1223' })}
    </>
  );
}
