import { describe, it, expect } from 'vitest';
import {
  allocateInSequence,
  amountDue,
  paymentDifference,
  rowDiscount,
  weightedDueDate,
} from '../incomingPayments';
import {
  meansBalance,
  overallAmount,
  paymentJournal,
  rowFxDifference,
  // rowSettled is re-exported from the outgoing module (incomingPayments.ts omits it).
  rowSettled,
} from '../outgoingPayments';
import {
  blankIncomingPayment,
  type IncomingPayment,
  type IncomingRow,
} from '../../mocks/incomingPayments';
import {
  blankPayment,
  type OutgoingPayment,
  type PaymentRow,
} from '../../mocks/outgoingPayments';
import { round2 } from '../num';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const TODAY = '2026-06-15';

/** A tickable incoming (A/R) row, with sensible defaults overridable per test. */
function incomingRow(patch: Partial<IncomingRow> = {}): IncomingRow {
  return {
    id: 'ar-x-1',
    invoiceId: 'ar-x',
    docNo: 'SI-2026-0001',
    installment: 0,
    installments: 1,
    docDate: '2026-06-01',
    dueDate: '2026-06-30',
    total: 1000,
    wtAmount: 0,
    balanceDue: 1000,
    blocked: false,
    cashDiscountPct: 0,
    amount: 0,
    invoiceFx: 1,
    controlAccount: '1120',
    projectId: '',
    selected: false,
    ...patch,
  };
}

/** A tickable outgoing (A/P) row. */
function paymentRow(patch: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'ap-x',
    invoiceId: 'ap-x',
    docNo: 'Primary 290001',
    vendorRef: 'V-0001',
    docDate: '2026-06-01',
    dueDate: '2026-06-30',
    total: 1000,
    wtAmount: 0,
    balanceDue: 1000,
    cashDiscountPct: 0,
    amount: 0,
    invoiceFx: 1,
    projectId: '',
    selected: true,
    ...patch,
  };
}

function incoming(patch: Partial<IncomingPayment> = {}): IncomingPayment {
  return { ...blankIncomingPayment(TODAY), id: 'rc-x', ...patch };
}

function outgoing(patch: Partial<OutgoingPayment> = {}): OutgoingPayment {
  return { ...blankPayment(TODAY), id: 'op-x', ...patch };
}

// ── rowDiscount / rowSettled (shared payment math) ───────────────────────────────

describe('rowDiscount', () => {
  it('is the discount % of the amount paid toward the row, rounded to the centavo', () => {
    expect(rowDiscount({ amount: 1000, cashDiscountPct: 2 })).toBe(20);
    expect(rowDiscount({ amount: 0, cashDiscountPct: 2 })).toBe(0);
    expect(rowDiscount({ amount: 1000, cashDiscountPct: 0 })).toBe(0);
  });

  it('rounds to centavos', () => {
    // 333.33 * 1.5% = 4.99995 -> 5.00
    expect(rowDiscount({ amount: 333.33, cashDiscountPct: 1.5 })).toBe(5);
  });
});

describe('rowSettled', () => {
  it('settles the invoice for the payment plus the cash discount', () => {
    // Pay 980, take a 2% discount on it -> clears 980 + 19.60 = 999.60 of the invoice.
    expect(rowSettled({ amount: 980, cashDiscountPct: 2 })).toBe(999.6);
  });

  it('equals the amount when there is no discount', () => {
    expect(rowSettled({ amount: 1000, cashDiscountPct: 0 })).toBe(1000);
  });
});

// ── allocateInSequence (incoming) ───────────────────────────────────────────────

