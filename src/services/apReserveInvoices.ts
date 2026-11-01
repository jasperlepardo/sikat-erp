import { AP_RI_SERIES, SEED_AP_RESERVE_INVOICES, type ApReserveInvoice } from '../mocks/apReserveInvoices';
import { apRiSeries, seriesLookup, formatDocNum } from './allSeries';
import { todayISO } from './dates';
import { createCollection } from './store';
import { poTotals } from './purchaseOrders';
import type { RoundingRule } from '../mocks/currencies';
import { listItems } from './items';
import { birForms, taxCodes } from './masterData';
import { getPartner } from './partners';
import { withTaxFiling } from './taxRecalc';
import { currentTaxData, docWithholding, stampWithholding, withSeedWithholding } from './withholding';
import { expenseAccountFor } from './goodsReceipts';
import { inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { rateAt, vatNotPaidToVendor, type TaxCode } from '../mocks/taxes';
import { round2 } from './num';
import type { Item } from '../mocks/items';
import type { ItemGroup } from '../mocks/itemMasters';
import type { Partner } from '../mocks/partners';
import type { TaxMasterData } from './taxDetermination';

const WITHHOLDING_PAYABLE: Record<string, string> = {
  'Expanded (EWT)': '2340',
  'Final (FWT)': '2345',
  'Withholding VAT': '2330',
  'Percentage tax': '2320',
};

/** Journal entry an A/P reserve invoice makes when added: Dr purchase accounts and Input VAT / Cr the vendor and any withholding tax. No stock moves (goods arrive on a later Goods Receipt). */
export function apriJournal(
  draft: ApRiInput,
  fx: number,
  { items, groups, codes, vendor, tax }: { items: Item[]; groups: ItemGroup[]; codes: TaxCode[]; vendor: Partner | undefined; tax: TaxMasterData },
): JournalLine[] {
  const vatAccount = (code: string) => codes.find((c) => c.code === code)?.glAccount || '1410';
  const reverse = (code: string) => vatNotPaidToVendor(codes.find((c) => c.code === code));
  const rateOf = (code: string) => { const c = codes.find((x) => x.code === code); return c ? (rateAt(c, draft.postingDate) ?? 0) : 0; };
  const factor = 1 - draft.discountPct / 100;
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => {
    if (account && amount) totals.set(account, round2((totals.get(account) ?? 0) + amount));
  };

  for (const l of draft.lines) {
    const item = items.find((i) => i.id === l.itemId);
    if (!item) continue;
    const net = round2(l.unitPrice * l.quantity * (1 - l.discountPct / 100) * factor * fx);
    const ownAccount = item.inventoryItem
      ? inventoryAccountFor(item, l.warehouse, groups)
      : expenseAccountFor(item, groups);
    add(ownAccount, net);
    if (!reverse(l.taxCode)) add(vatAccount(l.taxCode), round2((net * rateOf(l.taxCode)) / 100));
  }

  const withholding = docWithholding(
    draft as Parameters<typeof docWithholding>[0],
    vendor,
    items,
    tax,
    draft.postingDate,
  );
  const debits = round2([...totals.values()].reduce((n, v) => n + v, 0));
  let withheld = 0;
  for (const w of withholding.filter((x) => x.deducted)) {
    const amt = round2(w.amount * fx);
    add(w.account || WITHHOLDING_PAYABLE[w.kind] || '2340', -amt);
    withheld += amt;
  }
  if (debits) add(draft.controlAccount || '2010', -round2(debits - withheld));

  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit || a.credit - b.credit);
}

// Seeded withholding is stamped as if each was added under the seeded Settings.
const invoices = createCollection<ApReserveInvoice>(
  'sikat-erp:ap-reserve-invoices:v1',
  () => withSeedWithholding(SEED_AP_RESERVE_INVOICES),
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
  if (status !== 'Open') return invoices.save({ ...doc, docNum, status } as ApReserveInvoice);
  // Withholding and filing are fixed now, so later Settings changes don't move them.
  const [items, vendor, codes, forms] = await Promise.all([listItems(), getPartner(doc.vendorId), taxCodes.list(), birForms.list()]);
  const stamped = stampWithholding(doc, vendor ?? undefined, items, currentTaxData(), doc.postingDate);
  return invoices.save({ ...doc, lines: withTaxFiling(stamped.lines, codes, forms), withholdingSummary: stamped.withholdingSummary, docNum, status } as ApReserveInvoice);
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
