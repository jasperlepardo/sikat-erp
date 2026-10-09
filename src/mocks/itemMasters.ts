/**
 * Inventory master data behind the item master: item groups, units of measure,
 * warehouses and bins, manufacturers, customs / commission groups, shipping
 * types, warranty templates, item properties and inventory settings.
 * Seeds only — the app edits them in Settings › Inventory and Inventory ›
 * Warehouses & Bins (services/inventoryMasters.ts).
 */
import { blankPostalAddress, type PostalAddress } from './address';
import { SEED_STORE_WAREHOUSES } from './storeWarehouses';

export type ValuationMethod = 'Moving Average' | 'FIFO' | 'Standard Price' | 'Serial/Batch';

/** Fixed system lists (not master data). */
export const ITEM_TYPES = ['Items', 'Labor', 'Travel'] as const;
export const MANAGE_BY = ['None', 'Batches', 'Serial Numbers'] as const;
export const VALUATION_METHODS: ValuationMethod[] = ['Moving Average', 'FIFO', 'Standard Price', 'Serial/Batch'];
export const GL_BY = ['Item Group', 'Item Level', 'Warehouse'] as const;
export const ISSUE_METHODS = ['Manual', 'Backflush'] as const;
export const PLANNING_METHODS = ['MRP', 'MPS', 'None'] as const;
export const PROCUREMENT_METHODS = ['Buy', 'Make'] as const;


export interface ItemGroup {
  id: string;
  name: string;
  /** Item No. prefix for the group's numbering series, e.g. FST-00001. */
  prefix: string;
  valuationMethod: ValuationMethod;
  /** G/L account codes (Accounting › Chart of Accounts); '' for none (non-stock groups have no inventory account). */
  inventoryAccount: string;
  cogsAccount: string;
  revenueAccount: string;
  /**
   * Tax defaults copied onto an item when it's created in or moved to the group; the item can
   * override them. Codes from Settings › Accounting & Tax. '' = no default (excise: none applies).
   */
  purchaseTaxGroup: string;
  salesTaxGroup: string;
  withholdingGroup: string;
  exciseCategory: string;
  active: boolean;
}

export interface UnitOfMeasure {
  id: string;
  code: string;
  name: string;
  /**
   * Optional size and gross weight of one unit, for shipping weight, space and 3PL
   * calculations. 0 = not recorded. Volume is in the cube of `lengthUnit`.
   */
  length: number;
  width: number;
  height: number;
  volume: number;
  lengthUnit: InventorySettings['lengthUnit'];
  weight: number;
  weightUnit: InventorySettings['weightUnit'];
  active: boolean;
}

/** One conversion row: `altQty` of `altUom` = `baseQty` of the group's base unit (1 box = 24 pc). */
export interface UomConversion {
  id: string;
  altQty: number;
  altUom: string;
  baseQty: number;
}

/**
 * A template of related units and how they convert to the group's base unit. Items own their
 * units; "Add from UoM group" on the item copies a group's units in once (no link stays).
 */
export interface UomGroup {
  id: string;
  /** Short code, e.g. PIECE (max 20 characters). Items store it. */
  code: string;
  name: string;
  /** Unit every conversion is expressed in. */
  baseUom: string;
  conversions: UomConversion[];
  active: boolean;
}

/** Units in a group: the base unit, then its alternatives. */
export const groupUoms = (g: UomGroup) => [g.baseUom, ...g.conversions.map((c) => c.altUom)].filter(Boolean);

/** How many base units one `uom` is, or undefined when the group doesn't have it. */
export function baseQtyPer(g: UomGroup, uom: string): number | undefined {
  if (uom === g.baseUom) return 1;
  const c = g.conversions.find((x) => x.altUom === uom);
  return c && c.altQty > 0 && c.baseQty > 0 ? c.baseQty / c.altQty : undefined;
}

/** How many `to` units are in one `from` unit (1 box → 24 pc), rounded to 6 decimals. */
export function uomFactor(g: UomGroup, from: string, to: string): number | undefined {
  const a = baseQtyPer(g, from);
  const b = baseQtyPer(g, to);
  return a && b ? Math.round((a / b) * 1e6) / 1e6 : undefined;
}

/** "box = 24 pc · carton = 48 pc", for lists and hints. */
export const conversionSummary = (g: UomGroup) =>
  g.conversions.length
    ? g.conversions.map((c) => `${c.altQty === 1 ? '' : `${c.altQty} `}${c.altUom} = ${c.baseQty} ${g.baseUom}`).join(' · ')
    : `${g.baseUom} only`;