describe('allocateInSequence', () => {
  it('fills documents in table order, settling the last one partly', () => {
    const rows = [
      incomingRow({ id: 'a', balanceDue: 500 }),
      incomingRow({ id: 'b', balanceDue: 500 }),
      incomingRow({ id: 'c', balanceDue: 500 }),
    ];
    // 800 received: fully pays a (500), partly pays b (300), leaves c untouched.
    const out = allocateInSequence(rows, 800);

    expect(out[0]).toMatchObject({ id: 'a', selected: true, amount: 500 });
    expect(out[1]).toMatchObject({ id: 'b', selected: true, amount: 300 });
    // Untouched row: not selected, amount reset to its full balance due.
    expect(out[2]).toMatchObject({ id: 'c', selected: false, amount: 500 });
  });

  it('settles every row when the amount covers them all', () => {
    const rows = [incomingRow({ id: 'a', balanceDue: 400 }), incomingRow({ id: 'b', balanceDue: 600 })];
    const out = allocateInSequence(rows, 1000);
    expect(out.map((r) => [r.selected, r.amount])).toEqual([
      [true, 400],
      [true, 600],
    ]);
  });

  it('skips blocked rows, allocating to the next available one', () => {
    const rows = [
      incomingRow({ id: 'a', balanceDue: 500, blocked: true }),
      incomingRow({ id: 'b', balanceDue: 500 }),
    ];
    const out = allocateInSequence(rows, 500);
    expect(out[0]).toMatchObject({ id: 'a', selected: false });
    expect(out[1]).toMatchObject({ id: 'b', selected: true, amount: 500 });
  });

  it('is immutable — it returns new rows and leaves the inputs alone', () => {
    const rows = [incomingRow({ id: 'a', balanceDue: 500, amount: 0, selected: false })];
    const out = allocateInSequence(rows, 500);
    expect(rows[0]).toMatchObject({ amount: 0, selected: false });
    expect(out[0]).not.toBe(rows[0]);
  });
});

// ── amountDue (incoming) ────────────────────────────────────────────────────────

describe('amountDue', () => {
  it('sums the selected rows plus the on-account amount for a Customer payment', () => {
    const p = incoming({
      type: 'Customer',
      rows: [
        incomingRow({ id: 'a', selected: true, amount: 400 }),
        incomingRow({ id: 'b', selected: true, amount: 350 }),
        incomingRow({ id: 'c', selected: false, amount: 999 }), // not selected -> ignored
      ],
      onAccount: 50,
    });
    expect(amountDue(p)).toBe(800);
  });

  it('ignores selected rows with a zero amount', () => {
    const p = incoming({
      type: 'Customer',
      rows: [incomingRow({ id: 'a', selected: true, amount: 0 })],
      onAccount: 0,
    });
    expect(amountDue(p)).toBe(0);
  });

  it('sums the G/L lines for an Account payment', () => {
    const p = incoming({
      type: 'Account',
      accountRows: [
        { id: '1', account: '7010', remarks: '', amount: 100 },
        { id: '2', account: '7030', remarks: '', amount: 42.65 },
      ],
    });
    expect(amountDue(p)).toBe(142.65);
  });
});

// ── paymentDifference (incoming) ────────────────────────────────────────────────

describe('paymentDifference', () => {
  it('is received minus due, within the 1-peso allowance', () => {
    const p = incoming({
      type: 'Customer',
      rows: [incomingRow({ id: 'a', selected: true, amount: 1000 })],
      means: { ...blankIncomingPayment(TODAY).means, transfer: { account: '1015', date: TODAY, reference: '', amount: 1000.5 } },
    });
    const { diff, withinAllowance } = paymentDifference(p, 1);
    expect(diff).toBe(0.5);
    expect(withinAllowance).toBe(true);
  });

  it('flags a gap beyond the allowance as out of range, in PHP terms', () => {
    const p = incoming({
      type: 'Customer',
      rows: [incomingRow({ id: 'a', selected: true, amount: 1000 })],
      means: { ...blankIncomingPayment(TODAY).means, transfer: { account: '1015', date: TODAY, reference: '', amount: 1005 } },
    });
    const { diff, withinAllowance } = paymentDifference(p, 1);
    expect(diff).toBe(5);
    expect(withinAllowance).toBe(false);
  });

  it('measures the allowance in pesos, so the fx rate scales a foreign gap', () => {
    // 0.5 USD difference at 56 PHP/USD = 28 PHP, well beyond the 1-peso allowance.
    const p = incoming({
      type: 'Customer',
      currency: 'USD',
      rows: [incomingRow({ id: 'a', selected: true, amount: 1000 })],
      means: { ...blankIncomingPayment(TODAY).means, transfer: { account: '1018', date: TODAY, reference: '', amount: 1000.5 } },
    });
    const { diff, withinAllowance } = paymentDifference(p, 56);
    expect(diff).toBe(0.5);
    expect(withinAllowance).toBe(false);
  });
});

// ── weightedDueDate (shared) ────────────────────────────────────────────────────

