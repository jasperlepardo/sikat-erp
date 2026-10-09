import {
  SEED_COMMISSION_GROUPS,
  SEED_CUSTOMS_GROUPS,
  SEED_INVENTORY_SETTINGS,
  SEED_ITEM_GROUPS,
  SEED_ITEM_PROPERTIES,
  SEED_MANUFACTURERS,
  SEED_SHIPPING_TYPES,
  SEED_UOMS,
  SEED_UOM_GROUPS,
  SEED_WAREHOUSES,
  SEED_WARRANTY_TEMPLATES,
  type CommissionGroup,
  type CustomsGroup,
  type InventorySettings,
  type ItemGroup,
  type ItemProperty,
  type Manufacturer,
  type ShippingType,
  type UnitOfMeasure,
  type UomGroup,
  type Warehouse,
  type WarrantyTemplate,
} from '../mocks/itemMasters';
import { SEED_BINS, SEED_BIN_SUBLEVELS, type BinLocation, type BinSublevel } from '../mocks/binLocations';
import type { Account } from '../mocks/chartOfAccounts';
import { accounts } from './masterData';
import { createCollection } from './store';

/** Settings › Inventory and Inventory › Warehouses & Bins master data. */
export const itemGroups = createCollection<ItemGroup>('sikat-erp:item-groups:v6', SEED_ITEM_GROUPS, 'ig');
/** An item group's name for display — the id itself if the group is gone. */
export const itemGroupName = (id: string) => itemGroups.snapshot().find((g) => g.id === id)?.name ?? id;
export const unitsOfMeasure = createCollection<UnitOfMeasure>('sikat-erp:uoms:v5', SEED_UOMS, 'uom');
export const uomGroups = createCollection<UomGroup>('sikat-erp:uom-groups:v2', SEED_UOM_GROUPS, 'ug');
export const warehouses = createCollection<Warehouse>('sikat-erp:warehouses:v10', SEED_WAREHOUSES, 'wh');
/** Bin locations and the aisle / shelf / level codes they're addressed by (services/binLocations.ts). */
export const binLocations = createCollection<BinLocation>('sikat-erp:bin-locations:v1', SEED_BINS, 'bin');

const codeOf = (id: string) => (id ? (binLocations.snapshot().find((b) => b.id === id)?.code ?? '') : '');

/** Stamp each line's bin code as it is now — called when a document posts, so a later bin rename leaves its history as posted. */
export const withBinCodes = <L extends { binId: string }>(lines: L[]): (L & { binCode: string })[] =>
  lines.map((l) => ({ ...l, binCode: codeOf(l.binId) }));

/** The same for transfer lines' from- and to-bins. */
export const withTransferBinCodes = <L extends { fromBinId: string; toBinId: string }>(lines: L[]): (L & { fromBinCode: string; toBinCode: string })[] =>
  lines.map((l) => ({ ...l, fromBinCode: codeOf(l.fromBinId), toBinCode: codeOf(l.toBinId) }));
export const binSublevels = createCollection<BinSublevel>('sikat-erp:bin-sublevels:v1', SEED_BIN_SUBLEVELS, 'bsl');
export const manufacturers = createCollection<Manufacturer>('sikat-erp:manufacturers:v2', SEED_MANUFACTURERS, 'mfr');
export const customsGroups = createCollection<CustomsGroup>('sikat-erp:customs-groups:v2', SEED_CUSTOMS_GROUPS, 'cg');
export const commissionGroups = createCollection<CommissionGroup>('sikat-erp:commission-groups', SEED_COMMISSION_GROUPS, 'cm');
export const shippingTypes = createCollection<ShippingType>('sikat-erp:shipping-types', SEED_SHIPPING_TYPES, 'sh');
export const warrantyTemplates = createCollection<WarrantyTemplate>('sikat-erp:warranty-templates:v2', SEED_WARRANTY_TEMPLATES, 'wr');
export const itemProperties = createCollection<ItemProperty>('sikat-erp:item-properties:v2', SEED_ITEM_PROPERTIES, 'prop');
export const inventorySettings = createCollection<InventorySettings>('sikat-erp:inventory-settings', SEED_INVENTORY_SETTINGS, 'inventory');

/** Everything the item form needs, loaded once. */
export interface InventoryMasters {
  groups: ItemGroup[];
  uoms: UnitOfMeasure[];
  uomGroups: UomGroup[];
  warehouses: Warehouse[];
  /** Every warehouse's bin locations. */
  bins: BinLocation[];
  manufacturers: Manufacturer[];
  customs: CustomsGroup[];
  commissions: CommissionGroup[];
  shipping: ShippingType[];
  warranties: WarrantyTemplate[];
  properties: ItemProperty[];
  settings: InventorySettings;
  /** Chart of accounts, for the item's G/L account pickers. */
  accounts: Account[];
}

export async function loadInventoryMasters(): Promise<InventoryMasters> {
  const [groups, uoms, uomGroupRows, whs, bins, mfrs, customs, commissions, shipping, warranties, properties, [settings], chart] = await Promise.all([
    itemGroups.list(),
    unitsOfMeasure.list(),
    uomGroups.list(),
    warehouses.list(),
    binLocations.list(),
    manufacturers.list(),
    customsGroups.list(),
    commissionGroups.list(),
    shippingTypes.list(),
    warrantyTemplates.list(),
    itemProperties.list(),
    inventorySettings.list(),
    accounts.list(),
  ]);
  return {
    groups, uoms, uomGroups: uomGroupRows, warehouses: whs, bins, manufacturers: mfrs, customs, commissions, shipping, warranties,
    properties: properties.sort((a, b) => a.number - b.number), settings, accounts: chart,
  };
}

export const EMPTY_INVENTORY_MASTERS: InventoryMasters = {
  groups: [], uoms: [], uomGroups: [], warehouses: [], bins: [], manufacturers: [], customs: [], commissions: [], shipping: [], warranties: [],
  properties: [], settings: SEED_INVENTORY_SETTINGS[0], accounts: [],
};

/** Options over active rows, keeping the current value if it's been deactivated. */
export function activeOptions<T extends { active: boolean }>(
  rows: T[],
  value: (r: T) => string,
  label: (r: T) => string,
  current?: string,
  none?: string,
) {
  return [
    ...(none !== undefined ? [{ value: '', label: none }] : []),
    ...rows.filter((r) => r.active || value(r) === current).map((r) => ({ value: value(r), label: label(r) })),
  ];
}
