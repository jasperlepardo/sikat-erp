/**
 * The ledger for the seeded year: the books open on 1 Jan 2026 with FY2025's closing balance
 * sheet, then every seeded document posts the entry it makes when it's added in the app — built
 * with the same journal functions, from the costs the stock history gives its lines — alongside
 * the month's finance entries that don't come from a document here (payroll, mall leases,
 * utilities, depreciation, banking the stores' takings, tax remittances).
 *
 * Settled here, for the seed:
 * - Opening balances: stock at its opening cost (services/stockHistory.ts), fixed assets and
 *   deposits as listed below, and cash in each account enough that it never runs negative,
 *   with a working floor. Receivables and payables open at nil: FY2025's were all settled.
 *   Share capital and paid-in capital are fixed; retained earnings take the difference.
 * - Payroll is accrued and paid at month-end; the withholding and contributions are remitted on
 *   the 10th of the next month. Mall leases are paid on the 1st, less 5% EWT.
 * - Expanded and final withholding taken in a month is remitted on the 10th of the next month;
 *   VAT is settled quarterly on the 25th after the quarter (output less input).
 * - Dollars for the import and foreign-service payments are bought from the peso account on the day
 *   each payment goes out (the USD account isn't otherwise funded).
 * - POS cash is banked as it's collected; card settlements arrive on the 3rd of the next month,
 *   less the acquirer's fee.
 * - Import VAT paid to Customs isn't modelled (the import entries are the brokers'), so imports
 *   carry no input VAT.
 * - Nothing dated after the seed's as-of day (9 Oct 2026) is posted.
 */
