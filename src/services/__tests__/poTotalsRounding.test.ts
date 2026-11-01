/**
 * The purchasing footer's VAT must round per line — the same way apJournal posts input VAT — so the
 * displayed Total equals the posted GL total (no sub-centavo drift on multi-line documents).
 */
import { describe, it, expect } from 'vitest';
import { poTotals } from '../purchaseOrders';
import { round2 } from '../num';

const rateOf = () => 12; // flat 12% VAT
const line = (unitPrice: number) => ({ itemId: 'i', quantity: 1, unitPrice, discountPct: 0, taxCode: 'VAT' });

describe('poTotals VAT rounding', () => {
  // 12% of 100.01 = 12.0012 → 12.00 per line. Five lines: per-line = 60.00; VAT-of-summed-base = 60.01.
  const lines = Array.from({ length: 5 }, () => line(100.01));
  const perLine = round2(lines.reduce((n, l) => n + round2((l.unitPrice * 12) / 100), 0));
  const wholeBase = round2((lines.reduce((n, l) => n + l.unitPrice, 0) * 12) / 100);

  it('sums per-line rounded VAT (matches apJournal), not VAT of the summed base', () => {
    const t = poTotals({ discountPct: 0, freight: 0, freightTaxCode: '', lines }, rateOf);
    expect(t.tax).toBe(perLine);
    expect(t.tax).toBe(60.0);
    expect(perLine).not.toBe(wholeBase); // the two methods genuinely differ here (60.00 vs 60.01)
  });

  it('keeps the Total consistent with that VAT', () => {
    const t = poTotals({ discountPct: 0, freight: 0, freightTaxCode: '', lines }, rateOf);
    expect(t.total).toBe(round2(t.beforeDiscount - t.discount + t.freight + t.tax));
  });
});
