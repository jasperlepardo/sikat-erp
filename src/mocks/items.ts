/**
 * Item master data. Fields follow the SAP B1 Item Master Data field map,
 * grouped by tab, localized for the Philippines (BIR VAT, PH warehouses).
 * The seed is an Apple Premium Reseller's catalog (mocks/appleCatalog.ts).
 */
import type { Attachment } from './common';
import { SEED_ITEM_GROUPS, SEED_UOM_GROUPS, groupUoms, propertyId, uomFactor, type ItemGroup, type UomGroup, type ValuationMethod } from './itemMasters';
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

/** A vendor the item can be bought from, with that vendor's own part number. */
export interface ItemVendor {
  id: string;
  vendorId: string;
  /** The vendor's part number (BP catalog no.), for matching their invoices. */
  vendorItemNo: string;
}

/**
 * One unit the item is counted, bought or sold in, and how many inventory units it holds
 * (box = 24 pc). The inventory UoM is always one of them, with qty 1.
 */
export interface ItemUom {
  id: string;
  /** Unit code (Settings › Inventory › Units of measure). */
  uom: string;
  /** Inventory units in one of this unit. */
  qty: number;
  /** Can be picked on purchase documents. */
  purchase: boolean;
  /** Can be picked on sales documents. */
  sales: boolean;
  /** Selling price for one of this unit (VAT inclusive), overriding qty × base price; 0 to derive it. */
  price: number;
  /** Dimensions and weights of one of this unit, in the company's length / weight units. */
  length: number;
  width: number;
  height: number;
  volume: number;
  netWeight: number;
  grossWeight: number;
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
  /** Unit stock is kept in; always one of `uoms`, with qty 1. */
  inventoryUom: string;
  /** Every unit the item uses, with its conversion to the inventory UoM. */
  uoms: ItemUom[];
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
  /** Default vendor id (also the main one of the item's vendors), '' for none. */
  defaultVendorId: string;
  /** Main manufacturer code (also the main one of the item's manufacturers), '' for none. */
  manufacturer: string;
  /** Default unit on purchase documents; one of `uoms`. */
  purchasingUom: string;
  dutyPct: number;
  /** Tax group code (Settings › Accounting & Tax › Tax groups). */
  purchaseTaxGroup: string;
  /** Fixed tax code overriding the group; '' for none. */
  purchaseTaxCode: string;
  /** Withholding group code (Settings › Accounting & Tax › Withholding groups). */
  withholdingGroup: string;

