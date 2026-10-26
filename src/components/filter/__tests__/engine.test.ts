import { describe, it, expect } from 'vitest';
import {
  applyFilter,
  decodeFilter,
  encodeFilter,
  matches,
  oneRule,
  type FilterField,
  type FilterGroup,
  type Op,
} from '../engine';

/**
 * The pure comparison engine: matches() / applyFilter() against sample rows, plus the
 * encodeFilter/decodeFilter URL round-trip. Date operators are tested with an explicit
 * `today` so they don't depend on the runner's time zone.
 */
interface Row {
  no: string;
  total: number;
  postingDate: string;
  status: string;
  active: boolean;
  tags: string[];
  vendorRef: string;
}

const fields: FilterField<Row>[] = [
  { key: 'no', label: 'No.', type: 'text', get: (r) => r.no },
  { key: 'total', label: 'Total', type: 'number', get: (r) => r.total },
  { key: 'postingDate', label: 'Date', type: 'date', get: (r) => r.postingDate },
  { key: 'status', label: 'Status', type: 'choice', get: (r) => r.status },
  { key: 'active', label: 'Active', type: 'boolean', get: (r) => r.active },
  { key: 'tags', label: 'Tags', type: 'text', get: (r) => r.tags },
  { key: 'vendorRef', label: 'Vendor ref', type: 'text', get: (r) => r.vendorRef },
];

const TODAY = '2026-06-15';

const rows: Row[] = [
  { no: 'INV-001', total: 500, postingDate: '2026-06-14', status: 'Open', active: true, tags: ['a', 'b'], vendorRef: 'PO-9' },
  { no: 'INV-002', total: 1500, postingDate: '2026-06-10', status: 'Draft', active: false, tags: ['b'], vendorRef: '' },
  { no: 'CM-010', total: 3000, postingDate: '2026-01-01', status: 'Closed', active: true, tags: [], vendorRef: 'PO-3' },
];

const g = (field: string, op: Op, value?: unknown, value2?: unknown): FilterGroup => ({
  match: 'all',
  rules: [{ id: 'r', field, op, value, value2 }],
});

/** The `no`s of rows passing the filter, in order. */
const hits = (group: FilterGroup) => applyFilter(rows, group, fields, TODAY).map((r) => r.no);

describe('matches — text / choice operators', () => {
  const cases: Array<[string, FilterGroup, string[]]> = [
    ['is', g('status', 'is', 'Open'), ['INV-001']],
    ['is is case-insensitive', g('status', 'is', 'open'), ['INV-001']],
    ['isNot (also keeps blanks)', g('status', 'isNot', 'Open'), ['INV-002', 'CM-010']],
    ['contains', g('no', 'contains', 'INV'), ['INV-001', 'INV-002']],
    ['notContains', g('no', 'notContains', 'INV'), ['CM-010']],
    ['startsWith', g('no', 'startsWith', 'CM'), ['CM-010']],
    ['empty', g('vendorRef', 'empty'), ['INV-002']],
    ['notEmpty', g('vendorRef', 'notEmpty'), ['INV-001', 'CM-010']],
    ['array value matches any element', g('tags', 'is', 'a'), ['INV-001']],
    ['array contains', g('tags', 'contains', 'b'), ['INV-001', 'INV-002']],
    ['empty array is blank', g('tags', 'empty'), ['CM-010']],
  ];
  it.each(cases)('%s', (_name, group, expected) => {
    expect(hits(group)).toEqual(expected);
  });
});

describe('matches — number operators', () => {
  const cases: Array<[string, FilterGroup, string[]]> = [
    ['is', g('total', 'is', 1500), ['INV-002']],
    ['isNot', g('total', 'isNot', 1500), ['INV-001', 'CM-010']],
    ['gt', g('total', 'gt', 1000), ['INV-002', 'CM-010']],
    ['gte', g('total', 'gte', 1500), ['INV-002', 'CM-010']],
    ['lt', g('total', 'lt', 1500), ['INV-001']],
    ['lte', g('total', 'lte', 1500), ['INV-001', 'INV-002']],
    ['between', g('total', 'between', 1000, 3000), ['INV-002', 'CM-010']],
    ['between swaps reversed bounds', g('total', 'between', 3000, 1000), ['INV-002', 'CM-010']],
  ];
  it.each(cases)('%s', (_name, group, expected) => {
    expect(hits(group)).toEqual(expected);
  });
});

