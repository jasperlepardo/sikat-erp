import { Fragment, type ReactNode } from 'react';
import { DateFormatProvider } from '@jasperlepardo/sikat-design-system';
import { useCollection } from '../components/form/MasterLookup';
import type { Company } from '../mocks/companies';
import { DEFAULT_TIME_ZONE, applyDateSettings, formatDate } from '../services/dates';
import { myPreferences, preferences } from '../services/preferences';

/** How date pickers show a date: the user's format (read when called, so it follows the setting). */
const formatPickerDate = (iso: string) => formatDate(iso);

/**
 * Applies the current company's time zone ("today") and the user's date format and time zone
 * (how dates and timestamps read) before the pages render, and re-renders them when either changes.
 * `company` is AppShell's current company (undefined while it loads), so it's loaded once.
 */
export function DateSettings({ company, children }: { company: Company | undefined; children: ReactNode }) {
  const prefs = myPreferences(useCollection(preferences) ?? undefined);
  // While the company loads, the default zone stands in — the same as the seeded company's, so
  // its arrival doesn't re-render the page.
  const book = company?.timeZone || DEFAULT_TIME_ZONE;
  const settings = { bookTimeZone: book, dateFormat: prefs.dateFormat, displayTimeZone: prefs.timeZone || book };
  applyDateSettings(settings);
  // Date pickers come from the design system; the provider makes them read the same way.
  return (
    <Fragment key={`${settings.bookTimeZone}|${settings.dateFormat}|${settings.displayTimeZone}`}>
      <DateFormatProvider format={formatPickerDate}>{children}</DateFormatProvider>
    </Fragment>
  );
}
