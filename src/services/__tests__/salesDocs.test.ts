import { describe, it, expect } from 'vitest';
import type { TaxCode } from '../../mocks/taxes';
import { rateFrom } from '../../mocks/taxes';
import type { SoLine } from '../../mocks/salesOrders';
import { lineNet, lineTax, openQty, soDueDate, soTotals } from '../salesOrders';
import { qtTotals } from '../quotations';
import { dnOpenQty, dnTotals } from '../deliveries';
import { arTotals, balanceDue, installmentSchedule } from '../arInvoices';
import { riBalanceDue, riTotals } from '../reserveInvoices';
import { creditableSalesReturns, srOpenQty, srTotals } from '../salesReturns';
import { arCmTotals, netArCredit } from '../arCreditMemos';
import { baTotals, openAmountLC, openQty as baOpenQty } from '../blanketAgreements';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// A sales-order line. The total/qty helpers only read quantity, unitPrice, discountPct,
// taxCode, status and deliveredQty — the rest is filler so the object type-checks.
const soLine = (over: Partial<SoLine> = {}): SoLine => ({
  id: 'l1',
  itemId: 'itm-1',
  itemNo: 'ITM-1',
  description: 'Thing',
  quantity: 1,
  deliveredQty: 0,
  uomCode: 'EA',
  uomName: 'Each',
  itemsPerUnit: 1,
  warehouse: 'WH',
  priceListId: '',
  unitPrice: 100,
  discountPct: 0,
  priceSource: 'Manual',
  taxCode: 'OVAT',
  glAccount: '',
  status: 'Open',
  agreementId: '',
  agreementLineId: '',
  ...over,
});

// Minimal document header carrying only the fields the footer-total helpers read.
const doc = (lines: SoLine[], over: Partial<{ discountPct: number; freight: number; freightTaxCode: string; rounding: boolean }> = {}) => ({
  lines,
  discountPct: 0,
  freight: 0,
  freightTaxCode: 'OVAT',
  rounding: false,
  ...over,
});

// A VAT code whose rate changed from 10% to 12% on 2026-02-01, so posting date matters.
const taxCodes: TaxCode[] = [
  {
    id: 'OVAT',
    code: 'OVAT',
    name: 'Output VAT',
    direction: 'Sales',
    category: 'Standard',
    rates: [
      { from: '2026-01-01', rate: 10 },
      { from: '2026-02-01', rate: 12 },
    ],
    glAccount: '2310',
    returnFormIds: [],
    legalBasis: '',
    active: true,
    notes: '',
    atc: '',
  },
  {
    id: 'ZERO',
    code: 'ZERO',
    name: 'Zero-rated',
    direction: 'Sales',
    category: 'Zero-rated',
    rates: [{ from: '2026-01-01', rate: 0 }],
    glAccount: '',
    returnFormIds: [],
    legalBasis: '',
    active: true,
    notes: '',
    atc: '',
  },
];

const rate12 = () => 12; // flat 12% for the plain cases

// ── lineNet / lineTax ───────────────────────────────────────────────────────

describe('lineNet', () => {
  it('is quantity × discounted unit price, to the centavo', () => {
    expect(lineNet(soLine({ quantity: 3, unitPrice: 100 }))).toBe(300);
    expect(lineNet(soLine({ quantity: 2, unitPrice: 100, discountPct: 10 }))).toBe(180);
  });

  it('rounds to 2 decimals', () => {
    // 1 × 33.333 = 33.333 → 33.33
    expect(lineNet(soLine({ quantity: 1, unitPrice: 33.333 }))).toBe(33.33);
    // 3 × 10.005 = 30.015 → 30.02 (round half up)
    expect(lineNet(soLine({ quantity: 3, unitPrice: 10.005 }))).toBe(30.02);
  });
});