import { SEED_AR_CREDIT_MEMOS } from '../mocks/arCreditMemos';
import { SEED_AR_INVOICES } from '../mocks/arInvoices';
import { SEED_DELIVERIES } from '../mocks/deliveries';
import { SEED_INCOMING_PAYMENTS } from '../mocks/incomingPayments';
import { SEED_POSTINGS } from '../mocks/inventoryCountings';
import { SEED_ITEM_GROUPS } from '../mocks/itemMasters';
import { SEED_ITEMS, mergedItems } from '../mocks/items';
import { SEED_JOURNAL_ENTRIES, blankJournalEntry, newJeLine, type JournalEntry, type OriginType } from '../mocks/journalEntries';
import { SEED_PARTNERS } from '../mocks/partners';
import { SEED_SALES_RETURNS } from '../mocks/salesReturns';
import { SALES_MONTHS } from '../mocks/storeSales';
import { SEED_AS_OF } from '../mocks/supplyPlan';
import { SEED_COMPANY_TAX, SEED_TAX_CODES, SEED_TAX_GROUPS, SEED_WITHHOLDING, SEED_WITHHOLDING_GROUPS, rateAt } from '../mocks/taxes';
import { memoJournal } from './apCreditMemos';
import { apJournal } from './apInvoices';
import { arCmJournal } from './arCreditMemos';
import { arJournal, arWithholding } from './arInvoices';
import { dnJournal } from './deliveries';
import { grJournal } from './goodsReceipts';
import { returnJournal } from './goodsReturns';
import { incomingJournal } from './incomingPayments';
import { postingJournal } from './inventoryCountings';
import { inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { paymentJournal } from './outgoingPayments';
import { poWithholding } from './purchaseOrders';
import { purchasingHistory } from './purchasingHistory';
import { srJournal } from './salesReturns';
import { BOOKS_OPEN, stockHistory, withLineCosts, withStockHistory } from './stockHistory';
import type { TaxMasterData } from './taxDetermination';

const round2 = (n: number) => Math.round(n * 100) / 100;
const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const nextMonth = (month: string, day: number) => {
  const [y, m] = month.split('-').map(Number);
  return `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// ── The year's fixed figures ─────────────────────────────────────────────────

/** FY2025 closing balances other than cash, stock and the partners' (all settled): [account, debit (+) or credit (−)]. */
const OPENING_FIXED: [string, number][] = [
  ['1510', 12_600_000], ['1511', -3_150_000],
  ['1520', 48_000_000], ['1521', -9_600_000],
  ['1530', 9_800_000], ['1531', -2_450_000],
  ['1610', 36_000_000],
  ['3010', -120_000_000], ['3020', -30_000_000],
];
/** The least each cash account holds, as working cash. */
const CASH_FLOOR: Record<string, number> = { '1011': 50_000, '1012': 0, '1013': 0, '1015': 25_000_000, '1016': 5_000_000, '1017': 5_000_000, '1018': 3_000_000 };
const CASH = Object.keys(CASH_FLOOR);

/** Monthly payroll: gross pay, the employees' and the employer's contributions, tax withheld. */
const PAYROLL = { gross: 5_500_000, sssEe: 247_500, sssEr: 522_500, phicEe: 137_500, phicEr: 137_500, hdmfEe: 50_000, hdmfEr: 50_000, tax: 385_000 };
/** Mall leases for the stores (other than the Greenbelt 3 unit, billed on its own orders), and utilities. */
const MALL_LEASES = 3_800_000;
const LEASE_EWT_PCT = 5;
const UTILITIES = 620_000;
/** Depreciation per month, as September's. */
const DEPRECIATION: [string, number][] = [['6310', 214_500], ['1511', -96_500], ['1531', -118_000]];
/** The acquirer's fee on card settlements. */
const CARD_FEE_PCT = 1.8;

// ── Entries ──────────────────────────────────────────────────────────────────

interface Posting {
  id: string;
  date: string;
  /** Same-day order: documents first, then the finance entries that follow from them. */
  order: number;
  origin: OriginType;
  originNo: string;
  originId: string;
  dueDate?: string;
  remarks: string;
  ref1?: string;
  ref2?: string;
  transCode?: string;
  partnerId?: string;
  controlAccount?: string;
  lines: JournalLine[];
}

const lines = (rows: [string, number][]): JournalLine[] =>
  rows.filter(([, n]) => round2(n) !== 0).map(([account, n]) => ({ account, debit: n > 0 ? round2(n) : 0, credit: n < 0 ? round2(-n) : 0 }));

export interface Ledger {
  entries: JournalEntry[];
  /** Entries that don't balance, or documents whose journal came out empty when it shouldn't. */
  problems: string[];
}

function build(): Ledger {
  const H = purchasingHistory();
  // As the app reads them: variants with their parent's group, accounts and valuation.
  const items = mergedItems(withStockHistory(SEED_ITEMS));
  const groups = SEED_ITEM_GROUPS;
  const codes = SEED_TAX_CODES;
  const rateOf = (date: string) => (code: string) => {
    const c = codes.find((x) => x.code === code);
    return c ? (rateAt(c, date) ?? 0) : 0;
  };
  const TAX: TaxMasterData = { company: SEED_COMPANY_TAX[0], codes: SEED_TAX_CODES, groups: SEED_TAX_GROUPS, withholding: SEED_WITHHOLDING, withholdingGroups: SEED_WITHHOLDING_GROUPS };
  const partner = new Map(SEED_PARTNERS.map((p) => [p.id, p]));
  const posted = (status: string) => status !== 'Draft' && status !== 'Cancelled';
  const out: Posting[] = [];
  const doc = (p: Omit<Posting, 'order'>) => out.push({ ...p, order: 0 });

  // Purchasing
  for (const gr of H.receipts.filter((x) => posted(x.status)))
    doc({ id: `je-pd-${gr.id}`, date: gr.postingDate, origin: 'PD', originNo: String(gr.docNum), originId: gr.id, remarks: gr.journalRemark, lines: grJournal(gr, gr.fxRate || 1, items, groups) });
  for (const inv of H.invoices.filter((x) => posted(x.status))) {
    const withholding = poWithholding(inv, partner.get(inv.vendorId), items, TAX, inv.postingDate);
    doc({
      id: `je-pu-${inv.id}`, date: inv.postingDate, origin: 'PU', originNo: String(inv.docNum), originId: inv.id, dueDate: inv.dueDate, remarks: inv.journalRemark,
      partnerId: inv.vendorId, controlAccount: inv.controlAccount, lines: apJournal(inv, inv.fxRate || 1, { items, groups, codes, rateOf: rateOf(inv.postingDate), withholding }),
    });
  }
  const billAccount = new Map([...H.invoices, ...H.downPayments].map((b) => [b.id, b.controlAccount]));
  for (const p of H.payments.filter((x) => posted(x.status)))
    doc({
      id: `je-ps-${p.id}`, date: p.postingDate, origin: 'PS', originNo: String(p.docNum), originId: p.id, remarks: p.journalRemark,
      partnerId: p.vendorId, controlAccount: p.controlAccount, lines: paymentJournal(p, p.fxRate || 1, (id) => billAccount.get(id) ?? ''),
    });
  for (const r of H.returns.filter((x) => posted(x.status)))
    doc({ id: `je-rd-${r.id}`, date: r.postingDate, origin: 'RD', originNo: String(r.docNum), originId: r.id, remarks: r.journalRemark, lines: returnJournal(r, items, groups) });
  for (const m of H.memos.filter((x) => posted(x.status))) {
    const withholding = poWithholding(m, partner.get(m.vendorId), items, TAX, m.postingDate);
    doc({
      id: `je-pc-${m.id}`, date: m.postingDate, origin: 'PC', originNo: String(m.docNum), originId: m.id, dueDate: m.dueDate, remarks: m.journalRemark,
      partnerId: m.vendorId, controlAccount: m.controlAccount, lines: memoJournal(m, m.fxRate || 1, { items, groups, codes, rateOf: rateOf(m.postingDate), withholding }),
    });
  }

  // Sales
  for (const d of withLineCosts(SEED_DELIVERIES)().filter((x) => posted(x.status)))
    doc({ id: `je-dn-${d.id}`, date: d.postingDate, origin: 'DN', originNo: String(d.docNum), originId: d.id, remarks: d.journalRemark, lines: dnJournal(d, items, groups, true) });
  for (const a of withLineCosts(SEED_AR_INVOICES)().filter((x) => posted(x.status))) {
    const rates = rateOf(a.postingDate);
    doc({
      id: `je-in-${a.id}`, date: a.postingDate, origin: 'IN', originNo: String(a.docNum), originId: a.id, dueDate: a.dueDate, remarks: a.journalRemark,
      partnerId: a.customerId, controlAccount: a.controlAccount,
      lines: arJournal(a, a.fxRate || 1, { items, groups, codes, rateOf: rates, withholding: arWithholding(a, partner.get(a.customerId), items, rates) }, true),
    });
  }
  for (const p of SEED_INCOMING_PAYMENTS.filter((x) => posted(x.status)))
    doc({
      id: `je-rc-${p.id}`, date: p.postingDate, origin: 'RC', originNo: String(p.docNum), originId: p.id, remarks: p.journalRemark, ref2: p.reference,
      partnerId: p.customerId, controlAccount: p.controlAccount, lines: incomingJournal(p, p.fxRate || 1),
    });
  for (const r of withLineCosts(SEED_SALES_RETURNS)().filter((x) => posted(x.status)))
    doc({ id: `je-sr-${r.id}`, date: r.postingDate, origin: 'SR', originNo: String(r.docNum), originId: r.id, remarks: r.journalRemark, lines: srJournal(r, items, groups, true) });
  for (const m of withLineCosts(SEED_AR_CREDIT_MEMOS)().filter((x) => posted(x.status)))
    doc({
      id: `je-ac-${m.id}`, date: m.postingDate, origin: 'AC', originNo: String(m.docNum), originId: m.id, remarks: m.journalRemark,
      partnerId: m.customerId, controlAccount: m.controlAccount, lines: arCmJournal(m, m.fxRate || 1, { items, groups, codes, rateOf: rateOf(m.postingDate) }),
    });

  // Inventory (transfers move stock between warehouses on one inventory account: no entry)
  for (const p of SEED_POSTINGS.filter((x) => x.docNum))
    doc({ id: `je-iq-${p.id}`, date: p.postingDate, origin: 'IQ', originNo: String(p.docNum), originId: p.id, remarks: p.journalRemark, ref2: p.reference, lines: postingJournal(p, items, groups) });

  // ── Finance entries, month by month ────────────────────────────────────────
  const fin = (id: string, date: string, remarks: string, rows: [string, number][], patch: Partial<Posting> = {}) => {
    if (date <= SEED_AS_OF) out.push({ id, date, order: 1, origin: 'JE', originNo: '', originId: '', remarks, lines: lines(rows), ...patch });
  };
  /** Net credit on `accounts` from the entries so far dated within [from, to] (credit positive). */
  const creditOn = (accounts: string[], from: string, to: string) =>
    round2(out.filter((e) => e.date >= from && e.date <= to).reduce((n, e) => n + e.lines.filter((l) => accounts.includes(l.account)).reduce((k, l) => k + l.credit - l.debit, 0), 0));

  for (const m of SALES_MONTHS) {
    const tag = m.month.replace('-', '');
    const start = `${m.month}-01`;
    const P = PAYROLL;
    const eeTotal = P.sssEe + P.phicEe + P.hdmfEe;
    fin(`je-lease-${tag}`, start, `Mall leases and CUSA for the stores, ${m.month}`, [['6100', MALL_LEASES], ['2340', -MALL_LEASES * (LEASE_EWT_PCT / 100)], ['1015', -MALL_LEASES * (1 - LEASE_EWT_PCT / 100)]], { ref1: `LEASE-${tag}` });
    fin(`je-util-${tag}`, `${m.month}-20`, `Electricity and water billed through the malls, ${m.month}`, [['6110', UTILITIES], ['1015', -UTILITIES]], { ref1: `UTIL-${tag}` });
    fin(`je-payroll-${tag}`, m.end, `Payroll, ${m.month}`, [
      ['6010', P.gross], ['6030', P.sssEr + P.phicEr + P.hdmfEr],
      ['2420', -(P.sssEe + P.sssEr)], ['2430', -(P.phicEe + P.phicEr)], ['2440', -(P.hdmfEe + P.hdmfEr)], ['2350', -P.tax],
      ['1015', -(P.gross - eeTotal - P.tax)],
    ], { ref1: `PAY-${tag}` });
    fin(`je-payrem-${tag}`, nextMonth(m.month, 10), `Withholding on compensation and contributions remitted for ${m.month}`, [
      ['2350', P.tax], ['2420', P.sssEe + P.sssEr], ['2430', P.phicEe + P.phicEr], ['2440', P.hdmfEe + P.hdmfEr],
      ['1015', -(P.tax + P.sssEe + P.sssEr + P.phicEe + P.phicEr + P.hdmfEe + P.hdmfEr)],
    ], { ref1: `REM-${tag}` });
    fin(`je-depr-${tag}`, m.end, `Depreciation — store fixtures and IT equipment, ${m.month}`, DEPRECIATION, { transCode: 'DEPR', ref1: `DEP-${tag}` });
    // Banking the stores' takings: the month's POS collection.
    const pos = SEED_INCOMING_PAYMENTS.find((p) => p.id === `rc-pos-${tag}`);
    if (pos) {
      const cash = pos.means.cash.amount;
      const cards = round2(pos.means.cards.reduce((n, c) => n + c.amount, 0));
      const fee = round2(cards * (CARD_FEE_PCT / 100));
      out.push({ id: `je-deposit-${tag}`, date: m.end, order: 2, origin: 'JE', originNo: '', originId: '', remarks: `Store cash banked, ${m.month}`, ref1: `DEP-CASH-${tag}`, lines: lines([['1015', cash], ['1012', -cash]]) });
      fin(`je-cards-${tag}`, nextMonth(m.month, 3), `Card settlements for ${m.month}, less the acquirer's fee`, [['1015', cards - fee], ['6220', fee], ['1130', -cards]], { ref1: `CARDS-${tag}` });
    }
  }

  // Dollars bought for each payment from the USD account, the same day.
  for (const p of H.payments.filter((x) => posted(x.status) && x.means.transfer.account === '1018' && x.means.transfer.amount > 0)) {
    const php = round2(p.means.transfer.amount * (p.fxRate || 1));
    out.push({ id: `je-usd-${p.id}`, date: p.postingDate, order: -0.5, origin: 'JE', originNo: '', originId: '', remarks: `Dollars bought for the payment to ${p.payeeName}`, ref1: `FX-${p.postingDate.replace(/-/g, '')}`, lines: lines([['1018', php], ['1015', -php]]) });
  }

  // Withholding taken each month (EWT, final tax), remitted on the 10th of the next — from what's posted so far.
  for (const m of SALES_MONTHS) {
    const due = round2(creditOn(['2340'], `${m.month}-01`, m.end));
    const fwt = round2(creditOn(['2345'], `${m.month}-01`, m.end));
    fin(`je-ewt-${m.month.replace('-', '')}`, nextMonth(m.month, 10), `Withholding taxes remitted for ${m.month} (BIR 0619-E / 0619-F)`, [['2340', due], ['2345', fwt], ['1015', -(due + fwt)]], { ref1: `WT-${m.month.replace('-', '')}` });
  }
  // VAT, quarterly: output less input for the quarter, paid on the 25th after it.
  for (const [q, from, to, pay] of [['Q1', '2026-01-01', '2026-03-31', '2026-04-25'], ['Q2', '2026-04-01', '2026-06-30', '2026-07-25'], ['Q3', '2026-07-01', '2026-09-30', '2026-10-25']] as const) {
    const output = creditOn(['2310'], from, to);
    const input = -creditOn(['1410', '1420', '1430'], from, to);
    const inputBy = (a: string) => -creditOn([a], from, to);
    if (output - input > 0)
      fin(`je-vat-${q}`, pay, `VAT for ${q} 2026 (BIR 2550Q)`, [['2310', output], ['1410', -inputBy('1410')], ['1420', -inputBy('1420')], ['1430', -inputBy('1430')], ['1015', -(output - input)]], { ref1: `VAT-${q}-2026` });
  }

  // Hand-written entries that stay (the September rent accrual and its reversal).
  const hand = SEED_JOURNAL_ENTRIES;

  // ── Opening balances ───────────────────────────────────────────────────────
  const opening = new Map<string, number>();
  const add = (account: string, n: number) => opening.set(account, round2((opening.get(account) ?? 0) + n));
  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const o of stockHistory().opening) add(inventoryAccountFor(itemById.get(o.itemId)!, o.warehouse, groups), o.qty * o.unitCost);
  for (const [a, n] of OPENING_FIXED) add(a, n);
  // Cash: enough that no account runs below its floor.
  const all = [...out.map((e) => ({ date: e.date, order: e.order, lines: e.lines })), ...hand.map((e) => ({ date: e.postingDate, order: 1, lines: e.lines }))].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  for (const account of CASH) {
    let run = 0;
    let low = 0;
    for (const e of all) {
      for (const l of e.lines) if (l.account === account) run += l.debit - l.credit;
      low = Math.min(low, run);
    }
    add(account, Math.ceil((CASH_FLOOR[account] - low) / 1000) * 1000);
  }
  // Retained earnings take the difference.
  add('3100', -round2([...opening.values()].reduce((n, v) => n + v, 0)));
  const openingEntry: Posting = {
    id: 'je-opening', date: BOOKS_OPEN, order: -1, origin: 'JE', originNo: '', originId: '', remarks: 'Opening balances carried forward from the FY2025 closing balance sheet', ref1: 'OB-2026',
    lines: lines([...opening.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };

  // ── Number and shape them ─────────────────────────────────────────────────
  const problems: string[] = [];
  const entries = [
    openingEntry,
    ...out,
  ]
    .filter((e) => e.lines.length)
    .map((e): JournalEntry & { order: number } => ({
      ...blankJournalEntry(e.date),
      id: e.id,
      order: e.order,
      dueDate: e.dueDate || e.date,
      origin: e.origin,
      originNo: e.originNo,
      originId: e.originId,
      remarks: e.remarks,
      ref1: e.ref1 ?? '',
      ref2: e.ref2 ?? '',
      transCode: e.transCode ?? '',
      lines: e.lines.map((l, i) =>
        newJeLine({ id: `${e.id}-${i + 1}`, account: l.account, debit: l.debit, credit: l.credit, partnerId: e.partnerId && l.account === e.controlAccount ? e.partnerId : '' }),
      ),
    }));
  const seeded = [...entries, ...hand.map((e) => ({ ...e, order: 1 }))]
    .sort((a, b) => a.postingDate.localeCompare(b.postingDate) || a.order - b.order || a.id.localeCompare(b.id))
    .map(({ order: _o, ...e }, n) => ({ ...e, number: n + 1, transNo: n + 1 }));
  for (const e of seeded) {
    const d = round2(e.lines.reduce((k, l) => k + l.debit, 0));
    const c = round2(e.lines.reduce((k, l) => k + l.credit, 0));
    if (Math.abs(d - c) > 0.005) problems.push(`${e.id}: debits ${d} ≠ credits ${c}`);
  }
  // A reversal names the entry it reverses by number: renumbered above.
  const numberOf = new Map(seeded.map((e) => [e.id, e.number]));
  const named = seeded.map((e) => (e.reverses ? { ...e, remarks: e.remarks.replace(/^Reversal of \d+/, `Reversal of ${numberOf.get(e.reverses)}`) } : e));
  return { entries: named, problems };
}

let built: Ledger | undefined;
/** The seeded ledger, built on first use. */
export const seededLedger = (): Ledger => (built ??= build());