describe('matches — date operators', () => {
  const cases: Array<[string, FilterGroup, string[]]> = [
    ['is', g('postingDate', 'is', '2026-06-14'), ['INV-001']],
    ['before', g('postingDate', 'before', '2026-06-14'), ['INV-002', 'CM-010']],
    ['after', g('postingDate', 'after', '2026-06-10'), ['INV-001']],
    ['between', g('postingDate', 'between', '2026-06-01', '2026-06-30'), ['INV-001', 'INV-002']],
    // today=2026-06-15; inLastDays n keeps rows with day > (today - n) and <= today.
    ['inLastDays 2', g('postingDate', 'inLastDays', 2), ['INV-001']],
    ['inLastDays 7', g('postingDate', 'inLastDays', 7), ['INV-001', 'INV-002']],
  ];
  it.each(cases)('%s', (_name, group, expected) => {
    expect(hits(group)).toEqual(expected);
  });

  it('accepts a full ISO timestamp (uses the date part)', () => {
    const r: Row = { ...rows[0], no: 'TS', postingDate: '2026-06-14T23:59:59Z' };
    expect(matches(r, g('postingDate', 'is', '2026-06-14'), fields, TODAY)).toBe(true);
  });
});

describe('matches — boolean operators', () => {
  it('isTrue / isFalse', () => {
    expect(hits(g('active', 'isTrue'))).toEqual(['INV-001', 'CM-010']);
    expect(hits(g('active', 'isFalse'))).toEqual(['INV-002']);
  });
});

describe('matches — combining rules', () => {
  it('ALL requires every rule', () => {
    const group: FilterGroup = {
      match: 'all',
      rules: [
        { id: 'a', field: 'status', op: 'isNot', value: 'Closed' },
        { id: 'b', field: 'total', op: 'gte', value: 1000 },
      ],
    };
    expect(hits(group)).toEqual(['INV-002']);
  });

  it('ANY requires one rule', () => {
    const group: FilterGroup = {
      match: 'any',
      rules: [
        { id: 'a', field: 'status', op: 'is', value: 'Open' },
        { id: 'b', field: 'total', op: 'gt', value: 2000 },
      ],
    };
    expect(hits(group)).toEqual(['INV-001', 'CM-010']);
  });

  it('empty filter matches everything', () => {
    expect(hits({ match: 'all', rules: [] })).toEqual(['INV-001', 'INV-002', 'CM-010']);
  });

  it('incomplete rules and unknown fields are skipped', () => {
    expect(hits({ match: 'all', rules: [{ id: 'a', field: 'status', op: 'is' }] })).toEqual([
      'INV-001',
      'INV-002',
      'CM-010',
    ]);
    expect(hits({ match: 'all', rules: [{ id: 'a', field: 'nope', op: 'is', value: 'x' }] })).toEqual([
      'INV-001',
      'INV-002',
      'CM-010',
    ]);
  });
});

describe('applyFilter', () => {
  it('returns the same array reference when nothing is active', () => {
    expect(applyFilter(rows, { match: 'all', rules: [] }, fields, TODAY)).toBe(rows);
  });
});

describe('encodeFilter / decodeFilter round-trip', () => {
  const groups: Array<[string, FilterGroup]> = [
    ['single text rule', oneRule('no', 'contains', 'INV')],
    ['number between (two values)', g('total', 'between', 1000, 5000)],
    ['boolean no-value op', g('active', 'isTrue')],
    ['in with array value', g('status', 'in', ['Open', 'Draft'])],
    [
      'multiple rules, any match',
      {
        match: 'any',
        rules: [
          { id: 'a', field: 'status', op: 'is', value: 'Open' },
          { id: 'b', field: 'total', op: 'gte', value: 1000 },
        ],
      },
    ],
  ];
  it.each(groups)('%s survives encode → decode', (_name, group) => {
    const decoded = decodeFilter(encodeFilter(group));
    expect(decoded.match).toBe(group.match);
    // Ids are regenerated on decode; compare everything else.
    expect(decoded.rules.map((r) => ({ field: r.field, op: r.op, value: r.value, value2: r.value2 }))).toEqual(
      group.rules.map((r) => ({ field: r.field, op: r.op, value: r.value, value2: r.value2 })),
    );
  });

  it('encodes "" when there are no complete rules', () => {
    expect(encodeFilter({ match: 'all', rules: [] })).toBe('');
    expect(encodeFilter({ match: 'all', rules: [{ id: 'a', field: 'no', op: 'is' }] })).toBe('');
  });

  it('decodes empty / bad / tampered text to an empty filter, never throws', () => {
    expect(decodeFilter('')).toEqual({ match: 'all', rules: [] });
    expect(decodeFilter(null)).toEqual({ match: 'all', rules: [] });
    expect(decodeFilter('not json {')).toEqual({ match: 'all', rules: [] });
    // Rule with an unknown op is dropped.
    expect(decodeFilter(JSON.stringify({ m: 0, r: [['no', 'bogusOp', 'x']] })).rules).toEqual([]);
  });

  it('keeps a decoded filter matching the same rows', () => {
    const group = g('total', 'between', 1000, 3000);
    const decoded = decodeFilter(encodeFilter(group));
    expect(applyFilter(rows, decoded, fields, TODAY).map((r) => r.no)).toEqual(['INV-002', 'CM-010']);
  });
});
