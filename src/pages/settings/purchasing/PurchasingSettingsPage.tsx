import { TabbedPage, type PageTab } from '../../../components/form/TabbedPage';
import { DocumentSeriesTab } from './DocumentSeriesTab';
import { PurchasingSettingsTab } from './PurchasingSettingsTab';

const TABS: PageTab[] = [
  { value: 'document-series', label: 'Document series', Component: DocumentSeriesTab },
  { value: 'settings', label: 'Purchasing settings', Component: PurchasingSettingsTab },
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
