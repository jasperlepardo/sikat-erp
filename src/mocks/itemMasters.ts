/**
 * Master data behind the item master dropdowns. In the real product these are
 * Settings › Inventory lists; here they're fixed so the prototype has real choices.
 */

export type ValuationMethod = 'Moving Average' | 'FIFO' | 'Standard Price' | 'Serial/Batch';

export interface ItemGroup {
  name: string;
  /** Item No. prefix for the numbering series, e.g. FST-00001. */
  prefix: string;
  valuationMethod: ValuationMethod;
  inventoryAccount: string;
  cogsAccount: string;
  revenueAccount: string;
}

export const ITEM_GROUPS: ItemGroup[] = [
  { name: 'Fasteners', prefix: 'FST', valuationMethod: 'Moving Average', inventoryAccount: '1310 Inventory – Merchandise', cogsAccount: '5010 COGS – Merchandise', revenueAccount: '4010 Sales – Merchandise' },
  { name: 'Electrical', prefix: 'ELC', valuationMethod: 'Moving Average', inventoryAccount: '1310 Inventory – Merchandise', cogsAccount: '5010 COGS – Merchandise', revenueAccount: '4010 Sales – Merchandise' },
  { name: 'Plumbing', prefix: 'PLB', valuationMethod: 'Moving Average', inventoryAccount: '1310 Inventory – Merchandise', cogsAccount: '5010 COGS – Merchandise', revenueAccount: '4010 Sales – Merchandise' },
  { name: 'Hardware', prefix: 'HRD', valuationMethod: 'FIFO', inventoryAccount: '1310 Inventory – Merchandise', cogsAccount: '5010 COGS – Merchandise', revenueAccount: '4010 Sales – Merchandise' },
  { name: 'Paint', prefix: 'PNT', valuationMethod: 'FIFO', inventoryAccount: '1310 Inventory – Merchandise', cogsAccount: '5010 COGS – Merchandise', revenueAccount: '4010 Sales – Merchandise' },
  { name: 'Raw Materials', prefix: 'RM', valuationMethod: 'Standard Price', inventoryAccount: '1320 Inventory – Raw Materials', cogsAccount: '5020 COGS – Manufactured', revenueAccount: '4020 Sales – Manufactured' },
  { name: 'Finished Goods', prefix: 'FG', valuationMethod: 'Standard Price', inventoryAccount: '1330 Inventory – Finished Goods', cogsAccount: '5020 COGS – Manufactured', revenueAccount: '4020 Sales – Manufactured' },
  { name: 'Services', prefix: 'SVC', valuationMethod: 'Moving Average', inventoryAccount: '— None —', cogsAccount: '5030 Cost of Services', revenueAccount: '4030 Service Revenue' },
];

export const INVENTORY_ACCOUNTS = ['1310 Inventory – Merchandise', '1320 Inventory – Raw Materials', '1330 Inventory – Finished Goods', '— None —'];
export const COGS_ACCOUNTS = ['5010 COGS – Merchandise', '5020 COGS – Manufactured', '5030 Cost of Services'];
export const REVENUE_ACCOUNTS = ['4010 Sales – Merchandise', '4020 Sales – Manufactured', '4030 Service Revenue'];

export const ITEM_TYPES = ['Items', 'Labor', 'Travel'] as const;
export const MANAGE_BY = ['None', 'Batches', 'Serial Numbers'] as const;
export const VALUATION_METHODS: ValuationMethod[] = ['Moving Average', 'FIFO', 'Standard Price', 'Serial/Batch'];
export const GL_BY = ['Item Group', 'Item Level', 'Warehouse'] as const;
export const ISSUE_METHODS = ['Manual', 'Backflush'] as const;
export const PLANNING_METHODS = ['MRP', 'MPS', 'None'] as const;
export const PROCUREMENT_METHODS = ['Buy', 'Make'] as const;

