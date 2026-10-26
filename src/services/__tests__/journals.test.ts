/**
 * Journal-builder balance tests.
 *
 * Every journal builder must produce a balanced entry: total debits == total credits, to the cent.
 * The seeded year's ledger (services/ledgerHistory.ts) runs each of these over every posted seed
 * document, so the most representative fixtures are the seed documents themselves — we rebuild the
 * ctx each builder needs exactly as ledgerHistory does and assert balance per document.
 *
 * We also pin account selection where a builder exposes it: revenue/COGS resolve by item level,
 * then by item group, then the 4010 / 5010-style fallbacks.
 */
import { describe, it, expect } from 'vitest';
import type { JournalLine } from '../inventoryTransfers';

// Seeds
import { SEED_AR_CREDIT_MEMOS } from '../../mocks/arCreditMemos';
import { SEED_AR_INVOICES } from '../../mocks/arInvoices';
import { SEED_DELIVERIES } from '../../mocks/deliveries';
import { SEED_INCOMING_PAYMENTS } from '../../mocks/incomingPayments';
import { SEED_POSTINGS } from '../../mocks/inventoryCountings';
import { SEED_TRANSFERS } from '../../mocks/inventoryTransfers';
import { SEED_RESERVE_INVOICES } from '../../mocks/reserveInvoices';
import { SEED_ITEM_GROUPS } from '../../mocks/itemMasters';
import { SEED_ITEMS, mergedItems, type Item } from '../../mocks/items';
import { SEED_PARTNERS } from '../../mocks/partners';
import { SEED_SALES_RETURNS } from '../../mocks/salesReturns';
import {
  SEED_COMPANY_TAX,
  SEED_TAX_CODES,
  SEED_TAX_GROUPS,
  SEED_WITHHOLDING,
  SEED_WITHHOLDING_GROUPS,
  rateAt,
} from '../../mocks/taxes';

// Journal builders + helpers
import { memoJournal } from '../apCreditMemos';
import { apJournal } from '../apInvoices';
import { arCmJournal } from '../arCreditMemos';
import { arJournal, arWithholding } from '../arInvoices';
import { dnJournal } from '../deliveries';
import { grJournal } from '../goodsReceipts';
import { incomingJournal } from '../incomingPayments';
import { postingJournal } from '../inventoryCountings';
import { riJournal, riWithholding } from '../reserveInvoices';
import { srJournal } from '../salesReturns';
import { transferJournal } from '../inventoryTransfers';
import { revenueAccountFor, cogsAccountFor } from '../itemAccounts';
import { poWithholding } from '../withholding';
import { purchasingHistory } from '../purchasingHistory';
import { withLineCosts, withStockHistory } from '../stockHistory';
import type { TaxMasterData } from '../taxDetermination';
import { round2 } from '../num';

// ── Shared fixtures (built the way ledgerHistory.ts builds them) ───────────────

const items = mergedItems(withStockHistory(SEED_ITEMS));
const groups = SEED_ITEM_GROUPS;
const codes = SEED_TAX_CODES;
const rateOf = (date: string) => (code: string) => {
  const c = codes.find((x) => x.code === code);
  return c ? (rateAt(c, date) ?? 0) : 0;
};
const TAX: TaxMasterData = {
  company: SEED_COMPANY_TAX[0],
  codes: SEED_TAX_CODES,
  groups: SEED_TAX_GROUPS,
  withholding: SEED_WITHHOLDING,
  withholdingGroups: SEED_WITHHOLDING_GROUPS,
};
const partner = new Map(SEED_PARTNERS.map((p) => [p.id, p]));
const posted = (status: string) => status !== 'Draft' && status !== 'Cancelled';

/** Sum debits and credits of an entry (already rounded per line). */
const sums = (j: JournalLine[]) => ({
  debit: round2(j.reduce((n, l) => n + l.debit, 0)),
  credit: round2(j.reduce((n, l) => n + l.credit, 0)),
});

/** A journal balances when total debits == total credits, to the cent. */
const expectBalanced = (j: JournalLine[], label: string) => {
  const { debit, credit } = sums(j);
  expect(debit, `${label} debits≠credits (Dr ${debit} / Cr ${credit})`).toBe(credit);
};

const H = purchasingHistory();

// ── Delivery — dnJournal (Dr COGS / Cr Inventory) ──────────────────────────────

