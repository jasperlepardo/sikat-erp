import { describe, it, expect } from 'vitest';
import type { Item } from '../../mocks/items';
import type { CountLine, PostingLine } from '../../mocks/inventoryCountings';
import type { BinLocation } from '../../mocks/binLocations';
import type { TransferLine } from '../../mocks/inventoryTransfers';
import type { LandedCostEntry, LandedCostLine } from '../../mocks/landedCosts';
import { mergedItems } from '../../mocks/items';

import {
  addLayer,
  consumeLayers,
  transferLayers,
  updateFifoCosts,
  layerHistory,
} from '../costLayers';
import { listItems, saveItems, stockTotals, isLowStock } from '../items';
import {
  countVariance,
  postingVariance,
  variancePct,
  postingFromCount,
  stockAfter,
} from '../inventoryCountings';
import { qtyByItem, shortages } from '../inventoryTransfers';
import { binStock, transferBlock, fillPattern, planGeneration, planRename } from '../binLocations';
import { allocate, addLandedCost, listLandedCosts } from '../landedCosts';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures. The inventory functions only read a handful of fields on each type,
// so we build tiny literals (cast to the full type) rather than mirroring the
// whole seed. Collection-mutating tests use unique item ids / warehouses so the
// seeded layers never interfere.
// ─────────────────────────────────────────────────────────────────────────────

const makeItem = (over: Partial<Item> & Pick<Item, 'id'>): Item =>
  ({
    itemNo: over.id,
    name: '',
    description: '',
    inventoryItem: true,
    valuationMethod: 'FIFO',
    itemCost: 0,
    minStock: 0,
    inventoryUom: 'pc',
    uoms: [{ id: 'u1', uom: 'pc', qty: 1, purchase: true, sales: true, price: 0 }],
    warehouses: [],
    barcodes: [],
    itemGroupId: '',
    glBy: 'Item Level',
    inventoryAccount: '',
    parentItemId: '',
    ...over,
  }) as unknown as Item;

const wh = (code: string, inStock: number, extra: Record<string, unknown> = {}) =>
  ({ code, inStock, committed: 0, ordered: 0, preferredVendorId: '', defaultBinId: '', ...extra });

const countLine = (over: Partial<CountLine>): CountLine =>
  ({
    id: 'cl1',
    itemId: 'it1',
    itemNo: 'IT1',
    description: '',
    freeze: false,
    warehouse: 'WH-001',
    binId: '',
    inWhseQty: 0,
    uomCode: 'pc',
    itemsPerUnit: 1,
    counts: [],
    counted: false,
    uomCountedQty: 0,
    ...over,
  }) as CountLine;

const postingLine = (over: Partial<PostingLine>): PostingLine =>
  ({
    id: 'pl1',
    baseLineId: '',
    itemId: 'it1',
    itemNo: 'IT1',
    description: '',
    warehouse: 'WH-001',
    binId: '',
    binCode: '',
    inWhseQty: 0,
    uomCode: 'pc',
    itemsPerUnit: 1,
    uomCountedQty: 0,
    price: 0,
    ...over,
  }) as PostingLine;

// ═════════════════════════════════════════════════════════════════════════════
// costLayers — FIFO consumption, transfers, cost roll-up, concurrency
// ═════════════════════════════════════════════════════════════════════════════