describe('weightedDueDate', () => {
  it('falls back when nothing is dated', () => {
    const means = { transfer: { amount: 0, date: '' }, checks: [] as { amount: number; dueDate: string }[] };
    expect(weightedDueDate(means, '2026-07-01')).toBe('2026-07-01');
  });

  it('returns the single dated means when there is only one', () => {
    const means = { transfer: { amount: 1000, date: '2026-07-10' }, checks: [] as { amount: number; dueDate: string }[] };
    expect(weightedDueDate(means, '2026-01-01')).toBe('2026-07-10');
  });

  it('is the amount-weighted average of the transfer date and check due dates', () => {
    // 1000 on 2026-07-01 and 3000 on 2026-07-09 -> weighted day is 2026-07-07.
    const means = {
      transfer: { amount: 1000, date: '2026-07-01' },
      checks: [{ amount: 3000, dueDate: '2026-07-09' }],
    };
    expect(weightedDueDate(means, '2026-01-01')).toBe('2026-07-07');
  });
});

// ── overallAmount (outgoing) ────────────────────────────────────────────────────

describe('overallAmount', () => {
  it('sums selected rows plus on account for a Vendor payment', () => {
    const p = outgoing({
      type: 'Vendor',
      rows: [
        paymentRow({ id: 'a', selected: true, amount: 600 }),
        paymentRow({ id: 'b', selected: false, amount: 999 }),
      ],
      onAccount: 100,
    });
    expect(overallAmount(p)).toBe(700);
  });

  it('sums the G/L lines for an Account payment', () => {
    const p = outgoing({
      type: 'Account',
      accountRows: [
        { id: '1', account: '6225', remarks: '', amount: 500, projectId: '' },
        { id: '2', account: '6390', remarks: '', amount: 250, projectId: '' },
      ],
    });
    expect(overallAmount(p)).toBe(750);
  });
});

// ── meansBalance (outgoing) ─────────────────────────────────────────────────────

describe('meansBalance', () => {
  it('is what the payment means still have to cover: overall + bank charge - means entered', () => {
    const p = outgoing({
      type: 'Vendor',
      rows: [paymentRow({ id: 'a', selected: true, amount: 1000 })],
      onAccount: 0,
      means: {
        ...blankPayment(TODAY).means,
        bankCharge: 50,
        transfer: { account: '1015', date: TODAY, reference: '', amount: 400 },
      },
    });
    // 1000 overall + 50 charge - 400 transferred = 650 still to cover.
    expect(meansBalance(p)).toBe(650);
  });

  it('is zero once the means fully cover the overall amount and charge', () => {
    const p = outgoing({
      type: 'Vendor',
      rows: [paymentRow({ id: 'a', selected: true, amount: 1000 })],
      means: {
        ...blankPayment(TODAY).means,
        bankCharge: 0,
        transfer: { account: '1015', date: TODAY, reference: '', amount: 1000 },
      },
    });
    expect(meansBalance(p)).toBe(0);
  });
});

// ── rowFxDifference (outgoing) ──────────────────────────────────────────────────

describe('rowFxDifference', () => {
  it('is zero on a down-payment (DPR) row — nothing was booked to clear', () => {
    const r = paymentRow({ docType: 'DPR', amount: 1000, invoiceFx: 50 });
    expect(rowFxDifference(r, 58)).toBe(0);
  });

  it('is a loss (positive) when paying costs more pesos than the invoice was booked at', () => {
    // settled 1000 USD, booked at 55, paid at 56 -> 1000 * (56 - 55) = 1000 PHP loss.
    const r = paymentRow({ docType: 'APINV', amount: 1000, cashDiscountPct: 0, invoiceFx: 55 });
    expect(rowFxDifference(r, 56)).toBe(1000);
  });

  it('is negative (a gain) when paying costs fewer pesos', () => {
    const r = paymentRow({ docType: 'APINV', amount: 1000, invoiceFx: 56 });
    expect(rowFxDifference(r, 55)).toBe(-1000);
  });

  it('settles the discount too, so the difference is on the settled amount', () => {
    // amount 980 + 2% discount = 999.60 settled; (56-55) * 999.60 = 999.60.
    const r = paymentRow({ docType: 'APINV', amount: 980, cashDiscountPct: 2, invoiceFx: 55 });
    expect(rowFxDifference(r, 56)).toBe(999.6);
  });
});

// ── paymentJournal (outgoing) ───────────────────────────────────────────────────

