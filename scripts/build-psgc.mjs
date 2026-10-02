/**
 * Builds the Philippine location lists (src/data/psgc) from the PSA's PSGC exports in
 * source-data/. Run `node scripts/build-psgc.mjs` after replacing the CSVs.
 *
 * The exports have a few gaps that would break the province → city → barangay picker,
 * fixed here:
 * - Metro Manila has no province; its cities hang off district codes. They become one
 *   "Metro Manila" province, and Manila's barangays (filed under its districts) move to
 *   the City of Manila.
 * - Maguindanao's towns still use the pre-2022 province code; they're split between
 *   Maguindanao del Norte and del Sur (RA 11550).
 * - The BARMM Special Geographic Area towns are filed under Lanao del Sur; they get their
 *   own entry.
 * - Isabela City and Cotabato City point at codes with no province; they're listed under
 *   the province they sit in (Basilan, Maguindanao del Norte).
 * - Negros Occidental, Negros Oriental and Siquijor move to the Negros Island Region (RA 12000).
 * regions_corrected.csv is ignored: its codes don't match the PSGC.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const SRC = 'source-data';
const OUT = 'src/data/psgc';

function csv(file) {
  const [head, ...lines] = readFileSync(`${SRC}/${file}`, 'utf8').trim().split(/\r?\n/);
  const keys = head.split(',');
  return lines.map((line) => {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') (cell += '"'), i++;
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') cells.push(cell), (cell = '');
      else cell += c;
    }
    cells.push(cell);
    return Object.fromEntries(keys.map((k, i) => [k, cells[i].trim()]));
  });
}

const METRO_MANILA = '1300';
const SGA = '1999';
const MAG_NORTE = '19087';
const MAG_SUR = '19088';
const NORTE_TOWNS = new Set([
  'Barira', 'Buldon', 'Datu Blah T. Sinsuat', 'Datu Odin Sinsuat', 'Kabuntalan', 'Matanog',
  'Northern Kabuntalan', 'Parang', 'Sultan Kudarat', 'Sultan Mastura', 'Talitay', 'Upi',
]);
const NIR = { '0645': '18', '0746': '18', '0761': '18' };

const regions = csv('psgc_regions.updated.csv').map((r) => ({ code: r.code, name: r.name }));

const provinces = csv('psgc_provinces.updated.csv')
  .filter((p) => p.is_active === 'True')
  .map((p) => ({ code: p.code, name: p.name, region: NIR[p.code] ?? p.region_code }));
provinces.push(
  { code: METRO_MANILA, name: 'Metro Manila', region: '13' },
  { code: SGA, name: 'Special Geographic Area (BARMM)', region: '15' },
);

const provinceOf = (c) => {
  if (c.code.startsWith('1999')) return SGA;
  if (c.code.startsWith('13')) return METRO_MANILA;
  if (c.province_code === '1538') return NORTE_TOWNS.has(c.name) ? MAG_NORTE : MAG_SUR;
  if (c.province_code === '0997') return '1507'; // Isabela City → Basilan
  if (c.province_code === '1298') return MAG_NORTE; // Cotabato City
  return c.province_code;
};
const TYPES = { municipality: 'Municipality', 'component city': 'City', 'independent component city': 'City', 'highly urbanized city': 'City' };
const cities = csv('psgc_cities_municipalities.updated.fixed.csv').map((c) => ({
  code: c.code,
  name: c.name,
  province: provinceOf(c),
  type: TYPES[c.type] ?? 'Municipality',
}));

const provinceCodes = new Set(provinces.map((p) => p.code));
const stray = cities.filter((c) => !provinceCodes.has(c.province));
if (stray.length) throw new Error(`Cities without a province: ${stray.map((c) => c.name).join(', ')}`);

// Barangays, one file per province so the app loads only the one it needs.
const cityByCode = new Map(cities.map((c) => [c.code, c]));
const MANILA = '133900';
const byProvince = new Map();
let skipped = 0;
for (const b of csv('psgc_barangays.updated.csv')) {
  const cityCode = b.city_municipality_code.startsWith('1339') ? MANILA : b.city_municipality_code;
  const city = cityByCode.get(cityCode);
  if (!city) {
    skipped++;
    continue;
  }
  const perCity = byProvince.get(city.province) ?? {};
  (perCity[cityCode] ??= []).push([b.code, b.name]);
  byProvince.set(city.province, perCity);
}

const byName = (a, b) => a.name.localeCompare(b.name);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/barangays`, { recursive: true });
writeFileSync(
  `${OUT}/locations.json`,
  JSON.stringify({ regions, provinces: provinces.sort(byName), cities: cities.sort(byName) }),
);
let barangays = 0;
for (const [province, perCity] of byProvince) {
  for (const list of Object.values(perCity)) {
    list.sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
    barangays += list.length;
  }
  writeFileSync(`${OUT}/barangays/${province}.json`, JSON.stringify(perCity));
}
console.log(
  `${regions.length} regions, ${provinces.length} provinces, ${cities.length} cities/municipalities, ${barangays} barangays` +
    (skipped ? ` (${skipped} barangays skipped: unknown city)` : ''),
);
