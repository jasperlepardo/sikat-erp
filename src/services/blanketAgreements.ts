import { BA_SERIES, SEED_BLANKET_AGREEMENTS, type BaLine, type BlanketAgreement } from '../mocks/blanketAgreements';
import { createCollection } from './store';
import { baSeries, formatDocNum, seriesLookup } from './allSeries';
import type { SalesOrder } from '../mocks/salesOrders';

const agreements = createCollection<BlanketAgreement>('sikat-erp:blanket-agreements:v1', SEED_BLANKET_AGREEMENTS, 'ba');

export const listBlanketAgreements = agreements.list;
export const resetBlanketAgreements = agreements.reset;

export async function getBlanketAgreement(idOrNumber: string) {
  const direct = await agreements.get(idOrNumber);
  if (direct) return direct;
  const all = await agreements.list();
  return all.find((b) => baNumber(b) === idOrNumber) ?? null;
}

export type BaInput = Omit<BlanketAgreement, 'id'> & { id?: string };

export const seriesOf = (id: string) => seriesLookup(baSeries, id, BA_SERIES);
export const baNumber = (ba: Pick<BlanketAgreement, 'seriesId' | 'docNum' | 'startDate'>) =>
  formatDocNum(seriesOf(ba.seriesId), ba.docNum, ba.startDate);

export async function saveBlanketAgreement(input: BaInput, options: { asDraft?: boolean } = {}): Promise<BlanketAgreement> {
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
 * After any SO save, recompute committed and cumulative figures on all BA lines
 * that any SO line references. Scans all SOs each time (prototype approach).
 */
export async function recalculateBACommitments(baIds: string[]): Promise<void> {
  if (!baIds.length) return;
  // Import lazily to avoid a circular dependency at module load time.
  const { listSalesOrders } = await import('./salesOrders');
  const allSos: SalesOrder[] = await listSalesOrders();
  for (const baId of baIds) {
    const ba = await agreements.get(baId);
    if (!ba) continue;
    const linkedSos = allSos.filter((so) => so.lines.some((l) => l.agreementId === ba.id));
    const updatedLines: BaLine[] = ba.lines.map((baLine) => {
      let cumulativeCommittedQty = 0;
      let cumulativeQty = 0;
      for (const so of linkedSos) {
        for (const soLine of so.lines) {
          if (soLine.agreementLineId !== baLine.id) continue;
          if (so.status === 'Open' && soLine.status === 'Open') {
            cumulativeCommittedQty += soLine.quantity;
          }
          if (soLine.status === 'Closed') {
            cumulativeQty += soLine.quantity;
          }
        }
      }
      const cumulativeAmountLC = Math.round(cumulativeQty * baLine.unitPrice * 100) / 100;
      const cumulativeCommittedAmountLC = Math.round(cumulativeCommittedQty * baLine.unitPrice * 100) / 100;
      return {
        ...baLine,
        cumulativeCommittedQty,
        cumulativeCommittedAmountLC,
        cumulativeCommittedAmountFC: 0,
        cumulativeQty,
        cumulativeAmountLC,
        cumulativeAmountFC: 0,
      };
    });
    await agreements.save({ ...ba, lines: updatedLines });
  }
}

// ── Calculated fields ────────────────────────────────────────────────────────

export const openQty = (l: BaLine) =>
  l.rowStatus === 'Closed' ? 0 : Math.max(0, l.plannedQty - l.cumulativeQty);

export const openAmountLC = (l: BaLine) =>
  openQty(l) * l.unitPrice;

export const lineTotal = (l: BaLine) => l.plannedQty * l.unitPrice;

export function baTotals(ba: Pick<BlanketAgreement, 'lines'>) {
  const plannedTotal = ba.lines.reduce((n, l) => n + lineTotal(l), 0);
  const committedTotal = ba.lines.reduce((n, l) => n + l.cumulativeCommittedAmountLC, 0);
  const cumulativeTotal = ba.lines.reduce((n, l) => n + l.cumulativeAmountLC, 0);
  const openTotal = ba.lines.reduce((n, l) => n + openAmountLC(l), 0);
  return { plannedTotal, committedTotal, cumulativeTotal, openTotal };
}