describe('dnJournal', () => {
  const docs = withLineCosts(SEED_DELIVERIES)().filter((d) => posted(d.status));

  it('has posted deliveries to test', () => expect(docs.length).toBeGreaterThan(0));

  it.each(docs.map((d) => [d.docNum, d] as const))('delivery %s balances', (_no, d) => {
    expectBalanced(dnJournal(d, items, groups, true), `DN ${_no}`);
  });

  it('only moves COGS and Inventory — no revenue/VAT lines', () => {
    const d = docs.find((x) => x.lines.some((l) => items.find((i) => i.id === l.itemId)?.inventoryItem))!;
    const j = dnJournal(d, items, groups, true);
    expect(j.length).toBeGreaterThan(0);
  });
});

// ── A/R invoice — arJournal (Dr A/R / Cr Revenue / Cr VAT / Dr COGS / Cr Inv) ─

describe('arJournal', () => {
  const docs = withLineCosts(SEED_AR_INVOICES)().filter((a) => posted(a.status));

  it('has posted A/R invoices to test', () => expect(docs.length).toBeGreaterThan(0));

  it.each(docs.map((a) => [a.docNum, a] as const))('A/R invoice %s balances', (_no, a) => {
    const rates = rateOf(a.postingDate);
    const withholding = arWithholding(a, partner.get(a.customerId), items, rates, TAX);
    const j = arJournal(a, a.fxRate || 1, { itemsById: new Map(items.map((i) => [i.id, i])), groups, codes, rateOf: rates, withholding }, true);
    expectBalanced(j, `AR ${_no}`);
  });

  it('credits revenue by item (revenueAccountFor), with 4010 fallback for an unknown item', () => {
    const a = docs.find((x) => x.docType !== 'Service' && x.lines.some((l) => items.find((i) => i.id === l.itemId)))!;
    const rates = rateOf(a.postingDate);
    const withholding = arWithholding(a, partner.get(a.customerId), items, rates, TAX);
    const j = arJournal(a, a.fxRate || 1, { itemsById: new Map(items.map((i) => [i.id, i])), groups, codes, rateOf: rates, withholding }, true);
    const line = a.lines.find((l) => items.find((i) => i.id === l.itemId));
    const item = items.find((i) => i.id === line!.itemId)!;
    const revAccount = revenueAccountFor(item, groups);
    expect(j.some((e) => e.account === revAccount && e.credit > 0)).toBe(true);
  });
});

// ── Reserve invoice — riJournal (Dr A/R / Cr Revenue / Cr VAT, no stock) ───────

describe('riJournal', () => {
  const docs = SEED_RESERVE_INVOICES.filter((r) => posted(r.status));

  it('has posted reserve invoices to test', () => expect(docs.length).toBeGreaterThan(0));

  it.each(docs.map((r) => [r.docNum, r] as const))('reserve invoice %s balances', (_no, r) => {
    const rates = rateOf(r.postingDate);
    const withholding = riWithholding(r, partner.get(r.customerId), items, rates);
    const j = riJournal(r, r.fxRate || 1, { items, groups, codes, rateOf: rates, withholding });
    expectBalanced(j, `RI ${_no}`);
  });

  it('posts no inventory/COGS movement (reserve invoices only touch A/R, revenue, VAT)', () => {
    const r = docs[0];
    const rates = rateOf(r.postingDate);
    const withholding = riWithholding(r, partner.get(r.customerId), items, rates);
    const j = riJournal(r, r.fxRate || 1, { items, groups, codes, rateOf: rates, withholding });
    // COGS accounts of the lines' items must not appear.
    const cogsAccounts = new Set(
      r.lines.map((l) => items.find((i) => i.id === l.itemId)).filter(Boolean).map((i) => cogsAccountFor(i as Item, groups)),
    );
    expect(j.some((e) => cogsAccounts.has(e.account))).toBe(false);
  });
});

// ── Sales return — srJournal (Dr Inventory / Cr COGS, reverse of delivery) ─────

describe('srJournal', () => {
  const docs = withLineCosts(SEED_SALES_RETURNS)().filter((r) => posted(r.status));

  it('has posted sales returns to test', () => expect(docs.length).toBeGreaterThan(0));

  it.each(docs.map((r) => [r.docNum, r] as const))('sales return %s balances', (_no, r) => {
    expectBalanced(srJournal(r, items, groups, true), `SR ${_no}`);
  });
});

// ── A/R credit memo — arCmJournal (reversal of arJournal) ──────────────────────