  // Sales
  /** Default unit on sales documents; one of `uoms`. */
  salesUom: string;
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
  /** Base selling price per inventory unit (VAT inclusive); other units derive from it unless they set their own. */
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
  vendors: ItemVendor[];
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
export const newVendorRow = (vendorId = ''): ItemVendor => ({ id: rowId('vd'), vendorId, vendorItemNo: '' });
export const newBarcodeRow = (uom: string): ItemBarcode => ({ id: rowId('bc'), uom, barcode: '', freeText: '' });

export const newItemUom = (uom = '', patch: Partial<ItemUom> = {}): ItemUom => ({
  id: rowId('uom'),
  uom,
  qty: 1,
  purchase: true,
  sales: true,
  price: 0,
  length: 0,
  width: 0,
  height: 0,
  volume: 0,
  netWeight: 0,
  grossWeight: 0,
  ...patch,
});

type ItemUoms = Pick<Item, 'inventoryUom' | 'uoms'>;

/** Inventory units in one `uom` of the item (box → 24), or undefined when the item doesn't use that unit. */
export const itemsPerUom = (item: ItemUoms, uom: string): number | undefined =>
  uom === item.inventoryUom ? 1 : item.uoms.find((u) => u.uom === uom)?.qty || undefined;

/** The item's units usable on purchase or sales documents, inventory UoM first. */
export const itemUnits = (item: ItemUoms, use?: 'purchase' | 'sales') =>
  item.uoms.filter((u) => !use || u[use] || u.uom === item.inventoryUom);

/** Selling price of one `uom` (VAT inclusive): the unit's own price, else qty × base price. */
export function unitPrice(item: ItemUoms & Pick<Item, 'basePrice'>, uom: string): number {
  const u = item.uoms.find((x) => x.uom === uom);
  return u?.price || Math.round(item.basePrice * (itemsPerUom(item, uom) ?? 1) * 100) / 100;
}

/** Cost of one `uom`: item cost (per inventory unit) × qty. */
export const unitCost = (item: ItemUoms & Pick<Item, 'itemCost'>, uom: string) =>
  Math.round(item.itemCost * (itemsPerUom(item, uom) ?? 1) * 100) / 100;

/** "1 box = 24 pc", for hints and cards. */
export const uomSummary = (item: ItemUoms, uom: string) => {
  const qty = itemsPerUom(item, uom);
  return uom === item.inventoryUom ? `${uom} (inventory unit)` : qty ? `1 ${uom} = ${qty} ${item.inventoryUom}` : uom;
};

/**
 * Makes the inventory UoM a unit of the item with qty 1 (renaming the old inventory row, so
 * its dimensions stay), and moves default purchasing / sales units it no longer has onto it.
 */
export function withInventoryUom<T extends ItemUoms & Pick<Item, 'purchasingUom' | 'salesUom'>>(item: T, inventoryUom: string): T {
  const base = item.uoms.find((u) => u.uom === item.inventoryUom) ?? newItemUom();
  const uoms = [{ ...base, uom: inventoryUom, qty: 1 }, ...item.uoms.filter((u) => u !== base && u.uom !== inventoryUom)];
  const keep = (uom: string) => (uoms.some((u) => u.uom === uom) ? uom : inventoryUom);
  return { ...item, inventoryUom, uoms, purchasingUom: keep(item.purchasingUom), salesUom: keep(item.salesUom) };
}

/**
 * The units of a UoM group (Settings › Inventory › UoM groups), converted to the item's
 * inventory UoM, that the item doesn't have yet. Empty when the group lacks the inventory UoM.
 */
export function unitsFromGroup(item: ItemUoms, g: UomGroup): ItemUom[] {
  const units = groupUoms(g);
  if (!units.includes(item.inventoryUom)) return [];
  return units
    .filter((u) => !item.uoms.some((x) => x.uom === u))
    .map((u) => newItemUom(u, { qty: uomFactor(g, u, item.inventoryUom) ?? 1 }));
}

/** A blank item with defaults from its group (valuation, G/L accounts, tax). */
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
    uoms: [newItemUom('pc')],
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
    exciseTax: !!group.exciseCategory,
    exciseCategory: group.exciseCategory,
    validFrom: '',
    validTo: '',
    generalRemarks: '',
    defaultVendorId: '',
    manufacturer: '',
    purchasingUom: 'pc',
    dutyPct: 0,
    purchaseTaxGroup: group.purchaseTaxGroup || 'P-VAT12',
    purchaseTaxCode: '',
    withholdingGroup: group.withholdingGroup,
    salesUom: 'pc',
    sellingItemNo: '',
    salesTaxGroup: group.salesTaxGroup || 'S-VAT12',
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
    vendors: [],
    manufacturers: [],
    barcodes: [],
  };
}

