import { describe, it, expect } from 'vitest';
import { filterRows, InvalidFilterError } from '../listQuery';
import type { FilterField } from '../../components/filter/engine';

/**
 * filterRows: the AIP-132 List-style helper — parse AIP-160 text, apply it to rows.
 * Empty text matches everything; a filter that won't parse throws InvalidFilterError;
 * the `fields` option declares what may be filtered on.
 */
interface Row {
  no: string;
  total: number;
  status: string;
}

const fields: FilterField<Row>[] = [
  { key: 'no', label: 'No.', type: 'text', get: (r) => r.no },
  { key: 'total', label: 'Total', type: 'number', get: (r) => r.total },
  {
    key: 'status',
    label: 'Status',
    type: 'choice',
    get: (r) => r.status,
    options: [
      { value: 'Open', label: 'Open' },
      { value: 'Closed', label: 'Closed' },
    ],
  },
];

const rows: Row[] = [
  { no: 'INV-001', total: 500, status: 'Open' },
  { no: 'INV-002', total: 1500, status: 'Closed' },
  { no: 'CM-010', total: 3000, status: 'Open' },
];

const nos = (r: Row[]) => r.map((x) => x.no);

describe('filterRows — empty filter matches everything', () => {
  it.each([undefined, '', '   '])('returns all rows for %o', (filter) => {
    expect(filterRows(rows, filter, fields)).toBe(rows);
  });
});

describe('filterRows — filters by AIP-160 text', () => {
  const cases: Array<[string, string[]]> = [
    ['status = "Open"', ['INV-001', 'CM-010']],
    ['no:"INV"', ['INV-001', 'INV-002']],
    ['total >= 1500', ['INV-002', 'CM-010']],
    ['(total >= 1000 AND total <= 2000)', ['INV-002']],
    ['status = "Open" AND total > 1000', ['CM-010']],
    ['status = "Closed" OR total < 1000', ['INV-001', 'INV-002']],
  ];
  it.each(cases)('%s', (filter, expected) => {
    expect(nos(filterRows(rows, filter, fields))).toEqual(expected);
  });
});

describe('filterRows — throws InvalidFilterError on a bad filter', () => {
  const bad = ['status = "Open', 'bogus = "x"', 'total = "abc"', 'status = "Nope"'];
  it.each(bad)('%s', (filter) => {
    expect(() => filterRows(rows, filter, fields)).toThrow(InvalidFilterError);
  });

  it('carries the offending filter and a message', () => {
    try {
      filterRows(rows, 'bogus = "x"', fields);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidFilterError);
      const err = e as InvalidFilterError;
      expect(err.filter).toBe('bogus = "x"');
      expect(err.message).toBeTruthy();
      expect(err.name).toBe('InvalidFilterError');
    }
  });
});

describe('filterRows — respects the fields option', () => {
  it('defaults to no fields: any field reference is unknown and throws', () => {
    expect(() => filterRows(rows, 'status = "Open"')).toThrow(InvalidFilterError);
  });

  it('only declared fields are filterable', () => {
    const onlyNo: FilterField<Row>[] = [fields[0]];
    expect(nos(filterRows(rows, 'no:"CM"', onlyNo))).toEqual(['CM-010']);
    expect(() => filterRows(rows, 'total >= 1000', onlyNo)).toThrow(InvalidFilterError);
  });
});
