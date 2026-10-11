import { TabbedPage, type PageTab } from '../../../components/form/TabbedPage';
import type { ListRoute } from '../../../components/form/MasterList';
import { DOC_PATTERN_TYPES } from '../../../services/journalPatterns';
import { JournalPatternTab } from './JournalPatternTab';

const TABS: PageTab[] = DOC_PATTERN_TYPES.map((dt) => ({
  value: dt.key,
  label: dt.label,
  sidePanelEdit: true,
  Component: (route: ListRoute) => (
    <JournalPatternTab collection={dt.collection} variables={dt.variables} docTypeLabel={dt.label} sampleOverrides={dt.sample} {...route} />
  ),
}));

export function JournalPatternsPage() {
  return (
    <TabbedPage
      base="/settings/journal-patterns"
      icon="edit_note"
      title="Journal Patterns"
      tabs={TABS}
    />
  );
}