const conv = (altUom: string, baseQty: number, altQty = 1): UomConversion => ({ id: `uc-${altUom}`, altQty, altUom, baseQty });
const uomGroup = (code: string, name: string, baseUom: string, conversions: UomConversion[] = []): UomGroup => ({
  id: `ug-${code}`, code, name, baseUom, conversions, active: true,
});
export const SEED_UOM_GROUPS: UomGroup[] = [
  uomGroup('PIECE', 'Piece (each / pack / box / carton)', 'pc', [conv('pack', 6), conv('box', 24), conv('carton', 48)]),
  uomGroup('WEIGHT', 'Weight (gram / kilogram)', 'kg', [conv('g', 1, 1000)]),
  uomGroup('VOLUME', 'Volume (liter / gallon)', 'L', [conv('gal', 3.785)]),
  uomGroup('LENGTH', 'Length (meter / foot / roll)', 'm', [conv('ft', 0.3048), conv('roll', 50)]),
];

/** A unit of measure with no dimensions recorded. */
export const blankUom = (code = ''): UnitOfMeasure => ({
  id: `uom-${code}`, code, name: '', length: 0, width: 0, height: 0, volume: 0, lengthUnit: 'cm', weight: 0, weightUnit: 'kg', active: true,
});

/**
 * What a location is for. Offices bill: purchase orders can use them as Bill To and they
 * hold no stock. Warehouses receive vendor shipments (Ship To) and keep stock in bins.
 * Stores hold stock without bins and get it by inventory transfer.
 */
export type LocationType = 'office' | 'warehouse' | 'store';

export const LOCATION_TYPES: { value: LocationType; label: string; hint: string }[] = [
  { value: 'office', label: 'Office', hint: 'For billing: a Bill To on purchase orders. Holds no stock.' },
  { value: 'warehouse', label: 'Warehouse', hint: 'Receives vendor shipments (Ship To) and keeps stock in bin locations.' },
  { value: 'store', label: 'Store', hint: 'Holds and sells stock without bins; restocked by inventory transfer.' },
];

/** A location: an office, warehouse or store. Documents refer to it by `code`. */
export interface Warehouse {
  id: string;
  code: string;
  name: string;
  type: LocationType;
  /** The location's address: Ship To for a warehouse, Bill To for an office. */
  address: PostalAddress;
  /** Stock is kept in bin locations. Follows the type: only warehouses use bins. */
  binEnabled: boolean;
  active: boolean;
}

/** Whether items can be stocked here (warehouses and stores). */
export const holdsStock = (w: Pick<Warehouse, 'type'>) => w.type !== 'office';
/** Whether vendors deliver here: purchase and goods receipt lines, and Ship To. */
export const receivesFromVendors = (w: Pick<Warehouse, 'type'>) => w.type === 'warehouse';
/** Where vendors deliver an item by default: the first of its locations that receives shipments. */
export const vendorDeliveryLocation = (codes: string[], all: readonly Warehouse[], fallback = 'WH-MNL') =>
  codes.find((c) => all.some((w) => w.code === c && receivesFromVendors(w))) ?? fallback;

export interface Manufacturer {
  id: string;
  code: string;
  name: string;
  countryCode: string;
  contactPerson: string;
  email: string;
  phone: string;
  active: boolean;
}

export interface CustomsGroup {
  id: string;
  name: string;
  /** Harmonized System heading, e.g. 7318. */
  hsCode: string;
  duty: number;
  active: boolean;
}

export interface CommissionGroup {
  id: string;
  name: string;
  pct: number;
  active: boolean;
}

export interface ShippingType {
  id: string;
  name: string;
  trackingUrl: string;
  active: boolean;
}

export interface WarrantyTemplate {
  id: string;
  name: string;
  months: number;
  coverage: 'Parts' | 'Parts & labor' | 'Manufacturer';
  active: boolean;
}

/** One of the 64 admin-defined item property flags. */
export interface ItemProperty {
  id: string;
  /** Property number, 1–64. */
  number: number;
  name: string;
  group: string;
  active: boolean;
}
export const MAX_ITEM_PROPERTIES = 64;

export interface InventorySettings {
  id: string;
  lengthUnit: 'cm' | 'm' | 'in';
  weightUnit: 'kg' | 'lb';
}
export const LENGTH_UNITS = ['cm', 'm', 'in'] as const;
export const WEIGHT_UNITS = ['kg', 'lb'] as const;
/** Volume unit follows the length unit. */
export const volumeUnit = (length: InventorySettings['lengthUnit']) => `${length}³`;