describe('lineTax', () => {
  it('taxes the net after the document discount', () => {
    // net 100, 12% VAT, no doc discount
    expect(lineTax(soLine({ quantity: 1, unitPrice: 100 }), 12, 0)).toBe(12);
    // net 100, 12% VAT, 10% doc discount → tax base 90 → 10.80
    expect(lineTax(soLine({ quantity: 1, unitPrice: 100 }), 12, 10)).toBe(10.8);
  });

  it('is zero at a 0% rate', () => {
    expect(lineTax(soLine({ unitPrice: 500 }), 0, 0)).toBe(0);
  });
});

// ── soTotals: discount, freight, tax, rounding ───────────────────────────────

describe('soTotals', () => {
  it('sums lines, applies the header discount, and taxes the discounted base', () => {
    const t = soTotals(doc([soLine({ quantity: 1, unitPrice: 1000 })], { discountPct: 10 }), rate12);
    expect(t.beforeDiscount).toBe(1000);
    expect(t.discount).toBe(100);
    // tax base 900 @ 12% = 108
    expect(t.tax).toBe(108);
    expect(t.total).toBe(1000 - 100 + 108); // 1008
    expect(t.freight).toBe(0);
    expect(t.rounding).toBe(0);
  });

  it('adds freight and taxes freight by its own code', () => {
    const t = soTotals(doc([soLine({ quantity: 1, unitPrice: 1000 })], { freight: 200, freightTaxCode: 'OVAT' }), rate12);
    expect(t.freight).toBe(200);
    // line tax 120 + freight tax 24
    expect(t.tax).toBe(144);
    expect(t.total).toBe(1000 + 200 + 144); // 1344
  });

  it('a zero-rated freight code adds no freight tax', () => {
    const rateOf = (c: string) => (c === 'ZERO' ? 0 : 12);
    const t = soTotals(doc([soLine({ quantity: 1, unitPrice: 1000 })], { freight: 200, freightTaxCode: 'ZERO' }), rateOf);
    expect(t.tax).toBe(120); // only the line
    expect(t.total).toBe(1320);
  });

  it('rounds the total to the currency step only when rounding is on', () => {
    // raw total 1008.37, step "Round to 1" → 1008, rounding -0.37
    const d = doc([soLine({ quantity: 1, unitPrice: 900.33 })], { rounding: true });
    const t = soTotals(d, rate12, 'Round to 1');
    // beforeDiscount 900.33, tax 108.04 → raw 1008.37 → 1008
    expect(t.rounding).toBe(-0.37);
    expect(t.total).toBe(1008);
  });

  it('does not round when the rounding flag is off even with a rule passed', () => {
    const d = doc([soLine({ quantity: 1, unitPrice: 900.33 })], { rounding: false });
    const t = soTotals(d, rate12, 'Round to 1');
    expect(t.rounding).toBe(0);
    expect(t.total).toBe(1008.37);
  });

  it('resolves the VAT rate by posting date (10% before 1 Feb, 12% after)', () => {
    const d = doc([soLine({ quantity: 1, unitPrice: 1000 })]);
    const janTotal = soTotals(d, rateFrom(taxCodes, '2026-01-15'));
    const febTotal = soTotals(d, rateFrom(taxCodes, '2026-02-15'));
    expect(janTotal.tax).toBe(100); // 10%
    expect(febTotal.tax).toBe(120); // 12%
  });

  it('handles multiple lines with different tax codes', () => {
    const rateOf = rateFrom(taxCodes, '2026-03-01');
    const t = soTotals(doc([soLine({ quantity: 1, unitPrice: 1000, taxCode: 'OVAT' }), soLine({ id: 'l2', quantity: 2, unitPrice: 500, taxCode: 'ZERO' })]), rateOf);
    expect(t.beforeDiscount).toBe(2000);
    expect(t.tax).toBe(120); // only the OVAT line taxed
    expect(t.total).toBe(2120);
  });
});

// ── openQty / soDueDate ──────────────────────────────────────────────────────

describe('openQty (sales order line)', () => {
  it('is quantity minus delivered for an open line', () => {
    expect(openQty(soLine({ quantity: 10, deliveredQty: 4 }))).toBe(6);
  });

  it('is zero for a closed line and never negative', () => {
    expect(openQty(soLine({ quantity: 10, deliveredQty: 4, status: 'Closed' }))).toBe(0);
    expect(openQty(soLine({ quantity: 5, deliveredQty: 8 }))).toBe(0);
  });
});

