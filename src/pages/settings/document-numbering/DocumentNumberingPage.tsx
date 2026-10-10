import { TabbedPage, type PageTab } from '../../../components/form/TabbedPage';
import type { ListRoute } from '../../../components/form/MasterList';
import { DOC_TYPES } from '../../../services/allSeries';
import { DocSeriesTab } from './DocSeriesTab';

const TABS: PageTab[] = DOC_TYPES.map((dt) => ({
  value: dt.key,
  label: dt.label,
  sidePanelEdit: true,
  Component: (route: ListRoute) => <DocSeriesTab collection={dt.collection} conditionFields={dt.conditionFields} {...route} />,
}));

export function DocumentNumberingPage() {
  return (
    <TabbedPage
      base="/settings/document-numbering"
      icon="tag"
      title="Document Numbering"
      tabs={TABS}
    />
  );
}
