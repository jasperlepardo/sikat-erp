import { describe, it, expect, beforeEach } from 'vitest';
import {
  jeTotals,
  balancesOf,
  postingPeriodProblem,
  withAutoTax,
  lineProblems,
  parseJeRows,
  controlAccountOf,
} from '../journalEntries';
import { CLOSED_THROUGH, FISCAL_YEAR_END, newJeLine, type JeLine } from '../../mocks/journalEntries';
import type { Account } from '../../mocks/chartOfAccounts';
import type { Partner } from '../../mocks/partners';
import type { TaxCode } from '../../mocks/taxes';
import { voucherState, toJournalEntry } from '../journalVouchers';
import { newVoucherEntry, type VoucherEntry } from '../../mocks/journalVouchers';
import { erdTotals, erdLines, openForeignRows, defaultRates } from '../exchangeRateDifferences';
import type { ErdMasters } from '../exchangeRateDifferences';
import type { ErdRow } from '../../mocks/exchangeRateDifferences';
import type { ExchangeRate } from '../../mocks/currencies';
import { usageCount, type AccountUsage } from '../accountUsage';
import { defaultJournalRemark } from '../journalPatterns';

// ── Fixture builders ───────────────────────────────────────────────────────────

/** A minimal Account with every posting-control flag off; override the ones a test exercises. */
const acct = (patch: Partial<Account> & Pick<Account, 'code'>): Account =>
  ({
    name: `Account ${patch.code}`,
    parentCode: '',
    title: false,
    control: false,
    currency: 'PHP',
    active: true,
    blockManualPosting: false,
    validFrom: '',
    validTo: '',
    dimensions: [],
    projectRequired: false,
    defaultProjectId: '',
    balanceRange: false,
    minBalance: 0,
    maxBalance: 0,
    ...patch,
  }) as Account;

/** A minimal Partner carrying only the fields controlAccountOf / lineProblems read. */
const partner = (patch: Partial<Partner> & Pick<Partner, 'id'>): Partner =>
  ({
    code: patch.code ?? patch.id,
    name: patch.name ?? `Partner ${patch.id}`,
    roles: patch.roles ?? ['customer'],
    receivableAccount: patch.receivableAccount ?? '',
    payableAccount: patch.payableAccount ?? '',
    ...patch,
  }) as Partner;

const line = (patch: Partial<JeLine> = {}) => newJeLine(patch);

// ═══════════════════════════════════════════════════════════════════════════════
// journalEntries.ts
// ═══════════════════════════════════════════════════════════════════════════════

describe('jeTotals', () => {
  it('sums debits and credits and reports the (rounded) difference', () => {
    const t = jeTotals([line({ debit: 100 }), line({ credit: 40 }), line({ credit: 60 })]);
    expect(t).toEqual({ debit: 100, credit: 100, difference: 0 });
  });

  it('treats missing amounts as zero', () => {
    expect(jeTotals([line({}), line({ debit: 5 })])).toEqual({ debit: 5, credit: 0, difference: 5 });
  });

  it('rounds to two decimals, avoiding float drift', () => {
    const t = jeTotals([line({ debit: 0.1 }), line({ debit: 0.2 })]);
    expect(t.debit).toBe(0.3);
    expect(t.difference).toBe(0.3);
  });
});

describe('controlAccountOf', () => {
  it('uses the payable account for a vendor-only partner', () => {
    expect(controlAccountOf({ roles: ['vendor'], receivableAccount: '1120', payableAccount: '2010' })).toBe('2010');
  });

  it('uses the receivable account for a customer', () => {
    expect(controlAccountOf({ roles: ['customer'], receivableAccount: '1120', payableAccount: '2010' })).toBe('1120');
  });

  it('uses the receivable account when the partner is both customer and vendor', () => {
    expect(controlAccountOf({ roles: ['vendor', 'customer'], receivableAccount: '1120', payableAccount: '2010' })).toBe('1120');
  });
});

describe('balancesOf', () => {
  it('nets debit-positive balances per account across entries', () => {
    const entries = [
      { lines: [line({ account: '1000', debit: 100 }), line({ account: '2000', credit: 100 })] },
      { lines: [line({ account: '1000', credit: 30 })] },
    ] as any;
    const bal = balancesOf(entries, []);
    expect(bal.get('1000')).toBe(70);
    expect(bal.get('2000')).toBe(-100);
  });

  it('posts a manual BP row onto the partner control account', () => {
    const p = partner({ id: 'p1', roles: ['customer'], receivableAccount: '1120' });
    const entries = [{ lines: [line({ account: '', partnerId: 'p1', debit: 500 })] }] as any;
    const bal = balancesOf(entries, [p]);
    expect(bal.get('1120')).toBe(500);
  });
});

