import { PBA_SERIES, SEED_PURCHASE_BLANKET_AGREEMENTS, type PbaLine, type PurchaseBlanketAgreement } from '../mocks/purchaseBlanketAgreements';
import { createCollection } from './store';
import { pbaSeries, formatDocNum, seriesLookup } from './allSeries';
import type { PurchaseOrder } from '../mocks/purchaseOrders';

const agreements = createCollection<PurchaseBlanketAgreement>('sikat-erp:purchase-blanket-agreements', SEED_PURCHASE_BLANKET_AGREEMENTS, 'pba');

export const listPurchaseBlanketAgreements = agreements.list;
export const resetPurchaseBlanketAgreements = agreements.reset;

export async function getPurchaseBlanketAgreement(idOrNumber: string) {
  const direct = await agreements.get(idOrNumber);
  if (direct) return direct;
  const all = await agreements.list();
  return all.find((b) => pbaNumber(b) === idOrNumber) ?? null;
}

export type PbaInput = Omit<PurchaseBlanketAgreement, 'id'> & { id?: string };

export const seriesOf = (id: string) => seriesLookup(pbaSeries, id, PBA_SERIES);
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
 * After any PO save, recompute committed and cumulative figures on all PBA lines
 * that any PO line references.
 */
export async function recalculatePBACommitments(pbaIds: string[]): Promise<void> {
  if (!pbaIds.length) return;
  const { listPurchaseOrders } = await import('./purchaseOrders');
  const allPos: PurchaseOrder[] = await listPurchaseOrders();
  for (const pbaId of pbaIds) {
    const pba = await agreements.get(pbaId);
    if (!pba) continue;
    const linkedPos = allPos.filter((po) => po.lines.some((l) => l.agreementId === pba.id));
    const updatedLines: PbaLine[] = pba.lines.map((pbaLine) => {
      let cumulativeCommittedQty = 0;
      let cumulativeQty = 0;
      for (const po of linkedPos) {
        for (const poLine of po.lines) {
          if (poLine.agreementLineId !== pbaLine.id) continue;
          if (po.status === 'Open' && poLine.status === 'Open') {
            cumulativeCommittedQty += poLine.quantity;
          }
          if (poLine.status === 'Closed') {
            cumulativeQty += poLine.quantity;
          }
        }
      }
      const cumulativeAmountLC = Math.round(cumulativeQty * pbaLine.unitPrice * 100) / 100;
      const cumulativeCommittedAmountLC = Math.round(cumulativeCommittedQty * pbaLine.unitPrice * 100) / 100;
      return {
        ...pbaLine,
        cumulativeCommittedQty,
        cumulativeCommittedAmountLC,
        cumulativeCommittedAmountFC: 0,
        cumulativeQty,
        cumulativeAmountLC,
        cumulativeAmountFC: 0,
      };
    });
    await agreements.save({ ...pba, lines: updatedLines });
  }
}

// ── Calculated fields ────────────────────────────────────────────────────────

export const openQty = (l: PbaLine) =>
  l.rowStatus === 'Closed' ? 0 : Math.max(0, l.plannedQty - l.cumulativeQty);

export const openAmountLC = (l: PbaLine) =>
  openQty(l) * l.unitPrice;

export const lineTotal = (l: PbaLine) => l.plannedQty * l.unitPrice;

export function pbaTotals(pba: Pick<PurchaseBlanketAgreement, 'lines'>) {
  const plannedTotal = pba.lines.reduce((n, l) => n + lineTotal(l), 0);
  const committedTotal = pba.lines.reduce((n, l) => n + l.cumulativeCommittedAmountLC, 0);
  const cumulativeTotal = pba.lines.reduce((n, l) => n + l.cumulativeAmountLC, 0);
  const openTotal = pba.lines.reduce((n, l) => n + openAmountLC(l), 0);
  return { plannedTotal, committedTotal, cumulativeTotal, openTotal };
}
