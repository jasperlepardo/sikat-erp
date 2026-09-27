/**
 * Demo catalog for an Apple Premium Reseller in the Philippines.
 *
 * Flat items: one item per sellable configuration (model × size × chip ×
 * memory × storage × connectivity × colour). There are no item variants yet;
 * when variants arrive each family below becomes one parent item.
 *
 * Research snapshot: 27 Sep 2026. PH prices are Apple PH SRPs, VAT inclusive,
 * where published (iPhone 18 Pro, 18 Pro Max, iPhone Duo). Everything else is
 * estimated from the US price (see `phEstimate`) and carries the
 * "PH SRP to confirm" property. Apple part numbers, UPCs and Apple's cost to
 * the reseller are not public: the Manufacturers and Barcodes tabs stay empty
 * and the item cost is a demo assumption.
 */

/** Family specs expanded into items by `expandCatalog`. */
export interface Family {
  /** Item group name. */
  group: string;
  /** Item No. stem after the group prefix, e.g. 18P → IPH-18P-256-BLK. */
  code: string;
  name: string;
  /** Option axes, in Item No. / description order. Each option adds to the price. */
  axes: Axis[];
  colours?: string[];
  /** US starting price in USD (lowest option on every axis). */
  usFrom: number;
  /** Published PH SRP by full option key (e.g. "256"), when known. */
  ph?: Record<string, number>;
  serial?: boolean;
  validFrom?: string;
  weightKg?: number;
  /** Drop combinations that Apple doesn't sell. */
  allow?: (opts: Opt[], colour: string) => boolean;
  remarks?: string;
}

export interface Opt {
  /** Item No. segment. */
  code: string;
  /** Description segment. */
  label: string;
  /** US price step over the axis' first option. */
  us: number;
}
type Axis = Opt[];

const o = (code: string, label: string, us = 0): Opt => ({ code, label, us });

const STORAGE: Record<string, Opt> = {
  '64': o('64', '64GB'),
  '128': o('128', '128GB'),
  '256': o('256', '256GB'),
  '512': o('512', '512GB'),
  '1T': o('1T', '1TB'),
  '2T': o('2T', '2TB'),
};
/** Storage tiers with each tier's US price step. */
const storage = (...tiers: [keyof typeof STORAGE, number][]) => tiers.map(([k, us]) => ({ ...STORAGE[k], us }));
const wifiCell = (cellUs: number) => [o('WF', 'Wi-Fi'), o('CL', 'Wi-Fi + Cellular', cellUs)];

/** Colour → Item No. code. */
export const COLOUR_CODES: Record<string, string> = {
  Black: 'BLK', White: 'WHT', Silver: 'SLV', Glacier: 'GLC', Burgundy: 'BUR',
  'Star White': 'STW', 'Night Sky': 'NSK',
  Lavender: 'LAV', Sage: 'SAG', 'Mist Blue': 'MBL',
  'Sky Blue': 'SKB', 'Light Gold': 'LGD', 'Cloud White': 'CWH', 'Space Black': 'SBK',
  'Soft Pink': 'SPK', Pink: 'PNK', Teal: 'TEA', Ultramarine: 'ULM',
  Blue: 'BLU', Yellow: 'YEL', Purple: 'PUR', Starlight: 'STL', 'Space Gray': 'SGY',
  Midnight: 'MDN', Green: 'GRN', Orange: 'ORG',
  'Space Gray Aluminum': 'ASG', 'Black Aluminum': 'ABK', 'Light Gold Aluminum': 'ALG', 'Dark Bronze Aluminum': 'ADB',
  'Radiant Gold Titanium': 'TRG', 'Natural Titanium': 'TNT', 'Black Titanium': 'TBK',
  'Pearl White Ceramic': 'CPW', 'Night Blue Ceramic': 'CNB',
  'Midnight Aluminum': 'AMD', 'Starlight Aluminum': 'AST',
};

