import { useState } from 'react';
import { Panel, PanelHeader, Tabs } from '@jasperlepardo/sikat-design-system';
import { InventorySettingsTab } from './InventorySettingsTab';
import {
  CommissionGroupsTab,
  CustomsGroupsTab,
  ItemGroupsTab,
  ItemPropertiesTab,
  ManufacturersTab,
  ShippingTypesTab,
  UnitsTab,
  WarrantyTemplatesTab,
} from './lists';

const TABS = [
  { value: 'item-groups', label: 'Item groups', Component: ItemGroupsTab },
  { value: 'uoms', label: 'Units of measure', Component: UnitsTab },
  { value: 'manufacturers', label: 'Manufacturers', Component: ManufacturersTab },
  { value: 'customs', label: 'Customs groups', Component: CustomsGroupsTab },
  { value: 'commission', label: 'Commission groups', Component: CommissionGroupsTab },
  { value: 'shipping', label: 'Shipping types', Component: ShippingTypesTab },
  { value: 'warranty', label: 'Warranty templates', Component: WarrantyTemplatesTab },
  { value: 'properties', label: 'Item properties', Component: ItemPropertiesTab },
  { value: 'settings', label: 'Inventory settings', Component: InventorySettingsTab },
] as const;

/** Settings › Inventory: the master data the item master picks from. */
export function InventorySettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('item-groups');
  const Active = TABS.find((t) => t.value === tab)!.Component;
  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="inventory"
        title="Inventory settings"
        subcopy="Item groups, units, manufacturers, customs and commission groups, shipping, warranties and item properties."
        tabs={<Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} items={TABS.map((t) => ({ value: t.value, label: t.label }))} />}
      />
      <Panel.Body className="flex flex-col gap-2">
        <Active />
      </Panel.Body>
    </Panel>
  );
}