/** Seed helper: a stocked item in `group` with stock spread over warehouses. */
function seed(
  id: string,
  group: string,
  patch: Partial<Item> & { uomGroup?: string; weightKg?: number },
  stock: Record<string, [inStock: number, committed?: number, ordered?: number]> = {},
): Item {
  const { uomGroup, weightKg, ...rest } = patch;
  const base = blankItem(group);
  const uom = patch.inventoryUom ?? base.inventoryUom;
  // The inventory unit (with its weight), plus the other units of a UoM group when given.
  const own = { inventoryUom: uom, uoms: [newItemUom(uom, { id: `${id}-u0`, ...seedWeight(weightKg) })] };
  const g = SEED_UOM_GROUPS.find((x) => x.code === uomGroup);
  const uoms = g ? [...own.uoms, ...unitsFromGroup(own, g).map((u, n) => ({ ...u, id: `${id}-u${n + 1}` }))] : own.uoms;
  // Demo of a unit's own price: a sealed box sells at 10% off its pieces.
  const box = uoms.find((u) => u.uom === 'box');
  if (box && rest.basePrice) box.price = Math.round(rest.basePrice * box.qty * 0.9);
  return {
    ...base,
    id,
    hasTransactions: true,
    purchasingUom: uom,
    salesUom: uom,
    uoms,
    warehouses: Object.entries(stock).map(([code, [inStock, committed = 0, ordered = 0]]) =>
      // Manila main uses bins, so stocked items there need a default bin.
      newItemWarehouse(code, { inStock, committed, ordered, defaultBin: code === 'WH-MNL' ? 'A-01-01' : '' }),
    ),
    ...rest,
    // The default vendor and main manufacturer are always among the item's vendors / manufacturers.
    vendors:
      patch.defaultVendorId && !patch.vendors?.some((v) => v.vendorId === patch.defaultVendorId)
        ? [{ id: `${id}-v0`, vendorId: patch.defaultVendorId, vendorItemNo: '' }, ...(patch.vendors ?? [])]
        : (patch.vendors ?? []),
    // The main manufacturer is always one of the item's manufacturers.
    manufacturers:
      patch.manufacturer && !patch.manufacturers?.some((m) => m.code === patch.manufacturer)
        ? [...(patch.manufacturers ?? []), { id: `${id}-m0`, code: patch.manufacturer, catalogNo: '' }]
        : (patch.manufacturers ?? []),
  };
}

const seedWeight = (kg?: number) => (kg ? { netWeight: kg, grossWeight: Math.round(kg * 1.4 * 100) / 100 } : {});

const APPLE_VENDOR = 'bp-016';
/** Apple itself, bought from direct (in USD) when the distributor is short. */
const APPLE_DIRECT = 'bp-017';

const CUSTOMS_BY_GROUP: Record<string, string> = {
  iPhone: 'cg-8517', 'Apple Watch': 'cg-8517', iPad: 'cg-8471', Mac: 'cg-8471', AirPods: 'cg-8518', 'Home & TV': 'cg-8528',
};
const ACCESSORY_CUSTOMS: [RegExp, string][] = [
  [/^ACC-(PWR|MAGSF)/, 'cg-8504'], [/^ACC-(CBL|USBC)/, 'cg-8544'], [/^ACC-(CASE|SPBAND)/, 'cg-4202'],
];

// Demo of item units: chargers, cables and adapters get the PIECE group's units (stocked and
// sold by the piece); MagSafe chargers and the Lightning adapter are bought by the box of 24.
const PIECE_GROUP_ITEMS = /^ACC-(PWR|CBL|MAGSF|USBC)/;
const BOUGHT_BY_THE_BOX = /^ACC-(MAGSF|USBC)/;

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
    vendors: [{ id: `apl-${n}-v1`, vendorId: APPLE_DIRECT, vendorItemNo: e.itemNo }],
    ...(PIECE_GROUP_ITEMS.test(e.itemNo)
      ? { uomGroup: 'PIECE', purchasingUom: BOUGHT_BY_THE_BOX.test(e.itemNo) ? 'box' : 'pc' }
      : {}),
    manufacturer: 'MFR-APL',
    warrantyTemplate: 'wr-apl1',
    basePrice: e.price,
    // Demo assumption: reseller cost ≈ 88% of the VAT-exclusive SRP.
    itemCost: Math.round((e.price / 1.12) * 0.88),
    commissionGroup: accessory ? 'cm-high' : 'cm-std',
    validFrom: family.validFrom ?? '',
    weightKg: family.weightKg,
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
    purchaseTaxGroup: 'P-VAT12S', withholdingGroup: 'WH-SVC', warehouses: [], cycleCountDays: 0, planningMethod: 'None',
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

