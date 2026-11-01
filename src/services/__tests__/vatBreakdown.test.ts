/**
 * The BIR sales-invoice breakdown (VATable / Zero-rated / VAT-exempt), and that the DPI's billed-share
 * totals are computed per line so they match what dpiJournal posts.
 */
import { describe, it, expect } from 'vitest';
import type { TaxCode } from '../../mocks/taxes';
import { soVatBreakdown } from '../salesOrders';
import { dpiTotals } from '../apDownPaymentInvoices';
import { round2 } from '../num';

const codes = [
  { code: 'V', category: 'Standard' },
  { code: 'Z', category: 'Zero-rated' },
  { code: 'X', category: 'Exempt' },
] as unknown as TaxCode[];
const rateOf = (c: string) => (c === 'V' ? 12 : 0);
const line = (unitPrice: number, taxCode: string) => ({ itemId: taxCode, quantity: 1, unitPrice, discountPct: 0, taxCode });

describe('soVatBreakdown', () => {
  const lines = [line(100, 'V'), line(200, 'Z'), line(50, 'X')] as never;

  it('splits the taxable base by VAT category', () => {
    expect(soVatBreakdown({ lines, discountPct: 0 } as never, codes, rateOf)).toEqual({ vatable: 100, zeroRated: 200, exempt: 50 });
  });

  it('applies the document discount to each category', () => {
    expect(soVatBreakdown({ lines, discountPct: 10 } as never, codes, rateOf)).toEqual({ vatable: 90, zeroRated: 180, exempt: 45 });
  });

  it('the three buckets sum to the net taxable base', () => {
    const bd = soVatBreakdown({ lines, discountPct: 10 } as never, codes, rateOf);
    expect(round2(bd.vatable + bd.zeroRated + bd.exempt)).toBe(round2(350 * 0.9));
  });
});

describe('dpiTotals per-line share', () => {
  const rate12 = () => 12;
  const dpiLines = Array.from({ length: 5 }, () => line(100.01, 'V'));
  const d = { lines: dpiLines, discountPct: 0, freightTaxCode: '', dpmPct: 30 };

  it('sums tax per line with the share folded in (matches dpiJournal), not share-of-rounded-total', () => {
    const t = dpiTotals(d as never, rate12);
    const factor = 0.3;
    const perLine = round2(dpiLines.reduce((n, l) => n + round2((l.unitPrice * factor * 12) / 100), 0));
    expect(t.tax).toBe(perLine);
    expect(t.total).toBe(round2(t.dpm + t.tax));
  });
});