describe('postingPeriodProblem', () => {
  it('requires a date', () => {
    expect(postingPeriodProblem('')).toBe('Posting date is required.');
  });

  it('rejects a date in the closed period', () => {
    expect(postingPeriodProblem(CLOSED_THROUGH)).toMatch(/is closed/);
    expect(postingPeriodProblem('2026-07-01')).toMatch(/is closed/);
  });

  it('rejects a date after the fiscal year end (no period set up)', () => {
    expect(postingPeriodProblem('2027-01-01')).toMatch(/No posting period is set up/);
  });

  it('accepts an open date in the current fiscal year', () => {
    expect(postingPeriodProblem('2026-10-01')).toBeUndefined();
  });

  it('forces a period-13 posting onto the fiscal year end', () => {
    expect(postingPeriodProblem('2026-10-01', true)).toMatch(/Period 13/);
    expect(postingPeriodProblem(FISCAL_YEAR_END, true)).toBeUndefined();
  });
});

describe('withAutoTax', () => {
  const vat: TaxCode = {
    id: 'tc-1',
    code: 'VAT12',
    name: 'Output VAT 12%',
    direction: 'Output' as TaxCode['direction'],
    category: 'Standard' as TaxCode['category'],
    rates: [{ from: '2020-01-01', rate: 12 }] as TaxCode['rates'],
    glAccount: '2110',
    returnFormIds: [],
    legalBasis: '',
    active: true,
    notes: '',
    atc: '',
  };

  it('clears tax codes and drops generated rows when automaticTax is off', () => {
    const je = {
      automaticTax: false,
      postingDate: '2026-10-01',
      lines: [line({ account: '4000', credit: 1000, taxCode: 'VAT12' }), line({ account: '2110', credit: 120, taxOf: 'VAT12' })],
    };
    const out = withAutoTax(je, [vat]);
    expect(out).toHaveLength(1);
    expect(out[0].taxCode).toBe('');
  });

  it('generates one tax row per code at the posting-date rate on the same side', () => {
    const je = {
      automaticTax: true,
      postingDate: '2026-10-01',
      lines: [line({ account: '4000', credit: 1000, taxCode: 'VAT12' })],
    };
    const out = withAutoTax(je, [vat]);
    expect(out).toHaveLength(2);
    const tax = out[1];
    // net = debit - credit = -1000 → amount -120 → credit side.
    expect(tax.account).toBe('2110');
    expect(tax.credit).toBe(120);
    expect(tax.debit).toBe(0);
    expect(tax.taxOf).toBe('VAT12');
  });

  it('skips a code with no G/L account or zero amount', () => {
    const noGl: TaxCode = { ...vat, code: 'EX', glAccount: '' };
    const je = { automaticTax: true, postingDate: '2026-10-01', lines: [line({ account: '4000', credit: 1000, taxCode: 'EX' })] };
    expect(withAutoTax(je, [noGl])).toHaveLength(1);
  });
});