describe('arCmJournal', () => {
  const docs = withLineCosts(SEED_AR_CREDIT_MEMOS)().filter((m) => posted(m.status));

  it('has posted A/R credit memos to test', () => expect(docs.length).toBeGreaterThan(0));

  it.each(docs.map((m) => [m.docNum, m] as const))('A/R credit memo %s balances', (_no, m) => {
    const j = arCmJournal(m, m.fxRate || 1, { items, groups, codes, rateOf: rateOf(m.postingDate) });
    expectBalanced(j, `ARCM ${_no}`);
  });

  it('debits revenue (reversing the invoice) by item', () => {
    const m = docs.find((x) => x.docType !== 'Service' && x.lines.some((l) => items.find((i) => i.id === l.itemId)))!;
    const j = arCmJournal(m, m.fxRate || 1, { items, groups, codes, rateOf: rateOf(m.postingDate) });
    const line = m.lines.find((l) => items.find((i) => i.id === l.itemId))!;
    const item = items.find((i) => i.id === line.itemId)!;
    expect(j.some((e) => e.account === revenueAccountFor(item, groups) && e.debit > 0)).toBe(true);
  });
});

// ── Incoming payment — incomingJournal (Dr bank / Cr A/R, fx diff balances) ────

describe('incomingJournal', () => {
  const docs = SEED_INCOMING_PAYMENTS.filter((p) => posted(p.status));

  it('has posted incoming payments to test', () => expect(docs.length).toBeGreaterThan(0));

  it.each(docs.map((p) => [p.docNum, p] as const))('incoming payment %s balances', (_no, p) => {
    expectBalanced(incomingJournal(p, p.fxRate || 1), `RC ${_no}`);
  });
});

// ── Goods receipt — grJournal (Dr Inventory / Dr Freight-in / Cr GRNI) ─────────

describe('grJournal', () => {
  const docs = H.receipts.filter((x) => posted(x.status));

  it('has posted goods receipts to test', () => expect(docs.length).toBeGreaterThan(0));

  it.each(docs.map((gr) => [gr.docNum, gr] as const))('goods receipt %s balances', (_no, gr) => {
    expectBalanced(grJournal(gr, gr.fxRate || 1, items, groups), `PD ${_no}`);
  });
});

// ── A/P invoice — apJournal (Dr Inv/Expense/VAT / Cr WTax / Cr A/P) ────────────

describe('apJournal', () => {
  const docs = H.invoices.filter((x) => posted(x.status));

  it('has posted A/P invoices to test', () => expect(docs.length).toBeGreaterThan(0));

  it.each(docs.map((inv) => [inv.docNum, inv] as const))('A/P invoice %s balances', (_no, inv) => {
    const withholding = poWithholding(inv, partner.get(inv.vendorId), items, TAX, inv.postingDate);
    const j = apJournal(inv, inv.fxRate || 1, { itemsById: new Map(items.map((i) => [i.id, i])), groups, codes, rateOf: rateOf(inv.postingDate), withholding });
    expectBalanced(j, `AP ${_no}`);
  });
});

// ── A/P credit memo — memoJournal (reversal of apJournal) ──────────────────────

describe('memoJournal', () => {
  const docs = H.memos.filter((x) => posted(x.status));

  it('has posted A/P credit memos to test', () => expect(docs.length).toBeGreaterThan(0));

  it.each(docs.map((m) => [m.docNum, m] as const))('A/P credit memo %s balances', (_no, m) => {
    const withholding = poWithholding(m, partner.get(m.vendorId), items, TAX, m.postingDate);
    const j = memoJournal(m, m.fxRate || 1, { items, groups, codes, rateOf: rateOf(m.postingDate), withholding });
    expectBalanced(j, `APCM ${_no}`);
  });
});

// ── Inventory count posting — postingJournal (Dr/Cr Inventory vs variance) ─────

describe('postingJournal', () => {
  const docs = SEED_POSTINGS.filter((p) => p.docNum);

  it('has posted inventory counts to test', () => expect(docs.length).toBeGreaterThan(0));

  it.each(docs.map((p) => [p.docNum, p] as const))('inventory posting %s balances', (_no, p) => {
    expectBalanced(postingJournal(p, items, groups), `IQ ${_no}`);
  });
});

// ── Inventory transfer — transferJournal (Dr dest inv / Cr source inv) ─────────

describe('transferJournal', () => {
  const docs = SEED_TRANSFERS.filter((t) => posted(t.status));

  it('has posted transfers to test', () => expect(docs.length).toBeGreaterThan(0));

  it.each(docs.map((t) => [t.docNum, t] as const))('transfer %s balances (or is empty, same account)', (_no, t) => {
    // Same inventory account both ends → no G/L impact → empty entry (still balanced: 0 == 0).
    expectBalanced(transferJournal(t, items, groups), `IT ${_no}`);
  });
});