describe('consumeLayers (FIFO)', () => {
  it('takes the oldest layers first and returns a weighted-average unit cost', async () => {
    const item = `fifo-${crypto.randomUUID().slice(0, 8)}`;
    const w = 'TEST-WH';
    // Older layer @100, newer @200. Consuming 3 should take 2@100 + 1@200.
    await addLayer({ itemId: item, warehouse: w, receivedOn: '2026-01-01', qty: 2, unitCost: 100, sourceId: 'gr-a', receiptId: 'gr-a' });
    await addLayer({ itemId: item, warehouse: w, receivedOn: '2026-02-01', qty: 5, unitCost: 200, sourceId: 'gr-b', receiptId: 'gr-b' });

    const log: Parameters<typeof consumeLayers>[3] & object = [];
    const cost = await consumeLayers(item, w, 3, log as never[]);

    // (2*100 + 1*200) / 3 = 133.33
    expect(cost).toBe(133.33);
    // Oldest layer fully drained, newer layer down to 4.
    const hist = await layerHistory(item, w);
    expect(hist.map((l) => l.qty)).toEqual([0, 4]);
    // Breakdown logs both batches, oldest first.
    expect((log as { qty: number; unitCost: number }[]).map((t) => [t.qty, t.unitCost])).toEqual([
      [2, 100],
      [1, 200],
    ]);
  });

  it('falls back to the item cost when the item has no layers', async () => {
    const item = `nolayer-${crypto.randomUUID().slice(0, 8)}`;
    await saveItems([makeItem({ id: item, itemCost: 42.5 })]);
    const log: { qty: number; unitCost: number; receiptId: string }[] = [];
    const cost = await consumeLayers(item, 'TEST-WH', 3, log as never[]);
    expect(cost).toBe(42.5);
    expect(log).toEqual([{ itemId: item, warehouse: 'TEST-WH', qty: 3, unitCost: 42.5, receiptId: '', receivedOn: '' }]);
  });

  it('prices the overage beyond the known layers at the last layer cost', async () => {
    const item = `over-${crypto.randomUUID().slice(0, 8)}`;
    const w = 'TEST-WH';
    await addLayer({ itemId: item, warehouse: w, receivedOn: '2026-01-01', qty: 2, unitCost: 100, sourceId: 'gr-a', receiptId: 'gr-a' });
    // Want 5 but only 2 in layers: 2@100 + 3@100 (overage at last layer cost) = 500 / 5 = 100.
    const cost = await consumeLayers(item, w, 5, []);
    expect(cost).toBe(100);
  });

  it('returns 0 for a non-positive quantity without touching layers', async () => {
    const item = `zero-${crypto.randomUUID().slice(0, 8)}`;
    await addLayer({ itemId: item, warehouse: 'TEST-WH', receivedOn: '2026-01-01', qty: 4, unitCost: 100, sourceId: 'gr-a' });
    expect(await consumeLayers(item, 'TEST-WH', 0, [])).toBe(0);
    expect(await consumeLayers(item, 'TEST-WH', -5, [])).toBe(0);
    const hist = await layerHistory(item, 'TEST-WH');
    expect(hist.map((l) => l.qty)).toEqual([4]);
  });

  // CONCURRENCY INVARIANT (see docs/codebase-audit.md Phase 2): two concurrent
  // consumeLayers for the same item+warehouse must BOTH deduct — 4 → 2, not 4 → 3.
  // The `inTurn` queue serialises the read-modify-write so the second take reads
  // the first take's result.
  it('serialises concurrent consumption so both takes deduct (4 → 2)', async () => {
    const item = `concur-${crypto.randomUUID().slice(0, 8)}`;
    const w = 'TEST-WH';
    await addLayer({ itemId: item, warehouse: w, receivedOn: '2026-01-01', qty: 4, unitCost: 100, sourceId: 'gr-a' });

    // Fire both without awaiting the first — the race the audit describes.
    const [c1, c2] = await Promise.all([
      consumeLayers(item, w, 1, []),
      consumeLayers(item, w, 1, []),
    ]);

    expect(c1).toBe(100);
    expect(c2).toBe(100);
    const remaining = (await layerHistory(item, w)).reduce((n, l) => n + l.qty, 0);
    expect(remaining).toBe(2); // 4 − 1 − 1, not 3
  });
});