export const UOMS = ['pc', 'box', 'carton', 'pack', 'roll', 'm', 'ft', 'kg', 'L', 'gal', 'set', 'pail', 'hour', 'trip'];

export const COUNTRIES_OF_ORIGIN = ['— None —', 'Philippines', 'China', 'Japan', 'South Korea', 'Taiwan', 'Vietnam', 'Thailand', 'Malaysia', 'United States', 'Germany'];
export const CUSTOMS_GROUPS = [
  { name: '— None —', duty: 0 },
  { name: 'Fasteners & fittings (HS 7318)', duty: 5 },
  { name: 'Electrical wire & cable (HS 8544)', duty: 7 },
  { name: 'Paints & coatings (HS 3208)', duty: 10 },
  { name: 'Plastic pipes (HS 3917)', duty: 10 },
];

export const PURCHASE_TAX_GROUPS = ['VAT 12% – Input', 'VAT 12% – Input (Capital goods)', 'VAT-exempt purchase', 'Zero-rated purchase'];
export const SALES_TAX_GROUPS = ['VAT 12% – Output', 'VAT-exempt sale', 'Zero-rated sale (export)'];
export const PURCHASE_TAX_CODES = ['— None —', 'IV12 – Input VAT 12%', 'IVX – VAT-exempt', 'IV0 – Zero-rated'];
export const SALES_TAX_CODES = ['— None —', 'OV12 – Output VAT 12%', 'OVX – VAT-exempt', 'OV0 – Zero-rated'];

export const MANUFACTURERS = [
  { code: '— None —', name: '' },
  { code: 'MFR-001', name: 'Phelps Dodge Philippines' },
  { code: 'MFR-002', name: 'Boysen Paints (Pacific Paint)' },
  { code: 'MFR-003', name: 'Neltex Development Co.' },
  { code: 'MFR-004', name: 'Stanley Black & Decker' },
  { code: 'MFR-005', name: 'Schneider Electric' },
  { code: 'MFR-006', name: 'Luzon Steel Industries' },
];
export const manufacturerLabel = (code: string) => {
  const m = MANUFACTURERS.find((x) => x.code === code);
  return m && m.name ? `${m.code} · ${m.name}` : '— None —';
};

export const COMMISSION_GROUPS = ['— None —', 'Standard (2%)', 'High margin (4%)', 'Project sales (1%)'];
export const SHIPPING_TYPES = ['— None —', 'Pick-up', 'Own delivery', 'LBC', 'J&T Express', 'Lalamove', 'Sea freight'];
export const WARRANTY_TEMPLATES = ['— None —', '6 months – parts', '1 year – parts & labor', '2 years – manufacturer'];

export const PROPERTY_GROUPS: { group: string; labels: string[] }[] = [
  { group: 'Storage requirements', labels: ['Keep dry', 'Flammable', 'Fragile', 'Heavy (2-person lift)'] },
  { group: 'Compliance', labels: ['Hazardous', 'PS/ICC certified', 'Requires SDS', 'Import permit needed'] },
  { group: 'Marketing', labels: ['Promotional item', 'New arrival', 'Best seller', 'Clearance'] },
];

export interface Warehouse {
  code: string;
  name: string;
  binEnabled: boolean;
  bins: string[];
}

export const WAREHOUSES: Warehouse[] = [
  { code: 'WH-MNL', name: 'Manila main', binEnabled: true, bins: ['A-01-01', 'A-01-02', 'A-02-01', 'B-01-01', 'B-02-03', 'C-01-01'] },
  { code: 'WH-CEB', name: 'Cebu branch', binEnabled: false, bins: [] },
  { code: 'WH-DVO', name: 'Davao branch', binEnabled: false, bins: [] },
  { code: 'WH-PRD', name: 'Production floor', binEnabled: false, bins: [] },
];
export const warehouseLabel = (code: string) => {
  const w = WAREHOUSES.find((x) => x.code === code);
  return w ? `${w.code} · ${w.name}` : '— None —';
};
