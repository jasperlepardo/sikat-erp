/**
 * Exchange rate differences over the seeded books: which open foreign-currency documents are
 * revalued, at what difference, and the entry when the peso value falls.
 */
import { describe, expect, it } from 'vitest';
import { SEED_TAX_CODES } from '../../mocks/taxes';
import type { ErdRow } from '../../mocks/exchangeRateDifferences';
import { listApInvoices } from '../apInvoices';
import { listArInvoices } from '../arInvoices';
import { listItems } from '../items';
import { listPartners } from '../partners';
import { SEED_TAX } from '../withholding';
import { erdLines, erdTotals, openForeignRows, postErdRun, type ErdMasters } from '../exchangeRateDifferences';

const DATE = '2026-10-09';

async function masters(): Promise<ErdMasters> {
  const [arInvoices, apInvoices, partners, items] = await Promise.all([listArInvoices(), listApInvoices(), listPartners(), listItems()]);
  return { arInvoices, apInvoices, customers: partners, vendors: partners, items, codes: SEED_TAX_CODES, tax: SEED_TAX, rates: [] };
}

const row = (patch: Partial<ErdRow>): ErdRow => ({
  id: 'r', docType: 'IN', docId: 'x', docNo: 'DOC-1', partnerId: 'p', partnerName: 'P', currency: 'USD', balanceFc: 100,
  bookedRate: 58, rate: 56, difference: -200, controlAccount: '1120', selected: true, ...patch,
});

describe('open foreign-currency documents', () => {
  it('lists every open non-peso invoice and bill posted by the date, revalued at the run rate', async () => {
    const m = await masters();
    const rows = openForeignRows(DATE, { USD: 60 }, m);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.currency !== 'PHP' && r.balanceFc > 0)).toBe(true);
    for (const r of rows.filter((x) => x.currency === 'USD')) {
      expect(r.selected).toBe(true);
      expect(r.difference).toBeCloseTo(r.balanceFc * (60 - r.bookedRate), 1);
    }
    expect(rows.some((r) => r.docType === 'PU')).toBe(true);
  });

  it('leaves a document unticked with no difference when its currency has no rate', async () => {
    const rows = openForeignRows(DATE, {}, await masters());
    expect(rows.every((r) => r.rate === 0 && r.difference === 0 && !r.selected)).toBe(true);
  });

  it('falls back to the default control accounts and skips settled documents', async () => {
    const m = await masters();
    const bill = openForeignRows(DATE, { USD: 60 }, m).find((r) => r.docType === 'PU')!;
    const doc = m.apInvoices.find((b) => b.id === bill.docId)!;
    const withDefault = openForeignRows(DATE, { USD: 60 }, { ...m, apInvoices: [{ ...doc, controlAccount: '' }], arInvoices: [] });
    expect(withDefault[0].controlAccount).toBe('2010');
    const paid = openForeignRows(DATE, { USD: 60 }, { ...m, apInvoices: [{ ...doc, appliedAmount: 1e9 } as never], arInvoices: [] });
    expect(paid).toHaveLength(0);
  });
});

describe('a falling peso value', () => {
  it('credits A/R and debits A/P, with the loss and gain the other way round', () => {
    const rows = [row({ docType: 'IN', difference: -200 }), row({ docType: 'PU', difference: -300, controlAccount: '2010' })];
    expect(erdTotals(rows)).toEqual({ gain: 300, loss: 200, net: 100 });
    const lines = erdLines(rows);
    expect(lines.find((l) => l.account === '1120')?.credit).toBe(200);
    expect(lines.find((l) => l.account === '2010')?.debit).toBe(300);
  });

  it('a run without remarks is labelled with its date', async () => {
    const run = await postErdRun(DATE, '2026-10-10', { USD: 56 }, [row({})], '');
    expect(run.rows).toHaveLength(1);
    expect(run.remarks).toMatch(/^Exchange Rate Differences – /);
    expect([run.gain, run.loss]).toEqual([0, 200]);
  });
});
