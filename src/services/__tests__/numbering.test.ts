import { describe, it, expect, beforeEach } from 'vitest';
import type { DocumentSeries } from '../../mocks/common';
import { formatDocNum, matchingSeries, seriesLookup, poSeries } from '../allSeries';
import { PO_SERIES } from '../../mocks/purchaseOrders';

/** A full DocumentSeries with sensible defaults, overridable per test. */
const series = (patch: Partial<DocumentSeries> = {}): DocumentSeries => ({
  id: 'ser-x',
  name: 'Test',
  prefix: '',
  firstNo: 1,
  manual: false,
  isDefault: false,
  active: true,
  ...patch,
});

describe('formatDocNum', () => {
  it('returns the placeholder "Draft" when docNum is 0', () => {
    expect(formatDocNum(series({ prefix: 'PO-' }), 0)).toBe('Draft');
  });

  it('honours a custom placeholder when no date is given', () => {
    expect(formatDocNum(series({ prefix: 'PO-' }), 0, 'New')).toBe('New');
  });

  it('honours a custom placeholder passed alongside a date', () => {
    const s = series({ segments: [{ type: 'literal', value: 'PO' }, { type: 'sequence', padding: 4 }] });
    expect(formatDocNum(s, 0, '2026-10-10', 'Unposted')).toBe('Unposted');
  });

  it('uses prefix + docNum when there are no segments', () => {
    expect(formatDocNum(series({ prefix: 'PO-' }), 52)).toBe('PO-52');
  });

  it('falls back to "Name docNum" when there is neither prefix nor segments', () => {
    expect(formatDocNum(series({ name: 'Local', prefix: '' }), 7)).toBe('Local 7');
  });

  it('renders segments joined by "-", zero-padding the sequence', () => {
    const s = series({ segments: [{ type: 'literal', value: 'PO' }, { type: 'year' }, { type: 'sequence', padding: 4 }] });
    expect(formatDocNum(s, 52, '2026-10-10')).toBe('PO-2026-0052');
  });

  it('defaults the sequence padding to 4 when unspecified', () => {
    const s = series({ segments: [{ type: 'sequence' }] });
    expect(formatDocNum(s, 9, '2026-10-10')).toBe('0009');
  });

  it('does not truncate a sequence wider than its padding', () => {
    const s = series({ segments: [{ type: 'sequence', padding: 4 }] });
    expect(formatDocNum(s, 123456, '2026-10-10')).toBe('123456');
  });

  it('renders every segment type from the given date', () => {
    const s = series({
      segments: [
        { type: 'literal', value: 'INV' },
        { type: 'year' },
        { type: 'year_short' },
        { type: 'month' },
        { type: 'month_name' },
        { type: 'sequence', padding: 3 },
      ],
    });
    expect(formatDocNum(s, 5, '2026-03-10')).toBe('INV-2026-26-03-MAR-005');
  });

  it('rolls over year and month purely from the supplied date', () => {
    const s = series({ segments: [{ type: 'year' }, { type: 'month' }, { type: 'month_name' }, { type: 'sequence', padding: 2 }] });
    expect(formatDocNum(s, 1, '2026-12-31')).toBe('2026-12-DEC-01');
    expect(formatDocNum(s, 1, '2027-01-01')).toBe('2027-01-JAN-01');
  });

  it('falls back to the frozen clock (2026-06) when no date is passed to date segments', () => {
    const s = series({ segments: [{ type: 'year' }, { type: 'month' }, { type: 'month_name' }, { type: 'year_short' }, { type: 'sequence', padding: 2 }] });
    // Frozen clock in setup.ts is 2026-06-15.
    expect(formatDocNum(s, 1)).toBe('2026-06-JUN-26-01');
  });

  it('renders an empty literal segment as empty text', () => {
    const s = series({ segments: [{ type: 'literal' }, { type: 'sequence', padding: 2 }] });
    expect(formatDocNum(s, 3, '2026-10-10')).toBe('-03');
  });
});

describe('matchingSeries', () => {
  const all: DocumentSeries[] = [
    series({ id: 'a', active: true, conditions: [{ field: 'currency', value: 'USD' }] }),
    series({ id: 'b', active: true, conditions: [{ field: 'businessType', value: 'X' }, { field: 'currency', value: 'PHP' }] }),
    series({ id: 'c', active: false, conditions: [{ field: 'currency', value: 'PHP' }] }),
    series({ id: 'd', active: true }), // no conditions
  ];

  it('returns the first active series whose conditions all match', () => {
    expect(matchingSeries(all, { currency: 'USD' })?.id).toBe('a');
  });

  it('requires every condition of a multi-condition series to match', () => {
    expect(matchingSeries(all, { businessType: 'X', currency: 'PHP' })?.id).toBe('b');
    expect(matchingSeries(all, { businessType: 'X' })).toBeUndefined();
  });

  it('skips inactive series even when their condition matches', () => {
    // Only 'c' matches currency PHP but it's inactive; nothing else matches.
    expect(matchingSeries(all, { currency: 'PHP' })).toBeUndefined();
  });

  it('never matches a series with no conditions', () => {
    expect(matchingSeries(all, {})).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(matchingSeries(all, { currency: 'EUR' })).toBeUndefined();
  });
});

describe('seriesLookup', () => {
  const live = [
    series({ id: 's1', isDefault: false }),
    series({ id: 's2', isDefault: true }),
  ];
  const coll = { snapshot: () => live as readonly DocumentSeries[] };

  it('finds the series by id', () => {
    expect(seriesLookup(coll, 's1', PO_SERIES).id).toBe('s1');
  });

  it('falls back to the default series when the id is missing', () => {
    expect(seriesLookup(coll, 'nope', PO_SERIES).id).toBe('s2');
  });

  it('falls back to the first live series when there is no default', () => {
    const noDefault = { snapshot: () => [series({ id: 'f1' }), series({ id: 'f2' })] as readonly DocumentSeries[] };
    expect(seriesLookup(noDefault, 'nope', PO_SERIES).id).toBe('f1');
  });

  it('falls back to the seed when the live collection is empty', () => {
    const empty = { snapshot: () => [] as readonly DocumentSeries[] };
    expect(seriesLookup(empty, 'nope', PO_SERIES)).toBe(PO_SERIES[0]);
  });
});

describe('seriesLookup against the real poSeries collection', () => {
  beforeEach(async () => {
    await poSeries.reset();
  });

  it('resolves the seeded default when given an unknown id', () => {
    const resolved = seriesLookup(poSeries, 'missing', PO_SERIES);
    expect(resolved.id).toBe(PO_SERIES.find((s) => s.isDefault)!.id);
  });
});
