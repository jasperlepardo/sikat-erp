import { TabbedPage, type PageTab } from '../../../components/form/TabbedPage';
import { DocumentSettingsTab } from './DocumentSettingsTab';

const TABS: PageTab[] = [{ value: 'settings', label: 'Document settings', Component: DocumentSettingsTab }];

export function DocumentSettingsPage() {
  return <TabbedPage base="/settings/document-settings" icon="description" title="Documents" tabs={TABS} />;
}
