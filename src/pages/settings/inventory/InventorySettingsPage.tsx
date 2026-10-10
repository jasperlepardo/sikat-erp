import { TabbedPage, type PageTab } from '../../../components/form/TabbedPage';
import { InventorySettingsTab } from './InventorySettingsTab';
import {
  CommissionGroupsTab,
  CustomsGroupsTab,
  ItemGroupsTab,
  UomGroupsTab,
  ItemPropertiesTab,
  ManufacturersTab,
  ShippingTypesTab,
  UnitsTab,
  VariantAttributesTab,
  WarrantyTemplatesTab,
} from './lists';

const TABS: PageTab[] = [
  { value: 'item-groups', label: 'Item groups', Component: ItemGroupsTab },
  { value: 'uoms', label: 'Units of measure', Component: UnitsTab },
  { value: 'uom-groups', label: 'UoM groups', Component: UomGroupsTab },
  { value: 'variant-attributes', label: 'Variant attributes', Component: VariantAttributesTab },
  { value: 'manufacturers', label: 'Manufacturers', Component: ManufacturersTab },
  { value: 'customs', label: 'Customs groups', Component: CustomsGroupsTab },
  { value: 'commission', label: 'Commission groups', Component: CommissionGroupsTab },
  { value: 'shipping', label: 'Shipping types', Component: ShippingTypesTab },
  { value: 'warranty', label: 'Warranty templates', Component: WarrantyTemplatesTab },
  { value: 'properties', label: 'Item properties', Component: ItemPropertiesTab },
  { value: 'settings', label: 'Inventory settings', Component: InventorySettingsTab },
];

/** Settings › Inventory: the master data the item master picks from. */
export function InventorySettingsPage() {
  return (
    <TabbedPage
      base="/settings/inventory"
      icon="inventory"
      title="Inventory"
      tabs={TABS}
    />
  );
}
