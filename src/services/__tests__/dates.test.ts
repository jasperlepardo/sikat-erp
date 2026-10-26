import { describe, it, expect, afterEach } from 'vitest';
import {
  DATE_FORMATS,
  DEFAULT_TIME_ZONE,
  addDays,
  applyDateSettings,
  formatDate,
  formatDateTime,
  localDateTime,
  nowHHMM,
  todayISO,
} from '../dates';

// Several tests mutate module-level settings; restore the defaults afterwards.
const resetSettings = () =>
  applyDateSettings({ bookTimeZone: DEFAULT_TIME_ZONE, dateFormat: 'd MMM yyyy', displayTimeZone: '' });
afterEach(resetSettings);

describe('formatDate', () => {
  it('renders every supported format', () => {
    expect(formatDate('2026-09-25', 'd MMM yyyy')).toBe('25 Sep 2026');
    expect(formatDate('2026-09-25', 'MM/dd/yyyy')).toBe('09/25/2026');
    expect(formatDate('2026-09-25', 'dd/MM/yyyy')).toBe('25/09/2026');
    expect(formatDate('2026-09-25', 'yyyy-MM-dd')).toBe('2026-09-25');
  });

  it('covers all 4 declared formats and drops the leading zero on the day for the default', () => {
    expect(DATE_FORMATS).toHaveLength(4);
    expect(formatDate('2026-01-05', 'd MMM yyyy')).toBe('5 Jan 2026');
  });

  it('returns "" for an empty date', () => {
    expect(formatDate('')).toBe('');
  });

  it('accepts a full timestamp and uses only the date part', () => {
    expect(formatDate('2026-12-31T23:59:59Z', 'yyyy-MM-dd')).toBe('2026-12-31');
  });
});

describe('todayISO', () => {
  it('is the frozen clock day in the company time zone', () => {
    expect(todayISO()).toBe('2026-06-15');
  });

  it('gives the Manila day, not the UTC day, in the early-morning window', () => {
    // Manila 2026-06-15 03:00 is UTC 2026-06-14 19:00 — the naive UTC slice would be a day behind.
    const earlyManila = new Date('2026-06-14T19:00:00Z');
    expect(earlyManila.toISOString().slice(0, 10)).toBe('2026-06-14');
    expect(todayISO(earlyManila)).toBe('2026-06-15');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-06-15', 0)).toBe('2026-06-15');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('nowHHMM', () => {
  it('is the frozen time in the company zone, 24-hour', () => {
    expect(nowHHMM()).toBe('12:00');
    expect(nowHHMM(new Date('2026-06-15T15:30:00+08:00'))).toBe('15:30');
  });
});

describe('formatDateTime / localDateTime', () => {
  it('renders a UTC instant in the display zone', () => {
    // Default display zone follows the book zone (Asia/Manila): 09:30Z -> 17:30 Manila.
    expect(localDateTime('2026-09-25T09:30:00Z')).toBe('2026-09-25T17:30');
    expect(formatDateTime('2026-09-25T09:30:00Z')).toBe('25 Sep 2026 · 17:30');
  });

  it('returns "" for an empty timestamp', () => {
    expect(formatDateTime('')).toBe('');
  });
});

describe('applyDateSettings', () => {
  it('changes the default format used by formatDate()', () => {
    applyDateSettings({ bookTimeZone: DEFAULT_TIME_ZONE, dateFormat: 'MM/dd/yyyy', displayTimeZone: '' });
    expect(formatDate('2026-09-25')).toBe('09/25/2026');
  });

  it('uses a separate display time zone for timestamps', () => {
    applyDateSettings({ bookTimeZone: 'Asia/Manila', dateFormat: 'yyyy-MM-dd', displayTimeZone: 'UTC' });
    expect(localDateTime('2026-09-25T09:30:00Z')).toBe('2026-09-25T09:30');
  });
});
