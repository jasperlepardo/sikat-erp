import { MasterDefList, type MasterDef, type MasterRow } from '../../../components/form/MasterLookup';
import type { ListRoute } from '../../../components/form/MasterList';
import { TabbedPage, type PageTab } from '../../../components/form/TabbedPage';
import { landedCostTypeDef } from '../masterDefs';
import { DocumentSeriesTab } from './DocumentSeriesTab';
import { PurchasingSettingsTab } from './PurchasingSettingsTab';

const tab = <T extends MasterRow>(value: string, def: MasterDef<T>): PageTab => ({
  value,
  label: def.title,
  description: typeof def.description === 'string' ? def.description : undefined,
  Component: (route: ListRoute) => <MasterDefList def={def} {...route} />,
});

const TABS: PageTab[] = [
  { value: 'document-series', label: 'Document series', Component: DocumentSeriesTab },
  { value: 'settings', label: 'Purchasing settings', Component: PurchasingSettingsTab },
  tab('landed-cost-types', landedCostTypeDef),
];

export function PurchasingSettingsPage() {
  return (
    <TabbedPage
      base="/settings/purchasing"
      icon="shopping_cart"
      title="Purchasing"
      tabs={TABS}
    />
  );
}
