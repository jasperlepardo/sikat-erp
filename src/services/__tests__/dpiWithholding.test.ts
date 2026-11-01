/**
 * Down-payment invoice withholding + VAT recognition, and the final-invoice true-up.
 *
 * A down payment *invoice* is an issued invoice, so it recognizes its billed share of EWT and input
 * VAT now (RR 2-98 §2.57.4 as amended by RR 4-2024 / EOPT). A later invoice that draws it then
 * recognizes only the remainder — so each tax is taken exactly once across the two documents.
 */
import { describe, it, expect } from 'vitest';
import type { JournalLine } from '../inventoryTransfers';
import { SEED_ITEM_GROUPS } from '../../mocks/itemMasters';
import { SEED_ITEMS, mergedItems } from '../../mocks/items';
import { SEED_PARTNERS } from '../../mocks/partners';
import { SEED_COMPANY_TAX, SEED_TAX_CODES, SEED_TAX_GROUPS, SEED_WITHHOLDING, SEED_WITHHOLDING_GROUPS, rateAt } from '../../mocks/taxes';
import type { ApInvoice, ApLine, DownPaymentDraw } from '../../mocks/apInvoices';
import type { TaxMasterData } from '../taxDetermination';
import { withStockHistory } from '../stockHistory';
import { purchasingHistory } from '../purchasingHistory';
import { poTotals } from '../purchaseOrders';
import { poWithholding } from '../withholding';
import { apJournal, netDue, trueUpWithholding } from '../apInvoices';
import { dpiJournal, dpiNetDue, dpiTotals, dpiWithholding } from '../apDownPaymentInvoices';
import { round2 } from '../num';

const items = mergedItems(withStockHistory(SEED_ITEMS));
const groups = SEED_ITEM_GROUPS;
const codes = SEED_TAX_CODES;
const rateOf = (date: string) => (code: string) => {
  const c = codes.find((x) => x.code === code);
  return c ? (rateAt(c, date) ?? 0) : 0;
};
const TAX: TaxMasterData = { company: SEED_COMPANY_TAX[0], codes, groups: SEED_TAX_GROUPS, withholding: SEED_WITHHOLDING, withholdingGroups: SEED_WITHHOLDING_GROUPS };
const partner = new Map(SEED_PARTNERS.map((p) => [p.id, p]));

const sum = (j: JournalLine[], key: 'debit' | 'credit') => round2(j.reduce((n, l) => n + l[key], 0));
const bal = (j: JournalLine[], account: string) => round2(j.filter((l) => l.account === account).reduce((n, l) => n + l.debit - l.credit, 0));
const deducted = (w: { deducted: boolean; amount: number }[]) => round2(w.filter((x) => x.deducted).reduce((n, x) => n + x.amount, 0));

const deposit = purchasingHistory().downPaymentInvoices[0]; // dpi-001: 30% of po-054
const vendor = partner.get(deposit.vendorId);
const date = deposit.postingDate;
const fx = deposit.fxRate || 1;
const rOf = rateOf(date);
const t = dpiTotals(deposit, rOf);
const dpiWh = dpiWithholding(deposit, vendor, items, TAX, date);
const vatAccount = codes.find((c) => c.code === deposit.lines[0].taxCode)?.glAccount || '1410';
const dpiEwt = deducted(dpiWh);

describe('down payment invoice recognizes its share', () => {
  const j = dpiJournal(deposit, fx, { codes, rateOf: rOf, withholding: dpiWh });

  it('withholds EWT and claims input VAT (an invoice was issued)', () => {
    expect(dpiEwt).toBeGreaterThan(0);
    expect(t.tax).toBeGreaterThan(0);
  });

  it('journals Dr net advance + input VAT, Cr EWT payable + A/P, and balances', () => {
    expect(sum(j, 'debit')).toBe(sum(j, 'credit'));
    expect(bal(j, deposit.downPaymentAccount)).toBeCloseTo(round2(t.dpm * fx), 2); // net (ex-VAT) advance on 1150
    expect(bal(j, vatAccount)).toBeCloseTo(round2(t.tax * fx), 2); // creditable input VAT claimed now
    expect(bal(j, '2340')).toBeCloseTo(-round2(dpiEwt * fx), 2); // EWT payable credited
  });

  it('nets the EWT off what the vendor is paid', () => {
    expect(dpiNetDue(t.total, dpiWh)).toBe(round2(t.total - dpiEwt));
  });
});

describe('final invoice draws the DPI and trues up the remainder', () => {
  // A full invoice for the same order, drawing the down payment invoice in full.
  const bill = {
    lines: deposit.lines as unknown as ApLine[],
    discountPct: deposit.discountPct,
    freight: 0,
    freightTaxCode: '',
    controlAccount: deposit.controlAccount,
    drawnDownPayments: [
      {
        requestId: deposit.id,
        docNo: 'ADPI-2026-0001',
        amount: round2(t.total),
        amountLc: round2(t.dpm * fx),
        account: deposit.downPaymentAccount,
        inputVatLc: round2(t.tax * fx),
        vatAccount,
        withholding: dpiWh.filter((w) => w.deducted).map((w) => ({ atc: w.atc, amount: w.amount })),
      } satisfies DownPaymentDraw,
    ],
  };
  const full = poWithholding(bill, vendor, items, TAX, date); // withholding on the whole order
  const trued = trueUpWithholding(full, bill.drawnDownPayments);
  const fullVat = round2(poTotals(bill, rOf).tax * fx);
  const j = apJournal(bill as unknown as ApInvoice, fx, { itemsById: new Map(items.map((i) => [i.id, i])), groups, codes, rateOf: rOf, withholding: trued });

  it('withholds only the remaining EWT (full − what the DPI took)', () => {
    expect(deducted(trued)).toBeCloseTo(round2(deducted(full) - dpiEwt), 2);
    expect(dpiEwt + deducted(trued)).toBeCloseTo(deducted(full), 2); // taken once, in total
  });

  it('claims only the remaining input VAT and clears the net advance', () => {
    expect(bal(j, vatAccount)).toBeCloseTo(round2(fullVat - t.tax * fx), 2);
    expect(bal(j, deposit.downPaymentAccount)).toBeCloseTo(-round2(t.dpm * fx), 2); // advance cleared
  });

  it('balances', () => {
    expect(sum(j, 'debit')).toBe(sum(j, 'credit'));
  });

  it('netDue reduces by the down payment and the trued-up EWT', () => {
    expect(netDue(round2(poTotals(bill, rOf).total), trued, round2(t.total))).toBe(
      round2(poTotals(bill, rOf).total - deducted(trued) - t.total),
    );
  });
});
