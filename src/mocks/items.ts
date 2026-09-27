/**
 * Item master data. Fields follow the SAP B1 Item Master Data field map,
 * grouped by tab, localized for the Philippines (BIR VAT, PH warehouses).
 */
import type { Attachment } from './common';
import { SEED_ITEM_GROUPS, propertyId, type ItemGroup, type ValuationMethod } from './itemMasters';
import type { WithholdingCategory } from './taxes';

export type ItemType = 'Items' | 'Labor' | 'Travel';
export type ManageBy = 'None' | 'Batches' | 'Serial Numbers';
export type GlBy = 'Item Group' | 'Item Level' | 'Warehouse';
export type IssueMethod = 'Manual' | 'Backflush';
export type PlanningMethod = 'MRP' | 'MPS' | 'None';
export type ProcurementMethod = 'Buy' | 'Make';

/** Stock and replenishment settings for one warehouse (the Inventory Data grid). */
export interface ItemWarehouse {
  code: string;
  inStock: number;
  committed: number;
  ordered: number;
  preferredVendorId: string;
  defaultBin: string;
}

export interface ItemManufacturer {
  id: string;
  code: string;
  catalogNo: string;
}

export interface ItemBarcode {
  id: string;
  uom: string;
  barcode: string;
  freeText: string;
}

export interface Item {
  id: string;

  // Header
  itemNo: string;
  description: string;
  foreignName: string;
  itemType: ItemType;
  itemGroup: string;
  inventoryUom: string;
  manageBy: ManageBy;
  /** Once documents post against the item, Item No., type, UoM, tracking and valuation lock. */
  hasTransactions: boolean;

  // General
  purchaseItem: boolean;
  salesItem: boolean;
  inventoryItem: boolean;
  fixedAsset: boolean;
  valuationMethod: ValuationMethod;
  glBy: GlBy;
  inventoryAccount: string;
  cogsAccount: string;
  revenueAccount: string;
  /** Country name, '' when unknown. */
  countryOfOrigin: string;
  /** Customs group id, '' for none. */
  customsGroup: string;
  gtin: string;
  taxLiable: boolean;
  exciseTax: boolean;
  /** Excise category code (Settings › Accounting & Tax › Excise tax) when excise applies. */
  exciseCategory: string;
  validFrom: string;
  validTo: string;
  generalRemarks: string;

  // Purchasing
  defaultVendorId: string;
  /** Main manufacturer code (also the main row on the Manufacturers tab), '' for none. */
  manufacturer: string;
  purchasingUom: string;
  itemsPerPurchaseUnit: number;
  vendorItemNo: string;
  dutyPct: number;
  /** Tax group code (Settings › Accounting & Tax › Tax groups). */
  purchaseTaxGroup: string;
  /** Fixed tax code overriding the group; '' for none. */
  purchaseTaxCode: string;
  /** What buying this is for withholding tax: decides WC158 vs WC160 vs rent, etc. */
  withholdingCategory: WithholdingCategory;
  length: number;
  width: number;
  height: number;
  volume: number;
  netWeight: number;
  grossWeight: number;
  itemsPerPackage: number;
  packagesPerPallet: number;

  // Sales
  salesUom: string;
  itemsPerSalesUnit: number;
  sellingItemNo: string;
  /** Tax group code (Settings › Accounting & Tax › Tax groups). */
  salesTaxGroup: string;
  /** Fixed tax code overriding the group; '' for none. */
  salesTaxCode: string;
  /** Commission group id, '' for none. */
  commissionGroup: string;
  commissionPct: number;
  salesLeadTimeDays: number;
  /** Shipping type id, '' for none. */
  shippingType: string;
  /** Warranty template id, '' for none. */
  warrantyTemplate: string;
  /** Base selling price per sales unit (the default price list). */
  basePrice: number;

  // Inventory
  minStock: number;
  maxStock: number;
  minOrderQty: number;
  itemCost: number;
  cycleCountDays: number;
  warehouses: ItemWarehouse[];

