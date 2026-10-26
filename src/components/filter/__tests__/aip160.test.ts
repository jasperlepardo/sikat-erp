import { describe, it, expect } from 'vitest';
import { formatFilter, parseFilter } from '../aip160';
import type { FilterField, FilterGroup, Op } from '../engine';

/**
 * AIP-160 text ↔ FilterGroup. The fields below cover every type the parser branches on.
 * Note: parseFilter never throws — it returns { ok: false, error } on a bad filter (the brief
 * says it throws InvalidFilterError, but that error lives in listQuery.ts's filterRows instead).
 */
interface Row {
  no: string;
  total: number;
  postingDate: string;
  status: string;
  active: boolean;
}

const fields: FilterField<Row>[] = [
  { key: 'no', label: 'No.', type: 'text', get: (r) => r.no },
  { key: 'total', label: 'Total', type: 'number', get: (r) => r.total },
  { key: 'postingDate', label: 'Date', type: 'date', get: (r) => r.postingDate },
  {
    key: 'status',
    label: 'Status',
    type: 'choice',
    get: (r) => r.status,
    options: [
      { value: 'Open', label: 'Open' },
      { value: 'Draft', label: 'Draft' },
      { value: 'Closed', label: 'Closed' },
    ],
  },
  { key: 'active', label: 'Active', type: 'boolean', get: (r) => r.active },
];

const rule = (field: string, op: Op, value?: unknown, value2?: unknown): FilterGroup => ({
  match: 'all',
  rules: [{ id: 'x', field, op, value, value2 }],
});

/** parseFilter but asserting success and returning the group with ids stripped. */
function parsed(text: string): FilterGroup {
  const r = parseFilter(text, fields);
  expect(r.ok, `expected "${text}" to parse: ${r.ok ? '' : r.error}`).toBe(true);
  if (!r.ok) throw new Error(r.error);
  return { match: r.filter.match, rules: r.filter.rules.map((x) => ({ ...x, id: 'x' })) };
}

describe('formatFilter — every operator', () => {
  const cases: Array<[string, FilterGroup, string]> = [
    ['is', rule('status', 'is', 'Open'), 'status = "Open"'],
    ['isNot', rule('status', 'isNot', 'Open'), 'status != "Open"'],
    ['contains', rule('no', 'contains', 'INV'), 'no:"INV"'],
    ['notContains', rule('no', 'notContains', 'INV'), 'NOT no:"INV"'],
    ['startsWith', rule('no', 'startsWith', 'INV'), 'no = "INV*"'],
    ['gt', rule('total', 'gt', 1000), 'total > 1000'],
    ['gte', rule('total', 'gte', 1000), 'total >= 1000'],
    ['lt', rule('total', 'lt', 1000), 'total < 1000'],
    ['lte', rule('total', 'lte', 1000), 'total <= 1000'],
    ['between', rule('total', 'between', 1000, 5000), '(total >= 1000 AND total <= 5000)'],
    ['before', rule('postingDate', 'before', '2026-06-01'), 'postingDate < "2026-06-01"'],
    ['after', rule('postingDate', 'after', '2026-06-01'), 'postingDate > "2026-06-01"'],
    ['inLastDays', rule('postingDate', 'inLastDays', 7), 'postingDate > daysAgo(7)'],
    ['in (single)', rule('status', 'in', ['Open']), 'status = "Open"'],
    ['in (many)', rule('status', 'in', ['Open', 'Draft']), '(status = "Open" OR status = "Draft")'],
    ['notIn (single)', rule('status', 'notIn', ['Open']), 'NOT status = "Open"'],
    ['notIn (many)', rule('status', 'notIn', ['Open', 'Draft']), 'NOT (status = "Open" OR status = "Draft")'],
    ['isTrue', rule('active', 'isTrue'), 'active = true'],
    ['isFalse', rule('active', 'isFalse'), 'active = false'],
    ['notEmpty', rule('no', 'notEmpty'), 'no:*'],
    ['empty', rule('no', 'empty'), 'NOT no:*'],
  ];
  it.each(cases)('prints %s', (_name, group, text) => {
    expect(formatFilter(group, fields)).toBe(text);
  });

  it('joins multiple rules with AND / OR', () => {
    const all: FilterGroup = {
      match: 'all',
      rules: [
        { id: 'a', field: 'status', op: 'is', value: 'Open' },
        { id: 'b', field: 'total', op: 'gte', value: 1000 },
      ],
    };
    expect(formatFilter(all, fields)).toBe('status = "Open" AND total >= 1000');
    expect(formatFilter({ ...all, match: 'any' }, fields)).toBe('status = "Open" OR total >= 1000');
  });

  it('drops incomplete rules and unknown fields; "" when nothing filters', () => {
    expect(formatFilter({ match: 'all', rules: [{ id: 'a', field: 'status', op: 'is' }] }, fields)).toBe('');
    expect(formatFilter({ match: 'all', rules: [{ id: 'a', field: 'nope', op: 'is', value: 'x' }] }, fields)).toBe('');
    expect(formatFilter({ match: 'all', rules: [] }, fields)).toBe('');
  });
});

