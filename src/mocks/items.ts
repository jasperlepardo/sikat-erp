/**
 * Item master data. Fields follow the SAP B1 Item Master Data field map,
 * grouped by tab, localized for the Philippines (BIR VAT, PH warehouses).
 * The seed is an Apple Premium Reseller's catalog (mocks/appleCatalog.ts).
 */
import type { Attachment } from './common';
import { SEED_ITEM_GROUPS, propertyId, type ItemGroup, type ValuationMethod } from './itemMasters';
import type { WithholdingCategory } from './taxes';
import { expandCatalog } from './appleCatalog';

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
    countryOfOrigin: '',
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

const APPLE_VENDOR = 'bp-016';

const CUSTOMS_BY_GROUP: Record<string, string> = {
  iPhone: 'cg-8517', 'Apple Watch': 'cg-8517', iPad: 'cg-8471', Mac: 'cg-8471', AirPods: 'cg-8518', 'Home & TV': 'cg-8528',
};
const ACCESSORY_CUSTOMS: [RegExp, string][] = [
  [/^ACC-(PWR|MAGSF)/, 'cg-8504'], [/^ACC-(CBL|USBC)/, 'cg-8544'], [/^ACC-(CASE|SPBAND)/, 'cg-4202'],
];

/** Small deterministic hash so seeded stock looks varied but never changes between reloads. */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const prefixOf = (group: string) => SEED_ITEM_GROUPS.find((g) => g.name === group)!.prefix;
const TODAY = '2026-09-27';

/** One flat item per Apple configuration. */
const APPLE_ITEMS: Item[] = expandCatalog(prefixOf).map((e, n) => {
  const { family } = e;
  const h = hash(e.itemNo);
  const preOrder = !!family.validFrom && family.validFrom > TODAY;
  const accessory = family.group === 'Accessories';
  // Accessories carry more units; pre-order items have stock on order only.
  const scale = accessory ? 4 : 1;
  const mnl = preOrder ? 0 : (h % 9) * scale;
  const ceb = preOrder ? 0 : ((h >>> 4) % 4) * scale;
  const dvo = preOrder ? 0 : ((h >>> 8) % 3) * scale;
  return seed(`apl-${String(n + 1).padStart(4, '0')}`, family.group, {
    itemNo: e.itemNo,
    description: e.description,
    manageBy: family.serial ? 'Serial Numbers' : 'None',
    countryOfOrigin: '',
    customsGroup: CUSTOMS_BY_GROUP[family.group] ?? ACCESSORY_CUSTOMS.find(([re]) => re.test(e.itemNo))?.[1] ?? '',
    defaultVendorId: APPLE_VENDOR,
    manufacturer: 'MFR-APL',
    warrantyTemplate: 'wr-apl1',
    basePrice: e.price,
    // Demo assumption: reseller cost ≈ 88% of the VAT-exclusive SRP.
    itemCost: Math.round((e.price / 1.12) * 0.88),
    commissionGroup: accessory ? 'cm-high' : 'cm-std',
    validFrom: family.validFrom ?? '',
    netWeight: family.weightKg ?? 0,
    grossWeight: family.weightKg ? Math.round(family.weightKg * 1.4 * 100) / 100 : 0,
    minStock: accessory ? 4 : 1,
    maxStock: accessory ? 60 : 15,
    minOrderQty: accessory ? 10 : 1,
    planningMethod: 'MRP',
    leadTimeDays: 7,
    hasTransactions: !preOrder,
    properties: [
      ...(e.estimated ? [propertyId('PH SRP to confirm')] : []),
      ...(preOrder ? [propertyId('Pre-order')] : []),
      ...(family.group === 'iPhone' || family.group === 'iPad' || family.group === 'Apple Watch' ? [propertyId('Activation lock check')] : []),
      ...(!accessory && h % 5 === 0 ? [propertyId('Demo unit available')] : []),
    ],
    remarks: [
      family.remarks,
      e.estimated ? 'Price estimated from the US price — confirm against the Apple PH SRP.' : 'Price: Apple PH SRP (VAT inclusive).',
    ].filter(Boolean).join('\n'),
  }, {
    'WH-MNL': [mnl, mnl > 2 ? h % 2 : 0, preOrder ? 20 : (h >>> 12) % 2 ? 5 * scale : 0],
    'WH-CEB': [ceb],
    'WH-DVO': [dvo],
  });
});

