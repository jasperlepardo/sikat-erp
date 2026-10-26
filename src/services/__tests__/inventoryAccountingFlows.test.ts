import { describe, it, expect, beforeEach } from 'vitest';

import {
  listTransfers,
  getTransfer,
  postTransfer,
  transferQty,
  shortages,
  TransferPostError,
  type TransferInput,
} from '../inventoryTransfers';
import {
  listCountings,
  getCounting,
  listPostings,
  getPosting,
  addPosting,
  postingFromCount,
  postingVariance,
  variancePct,
  PostingError,
  type PostingInput,
} from '../inventoryCountings';
import {
  listTransferRequests,
  getTransferRequest,
  openQty,
  requestedQty,
  requestOpenQty,
} from '../inventoryTransferRequests';
import {
  addJournalEntry,
  reverseJournalEntry,
  jeTotals,
  getJournalEntry,
  JePostError,
  type JeInput,
} from '../journalEntries';
import { blankJournalEntry, newJeLine, CLOSED_THROUGH } from '../../mocks/journalEntries';
import {
  getVoucher,
  postVoucherEntries,
  voucherStatus,
  VoucherPostError,
} from '../journalVouchers';
import { erdLines, erdTotals, postErdRun, listErdRuns } from '../exchangeRateDifferences';
import type { ErdRow } from '../../mocks/exchangeRateDifferences';
import { listItems, stockTotals } from '../items';
import { layerHistory } from '../costLayers';
import { accounts, taxCodes, exchangeRates } from '../masterData';

// These suites post real documents through the module-level collections. The collections aren't
// exported, so instead of resetting them each test reads the current seed state as its baseline and
// asserts the DELTA — making the assertions order-independent even as posted rows accumulate.
//
// The frozen clock (src/test/setup.ts) is 2026-06-15, which is <= CLOSED_THROUGH (2026-08-31), so
// todayISO() lands in a closed period. Every posting here uses an explicit open-period date.
const OPEN_DATE = '2026-09-15';

const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0);

// ═══════════════════════════════════════════════════════════════════════════════
// Inventory transfers — postTransfer
// ═══════════════════════════════════════════════════════════════════════════════