describe('parseFilter — every operator', () => {
  const cases: Array<[string, FilterGroup]> = [
    ['status = "Open"', rule('status', 'is', 'Open')],
    ['status != "Open"', rule('status', 'isNot', 'Open')],
    ['no:"INV"', rule('no', 'contains', 'INV')],
    ['NOT no:"INV"', rule('no', 'notContains', 'INV')],
    ['no = "INV*"', rule('no', 'startsWith', 'INV')],
    ['no = "*INV*"', rule('no', 'contains', 'INV')],
    ['total > 1000', rule('total', 'gt', 1000)],
    ['total >= 1000', rule('total', 'gte', 1000)],
    ['total < 1000', rule('total', 'lt', 1000)],
    ['total <= 1000', rule('total', 'lte', 1000)],
    ['(total >= 1000 AND total <= 5000)', rule('total', 'between', 1000, 5000)],
    ['postingDate < "2026-06-01"', rule('postingDate', 'before', '2026-06-01')],
    ['postingDate > "2026-06-01"', rule('postingDate', 'after', '2026-06-01')],
    ['postingDate > daysAgo(7)', rule('postingDate', 'inLastDays', 7)],
    ['(status = "Open" OR status = "Draft")', rule('status', 'in', ['Open', 'Draft'])],
    ['NOT (status = "Open" OR status = "Draft")', rule('status', 'notIn', ['Open', 'Draft'])],
    ['active = true', rule('active', 'isTrue')],
    ['active = false', rule('active', 'isFalse')],
    ['no:*', rule('no', 'notEmpty')],
    ['NOT no:*', rule('no', 'empty')],
  ];
  it.each(cases)('reads %s', (text, group) => {
    expect(parsed(text)).toEqual(group);
  });

  it('accepts the - prefix as NOT', () => {
    expect(parsed('-no:"INV"')).toEqual(rule('no', 'notContains', 'INV'));
  });

  it('is case-insensitive on field names and choice values', () => {
    expect(parsed('STATUS = "open"')).toEqual(rule('status', 'is', 'Open'));
  });

  it('reads multiple AND rules and OR rules', () => {
    expect(parsed('status = "Open" AND total >= 1000')).toEqual({
      match: 'all',
      rules: [
        { id: 'x', field: 'status', op: 'is', value: 'Open', value2: undefined },
        { id: 'x', field: 'total', op: 'gte', value: 1000, value2: undefined },
      ],
    });
    expect(parsed('status = "Open" OR status = "Draft"')).toEqual(rule('status', 'in', ['Open', 'Draft']));
  });

  it('empty text is an empty filter', () => {
    expect(parsed('')).toEqual({ match: 'all', rules: [] });
    expect(parsed('   ')).toEqual({ match: 'all', rules: [] });
  });
});

describe('parseFilter — invalid filters report an error (never throw)', () => {
  const bad = [
    ['unclosed quote', 'status = "Open'],
    ['unknown field', 'bogus = "x"'],
    ['number field needs a number', 'total = "abc"'],
    ['date field needs a date', 'postingDate = "nope"'],
    ['choice value not in options', 'status = "Nonexistent"'],
    ['bare value with no field', '"INV"'],
    ['dangling operator', 'total >'],
    ['boolean needs true/false', 'active = "maybe"'],
    ['operator not available for type', 'total:"x"'],
    ['trailing junk', 'status = "Open" garbage'],
  ] as const;
  it.each(bad)('%s', (_name, text) => {
    const r = parseFilter(text, fields);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeTruthy();
  });
});

describe('round-trip parse → format → parse', () => {
  const texts = [
    'status = "Open"',
    'status != "Open"',
    'no:"INV"',
    'NOT no:"INV"',
    'no = "INV*"',
    'total > 1000',
    'total >= 1000',
    'total < 1000',
    'total <= 1000',
    '(total >= 1000 AND total <= 5000)',
    'postingDate < "2026-06-01"',
    'postingDate > "2026-06-01"',
    'postingDate > daysAgo(7)',
    '(status = "Open" OR status = "Draft")',
    'NOT (status = "Open" OR status = "Draft")',
    'active = true',
    'active = false',
    'no:*',
    'NOT no:*',
    'status = "Open" AND total >= 1000',
  ];
  it.each(texts)('is stable for %s', (text) => {
    const first = parsed(text);
    const printed = formatFilter(first, fields);
    expect(parsed(printed)).toEqual(first);
  });
});
