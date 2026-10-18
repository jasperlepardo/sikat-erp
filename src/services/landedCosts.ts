import {
  LC_SERIES,
  SEED_LANDED_COSTS,
  type LandedCost,
  type LandedCostEntry,
  type LandedCostLine,
} from '../mocks/landedCosts';
import { SEED_LC_TYPES, type LandedCostType } from '../mocks/landedCostTypes';
import { lcSeries, seriesLookup, formatDocNum } from './allSeries';
import { todayISO } from './dates';
import { createCollection } from './store';

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

const round2 = (n: number) => Math.round(n * 100) / 100;

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
  return lines.map((line) => {
    let alloc = 0;
    let varAlloc = 0;
    let constAlloc = 0;
    for (const entry of costs) {
      const total = lines.reduce((s, l) => s + basis(entry.allocationBy, l), 0);
      const share = total > 0 ? basis(entry.allocationBy, line) / total : 1 / lines.length;
      const portion = round2(entry.amount * share);
      alloc += portion;
      if (entry.isVariable) varAlloc += portion;
      else constAlloc += portion;
    }
    return {
      ...line,
      allocCostsVal: round2(alloc),
      varCosts: round2(varAlloc),
      constCosts: round2(constAlloc),
    };
  });
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

export { todayISO };