/** Non-stock sales items: AppleCare plans and store gift certificates. */
const service = (id: string, group: string, patch: Partial<Item>): Item =>
  seed(id, group, {
    itemType: 'Items', inventoryUom: 'plan', purchasingUom: 'plan', salesUom: 'plan', inventoryItem: false, purchaseItem: false,
    purchaseTaxGroup: 'P-VAT12S', withholdingCategory: 'Services', warehouses: [], cycleCountDays: 0, planningMethod: 'None',
    ...patch,
  });

const APPLECARE: Item[] = ([
  ['IPH', 'iPhone', 12990], ['IPD', 'iPad', 5990], ['MAC', 'Mac', 15990], ['AW', 'Apple Watch', 4990], ['APD', 'AirPods', 1990],
] as const).map(([code, product, price], n) =>
  service(`acp-${String(n + 1).padStart(3, '0')}`, 'AppleCare', {
    itemNo: `ACP-${code}-2Y`, description: `AppleCare+ for ${product} (2 years)`, basePrice: price, commissionGroup: 'cm-high',
    purchaseItem: true, defaultVendorId: APPLE_VENDOR, properties: [propertyId('PH SRP to confirm')],
    remarks: 'Sold with a serial-tracked device; the plan registers against that serial. Confirm AppleCare+ availability and pricing for PH.',
  }),
);

/** Appends the EAN-13 check digit to 12 digits. */
const ean13 = (d12: string) =>
  d12 + ((10 - ([...d12].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10)) % 10);

const GIFT_CERTIFICATES: Item[] = [1000, 5000, 10000].map((amount, n) =>
  service(`gc-${String(n + 1).padStart(3, '0')}`, 'Gift Certificates', {
    itemNo: `GC-${amount / 1000}K`, description: `Store gift certificate ₱${amount.toLocaleString('en-PH')}`, inventoryUom: 'pc',
    purchasingUom: 'pc', salesUom: 'pc', basePrice: amount, taxLiable: false,
    // EAN-13 with a 2xx prefix: reserved for in-store numbering, so it can't clash with a GS1 product code.
    barcodes: [{ id: `gc-${n + 1}-b1`, uom: 'pc', barcode: ean13(`20000000${String(amount / 1000).padStart(4, '0')}`), freeText: 'In-store code' }],
    generalRemarks: 'Our own gift certificate. Selling one is a liability, not a sale: VAT applies when it is redeemed against goods.',
  }),
);

export const SEED_ITEMS: Item[] = [
  ...APPLE_ITEMS,
  ...APPLECARE,
  ...GIFT_CERTIFICATES,
  // Services the store sells or buys. Their ids stay stable: the tax rules tester and tests use them.
  seed('itm-016', 'Services', {
    itemNo: 'SVC-SETUP', description: 'Device setup & data transfer', itemType: 'Labor', inventoryUom: 'hour', purchaseItem: false,
    purchaseTaxGroup: 'P-VAT12S', withholdingCategory: 'Services',
    inventoryItem: false, basePrice: 990, commissionGroup: 'cm-std', cycleCountDays: 0, warehouses: [],
  }),
  seed('itm-017', 'Services', {
    itemNo: 'SVC-DLV-TRIP', description: 'Same-day delivery (Metro Manila)', itemType: 'Travel', inventoryUom: 'trip',
    purchaseItem: false, inventoryItem: false, basePrice: 350, cycleCountDays: 0, warehouses: [],
    purchaseTaxGroup: 'P-VAT12S', withholdingCategory: 'Services',
  }),
  seed('itm-018', 'Services', {
    itemNo: 'SVC-RNT-MALL', description: 'Mall store space rent (monthly)', itemType: 'Items', inventoryUom: 'pc', purchasingUom: 'pc',
    salesItem: false, inventoryItem: false, purchaseTaxGroup: 'P-VAT12S', withholdingCategory: 'Rent', warehouses: [],
    cycleCountDays: 0, hasTransactions: false,
  }),
  seed('itm-019', 'Services', {
    itemNo: 'SVC-SUB-FITOUT', description: 'Store fit-out subcontract', itemType: 'Labor', inventoryUom: 'hour', purchasingUom: 'hour',
    salesItem: false, inventoryItem: false, purchaseTaxGroup: 'P-VAT12S', withholdingCategory: 'Contractor', warehouses: [],
    cycleCountDays: 0, hasTransactions: false,
  }),
  seed('itm-020', 'Services', {
    itemNo: 'SVC-CLD-HOST', description: 'Cloud hosting subscription (monthly)', itemType: 'Items', inventoryUom: 'pc',
    purchasingUom: 'pc', salesItem: false, inventoryItem: false, purchaseTaxGroup: 'P-VAT12S', withholdingCategory: 'Services',
    defaultVendorId: 'bp-015', warehouses: [], cycleCountDays: 0, hasTransactions: false,
  }),
];
