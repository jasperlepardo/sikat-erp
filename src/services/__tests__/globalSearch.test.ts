import { describe, expect, it } from 'vitest';
import { normalize, numberTerms, search, termsOf, type SearchEntry } from '../globalSearch';

const entry = (key: string, group: SearchEntry['group'], title: string, terms: string[], date?: string): SearchEntry => ({
  key, group, icon: 'description', title, href: `/${key}`, terms, date,
});

const po = (n: number, date: string) => {
  const no = `PO-2026-${String(n).padStart(4, '0')}`;
  return entry(`po-${n}`, 'Documents', no, numberTerms(no), date);
};

describe('normalize', () => {
  it('ignores case, spaces and separators', () => {
    expect(normalize('PO-2026 0001')).toBe('po20260001');
    expect(normalize('  A/P invoice ')).toBe('apinvoice');
  });
});

describe('numberTerms', () => {
  it('adds the prefix with the unpadded last number', () => {
    expect(numberTerms('PO-2026-0042')).toEqual(['po20260042', 'po42']);
    expect(numberTerms('LC-2026-00100')).toEqual(['lc202600100', 'lc100']);
  });
  it('keeps a number with no prefix as is', () => {
    expect(numberTerms('12')).toEqual(['12']);
  });
});

describe('termsOf', () => {
  it('drops empty values and duplicates', () => {
    expect(termsOf('Power Mac', '', undefined, 'power-mac')).toEqual(['powermac']);
  });
});

describe('search', () => {
  const index = [
    po(1, '2026-01-05'),
    po(42, '2026-03-01'),
    po(420, '2026-09-01'),
    entry('bp-1', 'Partners', 'Power Mac Center', termsOf('BP-0001', 'Power Mac Center')),
    entry('page-po', 'Pages', 'Purchase orders', termsOf('Purchase orders')),
    entry('set-po', 'Settings', 'Purchase order approvals', termsOf('Purchase order approvals')),
  ];

  it('returns nothing for an empty query', () => {
    expect(search(index, '   ')).toEqual([]);
  });

  it('finds a document by its short number, exact match first', () => {
    const [docs] = search(index, 'po42');
    expect(docs.group).toBe('Documents');
    expect(docs.hits.map((h) => h.title)).toEqual(['PO-2026-0042', 'PO-2026-0420']);
  });

  it('matches the full number with any separators', () => {
    expect(search(index, 'po 2026 0001')[0].hits[0].title).toBe('PO-2026-0001');
  });

  it('breaks ties by newest date', () => {
    const [docs] = search(index, 'po-2026');
    expect(docs.hits.map((h) => h.title)).toEqual(['PO-2026-0420', 'PO-2026-0042', 'PO-2026-0001']);
  });

  it('matches words in any order across a name', () => {
    expect(search(index, 'center power')[0].hits[0].title).toBe('Power Mac Center');
  });

  it('lists groups in palette order', () => {
    expect(search(index, 'purchase').map((g) => g.group)).toEqual(['Pages', 'Settings']);
  });

  it('caps each group but reports the total, unless expanded', () => {
    const [capped] = search(index, 'po', { perGroup: 2 });
    expect(capped.hits).toHaveLength(2);
    expect(capped.total).toBe(3);
    const [open] = search(index, 'po', { perGroup: 2, expanded: ['Documents'] });
    expect(open.hits).toHaveLength(3);
  });
});
