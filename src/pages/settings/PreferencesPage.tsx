import { Panel } from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../components/form/PageHeader';
import { FieldStack, ReadOnly, Section, bind } from '../../components/form/fields';
import { useCollection } from '../../components/form/MasterLookup';
import { useCurrentCompany } from '../../services/companies';
import { DATE_FORMATS, DEFAULT_TIME_ZONE, formatDate, formatDateTime } from '../../services/dates';
import { TIME_ZONES, myPreferences, preferences, saveMyPreferences } from '../../services/preferences';

const SAMPLE_DATE = '2026-10-19';

/**
 * Settings › Preferences: how dates and times read for the signed-in user. Display only —
 * stored dates don't change, and "today" stays the company's. Saved as soon as it's picked.
 */
export function PreferencesPage() {
  const prefs = myPreferences(useCollection(preferences) ?? undefined);
  const companyZone = useCurrentCompany()?.timeZone || DEFAULT_TIME_ZONE;
  const f = bind(prefs, (patch) => void saveMyPreferences(patch));

  return (
    <Panel className="flex-1">
      <PageHeader icon="tune" title="Preferences" />
      <Panel.Body className="flex flex-col gap-2">
        <Section icon="calendar_month" title="Dates and times">
          <FieldStack>
            {f.choose('dateFormat', 'Date format', DATE_FORMATS.map((d) => ({ value: d, label: formatDate(SAMPLE_DATE, d) })), {
              hint: 'How every date reads on screen. Saved as soon as you pick it.',
            })}
            {f.lookup('timeZone', 'Time zone', TIME_ZONES.map((z) => ({ value: z, label: z })), {
              clearable: true,
              placeholder: `The company's (${companyZone})`,
              hint: "For times things happened — activity, edits. Posting dates and \"today\" stay the company's.",
            })}
            <ReadOnly label="Preview" value={`${formatDate(SAMPLE_DATE)} · now: ${formatDateTime(new Date().toISOString())}`} hint="A date, and the current time in your time zone." />
          </FieldStack>
        </Section>
      </Panel.Body>
    </Panel>
  );
}