  // Planning
  planningMethod: PlanningMethod;
  procurementMethod: ProcurementMethod;
  leadTimeDays: number;
  orderMultiple: number;
  mrpMinOrderQty: number;
  maxOrderQty: number;
  horizonDays: number;
  toleranceDays: number;

  // Production
  issueMethod: IssueMethod;
  phantom: boolean;
  /** Warehouse codes, '' for none. */
  productionWarehouse: string;
  componentWarehouse: string;
  /** Bill of Materials code; '' when none exists yet. */
  bomCode: string;

  // Properties, remarks, attachments, manufacturers, barcodes
  /** Item property ids (Settings › Inventory › Item properties). */
  properties: string[];
  remarks: string;
  foreignRemarks: string;
  attachments: Attachment[];
  manufacturers: ItemManufacturer[];
  barcodes: ItemBarcode[];
}

export const newItemWarehouse = (code: string, patch: Partial<ItemWarehouse> = {}): ItemWarehouse => ({
  code,
  inStock: 0,
  committed: 0,
  ordered: 0,
  preferredVendorId: '',
  defaultBin: '',
  ...patch,
});

const rowId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
export const newManufacturerRow = (code = ''): ItemManufacturer => ({ id: rowId('mf'), code, catalogNo: '' });
export const newBarcodeRow = (uom: string): ItemBarcode => ({ id: rowId('bc'), uom, barcode: '', freeText: '' });

/** A blank item with defaults from its group (valuation, G/L accounts). */
export function blankItem(groupOrName: ItemGroup | string = SEED_ITEM_GROUPS[0]): Omit<Item, 'id'> {
  const group =
    typeof groupOrName === 'string'
      ? (SEED_ITEM_GROUPS.find((g) => g.name === groupOrName) ?? SEED_ITEM_GROUPS[0])
      : groupOrName;
  return {
    itemNo: '',
    description: '',
    foreignName: '',
    itemType: 'Items',
    itemGroup: group.name,
    inventoryUom: 'pc',
    manageBy: 'None',
    hasTransactions: false,
    purchaseItem: true,
    salesItem: true,
    inventoryItem: true,
    fixedAsset: false,
    valuationMethod: group.valuationMethod,
    glBy: 'Item Group',
    inventoryAccount: group.inventoryAccount,
    cogsAccount: group.cogsAccount,
    revenueAccount: group.revenueAccount,
    countryOfOrigin: 'Philippines',
    customsGroup: '',
    gtin: '',
    taxLiable: true,
    exciseTax: false,
    exciseCategory: '',
    validFrom: '',
    validTo: '',
    generalRemarks: '',
    defaultVendorId: '',
    manufacturer: '',
    purchasingUom: 'pc',
    itemsPerPurchaseUnit: 1,
    vendorItemNo: '',
    dutyPct: 0,
    purchaseTaxGroup: 'P-VAT12',
    purchaseTaxCode: '',
    withholdingCategory: 'Goods',
    length: 0,
    width: 0,
    height: 0,
    volume: 0,
    netWeight: 0,
    grossWeight: 0,
    itemsPerPackage: 0,
    packagesPerPallet: 0,
    salesUom: 'pc',
    itemsPerSalesUnit: 1,
    sellingItemNo: '',
    salesTaxGroup: 'S-VAT12',
    salesTaxCode: '',
    commissionGroup: '',
    commissionPct: 0,
    salesLeadTimeDays: 0,
    shippingType: '',
    warrantyTemplate: '',
    basePrice: 0,
    minStock: 0,
    maxStock: 0,
    minOrderQty: 0,
    itemCost: 0,
    cycleCountDays: 90,
    warehouses: [newItemWarehouse('WH-MNL')],
    planningMethod: 'None',
    procurementMethod: 'Buy',
    leadTimeDays: 0,
    orderMultiple: 0,
    mrpMinOrderQty: 0,
    maxOrderQty: 0,
    horizonDays: 90,
    toleranceDays: 0,
    issueMethod: 'Manual',
    phantom: false,
    productionWarehouse: '',
    componentWarehouse: '',
    bomCode: '',
    properties: [],
    remarks: '',
    foreignRemarks: '',
    attachments: [],
    manufacturers: [],
    barcodes: [],
  };
}

