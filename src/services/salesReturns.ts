import { SR_SERIES, SEED_SALES_RETURNS, newSrLine, type SalesReturn, type SrLine } from '../mocks/salesReturns';
import { srSeries, seriesLookup, formatDocNum } from './allSeries';
import type { ItemGroup } from '../mocks/itemMasters';
import type { Item } from '../mocks/items';
import { rateAt, type TaxCode } from '../mocks/taxes';
import { todayISO } from './dates';
import { dnInventoryQty, dnNumber, listDeliveries } from './deliveries';
import { itemGroups } from './inventoryMasters';
import { inventoryAccountFor, type JournalLine } from './inventoryTransfers';
import { listItems, saveItem } from './items';
import { consumeLayers, logConsumption, restoreLayer, updateFifoCosts, type Taken } from './costLayers';
import { postDocumentEntry, reverseDocumentEntry } from './journalEntries';
import { soTotals } from './salesOrders';
import { createCollection } from './store';
import { withLineCosts } from './stockHistory';

const salesReturns = createCollection<SalesReturn>('sikat-erp:sales-returns', withLineCosts(SEED_SALES_RETURNS), 'sr');

export const listSalesReturns = salesReturns.list;
export async function getSalesReturn(idOrNumber: string) {
  const direct = await salesReturns.get(idOrNumber);
  if (direct) return direct;
  const all = await salesReturns.list();
  return all.find((r) => srNumber(r) === idOrNumber) ?? null;
}

