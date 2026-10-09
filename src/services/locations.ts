/**
 * Philippine provinces, cities/municipalities and barangays from the PSA's Philippine Standard
 * Geographic Code (src/data/psgc, built by scripts/build-psgc.mjs). Reference data, not edited
 * in the app. Provinces and cities load once; barangays load per province when first needed.
 */
import { useEffect, useState } from 'react';

/** ISO code of the Philippines — addresses here use the PSGC province / city / barangay pickers. */
export const PHILIPPINES = 'PH';

export interface Region {
  code: string;
  name: string;
}
export interface Province {
  code: string;
  name: string;
  region: string;
}
export interface City {
  code: string;
  name: string;
  province: string;
  type: 'City' | 'Municipality';
}
export interface Barangay {
  code: string;
  name: string;
}
export interface Locations {
  regions: Region[];
  provinces: Province[];
  cities: City[];
}

let locations: Promise<Locations> | undefined;
export const loadLocations = () => (locations ??= import('../data/psgc/locations.json').then((m) => m.default as Locations));

const barangayFiles = import.meta.glob<{ default: Record<string, [string, string][]> }>('../data/psgc/barangays/*.json');
const barangayCache = new Map<string, Promise<Record<string, [string, string][]>>>();

/** Barangays of one city or municipality (empty when the PSGC lists none). */
export async function loadBarangays(city: City): Promise<Barangay[]> {
  const file = barangayFiles[`../data/psgc/barangays/${city.province}.json`];
  if (!file) return [];
  if (!barangayCache.has(city.province)) barangayCache.set(city.province, file().then((m) => m.default));
  const perCity = await barangayCache.get(city.province)!;
  return (perCity[city.code] ?? []).map(([code, name]) => ({ code, name }));
}

/** Provinces and cities, `undefined` while loading. */
export function useLocations() {
  const [data, setData] = useState<Locations>();
  useEffect(() => {
    let live = true;
    loadLocations().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);
  return data;
}

/** A city's barangays, `undefined` while loading. */
export function useBarangays(city: City | undefined) {
  const [state, setState] = useState<{ city?: string; rows: Barangay[] }>({ rows: [] });
  useEffect(() => {
    if (!city) return;
    let live = true;
    loadBarangays(city).then((rows) => live && setState({ city: city.code, rows }));
    return () => {
      live = false;
    };
  }, [city]);
  return city && state.city === city.code ? state.rows : undefined;
}

/** "Pasig", "City of Pasig" and "Pasig City" all name the same place. */
const bare = (name: string) => name.toLowerCase().replace(/^city of /, '').replace(/ city$/, '').trim();

/** The address's province, by code or (for addresses saved before codes) by name. */
export const findProvince = (data: Locations, code: string | undefined, name: string) =>
  data.provinces.find((p) => (code ? p.code === code : bare(p.name) === bare(name)));

export const findCity = (data: Locations, province: Province | undefined, code: string | undefined, name: string) =>
  data.cities.find((c) => (code ? c.code === code : !!province && c.province === province.code && bare(c.name) === bare(name)));

export const findBarangay = (rows: Barangay[], code: string | undefined, name: string) =>
  rows.find((b) => (code ? b.code === code : b.name.toLowerCase() === name.trim().toLowerCase()));
