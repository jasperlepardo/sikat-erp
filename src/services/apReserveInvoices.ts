import { AP_RI_SERIES, SEED_AP_RESERVE_INVOICES, type ApReserveInvoice } from '../mocks/apReserveInvoices';
import { apRiSeries, seriesLookup, formatDocNum } from './allSeries';
import { todayISO } from './dates';
import { createCollection } from './store';
import { poTotals } from './purchaseOrders';
import type { RoundingRule } from '../mocks/currencies';

const invoices = createCollection<ApReserveInvoice>(
  'sikat-erp:ap-reserve-invoices:v1',
  SEED_AP_RESERVE_INVOICES,
  'apri',
  { audit: 'APRI' },
);

export const listApReserveInvoices = invoices.list;
export async function getApReserveInvoice(idOrNumber: string) {
  const direct = await invoices.get(idOrNumber);
  if (direct) return direct;
  const all = await invoices.list();
  return all.find((inv) => apRiNumber(inv) === idOrNumber) ?? null;
}

export type ApRiInput = Omit<ApReserveInvoice, 'id'> & { id?: string };

const apRiSeriesOf = (id: string) => seriesLookup(apRiSeries, id, AP_RI_SERIES);
export const apRiNumber = (inv: Pick<ApReserveInvoice, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(apRiSeriesOf(inv.seriesId), inv.docNum, inv.postingDate);

export const apRiTotals = (
  inv: Pick<ApReserveInvoice, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode'>,
  rateOf: (taxCode: string) => number,
  rounding?: RoundingRule,
  isReverseCharge?: (taxCode: string) => boolean,
) => poTotals(inv as Parameters<typeof poTotals>[0], rateOf, rounding, isReverseCharge);

export async function saveApRiDraft(doc: ApRiInput): Promise<ApReserveInvoice> {
  return invoices.save({ ...doc, status: 'Draft', docNum: 0 } as ApReserveInvoice);
}

export async function addApReserveInvoice(doc: ApRiInput): Promise<ApReserveInvoice> {
  const series = apRiSeriesOf(doc.seriesId);
  const all = await invoices.list();
  const docNum = doc.docNum || Math.max(series.firstNo - 1, ...all.filter((r) => r.seriesId === series.id).map((r) => r.docNum)) + 1;
  const status = doc.approved !== false ? 'Open' : 'Not Confirmed';
  return invoices.save({ ...doc, docNum, status } as ApReserveInvoice);
}

export async function cancelApReserveInvoice(inv: ApReserveInvoice): Promise<ApReserveInvoice> {
  if (inv.status !== 'Open') throw new Error('Only open reserve invoices can be cancelled.');
  return invoices.save({ ...inv, status: 'Cancelled', closeDate: todayISO() });
}

export async function recallApReserveInvoice(inv: ApReserveInvoice): Promise<ApReserveInvoice> {
  if (inv.status !== 'Not Confirmed') throw new Error('Only Not Confirmed invoices can be recalled to draft.');
  return invoices.save({ ...inv, status: 'Draft', docNum: 0 });
}

export async function saveApRiRemarks(
  inv: ApReserveInvoice,
  patch: Pick<ApReserveInvoice, 'remarks' | 'paymentBlock' | 'paymentOrderRun'>,
): Promise<ApReserveInvoice> {
  const current = await invoices.get(inv.id);
  if (!current) throw new Error('This A/P reserve invoice no longer exists.');
  return invoices.save({ ...current, ...patch });
}
