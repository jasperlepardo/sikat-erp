import { Combobox, FormField, TextField } from '@jasperlepardo/sikat-design-system';
import { findBarangay, findCity, findProvince, useBarangays, useLocations } from '../../services/locations';

/** The location part of a Philippine address: names as printed, plus their PSGC codes. */
export interface PhLocation {
  province: string;
  provinceCode: string;
  city: string;
  cityCode: string;
  /** Barangay name. */
  block: string;
  barangayCode: string;
}

type Option = { value: string; label: string };

/** A value saved before it could be matched stays listed, so the field never blanks it. */
const withLegacy = (options: Option[], value: string, name: string) =>
  !value && name ? [{ value: `legacy:${name}`, label: name }, ...options] : options;

/**
 * Province → city/municipality → barangay pickers over the PSGC. Each level lists only what
 * sits inside the one above; picking a city first fills in its province.
 */
export function PhLocationFields({ value, onChange }: { value: PhLocation; onChange: (patch: Partial<PhLocation>) => void }) {
  const data = useLocations();
  const province = data && findProvince(data, value.provinceCode, value.province);
  const city = data && findCity(data, province, value.cityCode, value.city);
  const barangays = useBarangays(city);
  const barangay = barangays && findBarangay(barangays, value.barangayCode, value.block);

  const loading = !data;
  const provinceName = (code: string) => data?.provinces.find((p) => p.code === code)?.name ?? '';

  const pickProvince = (code: string | null) => {
    if (code?.startsWith('legacy:')) return;
    const p = data?.provinces.find((x) => x.code === code);
    if (p?.code === province?.code) return;
    onChange({ province: p?.name ?? '', provinceCode: p?.code ?? '', city: '', cityCode: '', block: '', barangayCode: '' });
  };
  const pickCity = (code: string | null) => {
    if (code?.startsWith('legacy:')) return;
    const c = data?.cities.find((x) => x.code === code);
    if (c && c.code === city?.code) return;
    onChange({
      city: c?.name ?? '',
      cityCode: c?.code ?? '',
      block: '',
      barangayCode: '',
      ...(c ? { province: provinceName(c.province), provinceCode: c.province } : {}),
    });
  };
  const pickBarangay = (code: string | null) => {
    if (code?.startsWith('legacy:')) return;
    const b = barangays?.find((x) => x.code === code);
    onChange({ block: b?.name ?? '', barangayCode: b?.code ?? '' });
  };

  const provinceOptions = withLegacy(
    (data?.provinces ?? []).map((p) => ({ value: p.code, label: p.name })),
    province?.code ?? '',
    value.province,
  );
  // With no province picked, every city is offered, labelled with its province.
  const cityOptions = withLegacy(
    (data?.cities ?? [])
      .filter((c) => !province || c.province === province.code)
      .map((c) => ({ value: c.code, label: province ? c.name : `${c.name}, ${provinceName(c.province)}` })),
    city?.code ?? '',
    value.city,
  );
  const barangayOptions = withLegacy(
    (barangays ?? []).map((b) => ({ value: b.code, label: b.name })),
    barangay?.code ?? '',
    value.block,
  );
  const legacyOr = (code: string | undefined, name: string) => code ?? (name ? `legacy:${name}` : null);

  return (
    <>
      <FormField key="province" label="Province" tooltip="Philippine Standard Geographic Code (PSA).">
        {(p) => (
          <Combobox
            {...p}
            options={provinceOptions}
            disabled={loading}
            placeholder={loading ? 'Loading…' : 'Search…'}
            clearable
            value={legacyOr(province?.code, value.province)}
            onValueChange={pickProvince}
          />
        )}
      </FormField>
      <FormField key="city" label="City / municipality" tooltip={province ? `In ${province.name}.` : 'Picking a city fills in its province.'}>
        {(p) => (
          <Combobox
            {...p}
            options={cityOptions}
            disabled={loading}
            placeholder={loading ? 'Loading…' : 'Search…'}
            clearable
            value={legacyOr(city?.code, value.city)}
            onValueChange={pickCity}
          />
        )}
      </FormField>
      {city && barangays && !barangays.length ? (
        // A few new municipalities have no barangays in the PSGC yet.
        <FormField key="barangay" label="Barangay" tooltip={`The PSGC lists no barangays for ${city.name} yet.`}>
          {(p) => (
            <TextField {...p} value={value.block} onChange={(e) => onChange({ block: e.currentTarget.value, barangayCode: '' })} />
          )}
        </FormField>
      ) : (
        <FormField key="barangay" label="Barangay" tooltip={city ? `In ${city.name}.` : 'Pick the city or municipality first.'}>
          {(p) => (
            <Combobox
              {...p}
              options={barangayOptions}
              disabled={!city || !barangays}
              placeholder={!city ? 'Pick a city first' : !barangays ? 'Loading…' : 'Search…'}
              clearable
              value={legacyOr(barangay?.code, value.block)}
              onValueChange={pickBarangay}
            />
          )}
        </FormField>
      )}
    </>
  );
}