type PurchasedService = [
  id: string, itemNo: string, description: string, uom: string, withholdingGroup: string, defaultVendorId: string, purchaseTaxGroup?: string,
];
const PURCHASED_SERVICES: PurchasedService[] = [
  ['itm-021', 'SVC-AI-SEAT', 'AI assistant subscription (per seat, monthly)', 'seat', 'WH-SVC', 'bp-018'],
  ['itm-022', 'SVC-ADS-DIGITAL', 'Digital advertising (search, video, social)', 'pc', 'WH-SVC', 'bp-019'],
  ['itm-023', 'SVC-SECURITY', 'Store security guard services (monthly)', 'pc', 'WH-CONT', 'bp-014'],
  ['itm-024', 'SVC-COURIER', 'Courier and logistics', 'trip', 'WH-SVC', 'bp-027'],
  ['itm-025', 'SVC-AUDIT', 'External audit and tax compliance fee', 'pc', 'WH-PROF', 'bp-021'],
  ['itm-026', 'SVC-CUSTOMS', 'Customs brokerage fee (per import entry)', 'pc', 'WH-COMM', 'bp-022'],
  ['itm-027', 'SVC-PHOTO', 'Product photography and creative services', 'pc', 'WH-PROF', 'bp-023'],
  ['itm-028', 'SVC-IT-CONSULT', 'IT consulting and systems integration', 'hour', 'WH-PROF', 'bp-024'],
  ['itm-029', 'SVC-SALES-COMM', 'Sales agent commission', 'pc', 'WH-SCOMM', 'bp-026'],
  ['itm-030', 'SVC-POS-LICENSE', 'POS software licence (annual)', 'pc', 'WH-ROY', 'bp-030'],
  ['itm-031', 'FIN-LOAN-INT', 'Interest on inventory financing', 'pc', 'WH-INT', 'bp-032', 'P-VATX'],
  ['itm-032', 'SVC-POSTAGE', 'Registered mail and postage', 'pc', 'WH-SVC', 'bp-028'],
  ['itm-033', 'SVC-LEGAL', 'Legal retainer and case fees', 'pc', 'WH-PROF', 'bp-033'],
  ['itm-034', 'SVC-AIRCON', 'Aircon preventive maintenance (monthly)', 'pc', 'WH-SVC', 'bp-034'],
  ['itm-035', 'SVC-DESIGN', 'Signage and campaign design', 'pc', 'WH-PROF', 'bp-035'],
  ['itm-036', 'SVC-RNT-CEB', 'Cebu store space rent (monthly)', 'pc', 'WH-RENT', 'bp-036'],
  ['itm-037', 'SVC-VIDEO-EDIT', 'Video editing', 'pc', 'WH-PROF', 'bp-037'],
  ['itm-038', 'SVC-POS-LEASE', 'POS terminal and card reader lease (monthly)', 'pc', 'WH-EQUIP', 'bp-038'],
  ['itm-039', 'SVC-SIGNAGE-LIC', 'Video wall content software licence (annual)', 'pc', 'WH-ROY', 'bp-039'],
  ['itm-040', 'SVC-FREIGHT', 'Air freight and forwarding', 'pc', 'WH-SVC', 'bp-042'],
  ['itm-041', 'SVC-ADVISORY', 'Retail operations advisory', 'pc', 'WH-PROF', 'bp-043'],
  // Set up wrong on purpose: a foreign service with no withholding group — the rules warn instead of guessing.
  ['itm-042', 'SVC-FOREIGN-MISC', 'Foreign service — to classify', 'pc', '', 'bp-029'],
];