const IPHONE_REMARK = 'Activation-locked device: check serial / IMEI at receiving and on the sales invoice.';

/** iPhone 18 Pro tiers from the published Apple PH prices (Pro Max is ₱5,000 more per tier). */
const PRO_MAX_PH = { '256': 99990, '512': 115990, '1T': 147990, '2T': 194990 };
const PRO_PH = Object.fromEntries(Object.entries(PRO_MAX_PH).map(([k, v]) => [k, v - 5000]));

export const APPLE_FAMILIES: Family[] = [
  // ── iPhone ────────────────────────────────────────────────────────────────
  {
    group: 'iPhone', code: '18PM', name: 'iPhone 18 Pro Max', usFrom: 1299, ph: PRO_MAX_PH, serial: true, validFrom: '2026-09-18', weightKg: 0.23,
    axes: [storage(['256', 0], ['512', 200], ['1T', 600], ['2T', 1200])],
    colours: ['Black', 'Silver', 'Glacier', 'Burgundy'], remarks: IPHONE_REMARK,
  },
  {
    group: 'iPhone', code: '18P', name: 'iPhone 18 Pro', usFrom: 1199, ph: PRO_PH, serial: true, validFrom: '2026-09-18', weightKg: 0.2,
    axes: [storage(['256', 0], ['512', 200], ['1T', 600], ['2T', 1200])],
    colours: ['Black', 'Silver', 'Glacier', 'Burgundy'], remarks: IPHONE_REMARK,
  },
  {
    group: 'iPhone', code: 'DUO', name: 'iPhone Duo', usFrom: 1999, serial: true, validFrom: '2026-10-23', weightKg: 0.24,
    ph: { '256': 159990, '512': 175990, '1T': 207990, '2T': 254990 },
    axes: [storage(['256', 0], ['512', 200], ['1T', 600], ['2T', 1200])],
    colours: ['Star White', 'Night Sky'],
    remarks: `Foldable. Pre-order from 16 Oct 2026, sales from 23 Oct 2026 (Valid From). ${IPHONE_REMARK}`,
  },
  {
    group: 'iPhone', code: 'AIR', name: 'iPhone Air', usFrom: 1099, serial: true, weightKg: 0.17,
    axes: [storage(['256', 0], ['512', 200], ['1T', 400])],
    colours: ['Sky Blue', 'Light Gold', 'Cloud White', 'Space Black'], remarks: IPHONE_REMARK,
  },
  {
    group: 'iPhone', code: '17', name: 'iPhone 17', usFrom: 899, serial: true, weightKg: 0.18,
    axes: [storage(['256', 0], ['512', 200])],
    colours: ['Lavender', 'Sage', 'Mist Blue', 'White', 'Black'], remarks: IPHONE_REMARK,
  },
  {
    group: 'iPhone', code: '17E', name: 'iPhone 17e', usFrom: 699, serial: true, weightKg: 0.17,
    axes: [storage(['256', 0], ['512', 200])],
    colours: ['Soft Pink', 'White', 'Black'], remarks: IPHONE_REMARK,
  },
  {
    group: 'iPhone', code: '16', name: 'iPhone 16', usFrom: 829, serial: true, weightKg: 0.17,
    axes: [storage(['128', 0], ['256', 100])],
    colours: ['Black', 'White', 'Pink', 'Teal', 'Ultramarine'], remarks: IPHONE_REMARK,
  },

  // ── iPad ──────────────────────────────────────────────────────────────────
  {
    group: 'iPad', code: 'PRO', name: 'iPad Pro (M5)', usFrom: 999, serial: true, weightKg: 0.45,
    axes: [
      [o('11', '11-inch'), o('13', '13-inch', 300)],
      storage(['256', 0], ['512', 200], ['1T', 600], ['2T', 1000]),
      [o('SG', 'Standard glass'), o('NT', 'Nano-texture glass', 100)],
      wifiCell(200),
    ],
    colours: ['Space Black', 'Silver'],
    // Nano-texture glass is a 1TB / 2TB option only.
    allow: ([, s, g]) => g.code === 'SG' || s.code === '1T' || s.code === '2T',
  },
  {
    group: 'iPad', code: 'AIR', name: 'iPad Air (M4)', usFrom: 599, serial: true, weightKg: 0.46,
    axes: [
      [o('11', '11-inch'), o('13', '13-inch', 200)],
      storage(['128', 0], ['256', 100], ['512', 300], ['1T', 500]),
      wifiCell(150),
    ],
    colours: ['Blue', 'Purple', 'Starlight', 'Space Gray'],
  },
  {
    group: 'iPad', code: 'MINI', name: 'iPad mini (A17 Pro)', usFrom: 499, serial: true, weightKg: 0.29,
    axes: [storage(['128', 0], ['256', 100], ['512', 300]), wifiCell(150)],
    colours: ['Blue', 'Purple', 'Starlight', 'Space Gray'],
  },
  {
    group: 'iPad', code: 'A16', name: 'iPad (A16)', usFrom: 349, serial: true, weightKg: 0.48,
    axes: [storage(['128', 0], ['256', 100], ['512', 300]), wifiCell(150)],
    colours: ['Blue', 'Pink', 'Yellow', 'Silver'],
  },

  // ── Mac (Apple's standard configurations; build-to-order is not itemised) ─
  {
    group: 'Mac', code: 'MBA13', name: 'MacBook Air 13-inch (M5)', usFrom: 1299, serial: true, weightKg: 1.24,
    axes: [[
      o('M5-8G-16-512', 'M5 10C CPU/8C GPU, 16GB, 512GB'),
      o('M5-10G-24-1T', 'M5 10C CPU/10C GPU, 24GB, 1TB', 300),
      o('M5-10G-32-1T', 'M5 10C CPU/10C GPU, 32GB, 1TB', 500),
    ]],
    colours: ['Sky Blue', 'Midnight', 'Starlight', 'Silver'],
  },
  {
    group: 'Mac', code: 'MBA15', name: 'MacBook Air 15-inch (M5)', usFrom: 1499, serial: true, weightKg: 1.51,
    axes: [[
      o('M5-10G-16-512', 'M5 10C CPU/10C GPU, 16GB, 512GB'),
      o('M5-10G-24-1T', 'M5 10C CPU/10C GPU, 24GB, 1TB', 300),
      o('M5-10G-32-1T', 'M5 10C CPU/10C GPU, 32GB, 1TB', 500),
    ]],
    colours: ['Sky Blue', 'Midnight', 'Starlight', 'Silver'],
  },
  {
    group: 'Mac', code: 'MBP14', name: 'MacBook Pro 14-inch', usFrom: 1599, serial: true, weightKg: 1.55,
    axes: [[
      o('M5-16-512', 'M5, 16GB, 512GB'),
      o('M5-16-1T', 'M5, 16GB, 1TB', 200),
      o('M5-24-1T', 'M5, 24GB, 1TB', 400),
      o('M5P-24-1T', 'M5 Pro 18C CPU/20C GPU, 24GB, 1TB', 600),
      o('M5X-36-1T', 'M5 Max 18C CPU/40C GPU, 36GB, 1TB', 1600),
    ]],
    colours: ['Space Black', 'Silver'],
  },
  {
    group: 'Mac', code: 'MBP16', name: 'MacBook Pro 16-inch', usFrom: 2699, serial: true, weightKg: 2.14,
    axes: [[
      o('M5P-24-1T', 'M5 Pro 18C CPU/20C GPU, 24GB, 1TB'),
      o('M5P-48-1T', 'M5 Pro 18C CPU/20C GPU, 48GB, 1TB', 400),
      o('M5X-48-1T', 'M5 Max 18C CPU/40C GPU, 48GB, 1TB', 1300),
    ]],
    colours: ['Space Black', 'Silver'],
  },
  {
    group: 'Mac', code: 'IMAC', name: 'iMac 24-inch (M4)', usFrom: 1299, serial: true, weightKg: 4.44,
    axes: [[
      o('M4-8C-16-256', 'M4 8C CPU/8C GPU, 16GB, 256GB'),
      o('M4-10C-16-256', 'M4 10C CPU/10C GPU, 16GB, 256GB', 200),
      o('M4-10C-16-512', 'M4 10C CPU/10C GPU, 16GB, 512GB', 400),
      o('M4-10C-24-512', 'M4 10C CPU/10C GPU, 24GB, 512GB', 600),
    ]],
    colours: ['Blue', 'Purple', 'Pink', 'Orange', 'Yellow', 'Green', 'Silver'],
    // The 8-core model comes in four colours only.
    allow: ([cfg], colour) => !cfg.code.includes('8C') || ['Blue', 'Pink', 'Green', 'Silver'].includes(colour),
    remarks: 'Confirm the iMac is still the M4 model before ordering.',
  },
  {
    group: 'Mac', code: 'MINI', name: 'Mac mini', usFrom: 899, serial: true, weightKg: 0.67,
    axes: [[
      o('M6-16-256', 'M6, 16GB, 256GB'),
      o('M6-16-512', 'M6, 16GB, 512GB', 200),
      o('M6-24-512', 'M6, 24GB, 512GB', 400),
      o('M5P-24-1T', 'M5 Pro, 24GB, 1TB', 800),
    ]],
    colours: ['Silver'], validFrom: '2026-09-22',
  },
  {
    group: 'Mac', code: 'STUDIO', name: 'Mac Studio', usFrom: 2499, serial: true, weightKg: 2.7, validFrom: '2026-09-22',
    axes: [[
      o('M5X-36-512', 'M5 Max 18C CPU/32C GPU, 36GB, 512GB'),
      o('M5U-96-1T', 'M5 Ultra 36C CPU/80C GPU, 96GB, 1TB', 3000),
    ]],
    colours: ['Silver'],
  },
  {
    group: 'Mac', code: 'SD', name: 'Studio Display', usFrom: 1599, serial: true, weightKg: 6.3,
    axes: [
      [o('SG', 'Standard glass'), o('NT', 'Nano-texture glass', 300)],
      [o('TS', 'Tilt-adjustable stand'), o('HS', 'Tilt- and height-adjustable stand', 400), o('VM', 'VESA mount adapter')],
    ],
  },

  // ── Apple Watch (case + band; bands sold on their own are accessories) ───
  {
    group: 'Apple Watch', code: 'S12A', name: 'Apple Watch Series 12 Aluminum', usFrom: 399, serial: true, validFrom: '2026-09-18', weightKg: 0.03,
    axes: [[o('42', '42mm'), o('46', '46mm', 30)], [o('GPS', 'GPS'), o('CEL', 'GPS + Cellular', 100)]],
    colours: ['Space Gray Aluminum', 'Black Aluminum', 'Light Gold Aluminum', 'Dark Bronze Aluminum'],
  },
  {
    group: 'Apple Watch', code: 'S12T', name: 'Apple Watch Series 12 Titanium', usFrom: 699, serial: true, validFrom: '2026-09-18', weightKg: 0.04,
    axes: [[o('42', '42mm'), o('46', '46mm', 50)], [o('CEL', 'GPS + Cellular')]],
    colours: ['Radiant Gold Titanium', 'Natural Titanium'],
  },
  {
    group: 'Apple Watch', code: 'S12C', name: 'Apple Watch Series 12 Ceramic', usFrom: 899, serial: true, validFrom: '2026-09-18', weightKg: 0.05,
    axes: [[o('42', '42mm'), o('46', '46mm', 50)], [o('CEL', 'GPS + Cellular')]],
    colours: ['Pearl White Ceramic', 'Night Blue Ceramic'],
  },
  {
    group: 'Apple Watch', code: 'U4', name: 'Apple Watch Ultra 4', usFrom: 799, serial: true, validFrom: '2026-09-18', weightKg: 0.06,
    axes: [[o('49', '49mm')], [o('CEL', 'GPS + Cellular')]],
    colours: ['Natural Titanium', 'Black Titanium'],
    remarks: 'Confirm Ultra 4 case finishes.',
  },
  {
    group: 'Apple Watch', code: 'SE3', name: 'Apple Watch SE 3', usFrom: 249, serial: true, weightKg: 0.03,
    axes: [[o('40', '40mm'), o('44', '44mm', 30)], [o('GPS', 'GPS'), o('CEL', 'GPS + Cellular', 50)]],
    colours: ['Midnight Aluminum', 'Starlight Aluminum'],
  },

  // ── AirPods ───────────────────────────────────────────────────────────────
  {
    group: 'AirPods', code: 'AP5', name: 'AirPods 5', usFrom: 129, serial: true, validFrom: '2026-09-18', weightKg: 0.05,
    axes: [[o('STD', 'USB-C Charging Case'), o('WCC', 'Wireless Charging Case', 20)]],
  },
  { group: 'AirPods', code: 'AP4', name: 'AirPods 4', usFrom: 99, serial: true, weightKg: 0.04, axes: [], remarks: 'Previous generation, still sold.' },
  { group: 'AirPods', code: 'PRO3', name: 'AirPods Pro 3', usFrom: 249, serial: true, weightKg: 0.05, axes: [] },
  {
    group: 'AirPods', code: 'MAX2', name: 'AirPods Max 2', usFrom: 549, serial: true, weightKg: 0.39, axes: [],
    colours: ['Midnight', 'Starlight', 'Blue', 'Purple', 'Orange'], remarks: 'Confirm AirPods Max 2 colours.',
  },

  // ── Home ──────────────────────────────────────────────────────────────────
  {
    group: 'Home & TV', code: 'ATV4K', name: 'Apple TV 4K', usFrom: 199, serial: true, weightKg: 0.21,
    axes: [[o('64-WF', 'Wi-Fi, 64GB'), o('128-ETH', 'Wi-Fi + Ethernet, 128GB', 30)]],
  },

  // ── Accessories (not serial-tracked) ─────────────────────────────────────
  ...([
    ['PWR20', '20W USB-C Power Adapter', 19],
    ['PWR35D', '35W Dual USB-C Port Compact Power Adapter', 59],
    ['PWR70', '70W USB-C Power Adapter', 59],
    ['PWR96', '96W USB-C Power Adapter', 79],
    ['CBL1M', 'USB-C Charge Cable (1 m)', 19],
    ['CBL240', '240W USB-C Charge Cable (2 m)', 29],
    ['MAGSF1', 'MagSafe Charger (1 m)', 39],
    ['MAGSF2', 'MagSafe Charger (2 m)', 49],
    ['USBCL', 'USB-C to Lightning Adapter', 29],
  ] as const).map(([code, name, usFrom]): Family => ({ group: 'Accessories', code, name, usFrom, axes: [], weightKg: 0.1 })),
  { group: 'Accessories', code: 'ATAG', name: 'AirTag', usFrom: 29, weightKg: 0.02, axes: [[o('1PK', '1 pack'), o('4PK', '4 pack', 70)]] },
  { group: 'Accessories', code: 'PENPRO', name: 'Apple Pencil Pro', usFrom: 129, serial: true, weightKg: 0.02, axes: [] },
  { group: 'Accessories', code: 'PENUSBC', name: 'Apple Pencil (USB-C)', usFrom: 79, serial: true, weightKg: 0.02, axes: [] },
  {
    group: 'Accessories', code: 'MKIPRO', name: 'Magic Keyboard for iPad Pro (M5)', usFrom: 299, serial: true, weightKg: 0.65,
    axes: [[o('11', '11-inch'), o('13', '13-inch', 50)]], colours: ['Black', 'White'],
  },
  {
    group: 'Accessories', code: 'MKIAIR', name: 'Magic Keyboard for iPad Air (M4)', usFrom: 269, serial: true, weightKg: 0.6,
    axes: [[o('11', '11-inch'), o('13', '13-inch', 50)]], colours: ['White'],
  },
  {
    group: 'Accessories', code: 'MK', name: 'Magic Keyboard', usFrom: 99, serial: true, weightKg: 0.24,
    axes: [[o('STD', 'Standard'), o('TID', 'with Touch ID', 50), o('TIDN', 'with Touch ID and Numeric Keypad', 100)]],
  },
  { group: 'Accessories', code: 'MMOUSE', name: 'Magic Mouse (USB-C)', usFrom: 79, serial: true, weightKg: 0.1, axes: [], colours: ['White', 'Black'] },
  { group: 'Accessories', code: 'MTPAD', name: 'Magic Trackpad (USB-C)', usFrom: 129, serial: true, weightKg: 0.23, axes: [], colours: ['White', 'Black'] },
  {
    group: 'Accessories', code: 'CASE', name: 'Clear Case with MagSafe', usFrom: 49, weightKg: 0.05,
    axes: [[o('18PM', 'for iPhone 18 Pro Max'), o('18P', 'for iPhone 18 Pro'), o('DUO', 'for iPhone Duo', 20), o('AIR', 'for iPhone Air'), o('17', 'for iPhone 17'), o('17E', 'for iPhone 17e', -10)]],
    remarks: 'Confirm the case range per model with the distributor price list.',
  },
  {
    group: 'Accessories', code: 'SPBAND', name: 'Sport Band', usFrom: 49, weightKg: 0.03,
    axes: [[o('42', '42mm'), o('46', '46mm'), o('49', '49mm (Ultra)')], [o('SM', 'S/M'), o('ML', 'M/L')]],
    colours: ['Black', 'White'],
  },
];

