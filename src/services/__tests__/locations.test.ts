/**
 * PSGC address lookups: match by code, or by name for addresses saved before codes, where
 * "Pasig", "City of Pasig" and "Pasig City" all name the same place.
 */
import { describe, expect, it } from 'vitest';
import data from '../../data/psgc/locations.json';
import { PHILIPPINES, findBarangay, findCity, findProvince, type Locations } from '../locations';

const psgc = data as Locations;

describe('PSGC lookups', () => {
  it('is keyed to the Philippines', () => {
    expect(PHILIPPINES).toBe('PH');
  });

  it('finds a province by code, else by name ignoring case', () => {
    expect(findProvince(psgc, '0458', '')?.name).toBe('Rizal');
    expect(findProvince(psgc, undefined, 'rizal')?.code).toBe('0458');
    expect(findProvince(psgc, undefined, 'Atlantis')).toBeUndefined();
  });

  it('finds a city by code, else by name within its province, with or without "City"', () => {
    const ncr = psgc.provinces.find((p) => p.code === '1300');
    expect(findCity(psgc, undefined, '137403', '')?.name).toBe('City of Pasig');
    expect(findCity(psgc, ncr, undefined, 'Pasig')?.code).toBe('137403');
    expect(findCity(psgc, ncr, undefined, 'Pasig City')?.code).toBe('137403');
    // A name needs its province.
    expect(findCity(psgc, undefined, undefined, 'Pasig')).toBeUndefined();
  });

  it('finds a barangay by code, else by trimmed name ignoring case', () => {
    const rows = [{ code: '1', name: 'Kapitolyo' }, { code: '2', name: 'San Antonio' }];
    expect(findBarangay(rows, '2', '')?.name).toBe('San Antonio');
    expect(findBarangay(rows, undefined, ' kapitolyo ')?.code).toBe('1');
    expect(findBarangay(rows, undefined, 'Ugong')).toBeUndefined();
  });
});
