/** Per-user display preferences (Settings › Preferences). Stored data never depends on them. */
import { CURRENT_USER_ID } from './common';
import type { DateFormat } from '../services/dates';

export interface UserPreferences {
  /** The user (sales employee id) these belong to. */
  id: string;
  dateFormat: DateFormat;
  /** IANA time zone timestamps are shown in; '' = the company's. */
  timeZone: string;
}

export const blankPreferences = (userId: string): UserPreferences => ({ id: userId, dateFormat: 'd MMM yyyy', timeZone: '' });

export const SEED_PREFERENCES: UserPreferences[] = [blankPreferences(CURRENT_USER_ID)];