type TaxDefaults = Pick<ItemGroup, 'purchaseTaxGroup' | 'salesTaxGroup' | 'withholdingGroup' | 'exciseCategory'>;
const GOODS_TAX: TaxDefaults = { purchaseTaxGroup: 'P-VAT12', salesTaxGroup: 'S-VAT12', withholdingGroup: 'WH-GDS', exciseCategory: '' };
const SERVICE_TAX: TaxDefaults = { purchaseTaxGroup: 'P-VAT12S', salesTaxGroup: 'S-VAT12', withholdingGroup: 'WH-SVC', exciseCategory: '' };
const RENT_TAX: TaxDefaults = { ...SERVICE_TAX, withholdingGroup: 'WH-RENT' };

const group = (
  name: string, prefix: string, valuationMethod: ValuationMethod,
  inventoryAccount: string, cogsAccount: string, revenueAccount: string,
  tax: TaxDefaults = GOODS_TAX,
): ItemGroup => ({ id: `ig-${prefix}`, name, prefix, valuationMethod, inventoryAccount, cogsAccount, revenueAccount, ...tax, active: true });

const MERCH = ['1310', '5010', '4010'] as const;
const NON_STOCK = ['', '5030', '4030'] as const;
export const SEED_ITEM_GROUPS: ItemGroup[] = [
  // Apple Premium Reseller catalog (mocks/appleCatalog.ts).
  group('iPhone', 'IPH', 'Serial/Batch', ...MERCH),
  group('iPad', 'IPD', 'Serial/Batch', ...MERCH),
  group('Mac', 'MAC', 'Serial/Batch', ...MERCH),
  group('Apple Watch', 'AW', 'Serial/Batch', ...MERCH),
  group('AirPods', 'APD', 'Serial/Batch', ...MERCH),
  group('Home & TV', 'HOM', 'Serial/Batch', ...MERCH),
  // FIFO: accessories come from several distributors at prices that move batch to batch.
  group('Accessories', 'ACC', 'FIFO', ...MERCH),
  group('AppleCare', 'ACP', 'Moving Average', ...NON_STOCK, SERVICE_TAX),
  group('Gift Certificates', 'GC', 'Moving Average', '', '5030', '2160', SERVICE_TAX),
  group('Services', 'SVC', 'Moving Average', ...NON_STOCK, SERVICE_TAX),
  group('Rent & Leases', 'RNT', 'Moving Average', ...NON_STOCK, RENT_TAX),
];

const uom = (code: string, name: string): UnitOfMeasure => ({ ...blankUom(code), name });
export const SEED_UOMS: UnitOfMeasure[] = [
  uom('pc', 'Piece'), uom('box', 'Box'), uom('carton', 'Carton'), uom('pack', 'Pack'), uom('roll', 'Roll'),
  uom('m', 'Meter'), uom('ft', 'Foot'), uom('g', 'Gram'), uom('kg', 'Kilogram'), uom('L', 'Liter'), uom('gal', 'Gallon'),
  uom('set', 'Set'), uom('pail', 'Pail'), uom('hour', 'Hour'), uom('trip', 'Trip'), uom('plan', 'Plan'), uom('seat', 'Seat'),
  uom('month', 'Month'), uom('year', 'Year'), uom('job', 'Job'),
];

const PH_PROVINCE: Record<string, string> = { '1300': 'Metro Manila', '0722': 'Cebu', '1124': 'Davao del Sur' };
const ph = (
  city: string, barangay: string, address: string, zip: string,
  provinceCode: string, cityCode: string, barangayCode: string,
): PostalAddress =>
  blankPostalAddress({
    addressLine: address, block: barangay, city: `City of ${city}`, zip,
    province: PH_PROVINCE[provinceCode], provinceCode, cityCode, barangayCode,
  });

// HQ: the company's registered address (mocks/companies.ts). Store addresses per powermaccenter.com/pages/store-list (Oct 2026). WH-MNL: the warehouse address the
// user supplied; its barangay isn't confirmed, so it's left blank (1600 is Pasig's general ZIP).
const CORE_WAREHOUSES: Warehouse[] = [
  { id: 'loc-HQ', code: 'HQ', name: 'Head office (Kapitolyo)', type: 'office', address: ph('Pasig', 'Kapitolyo', 'Kapitolyo Bldg., 7A 2nd St.', '1600', '1300', '137403', '137403009'), binEnabled: false, active: true },
  { id: 'wh-MNL', code: 'WH-MNL', name: 'Pasig warehouse', type: 'warehouse', address: ph('Pasig', '', '155 Dr. Sixto Antonio Ave.', '1600', '1300', '137403', ''), binEnabled: true, active: true },
  { id: 'wh-CEB', code: 'WH-CEB', name: 'Cebu store (Robinsons Galleria)', type: 'store', address: ph('Cebu', 'Tejero', '1/L Robinsons Galleria Cebu, Maxilom-Osmeña Blvd., 13th Ave. cor. Benedict St.', '6000', '0722', '072217', '072217083'), binEnabled: false, active: true },
  { id: 'wh-DVO', code: 'WH-DVO', name: 'Davao store (Abreeza)', type: 'store', address: ph('Davao', 'Barangay 20-B', '2nd Flr., Abreeza Mall, J.P. Laurel Ave., Bajada', '8000', '1124', '112402', '112402153'), binEnabled: false, active: true },
  { id: 'wh-PRD', code: 'WH-PRD', name: 'Mobile Care (Greenbelt 3)', type: 'store', address: ph('Makati', 'San Lorenzo', '2/F Greenbelt 3, Greenbelt Complex, Ayala Center', '1223', '1300', '137602', '137602025'), binEnabled: false, active: true },
];