describe('paymentJournal', () => {
  const balanced = (lines: { debit: number; credit: number }[]) => {
    const dr = round2(lines.reduce((n, l) => n + l.debit, 0));
    const cr = round2(lines.reduce((n, l) => n + l.credit, 0));
    return { dr, cr };
  };

  it('posts a plain PHP vendor payment: Dr vendor, Cr bank — debits equal credits', () => {
    const p = outgoing({
      type: 'Vendor',
      rows: [paymentRow({ id: 'a', invoiceId: 'ap-1', selected: true, amount: 1000, invoiceFx: 1 })],
      means: { ...blankPayment(TODAY).means, transfer: { account: '1015', date: TODAY, reference: '', amount: 1000 } },
    });
    const lines = paymentJournal(p, 1, () => '2110');

    const { dr, cr } = balanced(lines);
    expect(dr).toBe(cr);
    expect(dr).toBe(1000);
    expect(lines.find((l) => l.account === '2110')).toMatchObject({ debit: 1000, credit: 0 });
    expect(lines.find((l) => l.account === '1015')).toMatchObject({ debit: 0, credit: 1000 });
  });

  it('books a cash discount to Purchase Discounts and still balances', () => {
    // Pay 980, take a 2% discount (19.60): clears 999.60 of the invoice.
    const p = outgoing({
      type: 'Vendor',
      rows: [paymentRow({ id: 'a', invoiceId: 'ap-1', selected: true, amount: 980, cashDiscountPct: 2, invoiceFx: 1 })],
      means: { ...blankPayment(TODAY).means, transfer: { account: '1015', date: TODAY, reference: '', amount: 980 } },
    });
    const lines = paymentJournal(p, 1, () => '2110');

    const { dr, cr } = balanced(lines);
    expect(dr).toBe(cr);
    // Vendor cleared for the full settled 999.60; discount credited to 5060.
    expect(lines.find((l) => l.account === '2110')).toMatchObject({ debit: 999.6 });
    expect(lines.find((l) => l.account === '5060')).toMatchObject({ credit: 19.6 });
    expect(lines.find((l) => l.account === '1015')).toMatchObject({ credit: 980 });
  });

  it('posts the realized fx loss when paying at a higher rate, and still balances', () => {
    // 1000 USD invoice booked at 55; paid 1000 USD transfer at 56 PHP/USD.
    const p = outgoing({
      type: 'Vendor',
      currency: 'USD',
      rows: [paymentRow({ id: 'a', invoiceId: 'ap-1', selected: true, amount: 1000, invoiceFx: 55 })],
      means: { ...blankPayment(TODAY).means, transfer: { account: '1018', date: TODAY, reference: '', amount: 1000 } },
    });
    const lines = paymentJournal(p, 56, () => '2110');

    const { dr, cr } = balanced(lines);
    expect(dr).toBe(cr);
    // Vendor cleared at the booked rate (55k), bank out at 56k, 1k loss on 8020.
    expect(lines.find((l) => l.account === '2110')).toMatchObject({ debit: 55000 });
    expect(lines.find((l) => l.account === '1018')).toMatchObject({ credit: 56000 });
    expect(lines.find((l) => l.account === '8020')).toMatchObject({ debit: 1000 });
  });

  it('puts a down-payment row on its advance account at today\'s rate, with no fx difference', () => {
    // DPR advance: clears at the payment rate (fx), so there is no exchange difference line.
    const p = outgoing({
      type: 'Vendor',
      currency: 'USD',
      rows: [paymentRow({ id: 'a', invoiceId: 'dpr-1', docType: 'DPR', account: '1140', selected: true, amount: 1000, invoiceFx: 50 })],
      means: { ...blankPayment(TODAY).means, transfer: { account: '1018', date: TODAY, reference: '', amount: 1000 } },
    });
    const lines = paymentJournal(p, 56, () => '2110');

    const { dr, cr } = balanced(lines);
    expect(dr).toBe(cr);
    expect(lines.find((l) => l.account === '1140')).toMatchObject({ debit: 56000 });
    expect(lines.find((l) => l.account === '1018')).toMatchObject({ credit: 56000 });
    // No fx gain/loss line.
    expect(lines.find((l) => l.account === '7020' || l.account === '8020')).toBeUndefined();
  });

  it('posts an Account payment with a bank charge and balances', () => {
    const p = outgoing({
      type: 'Account',
      accountRows: [{ id: '1', account: '6300', remarks: 'Rent', amount: 1000, projectId: '' }],
      means: {
        ...blankPayment(TODAY).means,
        bankCharge: 50,
        transfer: { account: '1015', date: TODAY, reference: '', amount: 1050 },
      },
    });
    const lines = paymentJournal(p, 1, () => '2110');

    const { dr, cr } = balanced(lines);
    expect(dr).toBe(cr);
    expect(lines.find((l) => l.account === '6300')).toMatchObject({ debit: 1000 });
    expect(lines.find((l) => l.account === '6225')).toMatchObject({ debit: 50 });
    expect(lines.find((l) => l.account === '1015')).toMatchObject({ credit: 1050 });
  });
});