/** Seed helper: a stocked item in `group` with stock spread over warehouses. */
function seed(
  id: string,
  group: string,
  patch: Partial<Item>,
  stock: Record<string, [inStock: number, committed?: number, ordered?: number]> = {},
): Item {
  const base = blankItem(group);
  const uom = patch.inventoryUom ?? base.inventoryUom;
  return {
    ...base,
    id,
    hasTransactions: true,
    purchasingUom: uom,
    salesUom: uom,
    warehouses: Object.entries(stock).map(([code, [inStock, committed = 0, ordered = 0]]) =>
      // Manila main uses bins, so stocked items there need a default bin.
      newItemWarehouse(code, { inStock, committed, ordered, defaultBin: code === 'WH-MNL' ? 'A-01-01' : '' }),
    ),
    ...patch,
    // The main manufacturer is always one of the Manufacturers tab rows.
    manufacturers:
      patch.manufacturer && !patch.manufacturers?.some((m) => m.code === patch.manufacturer)
        ? [...(patch.manufacturers ?? []), { id: `${id}-m0`, code: patch.manufacturer, catalogNo: '' }]
        : (patch.manufacturers ?? []),
  };
}

export const SEED_ITEMS: Item[] = [
  seed('itm-001', 'Fasteners', {
    itemNo: 'FST-BLT-0612', description: 'Hex bolt M6 × 12mm', foreignName: 'Perno hex M6 × 12mm', inventoryUom: 'box',
    purchasingUom: 'carton', itemsPerPurchaseUnit: 10, salesUom: 'box', basePrice: 185, itemCost: 118.5,
    defaultVendorId: 'bp-002', vendorItemNo: 'MH-B612', minStock: 50, maxStock: 400, minOrderQty: 20,
    countryOfOrigin: 'Taiwan', customsGroup: 'cg-7318', dutyPct: 5,
    gtin: '4806501234567', manufacturer: 'MFR-004', planningMethod: 'MRP', leadTimeDays: 7, orderMultiple: 10,
    netWeight: 1.2, grossWeight: 1.3, itemsPerPackage: 1, packagesPerPallet: 120,
    barcodes: [
      { id: 'itm-001-b1', uom: 'box', barcode: '4806501234567', freeText: 'EAN-13 — supplier label' },
      { id: 'itm-001-b2', uom: 'carton', barcode: '14806501234564', freeText: 'GTIN-14 — carton' },
    ],
    manufacturers: [{ id: 'itm-001-m1', code: 'MFR-004', catalogNo: 'STN-HB-M6-12' }],
    properties: [propertyId('Best seller')],
  }, { 'WH-MNL': [110, 18, 40], 'WH-CEB': [30, 4] }),
  seed('itm-002', 'Fasteners', {
    itemNo: 'FST-NUT-0600', description: 'Hex nut M6', inventoryUom: 'box', basePrice: 95, itemCost: 52,
    defaultVendorId: 'bp-002', minStock: 50, maxStock: 300, planningMethod: 'MRP', leadTimeDays: 7,
  }, { 'WH-MNL': [32, 10] }),
  seed('itm-003', 'Electrical', {
    itemNo: 'ELC-WIR-1425', description: 'THHN wire 14 AWG, 150m', inventoryUom: 'roll', basePrice: 2450, itemCost: 1890,
    defaultVendorId: 'bp-004', manufacturer: 'MFR-001', minStock: 10, maxStock: 60,
    customsGroup: 'cg-8544', properties: [propertyId('PS/ICC certified')],
    manufacturers: [{ id: 'itm-003-m1', code: 'MFR-001', catalogNo: 'PD-THHN-14-150' }],
  }, { 'WH-MNL': [12, 2, 10], 'WH-CEB': [6] }),
  seed('itm-004', 'Electrical', {
    itemNo: 'ELC-BRK-2030', description: 'Circuit breaker 30A, 2-pole', inventoryUom: 'pc', basePrice: 540, itemCost: 355,
    defaultVendorId: 'bp-004', manufacturer: 'MFR-005', minStock: 12, maxStock: 80, properties: [propertyId('PS/ICC certified')],
  }, { 'WH-MNL': [6, 3] }),
  seed('itm-005', 'Plumbing', {
    itemNo: 'PLB-PVC-0050', description: 'PVC pipe ½" × 3m', inventoryUom: 'pc', basePrice: 48, itemCost: 29,
    defaultVendorId: 'bp-008', manufacturer: 'MFR-003', minStock: 100, maxStock: 800, customsGroup: 'cg-3917',
    length: 300, width: 2.1, height: 2.1,
  }, { 'WH-MNL': [320, 40], 'WH-DVO': [100] }),
  seed('itm-006', 'Plumbing', {
    itemNo: 'PLB-ELB-0050', description: 'PVC elbow ½"', inventoryUom: 'pc', basePrice: 12, itemCost: 5.5,
    defaultVendorId: 'bp-008', minStock: 40, maxStock: 500,
  }, { 'WH-MNL': [0, 25, 200] }),
  seed('itm-007', 'Hardware', {
    itemNo: 'HRD-HNG-0304', description: 'Butt hinge 3" × 4"', inventoryUom: 'pc', basePrice: 65, itemCost: 38,
    minStock: 30, maxStock: 200,
  }, { 'WH-MNL': [75] }),
  seed('itm-008', 'Hardware', {
    itemNo: 'HRD-LCK-0100', description: 'Cylindrical lockset', inventoryUom: 'pc', basePrice: 890, itemCost: 610,
    manufacturer: 'MFR-004', minStock: 10, maxStock: 60, warrantyTemplate: 'wr-6p',
  }, { 'WH-MNL': [9, 1], 'WH-CEB': [5] }),
  seed('itm-009', 'Paint', {
    itemNo: 'PNT-LTX-WHT4', description: 'Latex paint, white 4L', inventoryUom: 'gal', basePrice: 720, itemCost: 505,
    defaultVendorId: 'bp-006', manufacturer: 'MFR-002', manageBy: 'Batches', minStock: 15, maxStock: 120,
    customsGroup: 'cg-3208', properties: [propertyId('Keep dry'), propertyId('Requires SDS')],
    remarks: 'Store below 30°C. Stack max 4 high.',
  }, { 'WH-MNL': [22, 6] }),
  seed('itm-010', 'Paint', {
    itemNo: 'PNT-PRM-GRY4', description: 'Metal primer, grey 4L', inventoryUom: 'gal', basePrice: 680, itemCost: 470,
    defaultVendorId: 'bp-006', manufacturer: 'MFR-002', manageBy: 'Batches', minStock: 10, maxStock: 80,
    properties: [propertyId('Flammable'), propertyId('Requires SDS')],
  }, { 'WH-MNL': [9] }),
  seed('itm-011', 'Fasteners', {
    itemNo: 'FST-SCR-0425', description: 'Wood screw #8 × 1"', inventoryUom: 'box', basePrice: 150, itemCost: 88,
    defaultVendorId: 'bp-002', minStock: 60, maxStock: 400,
  }, { 'WH-MNL': [180], 'WH-CEB': [30] }),
  seed('itm-012', 'Electrical', {
    itemNo: 'ELC-OUT-0002', description: 'Duplex outlet', inventoryUom: 'pc', basePrice: 120, itemCost: 64,
    minStock: 25, validTo: '2026-06-30', generalRemarks: 'Discontinued — use ELC-OUT-0003 (with USB) from 2026-Q3.',
  }, { 'WH-MNL': [55] }),
  seed('itm-013', 'Raw Materials', {
    itemNo: 'RM-PVC-RSN', description: 'PVC resin, 25kg bag', inventoryUom: 'kg', purchasingUom: 'pack', itemsPerPurchaseUnit: 25,
    salesItem: false, basePrice: 0, itemCost: 62, manageBy: 'Batches', defaultVendorId: 'bp-003', countryOfOrigin: 'China',
    minStock: 500, maxStock: 5000, planningMethod: 'MRP', leadTimeDays: 21, mrpMinOrderQty: 1000, orderMultiple: 25,
    issueMethod: 'Backflush',
  }, { 'WH-PRD': [750, 300, 1000] }),
  seed('itm-014', 'Finished Goods', {
    itemNo: 'FG-KIT-PVC01', description: 'Pre-cut PVC plumbing kit', inventoryUom: 'set', purchaseItem: false,
    basePrice: 1450, itemCost: 980, planningMethod: 'MRP', procurementMethod: 'Make', leadTimeDays: 3,
    productionWarehouse: 'WH-PRD', componentWarehouse: 'WH-MNL', bomCode: '', minStock: 20, maxStock: 150,
    generalRemarks: 'Bill of Materials still to be set up in Manufacturing.',
  }, { 'WH-MNL': [14, 8] }),
  seed('itm-015', 'Hardware', {
    itemNo: 'HRD-GEN-5KVA', description: 'Portable generator 5kVA', inventoryUom: 'pc', manageBy: 'Serial Numbers',
    basePrice: 38500, itemCost: 29800, warrantyTemplate: 'wr-1pl', countryOfOrigin: 'Japan',
    minStock: 2, maxStock: 10, netWeight: 68, grossWeight: 75, properties: [propertyId('Heavy (2-person lift)')],
  }, { 'WH-MNL': [3, 1, 2] }),
  seed('itm-016', 'Services', {
    itemNo: 'SVC-INS-HR', description: 'Installation labor', itemType: 'Labor', inventoryUom: 'hour', purchaseItem: false,
    purchaseTaxGroup: 'P-VAT12S',
    withholdingCategory: 'Services',
    inventoryItem: false, basePrice: 450, commissionGroup: 'cm-std', cycleCountDays: 0, warehouses: [],
  }),
  seed('itm-017', 'Services', {
    itemNo: 'SVC-DLV-TRIP', description: 'Delivery trip (Metro Manila)', itemType: 'Travel', inventoryUom: 'trip',
    purchaseItem: false, inventoryItem: false, basePrice: 1200, cycleCountDays: 0, warehouses: [],
    purchaseTaxGroup: 'P-VAT12S', withholdingCategory: 'Services',
  }),
  seed('itm-018', 'Services', {
    itemNo: 'SVC-RNT-FORK', description: 'Forklift rental (per day)', itemType: 'Items', inventoryUom: 'pc', purchasingUom: 'pc',
    salesItem: false, inventoryItem: false, purchaseTaxGroup: 'P-VAT12S', withholdingCategory: 'Rent', warehouses: [],
    cycleCountDays: 0, hasTransactions: false,
  }),
  seed('itm-019', 'Services', {
    itemNo: 'SVC-SUB-INST', description: 'Installation subcontract', itemType: 'Labor', inventoryUom: 'hour', purchasingUom: 'hour',
    salesItem: false, inventoryItem: false, purchaseTaxGroup: 'P-VAT12S', withholdingCategory: 'Contractor', warehouses: [],
    cycleCountDays: 0, hasTransactions: false,
  }),
  seed('itm-020', 'Services', {
    itemNo: 'SVC-CLD-HOST', description: 'Cloud hosting subscription (monthly)', itemType: 'Items', inventoryUom: 'pc',
    purchasingUom: 'pc', salesItem: false, inventoryItem: false, purchaseTaxGroup: 'P-VAT12S', withholdingCategory: 'Services',
    defaultVendorId: 'bp-015', warehouses: [], cycleCountDays: 0, hasTransactions: false,
  }),
];
