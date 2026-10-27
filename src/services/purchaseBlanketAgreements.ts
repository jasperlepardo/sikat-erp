import { PBA_SERIES, SEED_PURCHASE_BLANKET_AGREEMENTS, withCommitments, type PbaLine, type PurchaseBlanketAgreement } from '../mocks/purchaseBlanketAgreements';
import { createCollection } from './store';
import { pbaSeries, formatDocNum, seriesLookup } from './allSeries';
import type { PurchaseOrder } from '../mocks/purchaseOrders';

const agreements = createCollection<PurchaseBlanketAgreement>('sikat-erp:purchase-blanket-agreements', SEED_PURCHASE_BLANKET_AGREEMENTS, 'pba');

export const listPurchaseBlanketAgreements = agreements.list;
/** Live purchase blanket agreements, for pickers (`useCollection`). */
export const purchaseAgreementsCollection = agreements;
/** The agreements as last loaded, for pickers that read them synchronously (purchasing line columns). */
export const agreementsSnapshot = () => agreements.snapshot();

export async function getPurchaseBlanketAgreement(idOrNumber: string) {
  const direct = await agreements.get(idOrNumber);
  if (direct) return direct;
  const all = await agreements.list();
  return all.find((b) => pbaNumber(b) === idOrNumber) ?? null;
}

export type PbaInput = Omit<PurchaseBlanketAgreement, 'id'> & { id?: string };

const seriesOf = (id: string) => seriesLookup(pbaSeries, id, PBA_SERIES);
export const pbaNumber = (pba: Pick<PurchaseBlanketAgreement, 'seriesId' | 'docNum' | 'startDate'>) =>
  formatDocNum(seriesOf(pba.seriesId), pba.docNum, pba.startDate);

export async function savePurchaseBlanketAgreement(input: PbaInput, options: { asDraft?: boolean } = {}): Promise<PurchaseBlanketAgreement> {
  let { docNum } = input;
  const addingNumber = !options.asDraft && input.status !== 'Draft' && !docNum;
  if (addingNumber) {
    const all = await agreements.list();
    const used = all
      .filter((b) => b.id !== input.id && b.seriesId === input.seriesId && b.docNum > 0)
      .map((b) => b.docNum);
    const series = seriesOf(input.seriesId);
    const max = used.length ? Math.max(...used) : series.firstNo - 1;
    docNum = max + 1;
  }
  return agreements.save({ ...input, docNum });
}

// ── Commitment recalculation ─────────────────────────────────────────────────

/**
 * After any PO save, recompute committed and cumulative figures on the agreements its
 * lines draw on (before and after the save, so a line moved off an agreement frees it).
 */
export async function recalculatePBACommitments(pbaIds: string[]): Promise<void> {
  if (!pbaIds.length) return;
  const { listPurchaseOrders } = await import('./purchaseOrders');
  const allPos: PurchaseOrder[] = await listPurchaseOrders();
  const changed = [];
  for (const pbaId of new Set(pbaIds)) {
    const pba = await agreements.get(pbaId);
    if (pba) changed.push(withCommitments(pba, allPos));
  }
  if (changed.length) await agreements.saveMany(changed);
}

// ── Calculated fields ────────────────────────────────────────────────────────

export const openQty = (l: PbaLine) =>
  l.rowStatus === 'Closed' ? 0 : Math.max(0, l.plannedQty - l.cumulativeQty);

const openAmountLC = (l: PbaLine) =>
  openQty(l) * l.unitPrice;

const lineTotal = (l: PbaLine) => l.plannedQty * l.unitPrice;

export function pbaTotals(pba: Pick<PurchaseBlanketAgreement, 'lines'>) {
  const plannedTotal = pba.lines.reduce((n, l) => n + lineTotal(l), 0);
  const committedTotal = pba.lines.reduce((n, l) => n + l.cumulativeCommittedAmountLC, 0);
  const cumulativeTotal = pba.lines.reduce((n, l) => n + l.cumulativeAmountLC, 0);
  const openTotal = pba.lines.reduce((n, l) => n + openAmountLC(l), 0);
  return { plannedTotal, committedTotal, cumulativeTotal, openTotal };
}