/** The head office and core locations, then every store (mocks/storeWarehouses.ts). */
export const SEED_WAREHOUSES: Warehouse[] = [...CORE_WAREHOUSES, ...SEED_STORE_WAREHOUSES];

const mfr = (code: string, name: string, country: string, contactPerson = '', email = '', phone = ''): Manufacturer => ({
  id: `mfr-${code}`, code, name, countryCode: country, contactPerson, email, phone, active: true,
});
export const SEED_MANUFACTURERS: Manufacturer[] = [
  mfr('MFR-APL', 'Apple Inc.', 'US'),
];

const customs = (name: string, hsCode: string, duty: number): CustomsGroup => ({ id: `cg-${hsCode}`, name, hsCode, duty, active: true });
// Duty: ITA goods (phones, computers, tablets) enter duty-free; confirm the rest with the customs broker.
export const SEED_CUSTOMS_GROUPS: CustomsGroup[] = [
  customs('Phones & smartwatches', '8517', 0),
  customs('Computers & tablets', '8471', 0),
  customs('Headphones & speakers', '8518', 0),
  customs('Displays & TV receivers', '8528', 0),
  customs('Power adapters', '8504', 0),
  customs('Electrical wire & cable', '8544', 7),
  customs('Cases & bags', '4202', 0),
];

export const SEED_COMMISSION_GROUPS: CommissionGroup[] = [
  { id: 'cm-std', name: 'Standard', pct: 2, active: true },
  { id: 'cm-high', name: 'High margin', pct: 4, active: true },
  { id: 'cm-proj', name: 'Project sales', pct: 1, active: true },
];

export const SEED_SHIPPING_TYPES: ShippingType[] = [
  { id: 'sh-pickup', name: 'Pick-up', trackingUrl: '', active: true },
  { id: 'sh-own', name: 'Own delivery', trackingUrl: '', active: true },
  { id: 'sh-lbc', name: 'LBC', trackingUrl: 'https://www.lbcexpress.com/track/', active: true },
  { id: 'sh-jt', name: 'J&T Express', trackingUrl: 'https://www.jtexpress.ph/', active: true },
  { id: 'sh-lala', name: 'Lalamove', trackingUrl: '', active: true },
  { id: 'sh-sea', name: 'Sea freight', trackingUrl: '', active: true },
];

export const SEED_WARRANTY_TEMPLATES: WarrantyTemplate[] = [
  { id: 'wr-6p', name: '6 months – parts', months: 6, coverage: 'Parts', active: true },
  { id: 'wr-1pl', name: '1 year – parts & labor', months: 12, coverage: 'Parts & labor', active: true },
  { id: 'wr-2m', name: '2 years – manufacturer', months: 24, coverage: 'Manufacturer', active: true },
  { id: 'wr-apl1', name: 'Apple one-year limited warranty', months: 12, coverage: 'Manufacturer', active: true },
];

const PROPERTY_SEED: [string, string[]][] = [
  ['Storage requirements', ['Keep dry', 'Flammable', 'Fragile', 'Heavy (2-person lift)']],
  ['Compliance', ['Hazardous', 'PS/ICC certified', 'Requires SDS', 'Import permit needed']],
  ['Marketing', ['Promotional item', 'New arrival', 'Best seller', 'Clearance']],
  ['Retail', ['PH SRP to confirm', 'Pre-order', 'Activation lock check', 'Demo unit available']],
];
export const SEED_ITEM_PROPERTIES: ItemProperty[] = PROPERTY_SEED.flatMap(([g, names], gi) =>
  names.map((name, i) => {
    const number = gi * names.length + i + 1;
    return { id: `prop-${number}`, number, name, group: g, active: true };
  }),
);
/** Property id by its seed name (for seeding items). */
export const propertyId = (name: string) => SEED_ITEM_PROPERTIES.find((p) => p.name === name)!.id;

export const SEED_INVENTORY_SETTINGS: InventorySettings[] = [{ id: 'inventory', lengthUnit: 'cm', weightUnit: 'kg' }];
