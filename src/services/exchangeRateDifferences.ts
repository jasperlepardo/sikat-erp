import type { ApInvoice } from '../mocks/apInvoices';
import type { ArInvoice } from '../mocks/arInvoices';
import type { ExchangeRate } from '../mocks/currencies';
import { FX_REVALUATION_TRANS_CODE, SEED_ERD_RUNS, type ErdRow, type ErdRun } from '../mocks/exchangeRateDifferences';
import { blankJournalEntry, newJeLine } from '../mocks/journalEntries';
import type { Item } from '../mocks/items';
import type { Partner } from '../mocks/partners';
import { FX_GAIN_ACCOUNT, FX_LOSS_ACCOUNT } from '../mocks/outgoingPayments';
import { invoiceBalance } from '../pages/purchasing/payments/detail/types';
import { apNumber } from './apInvoices';
import { arAmounts, arNumber } from './arInvoices';
import { formatDate } from './dates';
import { addJournalEntry, jeNumber } from './journalEntries';
import { rateOn } from './masterData';
import { createCollection } from './store';
import type { TaxMasterData } from './taxDetermination';

const runs = createCollection<ErdRun>('sikat-erp:exchange-rate-differences', SEED_ERD_RUNS, 'erd');

export const listErdRuns = runs.list;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export interface ErdMasters {
  arInvoices: ArInvoice[];
  apInvoices: ApInvoice[];
  customers: Partner[];
  vendors: Partner[];
  items: Item[];
  codes: TaxMasterData['codes'];
  tax: TaxMasterData;
  rates: ExchangeRate[];
}

/** The BSP rate on `date` for each foreign currency with an open document. */
export function defaultRates(currencies: string[], rates: ExchangeRate[], date: string) {
  return Object.fromEntries(currencies.map((c) => [c, rateOn(rates, c, date)?.rate ?? 0]));
}

/**
 * Open foreign-currency documents posted on or before `date`, with their open balance in the
 * document currency and the rate they were booked at. `rates` is the run's rate per currency.
 */
export function openForeignRows(date: string, rates: Record<string, number>, m: ErdMasters): ErdRow[] {
  const rows: ErdRow[] = [];
  const row = (r: Omit<ErdRow, 'id' | 'rate' | 'difference' | 'selected'>): ErdRow => {
    const rate = rates[r.currency] ?? 0;
    return { ...r, id: `${r.docType}-${r.docId}`, rate, difference: rate ? round2(r.balanceFc * (rate - r.bookedRate)) : 0, selected: Boolean(rate) };
  };
  for (const inv of m.arInvoices) {
    if (inv.status !== 'Open' || inv.currency === 'PHP' || inv.postingDate > date) continue;
    const c = m.customers.find((p) => p.id === inv.customerId);
    const { balanceDue } = arAmounts(inv, c, m.items, m.codes);
    if (balanceDue <= 0) continue;
    rows.push(row({ docType: 'IN', docId: inv.id, docNo: arNumber(inv), partnerId: inv.customerId, partnerName: inv.customerName, currency: inv.currency, balanceFc: balanceDue, bookedRate: inv.fxRate, controlAccount: inv.controlAccount || '1120' }));
  }
  for (const bill of m.apInvoices) {
    if (bill.status !== 'Open' || bill.currency === 'PHP' || bill.postingDate > date) continue;
    // Net due after withholding and down payments, less what's paid — the part still exposed to the rate.
    const { balanceDue } = invoiceBalance(bill, { vendors: m.vendors, items: m.items, tax: m.tax });
    if (balanceDue <= 0) continue;
    rows.push(row({ docType: 'PU', docId: bill.id, docNo: apNumber(bill), partnerId: bill.vendorId, partnerName: bill.vendorName, currency: bill.currency, balanceFc: balanceDue, bookedRate: bill.fxRate, controlAccount: bill.controlAccount || '2010' }));
  }
  return rows;
}

/** Gain and loss in PHP for the ticked rows. A/R up is a gain; A/P up is a loss. */
export function erdTotals(rows: ErdRow[]) {
  let gain = 0;
  let loss = 0;
  for (const r of rows.filter((x) => x.selected && x.difference)) {
    const effect = r.docType === 'IN' ? r.difference : -r.difference;
    if (effect > 0) gain += effect;
    else loss -= effect;
  }
  return { gain: round2(gain), loss: round2(loss), net: round2(gain - loss) };
}

/**
 * The run's journal entry lines: each document's control account (with its partner) moves by the
 * difference — Dr A/R / Cr A/P when the peso value rises — against 7020 for gains and 8020 for losses.
 */
export function erdLines(rows: ErdRow[]) {
  const lines = [];
  for (const r of rows.filter((x) => x.selected && x.difference)) {
    const up = r.difference > 0;
    const amt = Math.abs(r.difference);
    const remarks = `${r.docType === 'IN' ? 'A/R invoice' : 'A/P invoice'} ${r.docNo}: ${r.currency} ${r.balanceFc} × (${r.rate} − ${r.bookedRate})`;
    if (r.docType === 'IN') lines.push(newJeLine({ account: r.controlAccount, partnerId: r.partnerId, debit: up ? amt : 0, credit: up ? 0 : amt, remarks }));
    else lines.push(newJeLine({ account: r.controlAccount, partnerId: r.partnerId, debit: up ? 0 : amt, credit: up ? amt : 0, remarks }));
  }
  const { gain, loss } = erdTotals(rows);
  if (gain) lines.push(newJeLine({ account: FX_GAIN_ACCOUNT, credit: gain, remarks: 'Unrealized exchange gain' }));
  if (loss) lines.push(newJeLine({ account: FX_LOSS_ACCOUNT, debit: loss, remarks: 'Unrealized exchange loss' }));
  return lines;
}

/**
 * Post the run: one journal entry dated the revaluation date, reversed automatically on
 * `reversalDate` (the period and balance checks are the journal entry's own).
 */
export async function postErdRun(date: string, reversalDate: string, rates: Record<string, number>, rows: ErdRow[], remarks: string): Promise<ErdRun> {
  const lines = erdLines(rows);
  if (!lines.length) throw new Error('Nothing to revalue: no ticked document has a difference.');
  const label = `Exchange Rate Differences – ${formatDate(date)}`;
  const je = await addJournalEntry({
    ...blankJournalEntry(date),
    remarks: remarks || label,
    transCode: FX_REVALUATION_TRANS_CODE,
    ref1: `ERD ${date}`,
    reverse: true,
    reversalDate,
    lines,
  });
  const { gain, loss } = erdTotals(rows);
  return runs.save({
    date,
    reversalDate,
    rates: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, round4(v)])),
    rows: rows.filter((r) => r.selected && r.difference),
    journalEntryId: je.id,
    journalEntryNo: je.number,
    gain,
    loss,
    remarks: remarks || label,
  });
}

export const runLabel = (r: Pick<ErdRun, 'date' | 'journalEntryNo'>) => `${formatDate(r.date)} · journal entry ${jeNumber({ number: r.journalEntryNo, postingDate: r.date })}`;