/**
 * Estimated PH SRP from a US price. Calibrated on iPhone 18 Pro
 * (US$1,199 → ₱94,990): × 79.2, rounded to the nearest ₱1,000, less ₱10.
 */
export const phEstimate = (usd: number) => Math.max(990, Math.round((usd * 79.2) / 1000) * 1000 - 10);

export interface CatalogEntry {
  family: Family;
  itemNo: string;
  description: string;
  /** Option key for `family.ph` lookups, e.g. "256" or "11-256-SG-WF". */
  key: string;
  colour: string;
  /** VAT-inclusive PH SRP. */
  price: number;
  estimated: boolean;
}

/** Every allowed option × colour combination of every family. */
export function expandCatalog(prefixOf: (group: string) => string, families = APPLE_FAMILIES): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const family of families) {
    const combos = family.axes.reduce<Opt[][]>((acc, axis) => acc.flatMap((c) => axis.map((opt) => [...c, opt])), [[]]);
    for (const opts of combos) {
      for (const colour of family.colours ?? ['']) {
        if (family.allow && !family.allow(opts, colour)) continue;
        const key = opts.map((x) => x.code).join('-');
        const known = family.ph?.[key];
        const us = family.usFrom + opts.reduce((n, x) => n + x.us, 0);
        out.push({
          family,
          key,
          colour,
          itemNo: [prefixOf(family.group), family.code, key, colour && COLOUR_CODES[colour]].filter(Boolean).join('-'),
          description: [family.name, ...opts.map((x) => x.label), colour].filter(Boolean).join(', '),
          price: known ?? phEstimate(us),
          estimated: known === undefined,
        });
      }
    }
  }
  return out;
}