describe('soDueDate', () => {
  it('adds the payment term days when no manual months/days', () => {
    expect(soDueDate('2026-01-15', 30)).toBe('2026-02-14');
  });

  it('adds manual months and days instead of term days when given', () => {
    expect(soDueDate('2026-01-15', 30, 1, 0)).toBe('2026-02-15');
    expect(soDueDate('2026-01-31', 0, 1, 0)).toBe('2026-03-03'); // Jan 31 + 1 month overflows Feb
    expect(soDueDate('2026-01-15', 30, 0, 5)).toBe('2026-01-20');
  });

  it('returns "" for an empty posting date', () => {
    expect(soDueDate('', 30)).toBe('');
  });
});

// ── qt / dn / ar / ri / sr / arCm totals delegate to soTotals ────────────────

describe('document totals wrappers', () => {
  const d = doc([soLine({ quantity: 1, unitPrice: 1000 })], { discountPct: 10, freight: 100 });
  const expected = soTotals(d, rate12);

  it('qtTotals matches soTotals', () => {
    expect(qtTotals(d as never, rate12)).toEqual(expected);
  });
  it('dnTotals matches soTotals', () => {
    expect(dnTotals(d as never, rate12)).toEqual(expected);
  });
  it('arTotals matches soTotals', () => {
    expect(arTotals(d as never, rate12)).toEqual(expected);
  });
  it('riTotals matches soTotals', () => {
    expect(riTotals(d as never, rate12)).toEqual(expected);
  });
  it('srTotals matches soTotals', () => {
    expect(srTotals(d as never, rate12)).toEqual(expected);
  });
  it('arCmTotals matches soTotals', () => {
    expect(arCmTotals(d as never, rate12)).toEqual(expected);
  });
});

// ── balanceDue / riBalanceDue / netArCredit ──────────────────────────────────

describe('balanceDue family', () => {
  it('balanceDue is total minus withholding minus applied', () => {
    expect(balanceDue(1120, 50, 500)).toBe(570);
    expect(balanceDue(1120.555, 0, 0)).toBe(1120.56); // rounds
  });
  it('riBalanceDue mirrors balanceDue', () => {
    expect(riBalanceDue(1120, 50, 500)).toBe(570);
  });
  it('netArCredit is total minus applied', () => {
    expect(netArCredit(1000, 300)).toBe(700);
    expect(netArCredit(1000, 0)).toBe(1000);
  });
});

// ── installmentSchedule ──────────────────────────────────────────────────────

