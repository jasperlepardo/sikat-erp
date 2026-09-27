/**
 * Inventory master data behind the item master: item groups, units of measure,
 * warehouses and bins, manufacturers, customs / commission groups, shipping
 * types, warranty templates, item properties and inventory settings.
 * Seeds only — the app edits them in Settings › Inventory and Inventory ›
 * Warehouses & Bins (services/inventoryMasters.ts).
 */

export type ValuationMethod = 'Moving Average' | 'FIFO' | 'Standard Price' | 'Serial/Batch';

/** Fixed system lists (not master data). */
export const ITEM_TYPES = ['Items', 'Labor', 'Travel'] as const;
export const MANAGE_BY = ['None', 'Batches', 'Serial Numbers'] as const;
export const VALUATION_METHODS: ValuationMethod[] = ['Moving Average', 'FIFO', 'Standard Price', 'Serial/Batch'];
export const GL_BY = ['Item Group', 'Item Level', 'Warehouse'] as const;
export const ISSUE_METHODS = ['Manual', 'Backflush'] as const;
export const PLANNING_METHODS = ['MRP', 'MPS', 'None'] as const;
export const PROCUREMENT_METHODS = ['Buy', 'Make'] as const;

export const INVENTORY_ACCOUNTS = ['1310 Inventory – Merchandise', '1320 Inventory – Raw Materials', '1330 Inventory – Finished Goods', '— None —'];
export const COGS_ACCOUNTS = ['5010 COGS – Merchandise', '5020 COGS – Manufactured', '5030 Cost of Services'];
export const REVENUE_ACCOUNTS = ['4010 Sales – Merchandise', '4020 Sales – Manufactured', '4030 Service Revenue', '2150 Gift certificates outstanding'];

export interface ItemGroup {
  id: string;
  name: string;
  /** Item No. prefix for the group's numbering series, e.g. FST-00001. */
  prefix: string;
  valuationMethod: ValuationMethod;
  inventoryAccount: string;
  cogsAccount: string;
  revenueAccount: string;
  active: boolean;
}

export interface UnitOfMeasure {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  city: string;
  binEnabled: boolean;
  bins: string[];
  active: boolean;
}

export interface Manufacturer {
  id: string;
  code: string;
  name: string;
  country: string;
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

const group = (
  name: string, prefix: string, valuationMethod: ValuationMethod,
  inventoryAccount: string, cogsAccount: string, revenueAccount: string,
): ItemGroup => ({ id: `ig-${prefix}`, name, prefix, valuationMethod, inventoryAccount, cogsAccount, revenueAccount, active: true });

const MERCH = ['1310 Inventory – Merchandise', '5010 COGS – Merchandise', '4010 Sales – Merchandise'] as const;
export const SEED_ITEM_GROUPS: ItemGroup[] = [
  // Apple Premium Reseller catalog (mocks/appleCatalog.ts).
  group('iPhone', 'IPH', 'Serial/Batch', ...MERCH),
  group('iPad', 'IPD', 'Serial/Batch', ...MERCH),
  group('Mac', 'MAC', 'Serial/Batch', ...MERCH),
  group('Apple Watch', 'AW', 'Serial/Batch', ...MERCH),
  group('AirPods', 'APD', 'Serial/Batch', ...MERCH),
  group('Home & TV', 'HOM', 'Serial/Batch', ...MERCH),
  group('Accessories', 'ACC', 'Moving Average', ...MERCH),
  group('AppleCare', 'ACP', 'Moving Average', '— None —', '5030 Cost of Services', '4030 Service Revenue'),
  group('Gift Certificates', 'GC', 'Moving Average', '— None —', '5030 Cost of Services', '2150 Gift certificates outstanding'),
  group('Services', 'SVC', 'Moving Average', '— None —', '5030 Cost of Services', '4030 Service Revenue'),
];

const uom = (code: string, name: string): UnitOfMeasure => ({ id: `uom-${code}`, code, name, active: true });
export const SEED_UOMS: UnitOfMeasure[] = [
  uom('pc', 'Piece'), uom('box', 'Box'), uom('carton', 'Carton'), uom('pack', 'Pack'), uom('roll', 'Roll'),
  uom('m', 'Meter'), uom('ft', 'Foot'), uom('kg', 'Kilogram'), uom('L', 'Liter'), uom('gal', 'Gallon'),
  uom('set', 'Set'), uom('pail', 'Pail'), uom('hour', 'Hour'), uom('trip', 'Trip'), uom('plan', 'Plan'),
];

export const SEED_WAREHOUSES: Warehouse[] = [
  { id: 'wh-MNL', code: 'WH-MNL', name: 'Manila distribution center', city: 'Pasig', binEnabled: true, bins: ['A-01-01', 'A-01-02', 'A-02-01', 'B-01-01', 'B-02-03', 'C-01-01'], active: true },
  { id: 'wh-CEB', code: 'WH-CEB', name: 'Cebu store', city: 'Cebu City', binEnabled: false, bins: [], active: true },
  { id: 'wh-DVO', code: 'WH-DVO', name: 'Davao store', city: 'Davao City', binEnabled: false, bins: [], active: true },
  { id: 'wh-PRD', code: 'WH-PRD', name: 'Service center (repairs)', city: 'Makati', binEnabled: false, bins: [], active: true },
];

const mfr = (code: string, name: string, country: string, contactPerson = '', email = '', phone = ''): Manufacturer => ({
  id: `mfr-${code}`, code, name, country, contactPerson, email, phone, active: true,
});
export const SEED_MANUFACTURERS: Manufacturer[] = [
  mfr('MFR-APL', 'Apple Inc.', 'United States'),
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
