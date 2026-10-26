import {
  LC_SERIES,
  SEED_LANDED_COSTS,
  type LandedCost,
  type LandedCostEntry,
  type LandedCostLine,
} from '../mocks/landedCosts';
import { SEED_LC_TYPES, type LandedCostType } from '../mocks/landedCostTypes';
import type { Item } from '../mocks/items';
import type { ItemGroup } from '../mocks/itemMasters';
import { lcSeries, seriesLookup, formatDocNum } from './allSeries';
import { createCollection } from './store';
import { inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { listItems, saveItems } from './items';
import { round2 } from './num';

/** Landed costs are accrued as a liability (owed to brokers / freight forwarders / customs) until invoiced. */
export const LANDED_COST_ACCRUAL_ACCOUNT = '2030'; // Accrued Expenses

/** A landed cost is posted (capitalized) once it leaves Draft, until Cancelled. */
export const lcPosted = (status: LandedCost['status']) => status !== 'Draft' && status !== 'Cancelled';

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

/**
 * The posting that capitalizes a landed cost: debit each line's inventory account by its allocated
 * amount, credit the landed-cost accrual (a liability until the broker / forwarder / customs is billed).
 * Balances to the centavo because the credit is the sum of the debits.
 */
export function lcJournal(doc: Pick<LandedCost, 'lines'>, items: Item[], groups: ItemGroup[]): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => account && totals.set(account, round2((totals.get(account) ?? 0) + amount));
  let credit = 0;
  for (const l of doc.lines) {
    const item = items.find((i) => i.id === l.itemId);
    if (!item || !item.inventoryItem || !l.allocCostsVal) continue;
    add(inventoryAccountFor(item, l.warehouse, groups), l.allocCostsVal);
    credit += l.allocCostsVal;
  }
  if (credit) add(LANDED_COST_ACCRUAL_ACCOUNT, -round2(credit));
  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit);
}

/**
 * Capitalize (`sign` +1) or reverse (−1) a posted landed cost into live item costs. The allocation per
 * item is spread over the units on hand (moving average), matching how the seeded books fold it into
 * the receipt's cost layers. No stock on hand (all sold) → nothing to capitalize, left as is.
 */
async function applyLandedCostToInventory(lines: LandedCostLine[], sign: 1 | -1): Promise<void> {
  const byItem = new Map<string, number>();
  for (const l of lines) if (l.itemId && l.allocCostsVal) byItem.set(l.itemId, (byItem.get(l.itemId) ?? 0) + l.allocCostsVal);
  if (!byItem.size) return;
  const all = await listItems();
  const updates: Item[] = [];
  for (const [itemId, alloc] of byItem) {
    const item = all.find((i) => i.id === itemId);
    if (!item) continue;
    const units = (item.warehouses ?? []).reduce((s, w) => s + (w.inStock ?? 0), 0);
    if (units <= 0) continue;
    updates.push({ ...item, itemCost: round2(item.itemCost + (sign * alloc) / units) });
  }
  if (updates.length) await saveItems(updates);
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
  const saved = await lc.save({ ...input, lines: allocatedLines, docNum, status: 'Open', transactionId });
  // Capitalize the allocation into inventory (debit Inventory / credit accrual in the ledger).
  await applyLandedCostToInventory(allocatedLines, 1);
  return saved;
}

export async function cancelLandedCost(doc: LandedCost): Promise<LandedCost> {
  if (lcPosted(doc.status)) await applyLandedCostToInventory(doc.lines, -1);
  return lc.save({ ...doc, status: 'Cancelled' });
}