describe('transferLayers', () => {
  it('moves units to the destination keeping the batch received date and cost', async () => {
    const item = `xfer-${crypto.randomUUID().slice(0, 8)}`;
    await addLayer({ itemId: item, warehouse: 'FROM-WH', receivedOn: '2026-01-15', qty: 10, unitCost: 250, sourceId: 'gr-x', receiptId: 'gr-x' });

    await transferLayers(item, 'FROM-WH', 'TO-WH', 4, '2026-06-01', 'tr-1');

    const from = await layerHistory(item, 'FROM-WH');
    const to = await layerHistory(item, 'TO-WH');
    expect(from.reduce((n, l) => n + l.qty, 0)).toBe(6);
    expect(to).toHaveLength(1);
    // The destination layer carries the ORIGINAL batch date and cost, not the posting date.
    expect(to[0].receivedOn).toBe('2026-01-15');
    expect(to[0].unitCost).toBe(250);
    expect(to[0].qty).toBe(4);
    expect(to[0].receiptId).toBe('gr-x');
  });
});

describe('updateFifoCosts', () => {
  it('recomputes item cost from the weighted average of remaining layers', async () => {
    const item = `cost-${crypto.randomUUID().slice(0, 8)}`;
    const w = 'TEST-WH';
    await saveItems([makeItem({ id: item, itemCost: 1 })]);
    await addLayer({ itemId: item, warehouse: w, receivedOn: '2026-01-01', qty: 2, unitCost: 100, sourceId: 'a' });
    await addLayer({ itemId: item, warehouse: w, receivedOn: '2026-02-01', qty: 2, unitCost: 200, sourceId: 'b' });

    await updateFifoCosts([item]);

    const saved = (await listItems()).find((i) => i.id === item)!;
    // (2*100 + 2*200) / 4 = 150
    expect(saved.itemCost).toBe(150);
  });

  it('leaves item cost unchanged when no layers remain (does not zero it out)', async () => {
    const item = `nocost-${crypto.randomUUID().slice(0, 8)}`;
    await saveItems([makeItem({ id: item, itemCost: 77 })]);
    await updateFifoCosts([item]);
    const saved = (await listItems()).find((i) => i.id === item)!;
    expect(saved.itemCost).toBe(77);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// landedCosts — allocate + addLandedCost. Two SUSPECTED BUGS flagged with it.fails.
// ═════════════════════════════════════════════════════════════════════════════

describe('landedCosts.allocate', () => {
  it('splits by Value basis in proportion to each line', () => {
    const costs: LandedCostEntry[] = [
      { id: 'e1', landedCostTypeId: 't', allocationBy: 'Value', amount: 300, includeForCustoms: false, isVariable: false },
    ];
    const lines: LandedCostLine[] = [
      { id: 'l1', quantity: 1, unitPrice: 100 } as LandedCostLine, // value 100
      { id: 'l2', quantity: 1, unitPrice: 200 } as LandedCostLine, // value 200
    ];
    const out = allocate(costs, lines);
    expect(out[0].allocCostsVal).toBe(100);
    expect(out[1].allocCostsVal).toBe(200);
    expect(out[0].allocCostsVal + out[1].allocCostsVal).toBe(300);
  });

  it('separates variable and constant cost buckets', () => {
    const costs: LandedCostEntry[] = [
      { id: 'e1', landedCostTypeId: 't', allocationBy: 'Equal', amount: 100, includeForCustoms: false, isVariable: true },
      { id: 'e2', landedCostTypeId: 't', allocationBy: 'Equal', amount: 40, includeForCustoms: false, isVariable: false },
    ];
    const lines: LandedCostLine[] = [
      { id: 'l1', quantity: 1, unitPrice: 0 } as LandedCostLine,
      { id: 'l2', quantity: 1, unitPrice: 0 } as LandedCostLine,
    ];
    const out = allocate(costs, lines);
    expect(out[0].varCosts).toBe(50);
    expect(out[0].constCosts).toBe(20);
  });

  // ╔═══════════════════════════════════════════════════════════════════════╗
  // ║ SUSPECTED BUG 1 — allocate rounds each line independently.            ║
  // ║ src/services/landedCosts.ts:46-47. Each line's share is round2()'d on  ║
  // ║ its own, so the per-line allocations can sum to a few cents off the    ║
  // ║ cost total (no "largest remainder"/penny-reconciliation pass).        ║
  // ║ Example: 100.00 split Equal across 3 lines → 33.33 × 3 = 99.99.        ║
  // ║ EXPECTED: sum of allocCostsVal === 100.00                             ║
  // ║ ACTUAL:   99.99 (0.01 short).                                          ║
  // ╚═══════════════════════════════════════════════════════════════════════╝
  // FIXED (was bug 1): allocate uses cumulative rounding, so line shares sum to the total exactly.
  it('allocates 100 across 3 lines so they sum to exactly the total', () => {
    const costs: LandedCostEntry[] = [
      { id: 'e1', landedCostTypeId: 't', allocationBy: 'Equal', amount: 100, includeForCustoms: false, isVariable: false },
    ];
    const lines: LandedCostLine[] = [
      { id: 'l1', quantity: 1, unitPrice: 0 } as LandedCostLine,
      { id: 'l2', quantity: 1, unitPrice: 0 } as LandedCostLine,
      { id: 'l3', quantity: 1, unitPrice: 0 } as LandedCostLine,
    ];
    const out = allocate(costs, lines);
    expect(out.reduce((n, l) => n + l.allocCostsVal, 0)).toBeCloseTo(100, 2);
    expect(out.map((l) => l.allocCostsVal)).toEqual([33.33, 33.34, 33.33]);
  });
});

describe('landedCosts.addLandedCost', () => {
  it('numbers and opens the document with allocated lines', async () => {
    const doc = await addLandedCost({
      seriesId: 'lcs-primary',
      status: 'Draft',
      vendorId: '',
      vendorCode: '',
      vendorName: '',
      brokerId: '',
      brokerCode: '',
      brokerName: '',
      currency: 'PHP',
      postingDate: '2026-06-15',
      dueDate: '2026-06-15',
      reference: '',
      fileNo: '',
      journalRemark: '',
      docNum: 0,
      actualCustoms: 0,
      customsDate: '',
      customsAffectsInventory: false,
      remarks: '',
      transactionId: '',
      attachments: [],
      vendors: [],
      costs: [{ id: 'e1', landedCostTypeId: 'lct-001', allocationBy: 'Value', amount: 300, includeForCustoms: false, isVariable: false }],
      lines: [
        { id: 'l1', baseType: 'GRPO', baseId: 'gr', baseLineId: 'bl', baseDocNo: '', itemId: 'it1', itemNo: 'IT1', description: '', quantity: 1, uomCode: 'pc', warehouse: 'TEST-WH', unitPrice: 100, releaseNo: '', projectedCustoms: 0, customsValue: 0, expenditure: 0, allocCostsVal: 0, varCosts: 0, constCosts: 0 },
        { id: 'l2', baseType: 'GRPO', baseId: 'gr', baseLineId: 'bl', baseDocNo: '', itemId: 'it2', itemNo: 'IT2', description: '', quantity: 1, uomCode: 'pc', warehouse: 'TEST-WH', unitPrice: 200, releaseNo: '', projectedCustoms: 0, customsValue: 0, expenditure: 0, allocCostsVal: 0, varCosts: 0, constCosts: 0 },
      ],
    });
    expect(doc.status).toBe('Open');
    expect(doc.docNum).toBeGreaterThan(0);
    expect(doc.lines[0].allocCostsVal).toBe(100);
    expect(doc.lines[1].allocCostsVal).toBe(200);
    // Document was persisted to the module-level collection.
    expect((await listLandedCosts()).some((r) => r.id === doc.id)).toBe(true);
  });

  // FIXED (was bug 2): addLandedCost now capitalizes the allocation into inventory — it raises each
  // item's cost by the allocated amount per unit on hand (and posts Dr Inventory / Cr accrual in the
  // ledger; the seeded books fold the same amount into the receipt's cost layers).
  it('raises the receipted item cost by the allocation per unit', async () => {
    const item = `lcitem-${crypto.randomUUID().slice(0, 8)}`;
    await saveItems([makeItem({ id: item, itemCost: 100, warehouses: [wh('TEST-WH', 10)] })]);
    const before = (await listItems()).find((i) => i.id === item)!.itemCost;

    await addLandedCost({
      seriesId: 'lcs-primary',
      status: 'Draft',
      vendorId: '', vendorCode: '', vendorName: '', brokerId: '', brokerCode: '', brokerName: '',
      currency: 'PHP', postingDate: '2026-06-15', dueDate: '2026-06-15', reference: '', fileNo: '',
      journalRemark: '', docNum: 0, actualCustoms: 0, customsDate: '', customsAffectsInventory: true,
      remarks: '', transactionId: '', attachments: [], vendors: [],
      costs: [{ id: 'e1', landedCostTypeId: 'lct-001', allocationBy: 'Quantity', amount: 100, includeForCustoms: false, isVariable: false }],
      lines: [
        { id: 'l1', baseType: 'GRPO', baseId: 'gr', baseLineId: 'bl', baseDocNo: '', itemId: item, itemNo: 'IT', description: '', quantity: 10, uomCode: 'pc', warehouse: 'TEST-WH', unitPrice: 100, releaseNo: '', projectedCustoms: 0, customsValue: 0, expenditure: 0, allocCostsVal: 0, varCosts: 0, constCosts: 0 },
      ],
    });

    const after = (await listItems()).find((i) => i.id === item)!.itemCost;
    // 100 landed over 10 units on hand = +10 per unit.
    expect(after).toBe(before + 10);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// inventoryCountings — variance maths and copy-from-count
// ═════════════════════════════════════════════════════════════════════════════

describe('count & posting variance', () => {
  it('countVariance is counted − book, and 0 for an uncounted line', () => {
    expect(countVariance(countLine({ counted: true, inWhseQty: 10, uomCountedQty: 7, itemsPerUnit: 1 }))).toBe(-3);
    expect(countVariance(countLine({ counted: false, inWhseQty: 10, uomCountedQty: 7 }))).toBe(0);
  });

  it('countVariance respects items per unit (counted in boxes)', () => {
    // 1 box = 12 pc, counted 1 box → 12 pc vs book 10 → +2.
    expect(countVariance(countLine({ counted: true, inWhseQty: 10, uomCountedQty: 1, itemsPerUnit: 12 }))).toBe(2);
  });

  it('postingVariance always computes (no counted flag)', () => {
    expect(postingVariance(postingLine({ inWhseQty: 5, uomCountedQty: 8, itemsPerUnit: 1 }))).toBe(3);
  });

  it('variancePct is variance over book, and undefined when book is 0', () => {
    expect(variancePct(postingLine({ inWhseQty: 10, uomCountedQty: 9 }))).toBe(-10);
    expect(variancePct(postingLine({ inWhseQty: 0, uomCountedQty: 5 }))).toBeUndefined();
  });

  it('stockAfter adds the posting variance to current in-stock', () => {
    const items = [makeItem({ id: 'it1', warehouses: [wh('WH-001', 20)] })];
    expect(stockAfter(postingLine({ itemId: 'it1', warehouse: 'WH-001', inWhseQty: 20, uomCountedQty: 18 }), items)).toBe(18);
    // Unknown warehouse → base 0 + variance.
    expect(stockAfter(postingLine({ itemId: 'it1', warehouse: 'WH-ZZZ', inWhseQty: 0, uomCountedQty: 3 }), items)).toBe(3);
  });
});

describe('postingFromCount', () => {
  it('carries only counted lines and prices them from item cost', () => {
    const items = [
      makeItem({ id: 'it1', itemCost: 50 }),
      makeItem({ id: 'it2', itemCost: 80 }),
    ];
    const count = {
      id: 'ic-1',
      countDate: '2026-06-10',
      countTime: '09:00',
      reference: 'SHEET-1',
      endOfFiscalYear: '',
      lines: [
        countLine({ id: 'cl1', itemId: 'it1', counted: true, inWhseQty: 5, uomCountedQty: 4 }),
        countLine({ id: 'cl2', itemId: 'it2', counted: false, inWhseQty: 2, uomCountedQty: 2 }),
      ],
    } as never;
    const base = { priceSource: 'item-cost', priceListId: '', lines: [] } as never;

    const out = postingFromCount(count, base, items);
    expect(out.countDate).toBe('2026-06-10');
    expect(out.reference).toBe('SHEET-1');
    expect(out.countingId).toBe('ic-1');
    expect(out.lines).toHaveLength(1); // only the counted line
    expect(out.lines[0].itemId).toBe('it1');
    expect(out.lines[0].baseLineId).toBe('cl1');
    expect(out.lines[0].price).toBe(50);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// inventoryTransfers — qty aggregation and shortage detection
// ═════════════════════════════════════════════════════════════════════════════

describe('transfer qtyByItem & shortages', () => {
  const line = (): TransferLine =>
    ({ id: 'tl', itemId: '', itemNo: '', quantity: 0, toWarehouse: '', unitCost: 0 } as unknown as TransferLine);

  it('qtyByItem sums quantities per item and ignores blank item rows', () => {
    const lines = [
      { ...line(), itemId: 'it1', quantity: 3 },
      { ...line(), itemId: 'it1', quantity: 2 },
      { ...line(), itemId: '', quantity: 9 },
    ] as TransferLine[];
    const map = qtyByItem(lines);
    expect(map.get('it1')).toBe(5);
    expect(map.has('')).toBe(false);
  });

  it('shortages flags items asking for more than the source holds', () => {
    const items = [makeItem({ id: 'it1', itemNo: 'IT1', warehouses: [wh('FROM', 4)] })];
    const t = {
      fromWarehouse: 'FROM',
      lines: [{ ...line(), itemId: 'it1', itemNo: 'IT1', quantity: 6 }] as TransferLine[],
    };
    const out = shortages(t, items);
    expect(out).toHaveLength(1);
    expect(out[0].itemId).toBe('it1');

    // Enough stock → no shortage.
    const ok = shortages({ fromWarehouse: 'FROM', lines: [{ ...line(), itemId: 'it1', quantity: 4 }] as TransferLine[] }, items);
    expect(ok).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// binLocations — binStock, transferBlock, fillPattern, planGeneration, planRename
// ═════════════════════════════════════════════════════════════════════════════

describe('binStock', () => {
  it('sums stock of items whose default bin is this bin', () => {
    const items = [
      makeItem({ id: 'it1', warehouses: [wh('WH-001', 10, { defaultBinId: 'bin-1' })], uoms: [{ id: 'u', uom: 'pc', qty: 1, purchase: true, sales: true, price: 0, grossWeight: 2 }] as never, inventoryUom: 'pc' }),
      makeItem({ id: 'it2', warehouses: [wh('WH-001', 5, { defaultBinId: 'bin-2' })] }), // different bin — excluded
    ];
    const out = binStock({ id: 'bin-1', warehouse: 'WH-001' }, items);
    expect(out.qty).toBe(10);
    expect(out.items).toBe(1);
    expect(out.weight).toBe(20);
  });
});

describe('transferBlock', () => {
  const bin = (over: Partial<BinLocation>): BinLocation =>
    ({ id: 'b', code: 'B-01', warehouse: 'WH-001', active: true, transactionRestriction: 'none', itemRestriction: 'none', uomRestriction: 'none', restrictedItem: '', restrictedItemGroupId: '', restrictedUom: '', ...over } as unknown as BinLocation);
  const item = makeItem({ id: 'it1', itemNo: 'IT1', itemGroupId: 'g1' });

  it('returns null when the bin is undefined or unrestricted', () => {
    expect(transferBlock(undefined, item, 'pc', 'out')).toBeNull();
    expect(transferBlock(bin({}), item, 'pc', 'out')).toBeNull();
  });

  it('blocks an inactive bin', () => {
    expect(transferBlock(bin({ active: false }), item, 'pc', 'out')).toContain('inactive');
  });

  it('respects inbound/outbound restriction by direction', () => {
    expect(transferBlock({ ...bin({}), transactionRestriction: 'inbound' } as BinLocation, item, 'pc', 'out')).toContain('inbound');
    expect(transferBlock({ ...bin({}), transactionRestriction: 'inbound' } as BinLocation, item, 'pc', 'in')).toBeNull();
    expect(transferBlock({ ...bin({}), transactionRestriction: 'outbound' } as BinLocation, item, 'pc', 'in')).toContain('outbound');
  });

  it('enforces item restriction on inbound only', () => {
    const restricted = { ...bin({}), itemRestriction: 'item', restrictedItem: 'OTHER' } as BinLocation;
    expect(transferBlock(restricted, item, 'pc', 'in')).toContain('OTHER');
    // Outbound is never item-blocked.
    expect(transferBlock(restricted, item, 'pc', 'out')).toBeNull();
  });

  it('enforces uom restriction on inbound', () => {
    const restricted = { ...bin({}), uomRestriction: 'uom', restrictedUom: 'box' } as BinLocation;
    expect(transferBlock(restricted, item, 'pc', 'in')).toContain('box');
  });
});

describe('fillPattern', () => {
  it('substitutes segment tokens and a zero-padded sequence', () => {
    const b = { warehouse: 'WH-001', aisle: 'A', shelf: 'S', level: 'L' };
    expect(fillPattern('{WH}-{AISLE}{SHELF}{LEVEL}', b, 7)).toBe('WH-001-ASL');
    expect(fillPattern('BIN-{SEQ:3}', b, 7)).toBe('BIN-007');
    expect(fillPattern('BIN-{SEQ}', b, 7)).toBe('BIN-7');
  });
});

describe('planGeneration & planRename', () => {
  const sub = (tier: string, code: string) => ({ id: `s-${code}`, warehouse: 'WH-001', tier, code, description: '', active: true } as never);

  it('plans new bins across the tier ranges and skips existing codes', () => {
    const subs = [sub('aisle', 'A1'), sub('shelf', 'S1'), sub('level', 'L1'), sub('level', 'L2')];
    const existing = [{ code: 'WH-001-A1-S1-L1' } as BinLocation];
    const input = {
      warehouse: 'WH-001',
      ranges: { aisle: { from: '', to: '' }, shelf: { from: '', to: '' }, level: { from: '', to: '' } },
      defaults: {},
      patterns: { description: 'D{SEQ}', barcode: '', altSortCode: '' },
    } as never;
    const { add, skipped } = planGeneration(input, subs, existing);
    // 1 aisle × 1 shelf × 2 levels = 2; one already exists.
    expect(skipped).toEqual(['WH-001-A1-S1-L1']);
    expect(add).toHaveLength(1);
    expect(add[0].level).toBe('L2');
  });

  it('plans a rename and flags a collision onto an existing bin', () => {
    const bins = [
      { id: 'b1', warehouse: 'WH-001', aisle: 'A1', shelf: 'S1', level: 'L1', code: 'WH-001-A1-S1-L1' } as BinLocation,
      { id: 'b2', warehouse: 'WH-001', aisle: 'A2', shelf: 'S1', level: 'L1', code: 'WH-001-A2-S1-L1' } as BinLocation,
    ];
    // Rename aisle A1 → A2: lands on b2's code, a conflict.
    const input = {
      warehouse: 'WH-001',
      ranges: { aisle: { from: 'A1', to: 'A1' }, shelf: { from: '', to: '' }, level: { from: '', to: '' } },
      changes: { aisle: 'A2' },
      reason: '',
    } as never;
    const rows = planRename(input, bins);
    expect(rows).toHaveLength(1);
    expect(rows[0].to.code).toBe('WH-001-A2-S1-L1');
    expect(rows[0].conflict).toContain('already exists');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// items — stockTotals, isLowStock
// ═════════════════════════════════════════════════════════════════════════════

describe('stockTotals & isLowStock', () => {
  it('sums across warehouses; available = inStock − committed + ordered', () => {
    const item = makeItem({
      id: 'it1',
      warehouses: [
        wh('A', 10, { committed: 2, ordered: 1 }),
        wh('B', 5, { committed: 0, ordered: 4 }),
      ],
    });
    const t = stockTotals(item);
    expect(t.inStock).toBe(15);
    expect(t.committed).toBe(2);
    expect(t.ordered).toBe(5);
    expect(t.available).toBe(18); // 15 − 2 + 5
  });

  it('isLowStock when an inventory item is at or below minStock', () => {
    expect(isLowStock(makeItem({ id: 'low', inventoryItem: true, minStock: 10, warehouses: [wh('A', 10)] }))).toBe(true);
    expect(isLowStock(makeItem({ id: 'ok', inventoryItem: true, minStock: 10, warehouses: [wh('A', 11)] }))).toBe(false);
    // Non-inventory items are never low stock.
    expect(isLowStock(makeItem({ id: 'svc', inventoryItem: false, minStock: 10, warehouses: [] }))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// mergedItems — a variant inherits the parent's tax setup, G/L accounts, and UoMs
// ═════════════════════════════════════════════════════════════════════════════

describe('mergedItems', () => {
  it('a variant inherits tax setup, G/L accounts and UoMs from its parent but keeps its own price/cost/stock', () => {
    const parent = makeItem({
      id: 'p1',
      itemGroupId: 'grp-tablets',
      valuationMethod: 'Moving Average',
      glBy: 'Item Level',
      inventoryAccount: '1-INV',
      cogsAccount: '5-COGS',
      revenueAccount: '4-REV',
      purchaseTaxGroup: 'ptg-vat12',
      purchaseTaxCode: 'VAT12',
      salesTaxGroup: 'stg-vat12',
      salesTaxCode: 'OVAT12',
      withholdingGroup: 'wg-ewt1',
      inventoryUom: 'pc',
      purchasingUom: 'box',
      salesUom: 'pc',
      uoms: [
        { id: 'u1', uom: 'pc', qty: 1, purchase: true, sales: true, price: 0 },
        { id: 'u2', uom: 'box', qty: 24, purchase: true, sales: false, price: 0 },
      ] as never,
      itemCost: 999,
      basePrice: 999,
    });
    const variant = makeItem({
      id: 'v1',
      parentItemId: 'p1',
      itemNo: 'VAR-PINK',
      // Variant-own fields differ from the parent.
      itemCost: 500,
      basePrice: 600,
      warehouses: [wh('WH-001', 7)],
      // These should be OVERWRITTEN by the parent's values at merge time.
      itemGroupId: '',
      inventoryAccount: '',
      cogsAccount: '',
      revenueAccount: '',
      purchaseTaxGroup: '',
      salesTaxGroup: '',
      withholdingGroup: '',
      uoms: [],
      purchasingUom: '',
      salesUom: '',
    });

    const merged = mergedItems([parent, variant]);
    const v = merged.find((i) => i.id === 'v1')!;

    // Inherited from parent:
    expect(v.itemGroupId).toBe('grp-tablets');
    expect(v.valuationMethod).toBe('Moving Average');
    expect(v.inventoryAccount).toBe('1-INV');
    expect(v.cogsAccount).toBe('5-COGS');
    expect(v.revenueAccount).toBe('4-REV');
    expect(v.purchaseTaxGroup).toBe('ptg-vat12');
    expect(v.purchaseTaxCode).toBe('VAT12');
    expect(v.salesTaxGroup).toBe('stg-vat12');
    expect(v.salesTaxCode).toBe('OVAT12');
    expect(v.withholdingGroup).toBe('wg-ewt1');
    expect(v.purchasingUom).toBe('box');
    expect(v.salesUom).toBe('pc');
    expect(v.uoms).toHaveLength(2);

    // Kept from the variant:
    expect(v.itemNo).toBe('VAR-PINK');
    expect(v.itemCost).toBe(500);
    expect(v.basePrice).toBe(600);
    expect(v.warehouses[0].inStock).toBe(7);

    // A non-variant item passes through unchanged.
    const p = merged.find((i) => i.id === 'p1')!;
    expect(p.itemCost).toBe(999);
  });
});