describe('postTransfer (src/services/inventoryTransfers.ts)', () => {
  // Pick a stocked, non-frozen WH-001 item with headroom. apl-0002 has 7 in WH-001 (see seed).
  const SRC = 'WH-001';
  const DST = 'WH-009'; // a warehouse the item is unlikely to be frozen in by an open count

  // Read live stock each time: these tests share the module-level items collection (no reset hook),
  // so pick whichever stocked WH-001 item currently has the most headroom rather than a fixed id.
  async function stockedItem() {
    const items = await listItems();
    const candidates = items
      .filter((i) => i.inventoryItem && i.valuationMethod !== 'FIFO')
      .map((i) => ({ item: i, have: i.warehouses.find((w) => w.code === SRC)?.inStock ?? 0 }))
      .filter((c) => c.have > 0)
      .sort((a, b) => b.have - a.have);
    expect(candidates.length, 'some item should be stocked in WH-001').toBeGreaterThan(0);
    return candidates[0].item;
  }

  function draftFrom(item: Awaited<ReturnType<typeof stockedItem>>, quantity: number): TransferInput {
    return {
      seriesId: 'its-primary',
      docNum: 0,
      status: 'Draft',
      postingDate: OPEN_DATE,
      documentDate: OPEN_DATE,
      fromWarehouse: SRC,
      toWarehouse: DST,
      toBinId: '',
      salesEmployeeId: '',
      journalRemark: 'test transfer',
      remarks: '',
      baseRequestId: '',
      lines: [
        {
          id: `tl-test-${crypto.randomUUID().slice(0, 8)}`,
          itemId: item.id,
          itemNo: item.itemNo,
          name: item.name,
          description: item.description,
          quantity,
          uom: item.inventoryUom,
          fromBinId: '',
          fromBinCode: '',
          toWarehouse: DST,
          toBinId: '',
          toBinCode: '',
          unitCost: item.itemCost,
          baseLineId: '',
        },
      ],
    };
  }

  it('conserves company-wide stock: destination gains exactly what the source loses', async () => {
    const item = await stockedItem();
    const before = stockTotals(item).inStock;
    const srcBefore = item.warehouses.find((w) => w.code === SRC)!.inStock;
    const dstBefore = item.warehouses.find((w) => w.code === DST)?.inStock ?? 0;
    const QTY = Math.min(2, srcBefore); // never ask for more than the source holds

    const posted = await postTransfer(draftFrom(item, QTY));
    expect(posted.status).toBe('Posted');
    expect(posted.docNum).toBeGreaterThan(0);

    const after = (await listItems()).find((i) => i.id === item.id)!;
    const afterTotal = stockTotals(after).inStock;
    const srcAfter = after.warehouses.find((w) => w.code === SRC)!.inStock;
    const dstAfter = after.warehouses.find((w) => w.code === DST)!.inStock;

    // Company-wide In Stock doesn't change (documented in postTransfer).
    expect(afterTotal).toBe(before);
    expect(srcAfter).toBe(srcBefore - QTY);
    expect(dstAfter).toBe(dstBefore + QTY);
    // Line quantity conserved end to end.
    expect(transferQty(posted)).toBe(QTY);
  });

  it('records the transfer in the collection with the next doc number', async () => {
    const item = await stockedItem();
    const posted = await postTransfer(draftFrom(item, 1));
    const fetched = await getTransfer(posted.id);
    expect(fetched?.status).toBe('Posted');
    const all = await listTransfers();
    const maxForSeries = Math.max(
      ...all.filter((t) => t.seriesId === 'its-primary').map((t) => t.docNum),
    );
    expect(posted.docNum).toBe(maxForSeries);
  });

  it('a FIFO transfer carries batch (receivedOn) dates onto the destination warehouse', async () => {
    const items = await listItems();
    // apl-0361 (ACC-PWR20) is a FIFO item well-stocked in WH-001 (see seed).
    const item = items.find(
      (i) =>
        i.id === 'apl-0361' &&
        i.valuationMethod === 'FIFO' &&
        (i.warehouses.find((w) => w.code === SRC)?.inStock ?? 0) > 2,
    );
    expect(item, 'FIFO seed item apl-0361 should be stocked in WH-001').toBeTruthy();
    const FIFO_DST = 'WH-012';

    const srcLayersBefore = await layerHistory(item!.id, SRC);
    expect(srcLayersBefore.length, 'FIFO item should carry at least one cost layer').toBeGreaterThan(0);
    const oldestBatchDate = srcLayersBefore[0].receivedOn;
    const dstLayerDatesBefore = new Set(
      (await layerHistory(item!.id, FIFO_DST)).map((l) => l.receivedOn),
    );

    const draft: TransferInput = {
      seriesId: 'its-primary',
      docNum: 0,
      status: 'Draft',
      postingDate: OPEN_DATE,
      documentDate: OPEN_DATE,
      fromWarehouse: SRC,
      toWarehouse: FIFO_DST,
      toBinId: '',
      salesEmployeeId: '',
      journalRemark: 'fifo transfer',
      remarks: '',
      baseRequestId: '',
      lines: [
        {
          id: `tl-fifo-${crypto.randomUUID().slice(0, 8)}`,
          itemId: item!.id,
          itemNo: item!.itemNo,
          name: item!.name,
          description: item!.description,
          quantity: 2,
          uom: item!.inventoryUom,
          fromBinId: '',
          fromBinCode: '',
          toWarehouse: FIFO_DST,
          toBinId: '',
          toBinCode: '',
          unitCost: item!.itemCost,
          baseLineId: '',
        },
      ],
    };

    await postTransfer(draft);

    // The oldest source batch's date now appears on a destination layer (FIFO order preserved).
    const dstLayersAfter = await layerHistory(item!.id, FIFO_DST);
    const newDstDates = dstLayersAfter
      .map((l) => l.receivedOn)
      .filter((d) => !dstLayerDatesBefore.has(d));
    expect(dstLayersAfter.length).toBeGreaterThan(0);
    // The moved layer kept its original receivedOn, not the transfer's posting date.
    expect(dstLayersAfter.some((l) => l.receivedOn === oldestBatchDate)).toBe(true);
    expect(newDstDates.every((d) => d !== OPEN_DATE || d === oldestBatchDate)).toBe(true);
  });

  it('blocks a shortage: asking for more than the source holds throws TransferPostError', async () => {
    const item = await stockedItem();
    const have = item.warehouses.find((w) => w.code === SRC)!.inStock;

    // shortages() is the pure guard postTransfer re-checks against live stock.
    const short = shortages({ lines: draftFrom(item, have + 100).lines, fromWarehouse: SRC }, [item]);
    expect(short).toHaveLength(1);
    expect(short[0].itemId).toBe(item.id);

    await expect(postTransfer(draftFrom(item, have + 100))).rejects.toBeInstanceOf(TransferPostError);

    // Nothing moved: company-wide stock unchanged.
    const after = (await listItems()).find((i) => i.id === item.id)!;
    expect(stockTotals(after).inStock).toBe(stockTotals(item).inStock);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Inventory counting → posting — addPosting
// ═══════════════════════════════════════════════════════════════════════════════

describe('addPosting (src/services/inventoryCountings.ts)', () => {
  it('posting variance moves stock to the counted qty', async () => {
    const items = await listItems();
    // Use a stocked item in a quiet warehouse; count it 3 higher than the book qty.
    const item = items.find((i) => i.id === 'apl-0006' && stockTotals(i).inStock > 0)!;
    expect(item).toBeTruthy();
    const WH = 'WH-010';
    const row = item.warehouses.find((w) => w.code === WH);
    const bookQty = row?.inStock ?? 0;
    const countedTarget = bookQty + 3;

    const line = {
      id: `pl-test-${crypto.randomUUID().slice(0, 8)}`,
      baseLineId: '',
      itemId: item.id,
      itemNo: item.itemNo,
      description: item.description,
      warehouse: WH,
      binId: '',
      binCode: '',
      inWhseQty: bookQty, // In-Whse Qty on count date
      uomCode: item.inventoryUom,
      itemsPerUnit: 1,
      uomCountedQty: countedTarget, // counted = book + 3
      price: item.itemCost,
    };

    // Documented: variance = counted − inWhseQty.
    expect(postingVariance(line)).toBe(3);

    const input: PostingInput = {
      seriesId: 'ip-primary',
      docNum: 0,
      postingDate: OPEN_DATE,
      countDate: OPEN_DATE,
      countTime: '12:00',
      priceSource: 'item-cost',
      priceListId: '',
      reference: 'TEST-COUNT',
      endOfFiscalYear: '',
      countingId: '',
      journalRemark: 'test posting',
      remarks: '',
      attachments: [],
      lines: [line],
    };

    const posted = await addPosting(input);
    expect(posted.docNum).toBeGreaterThan(0);

    const after = (await listItems()).find((i) => i.id === item.id)!;
    const afterQty = after.warehouses.find((w) => w.code === WH)!.inStock;
    // Stock now equals the counted figure.
    expect(afterQty).toBe(countedTarget);
  });

  it('variancePct is undefined when there was nothing in the books', () => {
    const line = {
      id: 'x',
      baseLineId: '',
      itemId: 'i',
      itemNo: 'I',
      description: '',
      warehouse: 'W',
      binId: '',
      binCode: '',
      inWhseQty: 0,
      uomCode: 'pc',
      itemsPerUnit: 1,
      uomCountedQty: 5,
      price: 1,
    };
    expect(postingVariance(line)).toBe(5);
    expect(variancePct(line)).toBeUndefined();
  });

  it('blocks a posting that would drive stock below zero (stock moved out after the count)', async () => {
    const items = await listItems();
    const item = items.find((i) => i.id === 'apl-0009' && stockTotals(i).inStock > 0)!;
    const WH = 'WH-011';
    // Claim the book held a huge quantity but counted 0 → variance hugely negative → below zero now.
    const line = {
      id: `pl-neg-${crypto.randomUUID().slice(0, 8)}`,
      baseLineId: '',
      itemId: item.id,
      itemNo: item.itemNo,
      description: item.description,
      warehouse: WH,
      binId: '',
      binCode: '',
      inWhseQty: 9999,
      uomCode: item.inventoryUom,
      itemsPerUnit: 1,
      uomCountedQty: 0,
      price: item.itemCost,
    };
    const input: PostingInput = {
      seriesId: 'ip-primary',
      docNum: 0,
      postingDate: OPEN_DATE,
      countDate: OPEN_DATE,
      countTime: '12:00',
      priceSource: 'item-cost',
      priceListId: '',
      reference: 'TEST-NEG',
      endOfFiscalYear: '',
      countingId: '',
      journalRemark: '',
      remarks: '',
      attachments: [],
      lines: [line],
    };
    await expect(addPosting(input)).rejects.toBeInstanceOf(PostingError);
  });

  it('copying an open count to a posting closes the count', async () => {
    const countings = await listCountings();
    // ic-002 is an Open single-counter Cebu count with some counted lines (see seed).
    const count = countings.find((c) => c.id === 'ic-002' && c.status === 'Open');
    expect(count, 'seed count ic-002 should be open').toBeTruthy();
    const items = await listItems();

    const base: PostingInput = {
      seriesId: 'ip-primary',
      docNum: 0,
      postingDate: OPEN_DATE,
      countDate: OPEN_DATE,
      countTime: '12:00',
      priceSource: 'item-cost',
      priceListId: '',
      reference: '',
      endOfFiscalYear: '',
      countingId: '',
      journalRemark: 'from count',
      remarks: '',
      attachments: [],
      lines: [],
    };
    const input = postingFromCount(count!, base, items);
    // Only counted lines are copied.
    const countedCount = count!.lines.filter((l) => l.counted).length;
    expect(input.lines).toHaveLength(countedCount);
    expect(input.countingId).toBe('ic-002');

    await addPosting(input);
    const reread = await getCounting('ic-002');
    expect(reread?.status).toBe('Closed');
    expect(reread?.postingId).toBeTruthy();
  });

  it('seed postings are present', async () => {
    const postings = await listPostings();
    expect(postings.some((p) => p.id === 'ip-001')).toBe(true);
    expect(await getPosting('ip-001')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Transfer requests — open qty & fulfilment
// ═══════════════════════════════════════════════════════════════════════════════

describe('transfer requests (src/services/inventoryTransferRequests.ts)', () => {
  it('open qty of a fresh request equals requested qty (nothing copied yet)', async () => {
    const reqs = await listTransferRequests();
    const open = reqs.find((r) => r.id === 'itr-002' && r.status === 'Open')!;
    expect(open).toBeTruthy();
    // Nothing has been transferred from itr-002 in the seed: openQty === quantity on every line.
    for (const l of open.lines) expect(openQty(l)).toBe(l.quantity);
    expect(requestOpenQty(open)).toBe(requestedQty(open));
  });

  it('a fully-fulfilled request shows zero open qty (itr-001 was closed by it-001)', async () => {
    const closed = await getTransferRequest('itr-001');
    expect(closed?.status).toBe('Closed');
    // open qty = qty − copied; everything was copied, so open is 0 on every line.
    expect(requestOpenQty(closed!)).toBe(0);
    for (const l of closed!.lines) expect(l.openQty).toBe(0);
  });

  it('openQty never reports a negative (clamped at 0)', () => {
    expect(openQty({ openQty: -5 })).toBe(0);
    expect(openQty({ openQty: 3 })).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Journal entries — post, reverse, reject
// ═══════════════════════════════════════════════════════════════════════════════

describe('journal entries (src/services/journalEntries.ts)', () => {
  beforeEach(async () => {
    // These read the chart for balance-range checks; keep the seed in place.
    await accounts.reset();
  });

  const balancedJe = (date: string): JeInput => ({
    ...blankJournalEntry(date),
    remarks: 'test balanced entry',
    lines: [
      newJeLine({ account: '6020', debit: 1000, credit: 0 }),
      newJeLine({ account: '2030', debit: 0, credit: 1000 }),
    ],
  });

  it('posts a balanced entry and stamps Posted + a number', async () => {
    const je = balancedJe(OPEN_DATE);
    expect(jeTotals(je.lines).difference).toBe(0);
    const posted = await addJournalEntry(je);
    expect(posted.status).toBe('Posted');
    expect(posted.number).toBeGreaterThan(0);
    const stored = await getJournalEntry(posted.id);
    expect(stored).toBeTruthy();
  });

  it('rejects an unbalanced entry', async () => {
    const je: JeInput = {
      ...blankJournalEntry(OPEN_DATE),
      lines: [
        newJeLine({ account: '6020', debit: 1000, credit: 0 }),
        newJeLine({ account: '2030', debit: 0, credit: 900 }),
      ],
    };
    expect(jeTotals(je.lines).difference).toBe(100);
    await expect(addJournalEntry(je)).rejects.toBeInstanceOf(JePostError);
  });

  it('rejects posting into a closed period', async () => {
    const je = balancedJe(CLOSED_THROUGH); // 2026-08-31, closed through that day
    await expect(addJournalEntry(je)).rejects.toBeInstanceOf(JePostError);
    await expect(addJournalEntry(je)).rejects.toThrow(/closed/i);
  });

  it('reverses a posted entry with a balanced, debit/credit-swapped counter-entry', async () => {
    const posted = await addJournalEntry(balancedJe('2026-09-10'));
    const reversal = await reverseJournalEntry(posted.id, '2026-09-20');

    // Counter-entry references the original and swaps sides.
    expect(reversal.reverses).toBe(posted.id);
    expect(jeTotals(reversal.lines).difference).toBe(0);
    const origTotals = jeTotals(posted.lines);
    const revTotals = jeTotals(reversal.lines);
    expect(revTotals.debit).toBe(origTotals.credit);
    expect(revTotals.credit).toBe(origTotals.debit);

    // Original is now marked Reversed and points at the reversal.
    const reread = await getJournalEntry(posted.id);
    expect(reread?.status).toBe('Reversed');
    expect(reread?.reversedBy).toBe(reversal.id);
  });

  it('refuses to reverse an entry twice', async () => {
    const posted = await addJournalEntry(balancedJe('2026-09-11'));
    await reverseJournalEntry(posted.id, '2026-09-21');
    await expect(reverseJournalEntry(posted.id, '2026-09-22')).rejects.toThrow(/already reversed/i);
  });

  it('inline Reverse ticked posts the entry AND its reversal in one call', async () => {
    const je: JeInput = {
      ...balancedJe('2026-09-12'),
      reverse: true,
      reversalDate: '2026-09-25',
    };
    const posted = await addJournalEntry(je);
    // The original is auto-marked Reversed and linked to the reversing entry.
    expect(posted.status).toBe('Reversed');
    expect(posted.reversedBy).toBeTruthy();
    const reversal = await getJournalEntry(posted.reversedBy);
    expect(reversal?.reverses).toBe(posted.id);
    expect(jeTotals(reversal!.lines).difference).toBe(0);
  });

  it('rejects an inline reversal dated on or before the posting date', async () => {
    const je: JeInput = {
      ...balancedJe('2026-09-13'),
      reverse: true,
      reversalDate: '2026-09-13',
    };
    await expect(addJournalEntry(je)).rejects.toThrow(/Reversal date must be after/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Journal vouchers — post selected entries
// ═══════════════════════════════════════════════════════════════════════════════

describe('postVoucherEntries (src/services/journalVouchers.ts)', () => {
  beforeEach(async () => {
    await accounts.reset();
    await taxCodes.reset();
  });

  it('posts the balanced entry and stops at the unbalanced one, naming it', async () => {
    const voucher = await getVoucher('jv-001');
    expect(voucher, 'seed voucher jv-001 should exist').toBeTruthy();
    // jv-001 seed: entry trans 1 is balanced, entry trans 2 is unbalanced (D 515000 vs C 420000).
    const entries = voucher!.entries;
    const e1 = entries.find((e) => e.transNo === 1)!;
    const e2 = entries.find((e) => e.transNo === 2)!;
    expect(e1.entryStatus).toBe('Open');
    expect(e2.entryStatus).toBe('Open');

    let err: unknown;
    try {
      await postVoucherEntries('jv-001', [e1.id, e2.id]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(VoucherPostError);
    const ve = err as VoucherPostError;
    // The run names the entry it stopped on, and lists the ones that went through first.
    expect(ve.entryId).toBe(e2.id);
    expect(ve.posted.map((p) => p.transNo)).toContain(1);

    // Entry 1 is now Closed with a journal entry; entry 2 is still Open.
    const reread = await getVoucher('jv-001');
    const r1 = reread!.entries.find((e) => e.transNo === 1)!;
    const r2 = reread!.entries.find((e) => e.transNo === 2)!;
    expect(r1.entryStatus).toBe('Closed');
    expect(r1.journalEntryId).toBeTruthy();
    expect(r2.entryStatus).toBe('Open');
    // The posted entry's journal entry really exists and is balanced.
    const je = await getJournalEntry(r1.journalEntryId!);
    expect(je).toBeTruthy();
    expect(jeTotals(je!.lines).difference).toBe(0);
    // Voucher stays Open while an entry remains unposted.
    expect(voucherStatus(reread!)).toBe('Open');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Exchange-rate differences — run + reversal
// ═══════════════════════════════════════════════════════════════════════════════

describe('exchange-rate differences (src/services/exchangeRateDifferences.ts)', () => {
  beforeEach(async () => {
    await accounts.reset();
    await exchangeRates.reset();
  });

  const gainRow = (): ErdRow => ({
    id: 'IN-test',
    docType: 'IN',
    docId: 'test-ar',
    docNo: 'SI-TEST',
    partnerId: 'bp-002',
    partnerName: 'Northgate Prime Malls Inc.',
    currency: 'USD',
    balanceFc: 1000,
    bookedRate: 55,
    rate: 57, // rate rose → A/R up → unrealized gain
    difference: 2000, // 1000 × (57 − 55)
    selected: true,
    controlAccount: '1120',
  });

  it('erdLines produces a balanced entry (control account vs FX gain)', () => {
    const rows = [gainRow()];
    const totals = erdTotals(rows);
    expect(totals.gain).toBe(2000);
    expect(totals.loss).toBe(0);

    const lines = erdLines(rows);
    const debit = sum(lines.map((l) => l.debit || 0));
    const credit = sum(lines.map((l) => l.credit || 0));
    expect(debit).toBe(credit);
    // A/R rises: Dr 1120 (with partner), Cr 7020.
    const ar = lines.find((l) => l.account === '1120')!;
    expect(ar.debit).toBe(2000);
    expect(ar.partnerId).toBe('bp-002');
    const gain = lines.find((l) => l.account === '7020')!;
    expect(gain.credit).toBe(2000);
  });

  it('posting a run writes a balanced journal entry and auto-reverses it', async () => {
    const date = '2026-09-15';
    const reversalDate = '2026-09-30';
    const rows = [gainRow()];
    const runsBefore = await listErdRuns();

    const run = await postErdRun(date, reversalDate, { USD: 57 }, rows, 'FX reval test');
    expect(run.journalEntryId).toBeTruthy();
    expect(run.gain).toBe(2000);
    expect(run.loss).toBe(0);
    expect(run.reversalDate).toBe(reversalDate);

    // Persisted as a new run.
    const runsAfter = await listErdRuns();
    expect(runsAfter.length).toBe(runsBefore.length + 1);

    // The run's journal entry balances and is auto-marked Reversed (reverse: true was passed).
    const je = await getJournalEntry(run.journalEntryId);
    expect(je).toBeTruthy();
    expect(jeTotals(je!.lines).difference).toBe(0);
    expect(je!.status).toBe('Reversed');
    expect(je!.reversedBy).toBeTruthy();

    // The reversing entry exists, references the run entry, and balances.
    const reversal = await getJournalEntry(je!.reversedBy);
    expect(reversal?.reverses).toBe(je!.id);
    expect(reversal?.postingDate).toBe(reversalDate);
    expect(jeTotals(reversal!.lines).difference).toBe(0);
  });

  it('refuses a run with nothing to revalue', async () => {
    await expect(
      postErdRun('2026-09-15', '2026-09-30', {}, [], 'empty'),
    ).rejects.toThrow(/Nothing to revalue/i);
  });
});