describe('lineProblems — validation matrix', () => {
  const accounts = [
    acct({ code: '1000' }),
    acct({ code: '1100', title: true }),
    acct({ code: '2000', active: false }),
    acct({ code: '1120', control: true }),
    acct({ code: '6000', dimensions: [{ dimension: 1, required: true, defaultRuleId: '' }] }),
    acct({ code: '6100', projectRequired: true }),
    acct({ code: '6200', blockManualPosting: true }),
  ];
  const partners = [partner({ id: 'cust', roles: ['customer'], receivableAccount: '1120' })];
  const date = '2026-10-01';

  const problemsFor = (l: JeLine, manual = true) => lineProblems([l], accounts, partners, date, manual);

  it('flags posting to a title (non-postable) account', () => {
    const out = problemsFor(line({ account: '1100', debit: 10 }));
    expect(out.some((p) => /title account/.test(p.message))).toBe(true);
  });

  it('flags posting to an inactive account', () => {
    const out = problemsFor(line({ account: '2000', debit: 10 }));
    expect(out.some((p) => /is inactive/.test(p.message))).toBe(true);
  });

  it('flags a manual posting to a control account', () => {
    const out = problemsFor(line({ account: '1120', debit: 10 }), true);
    expect(out.some((p) => /control account/.test(p.message))).toBe(true);
  });

  it('does not flag the control account for a document (non-manual) posting', () => {
    const out = problemsFor(line({ account: '1120', debit: 10 }), false);
    expect(out.some((p) => /control account/.test(p.message))).toBe(false);
  });

  it('flags a manual posting to a document-only account', () => {
    const out = problemsFor(line({ account: '6200', debit: 10 }), true);
    expect(out.some((p) => /only takes postings from documents/.test(p.message))).toBe(true);
  });

  it('flags a missing required dimension on a manual row', () => {
    const out = problemsFor(line({ account: '6000', debit: 10, dims: [] }), true);
    expect(out.some((p) => p.key.endsWith(':dim1') && /Business Unit/.test(p.message))).toBe(true);
  });

  it('clears the dimension problem once the rule is supplied', () => {
    const out = problemsFor(line({ account: '6000', debit: 10, dims: [{ dimension: 1, ruleId: 'ocr-retail' }] }), true);
    expect(out.some((p) => p.key.endsWith(':dim1'))).toBe(false);
  });

  it('flags a missing required project on a manual row', () => {
    const out = problemsFor(line({ account: '6100', debit: 10, projectId: '' }), true);
    expect(out.some((p) => p.key.endsWith(':project'))).toBe(true);
  });

  it('flags an account that does not exist', () => {
    const out = problemsFor(line({ account: '9999', debit: 10 }));
    expect(out.some((p) => /doesn't exist/.test(p.message))).toBe(true);
  });

  it('requires a G/L account or business partner', () => {
    const out = problemsFor(line({ debit: 10 }));
    expect(out.some((p) => /pick a G\/L account or business partner/.test(p.message))).toBe(true);
  });

  it('rejects both a debit and a credit on one row', () => {
    const out = problemsFor(line({ account: '1000', debit: 10, credit: 5 }));
    expect(out.some((p) => /not both/.test(p.message))).toBe(true);
  });

  it('rejects a negative amount', () => {
    const out = problemsFor(line({ account: '1000', debit: -5 }));
    expect(out.some((p) => /can't be negative/.test(p.message))).toBe(true);
  });

  it('requires an amount', () => {
    const out = problemsFor(line({ account: '1000' }));
    expect(out.some((p) => /enter an amount/.test(p.message))).toBe(true);
  });

  it('skips generated tax rows entirely', () => {
    expect(problemsFor(line({ taxOf: 'VAT12', account: '2110', credit: 120 }))).toHaveLength(0);
  });

  it('flags a BP row whose partner has no control account', () => {
    const noCtrl = partner({ id: 'bad', roles: ['customer'], receivableAccount: '' });
    const out = lineProblems([line({ partnerId: 'bad', debit: 10 })], accounts, [...partners, noCtrl], date, true);
    expect(out.some((p) => /no control account/.test(p.message))).toBe(true);
  });

  it('accepts a clean manual G/L row with no problems', () => {
    expect(problemsFor(line({ account: '1000', debit: 100 }))).toHaveLength(0);
  });
});

describe('parseJeRows', () => {
  it('parses tab-separated account/debit/credit/remarks rows', () => {
    const { lines, skipped } = parseJeRows('1000\t100\t0\tCash in\n2000\t0\t100\tRevenue');
    expect(skipped).toBe(0);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ account: '1000', debit: 100, credit: 0, remarks: 'Cash in' });
    expect(lines[1]).toMatchObject({ account: '2000', debit: 0, credit: 100 });
  });

  it('skips a header row and strips thousands separators', () => {
    const { lines, skipped } = parseJeRows('Account\tDebit\tCredit\n1000\t1,234.50\t0');
    expect(skipped).toBe(1);
    expect(lines[0].debit).toBe(1234.5);
  });

  it('ignores fully blank lines without counting them as skipped', () => {
    const { lines, skipped } = parseJeRows('1000\t5\t0\n\n\n2000\t0\t5');
    expect(lines).toHaveLength(2);
    expect(skipped).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// journalVouchers.ts
// ═══════════════════════════════════════════════════════════════════════════════

describe('voucherState', () => {
  const closedEntry = { entryStatus: 'Closed' } as VoucherEntry;
  const openEntry = { entryStatus: 'Open' } as VoucherEntry;

  it('is Open when nothing is posted', () => {
    expect(voucherState({ entries: [openEntry, openEntry] })).toEqual({ label: 'Open', intent: 'success' });
  });

  it('is Open with no entries at all', () => {
    expect(voucherState({ entries: [] })).toEqual({ label: 'Open', intent: 'success' });
  });

  it('is Partly posted when some but not all entries are posted', () => {
    expect(voucherState({ entries: [closedEntry, openEntry] })).toEqual({ label: 'Partly posted', intent: 'warning' });
  });

  it('is Closed when every entry is posted', () => {
    expect(voucherState({ entries: [closedEntry, closedEntry] })).toEqual({ label: 'Closed', intent: 'default' });
  });
});

describe('toJournalEntry', () => {
  it('drops the voucher-only fields and resets posting fields', () => {
    const e: VoucherEntry = {
      ...newVoucherEntry('2026-10-01', 1),
      automaticTax: false,
      lines: [line({ account: '1000', debit: 100 }), line({ account: '2000', credit: 100 })],
    };
    const je = toJournalEntry(e, []);
    expect(je).not.toHaveProperty('entryStatus');
    expect(je).not.toHaveProperty('journalEntryId');
    expect(je).not.toHaveProperty('id');
    expect(je.number).toBe(0);
    expect(je.transNo).toBe(0);
    expect(je.status).toBe('Posted');
    expect(je.reversedBy).toBe('');
    expect(je.reverses).toBe('');
  });

  it('drops empty rows but keeps rows with an account or amount', () => {
    const e: VoucherEntry = {
      ...newVoucherEntry('2026-10-01', 1),
      automaticTax: false,
      lines: [line({ account: '1000', debit: 100 }), line({}), line({ account: '2000', credit: 100 })],
    };
    const je = toJournalEntry(e, []);
    expect(je.lines).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// exchangeRateDifferences.ts
// ═══════════════════════════════════════════════════════════════════════════════

const erdRow = (patch: Partial<ErdRow> & Pick<ErdRow, 'docType' | 'difference'>): ErdRow => ({
  id: `${patch.docType}-x`,
  docId: 'x',
  docNo: 'DOC-1',
  partnerId: 'p1',
  partnerName: 'Acme',
  currency: 'USD',
  balanceFc: 1000,
  bookedRate: 56,
  rate: 58,
  controlAccount: patch.docType === 'IN' ? '1120' : '2010',
  selected: true,
  ...patch,
});

describe('erdTotals', () => {
  it('counts an A/R rise as a gain', () => {
    expect(erdTotals([erdRow({ docType: 'IN', difference: 2000 })])).toEqual({ gain: 2000, loss: 0, net: 2000 });
  });

  it('counts an A/P rise (positive difference) as a loss', () => {
    expect(erdTotals([erdRow({ docType: 'PU', difference: 1500 })])).toEqual({ gain: 0, loss: 1500, net: -1500 });
  });

  it('ignores unselected rows and zero-difference rows', () => {
    const rows = [
      erdRow({ docType: 'IN', difference: 2000, selected: false }),
      erdRow({ docType: 'IN', difference: 0 }),
      erdRow({ docType: 'PU', difference: 500 }),
    ];
    expect(erdTotals(rows)).toEqual({ gain: 0, loss: 500, net: -500 });
  });

  it('nets a gain against a loss', () => {
    const rows = [erdRow({ docType: 'IN', difference: 3000 }), erdRow({ docType: 'PU', difference: 1000 })];
    expect(erdTotals(rows)).toEqual({ gain: 3000, loss: 1000, net: 2000 });
  });
});

describe('erdLines', () => {
  it('debits the A/R control account and credits the FX gain account for an A/R rise', () => {
    const lines = erdLines([erdRow({ docType: 'IN', difference: 2000, controlAccount: '1120', partnerId: 'p1' })]);
    const control = lines.find((l) => l.account === '1120')!;
    expect(control.debit).toBe(2000);
    expect(control.credit).toBe(0);
    expect(control.partnerId).toBe('p1');
    // The balancing gain line credits 7020.
    const gain = lines.find((l) => l.credit === 2000 && l.account !== '1120')!;
    expect(gain).toBeDefined();
    expect(gain.debit).toBe(0);
  });

  it('credits the A/P control account and debits the FX loss account for an A/P rise', () => {
    const lines = erdLines([erdRow({ docType: 'PU', difference: 1500, controlAccount: '2010' })]);
    const control = lines.find((l) => l.account === '2010')!;
    expect(control.credit).toBe(1500);
    expect(control.debit).toBe(0);
    const loss = lines.find((l) => l.debit === 1500 && l.account !== '2010')!;
    expect(loss).toBeDefined();
  });

  it('is balanced (debits equal credits)', () => {
    const lines = erdLines([erdRow({ docType: 'IN', difference: 3000 }), erdRow({ docType: 'PU', difference: 1000 })]);
    const debit = lines.reduce((n, l) => n + l.debit, 0);
    const credit = lines.reduce((n, l) => n + l.credit, 0);
    expect(debit).toBe(credit);
  });

  it('produces no lines when nothing is selected', () => {
    expect(erdLines([erdRow({ docType: 'IN', difference: 2000, selected: false })])).toHaveLength(0);
  });
});

describe('defaultRates', () => {
  const rates: ExchangeRate[] = [
    { id: 'r1', date: '2026-09-30', rates: { USD: 58.5 }, unavailable: [], source: 'BSP RERB' },
    { id: 'r2', date: '2026-10-15', rates: { USD: 59.1, EUR: 63.2 }, unavailable: [], source: 'BSP RERB' },
  ];

  it('picks the most recent rate on or before the date, per currency', () => {
    expect(defaultRates(['USD', 'EUR'], rates, '2026-10-15')).toEqual({ USD: 59.1, EUR: 63.2 });
  });

  it('falls back to an earlier day when none exists on the date', () => {
    expect(defaultRates(['USD'], rates, '2026-10-01')).toEqual({ USD: 58.5 });
  });

  it('is 0 for a currency with no quoted rate', () => {
    expect(defaultRates(['JPY'], rates, '2026-10-15')).toEqual({ JPY: 0 });
  });
});

describe('openForeignRows', () => {
  const baseMasters = (): ErdMasters => ({
    arInvoices: [],
    apInvoices: [],
    customers: [],
    vendors: [],
    items: [],
    codes: [] as ErdMasters['codes'],
    tax: {} as ErdMasters['tax'],
    rates: [],
  });

  it('ignores PHP and non-Open A/R invoices', () => {
    const m = baseMasters();
    m.arInvoices = [
      { id: 'a1', status: 'Open', currency: 'PHP', postingDate: '2026-09-01', customerId: 'c1' },
      { id: 'a2', status: 'Draft', currency: 'USD', postingDate: '2026-09-01', customerId: 'c1' },
    ] as any;
    expect(openForeignRows('2026-10-01', { USD: 59 }, m)).toHaveLength(0);
  });

  it('ignores documents posted after the run date', () => {
    const m = baseMasters();
    m.arInvoices = [{ id: 'a1', status: 'Open', currency: 'USD', postingDate: '2026-11-01', customerId: 'c1' }] as any;
    expect(openForeignRows('2026-10-01', { USD: 59 }, m)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// accountUsage.ts
// ═══════════════════════════════════════════════════════════════════════════════

describe('usageCount', () => {
  it('sums item groups, items, partners and tax codes', () => {
    const u: AccountUsage = { itemGroups: ['A', 'B'], items: 404, partners: ['x'], taxCodes: ['VAT', 'EWT'] };
    expect(usageCount(u)).toBe(2 + 404 + 1 + 2);
  });

  it('is 0 for an undefined usage record', () => {
    expect(usageCount(undefined)).toBe(0);
  });

  it('is 0 for an empty usage record', () => {
    expect(usageCount({ itemGroups: [], items: 0, partners: [], taxCodes: [] })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// journalPatterns.ts
// ═══════════════════════════════════════════════════════════════════════════════

describe('defaultJournalRemark', () => {
  beforeEach(async () => {
    // Patterns read from a managed collection snapshot; reset so the seed is in place.
    const { DOC_PATTERN_TYPES } = await import('../journalPatterns');
    await Promise.all(DOC_PATTERN_TYPES.map((d) => d.collection.reset()));
  });

  it('returns "" for an unknown doc type', () => {
    expect(defaultJournalRemark('does-not-exist', { entityName: 'X' })).toBe('');
  });

  it('substitutes variables into the default active pattern', () => {
    const out = defaultJournalRemark('ar-invoices', { entityCode: 'BP-001', entityName: 'XYZ Corporation', docNo: 'SI-1' });
    expect(out).not.toContain('{');
    expect(out.length).toBeGreaterThan(0);
  });

  it('collapses dangling separators when an optional variable is blank', () => {
    const out = defaultJournalRemark('purchase-orders', { entityCode: 'VD-001', entityName: 'ABC Supplies' });
    expect(out).not.toMatch(/[–-]\s*$/);
    expect(out).not.toMatch(/^\s*[–-]/);
    expect(out).not.toMatch(/\s[–-]\s[–-]\s/);
  });
});