describe('installmentSchedule', () => {
  it('splits into equal parts with the last taking the cents', () => {
    const s = installmentSchedule('2026-01-15', 3, 100, 30);
    expect(s).toHaveLength(3);
    expect(s.map((p) => p.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(s.reduce((n, p) => n + p.amount, 0)).toBeCloseTo(100, 2);
  });

  it('dates each installment a term period apart from the due date', () => {
    const s = installmentSchedule('2026-01-15', 3, 90, 30);
    expect(s.map((p) => p.dueDate)).toEqual(['2026-01-15', '2026-02-14', '2026-03-16']);
  });

  it('defaults the step to 30 days when termDays is 0 (COD)', () => {
    const s = installmentSchedule('2026-01-15', 2, 100, 0);
    expect(s.map((p) => p.dueDate)).toEqual(['2026-01-15', '2026-02-14']);
  });

  it('coerces count to at least 1 and gives one full-balance row', () => {
    const s = installmentSchedule('2026-01-15', 0, 500, 30);
    expect(s).toHaveLength(1);
    expect(s[0].amount).toBe(500);
  });

  it('leaves dates blank when the due date is empty', () => {
    const s = installmentSchedule('', 2, 100, 30);
    expect(s.map((p) => p.dueDate)).toEqual(['', '']);
  });
});

// ── dnOpenQty / srOpenQty (partially invoiced / credited) ────────────────────

describe('dnOpenQty', () => {
  const l = { quantity: 10, invoicedQty: 4 } as never;
  it('is quantity minus invoiced while the delivery is Open', () => {
    expect(dnOpenQty(l, { status: 'Open' })).toBe(6);
  });
  it('is zero once the delivery is Closed', () => {
    expect(dnOpenQty(l, { status: 'Closed' })).toBe(0);
  });
  it('never goes negative', () => {
    expect(dnOpenQty({ quantity: 3, invoicedQty: 9 } as never, { status: 'Open' })).toBe(0);
  });
});

describe('srOpenQty', () => {
  const l = { quantity: 10, creditedQty: 4 } as never;
  it('is quantity minus credited while the return is Open', () => {
    expect(srOpenQty(l, { status: 'Open' })).toBe(6);
  });
  it('is zero once the return is Closed', () => {
    expect(srOpenQty(l, { status: 'Closed' })).toBe(0);
  });
});

// ── creditableSalesReturns ───────────────────────────────────────────────────

describe('creditableSalesReturns', () => {
  const mkReturn = (over: Record<string, unknown>) =>
    ({ customerId: 'c1', status: 'Open', lines: [{ quantity: 5, creditedQty: 0 }], ...over }) as never;

  it("returns a customer's open returns that still have quantity to credit", () => {
    const all = [mkReturn({ id: 'r1' })];
    expect(creditableSalesReturns(all, 'c1')).toHaveLength(1);
  });

  it('excludes other customers, non-open returns, and fully-credited ones', () => {
    const all = [
      mkReturn({ id: 'r1', customerId: 'c2' }), // other customer
      mkReturn({ id: 'r2', status: 'Closed' }), // not open
      mkReturn({ id: 'r3', lines: [{ quantity: 5, creditedQty: 5 }] }), // nothing left
      mkReturn({ id: 'r4' }), // keeper
    ];
    const got = creditableSalesReturns(all, 'c1');
    expect(got.map((r) => (r as { id: string }).id)).toEqual(['r4']);
  });
});

// ── Blanket agreement totals and open amounts ────────────────────────────────

describe('blanket agreement totals', () => {
  const baLine = (over: Record<string, unknown>) =>
    ({
      plannedQty: 100,
      unitPrice: 50,
      cumulativeQty: 0,
      cumulativeCommittedAmountLC: 0,
      cumulativeAmountLC: 0,
      rowStatus: 'Open',
      ...over,
    }) as never;

  it('openQty is planned minus fulfilled, zero when the row is closed', () => {
    expect(baOpenQty(baLine({ plannedQty: 100, cumulativeQty: 30 }))).toBe(70);
    expect(baOpenQty(baLine({ plannedQty: 100, cumulativeQty: 30, rowStatus: 'Closed' }))).toBe(0);
    expect(baOpenQty(baLine({ plannedQty: 100, cumulativeQty: 150 }))).toBe(0); // never negative
  });

  it('openAmountLC is open qty × unit price', () => {
    expect(openAmountLC(baLine({ plannedQty: 100, cumulativeQty: 30, unitPrice: 50 }))).toBe(70 * 50);
  });

  it('baTotals sums planned, committed, cumulative and open across lines', () => {
    const ba = {
      lines: [
        baLine({ plannedQty: 100, unitPrice: 50, cumulativeQty: 40, cumulativeAmountLC: 2000, cumulativeCommittedAmountLC: 500 }),
        baLine({ plannedQty: 10, unitPrice: 100, cumulativeQty: 0, cumulativeAmountLC: 0, cumulativeCommittedAmountLC: 300 }),
      ],
    } as never;
    const t = baTotals(ba);
    expect(t.plannedTotal).toBe(100 * 50 + 10 * 100); // 6000
    expect(t.committedTotal).toBe(800);
    expect(t.cumulativeTotal).toBe(2000);
    // open: (100-40)*50 + (10-0)*100 = 3000 + 1000
    expect(t.openTotal).toBe(4000);
  });
});
