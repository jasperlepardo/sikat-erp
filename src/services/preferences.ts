import { blankPreferences, SEED_PREFERENCES, type UserPreferences } from '../mocks/preferences';
import { CURRENT_USER_ID } from '../mocks/common';
import { createCollection } from './store';

export const preferences = createCollection<UserPreferences>('sikat-erp:preferences', SEED_PREFERENCES, 'prf');

/** The signed-in user's preferences; defaults when they've never saved any. */
export const myPreferences = (all: readonly UserPreferences[] = preferences.snapshot()) =>
  all.find((p) => p.id === CURRENT_USER_ID) ?? blankPreferences(CURRENT_USER_ID);

export const saveMyPreferences = (patch: Partial<Omit<UserPreferences, 'id'>>) => preferences.save({ ...myPreferences(), ...patch });

/** Time zones the pickers offer (IANA names), from the browser; a short list where it can't say. */
export const TIME_ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['Asia/Manila', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC'];
  }
})();
