import {
  LC_SERIES,
  SEED_LANDED_COSTS,
  type LandedCost,
  type LandedCostEntry,
  type LandedCostLine,
} from '../mocks/landedCosts';
import { SEED_LC_TYPES, type LandedCostType } from '../mocks/landedCostTypes';
import { lcSeries, seriesLookup, formatDocNum } from './allSeries';
import { createCollection } from './store';
import { round2 } from './num';

const lc = createCollection<LandedCost>('sikat-erp:landed-costs:v1', SEED_LANDED_COSTS, 'lc', { audit: 'LC' });
export const landedCostTypes = createCollection<LandedCostType>('sikat-erp:lc-types', SEED_LC_TYPES, 'lct');

export const listLandedCosts = lc.list;
export async function getLandedCost(idOrNumber: string) {
  const direct = await lc.get(idOrNumber);
  if (direct) return direct;
  const all = await lc.list();
  return all.find((r) => lcNumber(r) === idOrNumber) ?? null;
}

export type LcInput = Omit<LandedCost, 'id'> & { id?: string };

export const lcNumber = (doc: Pick<LandedCost, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(seriesLookup(lcSeries, doc.seriesId, LC_SERIES), doc.docNum, doc.postingDate);

export function lcTotals(costs: LandedCostEntry[]) {
  return round2(costs.reduce((n, c) => n + c.amount, 0));
}

function basis(by: LandedCostEntry['allocationBy'], l: LandedCostLine): number {
  if (by === 'Quantity') return l.quantity;
  if (by === 'Value') return l.unitPrice * l.quantity;
  return 1;
}

export function allocate(costs: LandedCostEntry[], lines: LandedCostLine[]): LandedCostLine[] {
  const alloc = lines.map(() => 0);
  const varAlloc = lines.map(() => 0);
  const constAlloc = lines.map(() => 0);
  // Allocate each cost across the lines with cumulative rounding: round the running total at each
  // line and take the step as that line's share. The per-line portions then sum to exactly the
  // cost amount (no penny drift), because the last step closes on round2(amount).
  for (const entry of costs) {
    const total = lines.reduce((s, l) => s + basis(entry.allocationBy, l), 0);
    let cumRaw = 0;
    let cumRounded = 0;
    lines.forEach((line, i) => {
      const share = total > 0 ? basis(entry.allocationBy, line) / total : 1 / lines.length;
      cumRaw += entry.amount * share;
      const next = round2(cumRaw);
      const portion = round2(next - cumRounded);
      cumRounded = next;
      alloc[i] += portion;
      if (entry.isVariable) varAlloc[i] += portion;
      else constAlloc[i] += portion;
    });
  }
  return lines.map((line, i) => ({
    ...line,
    allocCostsVal: round2(alloc[i]),
    varCosts: round2(varAlloc[i]),
    constCosts: round2(constAlloc[i]),
  }));
}

export const saveLcDraft = (input: LcInput) => lc.save({ ...input, status: 'Draft', docNum: 0 });

export async function addLandedCost(input: LcInput): Promise<LandedCost> {
  const all = await lc.list();
  const series = seriesLookup(lcSeries, input.seriesId, LC_SERIES);
  const docNum =
    input.docNum ||
    Math.max(series.firstNo - 1, ...all.filter((r) => r.seriesId === series.id).map((r) => r.docNum)) + 1;
  const allocatedLines = allocate(input.costs, input.lines);
  const transactionId = `lc-tx-${crypto.randomUUID().slice(0, 8)}`;
  return lc.save({ ...input, lines: allocatedLines, docNum, status: 'Open', transactionId });
}

export async function cancelLandedCost(doc: LandedCost): Promise<LandedCost> {
  return lc.save({ ...doc, status: 'Cancelled' });
}

;