export type SrInput = Omit<SalesReturn, 'id'> & { id?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const srSeriesOf = (id: string) => seriesLookup(srSeries, id, SR_SERIES);
export const srNumber = (r: Pick<SalesReturn, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(srSeriesOf(r.seriesId), r.docNum, r.postingDate);

/** Footer totals — same math as the delivery (lines are the same shape). */
export const srTotals = (
  r: Pick<SalesReturn, 'lines' | 'discountPct' | 'freight' | 'freightTaxCode' | 'rounding'>,
  rateOf: (code: string) => number,
  rule?: Parameters<typeof soTotals>[2],
) => soTotals(r as unknown as Parameters<typeof soTotals>[0], rateOf, rule);

const rateFrom = (codes: readonly TaxCode[], date: string) => (code: string) => {
  const c = codes.find((x) => x.code === code);
  return c ? (rateAt(c, date) ?? 0) : 0;
};

export const srTotal = (r: SalesReturn, codes: TaxCode[]) =>
  srTotals(r, rateFrom(codes, r.postingDate)).total;

/** Left to credit on a return line: only while the return is Open. */
export const srOpenQty = (l: SrLine, r: Pick<SalesReturn, 'status'>) =>
  r.status === 'Open' ? Math.max(0, round4(l.quantity - l.creditedQty)) : 0;

/** Returns an A/R credit memo can copy from: the customer's open returns with quantity left to credit. */
export const creditableSalesReturns = (all: SalesReturn[], customerId: string) =>
  all.filter((r) => r.customerId === customerId && r.status === 'Open' && r.lines.some((l) => srOpenQty(l, r) > 0));

/** Build SrLine[] from DnLine picks. */
export function srLineFromDelivery(dn: SalesReturn['lines'][0] extends never ? never : import('../mocks/deliveries').Delivery, picks: { lineId: string; qty: number }[]): SrLine[] {
  return picks.flatMap(({ lineId, qty }) => {
    const dl = dn.lines.find((l) => l.id === lineId);
    if (!dl) return [];
    const { invoicedQty: _i, ...base } = dl;
    return [
      newSrLine({
        ...base,
        id: `srl-${crypto.randomUUID().slice(0, 8)}`,
        quantity: qty,
        baseType: 'DN' as const,
        baseId: dn.id,
        baseLineId: dl.id,
        baseDocNo: dnNumber(dn),
        creditedQty: 0,
        returnReason: '',
      }),
    ];
  });
}

/**
 * The entry the return makes, in PHP: Dr Inventory / Cr COGS — reverse of the delivery journal.
 * Stock comes back in at the cost it went out at.
 */
export function srJournal(
  r: Pick<SalesReturn, 'lines'>,
  items: readonly Item[],
  groups: readonly ItemGroup[],
  fixed = false,
): JournalLine[] {
  const totals = new Map<string, number>();
  const add = (account: string, amount: number) => account && totals.set(account, round2((totals.get(account) ?? 0) + amount));
  const cogsAccountFor = (item: Item) =>
    item.glBy === 'Item Level' ? item.cogsAccount : groups.find((g) => g.id === item.itemGroupId)?.cogsAccount || item.cogsAccount;
  for (const l of r.lines) {
    const item = items.find((i) => i.id === l.itemId);
    if (!item?.inventoryItem) continue;
    const value = round2(dnInventoryQty(l) * (fixed ? l.unitCostLc : item.itemCost));
    if (!value) continue;
    // Dr Inventory / Cr COGS (reverse of the delivery's Dr COGS / Cr Inventory)
    add(inventoryAccountFor(item, l.warehouse, [...groups]), value);
    add(cogsAccountFor(item), -value);
  }
  return [...totals.entries()]
    .filter(([, n]) => n !== 0)
    .map(([account, n]): JournalLine => ({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 }))
    .sort((a, b) => b.debit - a.debit);
}

// ── Saving and posting ───────────────────────────────────────────────────────

export class SrPostError extends Error {
  constructor(
    readonly lineIds: string[],
    message: string,
  ) {
    super(message);
  }
}

export const saveReturnDraft = (input: SrInput) => salesReturns.save({ ...input, status: 'Draft', docNum: 0 });

export async function saveReturnRemarks(r: SalesReturn, patch: Pick<SalesReturn, 'remarks' | 'attachments'>) {
  const current = await salesReturns.get(r.id);
  if (!current) throw new Error('This sales return no longer exists.');
  return salesReturns.save({ ...current, ...patch });
}

/**
 * Credited quantities on sales return lines, from A/R credit memos copied from them.
 * A return closes when all lines are fully credited.
 */
export async function applySrCreditedQty(lines: { baseId: string; baseLineId: string; quantity: number }[], sign: 1 | -1) {
  const byReturn = new Map<string, typeof lines>();
  for (const l of lines) {
    if (l.baseId) byReturn.set(l.baseId, [...(byReturn.get(l.baseId) ?? []), l]);
  }
  for (const [returnId, rows] of byReturn) {
    const before = await salesReturns.get(returnId);
    if (!before) continue;
    const linesNow = before.lines.map((sl) => {
      const qty = rows.filter((r) => r.baseLineId === sl.id).reduce((n, r) => n + r.quantity, 0);
      if (!qty) return sl;
      return { ...sl, creditedQty: Math.max(0, round2(sl.creditedQty + qty * sign)) };
    });
    const allCredited = linesNow.every((sl) => sl.creditedQty >= sl.quantity);
    const status = before.status === 'Cancelled' ? before.status : allCredited ? 'Closed' : 'Open';
    await salesReturns.save({ ...before, lines: linesNow, status, closeDate: status === 'Closed' ? before.closeDate || todayISO() : '' });
  }
}

/**
 * Add the sales return. All lines go together or none do. Stock comes back in at item cost
 * (FIFO: restore layers or use current cost), and the journal entry posts.
 */
export async function addSalesReturn(input: SrInput, fx: number): Promise<SalesReturn> {
  const items = await listItems();
  const deliveries = await listDeliveries();

  // Validate base delivery open quantities
  const problems: { lineId: string; message: string }[] = [];
  const byBase = new Map<string, { line: SrLine; qty: number }>();
  for (const l of input.lines.filter((x) => x.baseType === 'DN')) {
    byBase.set(l.baseLineId, { line: l, qty: (byBase.get(l.baseLineId)?.qty ?? 0) + l.quantity });
  }
  for (const [baseLineId, { line, qty }] of byBase) {
    const dn = deliveries.find((d) => d.id === line.baseId);
    const dl = dn?.lines.find((x) => x.id === baseLineId);
    const open = dn && dl ? dl.quantity - dl.invoicedQty : 0;
    if (qty > open + 0.0001) {
      problems.push({ lineId: line.id, message: `${line.itemNo}: returning ${qty} ${line.uomCode} but ${line.baseDocNo} has only ${open} left to return.` });
    }
  }
  if (problems.length) throw new SrPostError(problems.map((p) => p.lineId), problems.map((p) => p.message).join(' '));

  // FIFO: restore layers when goods come back in
  const fifoItemIds = new Set<string>();
  const taken: Taken[] = [];
  const lines = await Promise.all(
    input.lines.map(async (l) => {
      if (l.unitCostLc) return l;
      const item = items.find((i) => i.id === l.itemId);
      if (item?.valuationMethod === 'FIFO' && item.inventoryItem) {
        fifoItemIds.add(l.itemId);
        // For returns we use consumeLayers to get the current cost, then we'll restore
        const cost = await consumeLayers(l.itemId, l.warehouse, dnInventoryQty(l), taken);
        return { ...l, unitCostLc: cost };
      }
      return { ...l, unitCostLc: item?.itemCost ?? 0 };
    }),
  );

  // Stock comes back in: +1 to inStock
  const touched = new Map<string, Item>();
  for (const l of lines) {
    const item = touched.get(l.itemId) ?? structuredClone(items.find((i) => i.id === l.itemId));
    if (!item?.inventoryItem) continue;
    const row = item.warehouses.find((w) => w.code === l.warehouse);
    if (!row) continue;
    row.inStock = round4(row.inStock + dnInventoryQty(l));
    touched.set(item.id, { ...item, hasTransactions: true });
  }
  for (const item of touched.values()) await saveItem(item);

  // FIFO: restore layers for items coming back in
  for (const l of lines) {
    const item = items.find((i) => i.id === l.itemId);
    if (item?.valuationMethod === 'FIFO' && item.inventoryItem && l.unitCostLc > 0) {
      await restoreLayer({ itemId: l.itemId, warehouse: l.warehouse, receivedOn: input.postingDate, qty: dnInventoryQty(l), unitCost: l.unitCostLc, sourceId: `sr-restore-${input.id ?? 'new'}` });
      fifoItemIds.add(l.itemId);
    }
  }
  await updateFifoCosts([...fifoItemIds]);

  const all = await salesReturns.list();
  const series = srSeriesOf(input.seriesId);
  const docNum = Math.max(series.firstNo - 1, ...all.filter((r) => r.seriesId === series.id).map((r) => r.docNum)) + 1;
  const saved = await salesReturns.save({ ...input, lines, docNum, status: 'Open', fxRate: fx });
  await logConsumption(saved.id, saved.postingDate, taken);

  await postDocumentEntry({
    origin: 'SR',
    originNo: docNum,
    originId: saved.id,
    postingDate: saved.postingDate,
    dueDate: saved.dueDate,
    remarks: saved.journalRemark,
    lines: srJournal(saved, items, await itemGroups.list(), true),
  });

  return saved;
}

/** Cancel: stock goes back out at the cost it came in at, the entry is reversed. */
export async function cancelSalesReturn(r: SalesReturn) {
  if (r.lines.some((l) => l.creditedQty > 0)) {
    throw new SrPostError([], 'Already credited on an A/R credit memo — cancel the credit memo first.');
  }
  const items = await listItems();

  // Stock goes back out: -1 to inStock
  const touched = new Map<string, Item>();
  for (const l of r.lines) {
    const item = touched.get(l.itemId) ?? structuredClone(items.find((i) => i.id === l.itemId));
    if (!item?.inventoryItem) continue;
    const row = item.warehouses.find((w) => w.code === l.warehouse);
    if (!row) continue;
    row.inStock = round4(row.inStock - dnInventoryQty(l));
    touched.set(item.id, item);
  }
  for (const item of touched.values()) await saveItem(item);

  // FIFO: consume back out
  const fifoItemIds = new Set<string>();
  const taken: Taken[] = [];
  for (const l of r.lines) {
    const item = items.find((i) => i.id === l.itemId);
    if (item?.valuationMethod === 'FIFO' && item.inventoryItem && l.unitCostLc > 0) {
      await consumeLayers(l.itemId, l.warehouse, dnInventoryQty(l), taken);
      fifoItemIds.add(l.itemId);
    }
  }
  await updateFifoCosts([...fifoItemIds]);

  const saved = await salesReturns.save({ ...r, status: 'Cancelled', closeDate: todayISO() });
  await reverseDocumentEntry(r.id);
  return saved;
}
