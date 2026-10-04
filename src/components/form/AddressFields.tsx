import { bind, Fields } from './fields';
import { PhLocationFields } from './PhLocationFields';
import type { PostalAddress } from '../../mocks/address';
import { PHILIPPINES } from '../../services/locations';
import { countryDef } from '../../pages/settings/masterDefs';

/**
 * Responsive address grid: 1 col → 2 → 3 → 6 (one row on lg+).
 * PH: Address | Barangay | City/Muni | Province | ZIP | Country.
 * Foreign: Address | City | State/Province | ZIP | Country.
 * Renders its own grid — do not wrap in Fields.
 */
export function AddressFields({
  value,
  onChange,
  countryError,
  cols = 2,
}: {
  value: PostalAddress;
  onChange: (patch: Partial<PostalAddress>) => void;
  countryError?: string;
  cols?: 1 | 2 | 3;
}) {
  const f = bind(value, (p: Partial<PostalAddress>) =>
    p.country !== undefined && p.country !== value.country
      ? onChange({ country: p.country, province: '', provinceCode: '', city: '', cityCode: '', block: '', barangayCode: '' })
      : onChange(p),
  );
  return (
    <Fields cols={cols}>
      {f.text('addressLine', 'Address', { placeholder: 'e.g. Unit 1203, Tektite East Tower, Exchange Road' })}
      {value.country === PHILIPPINES ? (
        <PhLocationFields value={value} onChange={onChange} />
      ) : (
        <>
          {f.text('city', 'City', { placeholder: 'e.g. San Francisco' })}
          {f.text('province', 'State / province', { placeholder: 'e.g. California' })}
        </>
      )}
      {f.text('zip', 'ZIP code', { placeholder: 'e.g. 1223' })}
      {f.master('country', 'Country/Region', countryDef, { required: true, error: countryError })}
    </Fields>
  );
}