/** Purchases whose tax treatment is fixed on the item rather than decided by the vendor. */
const ITEM_TAX_CASES: Item[] = [
  seed('itm-043', 'Services', {
    itemNo: 'IMP-VAT-DISB', description: 'Import VAT advanced by customs broker', itemType: 'Items', inventoryUom: 'pc', purchasingUom: 'pc',
    salesItem: false, inventoryItem: false, purchaseTaxGroup: 'P-VAT12', purchaseTaxCode: '46', withholdingGroup: 'WH-NONE',
    defaultVendorId: 'bp-022', warehouses: [], cycleCountDays: 0, hasTransactions: false,
    generalRemarks: 'The broker pays the import VAT to the Bureau of Customs for us and bills it back at cost: fixed code 46, and no withholding on a reimbursement.',
  }),
  seed('itm-044', 'Services', {
    itemNo: 'IMP-MANUALS', description: 'Printed Apple training manuals (imported)', itemType: 'Items', inventoryUom: 'pc', purchasingUom: 'pc',
    salesItem: false, inventoryItem: false, purchaseTaxGroup: 'P-VATX', withholdingGroup: 'WH-GDS',
    defaultVendorId: 'bp-017', warehouses: [], cycleCountDays: 0, hasTransactions: false,
    generalRemarks: 'Books and printed materials are VAT-exempt on importation (NIRC Sec. 109): imported from Apple they get code 49.',
  }),
];

export const SEED_ITEMS: Item[] = [
  ...APPLE_ITEMS,
  ...APPLECARE,
  ...GIFT_CERTIFICATES,
  // Services the store sells or buys. Their ids stay stable: the tax rules tester and tests use them.
  seed('itm-016', 'Services', {
    itemNo: 'SVC-SETUP', description: 'Device setup & data transfer', itemType: 'Labor', inventoryUom: 'hour', purchaseItem: false,
    purchaseTaxGroup: 'P-VAT12S', withholdingGroup: 'WH-SVC',
    inventoryItem: false, basePrice: 990, commissionGroup: 'cm-std', cycleCountDays: 0, warehouses: [],
  }),
  seed('itm-017', 'Services', {
    itemNo: 'SVC-DLV-TRIP', description: 'Same-day delivery (Metro Manila)', itemType: 'Travel', inventoryUom: 'trip',
    purchaseItem: false, inventoryItem: false, basePrice: 350, cycleCountDays: 0, warehouses: [],
    purchaseTaxGroup: 'P-VAT12S', withholdingGroup: 'WH-SVC',
  }),
  seed('itm-018', 'Rent & Leases', {
    itemNo: 'SVC-RNT-MALL', description: 'Mall store space rent (monthly)', itemType: 'Items', inventoryUom: 'pc', purchasingUom: 'pc',
    salesItem: false, inventoryItem: false, purchaseTaxGroup: 'P-VAT12S', withholdingGroup: 'WH-RENT', warehouses: [],
    defaultVendorId: 'bp-002', cycleCountDays: 0, hasTransactions: false,
  }),
  seed('itm-019', 'Services', {
    itemNo: 'SVC-SUB-FITOUT', description: 'Store fit-out subcontract', itemType: 'Labor', inventoryUom: 'hour', purchasingUom: 'hour',
    salesItem: false, inventoryItem: false, purchaseTaxGroup: 'P-VAT12S', withholdingGroup: 'WH-CONT', warehouses: [],
    defaultVendorId: 'bp-025', cycleCountDays: 0, hasTransactions: false,
  }),
  seed('itm-020', 'Services', {
    itemNo: 'SVC-CLD-HOST', description: 'Cloud hosting subscription (monthly)', itemType: 'Items', inventoryUom: 'pc',
    purchasingUom: 'pc', salesItem: false, inventoryItem: false, purchaseTaxGroup: 'P-VAT12S', withholdingGroup: 'WH-SVC',
    defaultVendorId: 'bp-015', warehouses: [], cycleCountDays: 0, hasTransactions: false,
  }),
  // Other things the store buys — one per withholding group, so every vendor's tax scenario can be tried.
  ...PURCHASED_SERVICES.map(([id, itemNo, description, uom, withholdingGroup, defaultVendorId, purchaseTaxGroup = 'P-VAT12S']) =>
    seed(id, withholdingGroup === 'WH-RENT' ? 'Rent & Leases' : 'Services', {
      itemNo, description, itemType: 'Items', inventoryUom: uom, purchasingUom: uom, salesItem: false, inventoryItem: false,
      purchaseTaxGroup, withholdingGroup, defaultVendorId, warehouses: [], cycleCountDays: 0, hasTransactions: false,
    }),
  ),
  ...ITEM_TAX_CASES,
];
