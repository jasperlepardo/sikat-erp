import {
  SEED_COMMISSION_GROUPS,
  SEED_CUSTOMS_GROUPS,
  SEED_INVENTORY_SETTINGS,
  SEED_ITEM_GROUPS,
  SEED_ITEM_PROPERTIES,
  SEED_MANUFACTURERS,
  SEED_SHIPPING_TYPES,
  SEED_UOMS,
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
  type Warehouse,
  type WarrantyTemplate,
} from '../mocks/itemMasters';
import { createCollection } from './store';

/** Settings › Inventory and Inventory › Warehouses & Bins master data. */
export const itemGroups = createCollection<ItemGroup>('sikat-erp:item-groups', SEED_ITEM_GROUPS, 'ig');
export const unitsOfMeasure = createCollection<UnitOfMeasure>('sikat-erp:uoms', SEED_UOMS, 'uom');
export const warehouses = createCollection<Warehouse>('sikat-erp:warehouses', SEED_WAREHOUSES, 'wh');
export const manufacturers = createCollection<Manufacturer>('sikat-erp:manufacturers', SEED_MANUFACTURERS, 'mfr');
export const customsGroups = createCollection<CustomsGroup>('sikat-erp:customs-groups', SEED_CUSTOMS_GROUPS, 'cg');
export const commissionGroups = createCollection<CommissionGroup>('sikat-erp:commission-groups', SEED_COMMISSION_GROUPS, 'cm');
export const shippingTypes = createCollection<ShippingType>('sikat-erp:shipping-types', SEED_SHIPPING_TYPES, 'sh');
export const warrantyTemplates = createCollection<WarrantyTemplate>('sikat-erp:warranty-templates', SEED_WARRANTY_TEMPLATES, 'wr');
export const itemProperties = createCollection<ItemProperty>('sikat-erp:item-properties', SEED_ITEM_PROPERTIES, 'prop');
export const inventorySettings = createCollection<InventorySettings>('sikat-erp:inventory-settings', SEED_INVENTORY_SETTINGS, 'inventory');

/** Everything the item form needs, loaded once. */
export interface InventoryMasters {
  groups: ItemGroup[];
  uoms: UnitOfMeasure[];
  warehouses: Warehouse[];
  manufacturers: Manufacturer[];
  customs: CustomsGroup[];
  commissions: CommissionGroup[];
  shipping: ShippingType[];
  warranties: WarrantyTemplate[];
  properties: ItemProperty[];
  settings: InventorySettings;
}

export async function loadInventoryMasters(): Promise<InventoryMasters> {
  const [groups, uoms, whs, mfrs, customs, commissions, shipping, warranties, properties, [settings]] = await Promise.all([
    itemGroups.list(),
    unitsOfMeasure.list(),
    warehouses.list(),
    manufacturers.list(),
    customsGroups.list(),
    commissionGroups.list(),
    shippingTypes.list(),
    warrantyTemplates.list(),
    itemProperties.list(),
    inventorySettings.list(),
  ]);
  return {
    groups, uoms, warehouses: whs, manufacturers: mfrs, customs, commissions, shipping, warranties,
    properties: properties.sort((a, b) => a.number - b.number), settings,
  };
}

export const EMPTY_INVENTORY_MASTERS: InventoryMasters = {
  groups: [], uoms: [], warehouses: [], manufacturers: [], customs: [], commissions: [], shipping: [], warranties: [],
  properties: [], settings: SEED_INVENTORY_SETTINGS[0],
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
