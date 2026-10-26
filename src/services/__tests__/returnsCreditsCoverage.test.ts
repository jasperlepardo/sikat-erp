/**
 * Coverage-focused unit tests for the sales-side returns & credits services:
 *   - src/services/salesReturns.ts
 *   - src/services/arCreditMemos.ts
 *
 * Strategy: exercise the pure helpers (totals, open/credited-qty, copy-from-base builders, journal
 * builders) directly, and drive the add / save / close / cancel / apply paths through the real
 * services, asserting the DOCUMENTED, observable effects — item stock, return status + creditedQty,
 * memo status + applications, invoice balances, and that every journal builder balances.
 *
 * Isolation: collections hold module-level state across tests; setup.ts clears localStorage before
 * each test, but the module-level `loaded` cache is only reset by a save that misses cache or by
 * reading seed rows. Each test reads the live rows it needs through the services' list/get and
 * either fully reverses its own mutation (cancel) or uses distinct freshly-built documents.
 */
import { describe, expect, it, vi } from 'vitest';

// These are integration-style tests: each drives several awaited service calls (order → delivery →
// invoice → return → credit memo). The shared Vitest harness fakes the clock and runs test files in
// parallel, so the default 5s per-test timeout can be exceeded under CPU contention. Give these
// tests generous headroom so contention never turns a correct test into a flaky timeout.
vi.setConfig({ testTimeout: 30000 });

import { SEED_ITEMS, mergedItems } from '../../mocks/items';
import { SEED_PARTNERS } from '../../mocks/partners';
import { SEED_TAX_CODES, rateFrom } from '../../mocks/taxes';

import { blankSalesOrder, newSoLine, type SalesOrder, type SoLine } from '../../mocks/salesOrders';
import { saveSalesOrder } from '../salesOrders';
import { newDnLine, type Delivery } from '../../mocks/deliveries';
import { addDelivery } from '../deliveries';
import { newArLine } from '../../mocks/arInvoices';
import { addArInvoice, arAmounts, getArInvoice } from '../arInvoices';

import { newSrLine, type SalesReturn, type SrLine } from '../../mocks/salesReturns';
import {
  addSalesReturn,
  cancelSalesReturn,
  closeWithReplacementDelivery,
  creditableSalesReturns,
  getSalesReturn,
  listSalesReturns,
  recallSalesReturn,
  saveReturnDraft,
  saveReturnRemarks,
  SrPostError,
  srJournal,
  srLineFromDelivery,
  srNumber,
  srOpenQty,
  srTotal,
  srTotals,
} from '../salesReturns';

import { newArCmLine, type ArCreditMemo, type ArCmLine } from '../../mocks/arCreditMemos';
import {
  addArCreditMemo,
  applyArCredit,
  arCmJournal,
  arCmNumber,
  arCmTotal,
  arCmTotals,
  arCreditMemoFromInvoice,
  arCreditMemoFromReturn,
  baseArInvoiceIds,
  cancelArCreditMemo,
  getArCreditMemo,
  listArCreditMemos,
  netArCredit,
  receivesStock,
  recallArCreditMemo,
  saveArCmDraft,
  saveArCmRemarks,
  type ArInvoiceBalances,
} from '../arCreditMemos';

import { listItems } from '../items';
import { itemGroups } from '../inventoryMasters';

// ── Shared fixtures ────────────────────────────────────────────────────────────

const OWNER = 'emp-001';
/** A FIFO accessory with plenty of uncommitted stock in WH-001 (ACC-PWR20). */
const ITEM_ID = 'apl-0361';
const WAREHOUSE = 'WH-001';
const CUSTOMER_ID = 'bp-002';
const RATE_OF = rateFrom(SEED_TAX_CODES, '2026-06-15');
const CODES = SEED_TAX_CODES;

const mItems = mergedItems(SEED_ITEMS);
const seedItem = mItems.find((i) => i.id === ITEM_ID)!;
const customer = SEED_PARTNERS.find((p) => p.id === CUSTOMER_ID)!;

const imbalance = (lines: { debit: number; credit: number }[]) =>
  Math.round(lines.reduce((n, l) => n + l.debit - l.credit, 0) * 100) / 100 + 0;

async function stockOf(itemId = ITEM_ID, warehouse = WAREHOUSE): Promise<number> {
  const items = await listItems();
  const it = items.find((i) => i.id === itemId)!;
  return it.warehouses.find((w) => w.code === warehouse)?.inStock ?? 0;
}

async function makeOrder(qty: number, patch: Partial<SoLine> = {}): Promise<SalesOrder> {
  const line = newSoLine({
    itemId: ITEM_ID,
    itemNo: seedItem.itemNo,
    description: seedItem.name,
    quantity: qty,
    warehouse: WAREHOUSE,
    unitPrice: 2000,
    taxCode: 'OVAT',
    priceSource: 'Base price',
    ...patch,
  });
  return saveSalesOrder({
    ...blankSalesOrder(OWNER),
    customerId: CUSTOMER_ID,
    customerCode: customer.code,
    customerName: customer.name,
    currency: 'PHP',
    postingDate: '2026-06-15',
    documentDate: '2026-06-15',
    dueDate: '2026-07-15',
    approved: true,
    lines: [line],
  });
}

function deliveryFromOrder(so: SalesOrder, line: SoLine, qty: number): Omit<Delivery, 'id'> {
  const dnLine = newDnLine({
    itemId: line.itemId,
    itemNo: line.itemNo,
    description: line.description,
    quantity: qty,
    uomCode: line.uomCode,
    uomName: line.uomName,
    itemsPerUnit: line.itemsPerUnit,
    warehouse: line.warehouse,
    unitPrice: line.unitPrice,
    taxCode: line.taxCode,
    baseType: 'SO',
    baseId: so.id,
    baseLineId: line.id,
    baseRow: 1,
  });
  return {
    customerId: so.customerId,
    customerCode: so.customerCode,
    customerName: so.customerName,
    contactId: '',
    customerRef: '',
    currency: 'PHP',
    seriesId: 'dns-primary',
    docNum: 0,
    status: 'Draft',
    postingDate: '2026-06-16',
    deliveryDate: '2026-06-16',
    documentDate: '2026-06-16',
    dueDate: '2026-07-16',
    closeDate: '',
    lines: [dnLine],
    shipTo: '',
    billTo: '',
    shippingType: '',
    language: 'English',
    trackingNo: '',
    stampNo: '',
    pickPackRemarks: '',
    bpChannelName: '',
    bpChannelContact: '',
    journalRemark: 'Deliveries – test',
    projectId: '',
    paymentTermId: 'pt-004',
    paymentMethod: 'BANK',
    indicator: '',
    federalTaxId: '',
    orderNumber: String(so.docNum),
    dueMonths: 0,
    dueDays: 0,
    cashDiscountDays: 0,
    references: [],
    useShippedGoodsAccount: false,
    attachments: [],
    salesEmployeeId: '',
    ownerId: OWNER,
    discountPct: 0,
    freight: 0,
    freightTaxCode: 'OVAT',
    rounding: false,
    remarks: '',
    fxRate: 1,
    approved: true,
  } as Omit<Delivery, 'id'>;
}

/** A sales-return input with the given lines. */
function returnInput(lines: SrLine[], patch: Partial<SalesReturn> = {}): Parameters<typeof addSalesReturn>[0] {
  return {
    customerId: CUSTOMER_ID,
    customerCode: customer.code,
    customerName: customer.name,
    contactId: '',
    customerRef: '',
    currency: 'PHP',
    seriesId: 'srs-primary',
    docNum: 0,
    status: 'Draft',
    postingDate: '2026-06-18',
    deliveryDate: '2026-06-18',
    documentDate: '2026-06-18',
    dueDate: '2026-07-18',
    closeDate: '',
    lines,
    shipTo: '',
    billTo: '',
    shippingType: '',
    language: 'English',
    trackingNo: '',
    stampNo: '',
    pickPackRemarks: '',
    bpChannelName: '',
    bpChannelContact: '',
    journalRemark: 'Sales Returns – test',
    projectId: '',
    paymentTermId: 'pt-004',
    paymentMethod: 'BANK',
    indicator: '',
    federalTaxId: '',
    orderNumber: '',
    dueMonths: 0,
    dueDays: 0,
    cashDiscountDays: 0,
    references: [],
    useShippedGoodsAccount: false,
    attachments: [],
    salesEmployeeId: '',
    ownerId: OWNER,
    discountPct: 0,
    freight: 0,
    freightTaxCode: 'OVAT',
    rounding: false,
    remarks: '',
    fxRate: 1,
    approved: true,
    replacementDnId: '',
    ...patch,
  } as Parameters<typeof addSalesReturn>[0];
}

/** An A/R credit-memo input with the given lines. */
function cmInput(lines: ArCmLine[], patch: Partial<ArCreditMemo> = {}): Parameters<typeof addArCreditMemo>[0] {
  return {
    customerId: CUSTOMER_ID,
    customerCode: customer.code,
    customerName: customer.name,
    contactId: '',
    customerRef: '',
    currency: 'PHP',
    seriesId: 'acms-primary',
    docNum: 0,
    status: 'Draft',
    postingDate: '2026-06-19',
    dueDate: '2026-07-19',
    documentDate: '2026-06-19',
    closeDate: '',
    docType: 'Item',
    lines,
    applications: [],
    shipTo: '',
    billTo: '',
    shippingType: '',
    language: 'English',
    trackingNo: '',
    blockDunning: false,
    bpChannelName: '',
    bpChannelContact: '',
    journalRemark: 'A/R Credit Memos – test',
    projectId: '',
    paymentTermId: 'pt-004',
    paymentMethod: 'BANK',
    indicator: '',
    federalTaxId: '',
    orderNumber: '',
    dueMonths: 0,
    dueDays: 0,
    cashDiscountDays: 0,
    references: [],
    controlAccount: '1120',
    paymentBlock: false,
    maxCashDiscount: false,
    installments: 1,
    useShippedGoodsAccount: false,
    attachments: [],
    salesEmployeeId: '',
    ownerId: OWNER,
    discountPct: 0,
    freight: 0,
    freightTaxCode: 'OVAT',
    rounding: false,
    remarks: '',
    appliedAmount: 0,
    fxRate: 1,
    approved: true,
    ...patch,
  } as Parameters<typeof addArCreditMemo>[0];
}

/** Build an Open sales return of `qty` ITEM_ID from a delivery (returns {sr, dn, so}). */
async function returnFromFreshDelivery(deliverQty: number, returnQty: number) {
  const so = await makeOrder(deliverQty, { quantity: deliverQty });
  const dn = await addDelivery(deliveryFromOrder(so, so.lines[0], deliverQty), 1);
  const dl = dn.lines[0];
  const srLine = newSrLine({
    itemId: dl.itemId,
    itemNo: dl.itemNo,
    description: dl.description,
    quantity: returnQty,
    warehouse: dl.warehouse,
    itemsPerUnit: dl.itemsPerUnit,
    unitPrice: dl.unitPrice,
    taxCode: dl.taxCode,
    baseType: 'DN',
    baseId: dn.id,
    baseLineId: dl.id,
    baseRow: 1,
  });
  const sr = await addSalesReturn(returnInput([srLine]), 1);
  return { sr, dn, so, dl };
}

// ── salesReturns: pure helpers ─────────────────────────────────────────────────

describe('salesReturns pure helpers', () => {
  it('srNumber formats the seeded return positionally', () => {
    expect(srNumber({ seriesId: 'srs-primary', docNum: 1, postingDate: '2026-10-03' })).toBe('SRT-2026-0001');
  });

  it('srTotals / srTotal sum net + 12% VAT with the delivery math', () => {
    const line = newSrLine({ itemId: ITEM_ID, quantity: 3, unitPrice: 2000, taxCode: 'OVAT', itemsPerUnit: 1 });
    const r = { lines: [line], discountPct: 0, freight: 0, freightTaxCode: 'OVAT', rounding: false, postingDate: '2026-06-15' } as SalesReturn;
    const t = srTotals(r, RATE_OF);
    expect(t.beforeDiscount).toBeCloseTo(6000, 2);
    expect(t.tax).toBeCloseTo(720, 2);
    expect(t.total).toBeCloseTo(6720, 2);
    expect(srTotal(r, CODES)).toBeCloseTo(6720, 2);
  });

  it('srOpenQty is quantity minus credited only while Open, else 0', () => {
    const l = newSrLine({ quantity: 5, creditedQty: 2 });
    expect(srOpenQty(l, { status: 'Open' })).toBe(3);
    expect(srOpenQty(l, { status: 'Closed' })).toBe(0);
    expect(srOpenQty(l, { status: 'Cancelled' })).toBe(0);
    // Credited beyond quantity never goes negative.
    expect(srOpenQty(newSrLine({ quantity: 2, creditedQty: 5 }), { status: 'Open' })).toBe(0);
  });

  it('creditableSalesReturns keeps a customer\'s Open returns with qty left to credit', () => {
    const open = { customerId: 'c1', status: 'Open', lines: [newSrLine({ quantity: 3, creditedQty: 1 })] } as SalesReturn;
    const fullyCredited = { customerId: 'c1', status: 'Open', lines: [newSrLine({ quantity: 3, creditedQty: 3 })] } as SalesReturn;
    const closed = { customerId: 'c1', status: 'Closed', lines: [newSrLine({ quantity: 3, creditedQty: 0 })] } as SalesReturn;
    const otherCust = { customerId: 'c2', status: 'Open', lines: [newSrLine({ quantity: 3, creditedQty: 0 })] } as SalesReturn;
    const out = creditableSalesReturns([open, fullyCredited, closed, otherCust], 'c1');
    expect(out).toEqual([open]);
  });

  it('srLineFromDelivery builds SR lines from picked delivery lines and skips unknown ids', () => {
    const dn = {
      id: 'dn-x',
      docNum: 7,
      postingDate: '2026-05-01',
      seriesId: 'dns-primary',
      lines: [
        { id: 'dl-1', itemId: ITEM_ID, itemNo: 'A', quantity: 10, invoicedQty: 4, uomCode: 'pc', warehouse: WAREHOUSE } as Delivery['lines'][number],
      ],
    } as unknown as Delivery;
    const out = srLineFromDelivery(dn, [{ lineId: 'dl-1', qty: 2 }, { lineId: 'missing', qty: 1 }]);
    expect(out).toHaveLength(1);
    expect(out[0].baseType).toBe('DN');
    expect(out[0].baseId).toBe('dn-x');
    expect(out[0].baseLineId).toBe('dl-1');
    expect(out[0].quantity).toBe(2);
    expect(out[0].creditedQty).toBe(0);
    expect('invoicedQty' in out[0]).toBe(false);
  });

  it('srJournal mirrors the delivery: Dr Inventory / Cr COGS, balanced, fixed vs live cost', () => {
    const line = newSrLine({ itemId: ITEM_ID, quantity: 2, itemsPerUnit: 1, warehouse: WAREHOUSE, unitCostLc: 1500 });
    const groups = SEED_ITEMS.length ? [] : []; // groups fetched below
    void groups;
    // use empty groups: inventory/cogs come from item level for merged items
    const fixed = srJournal({ lines: [line] }, mItems, [], true);
    expect(imbalance(fixed)).toBe(0);
    // Fixed cost: value = 2 * 1500 = 3000 on each side.
    const dr = fixed.find((l) => l.debit > 0)!;
    const cr = fixed.find((l) => l.credit > 0)!;
    expect(dr.debit).toBeCloseTo(3000, 2);
    expect(cr.credit).toBeCloseTo(3000, 2);
    // A non-inventory / zero-cost line contributes nothing.
    const zero = srJournal({ lines: [newSrLine({ itemId: ITEM_ID, quantity: 0, unitCostLc: 0 })] }, mItems, [], true);
    expect(zero).toEqual([]);
  });
});

// ── salesReturns: saving + posting ──────────────────────────────────────────────

describe('salesReturns save / add / cancel / recall / close', () => {
  it('saveReturnDraft stores a Draft with docNum 0; getSalesReturn finds it by id', async () => {
    const draft = await saveReturnDraft(returnInput([]));
    expect(draft.status).toBe('Draft');
    expect(draft.docNum).toBe(0);
    expect((await getSalesReturn(draft.id))!.id).toBe(draft.id);
  });

  it('saveReturnRemarks patches remarks on an existing return and throws for a missing one', async () => {
    const draft = await saveReturnDraft(returnInput([]));
    const patched = await saveReturnRemarks(draft, { remarks: 'inspected', attachments: [] });
    expect(patched.remarks).toBe('inspected');
    await expect(saveReturnRemarks({ ...draft, id: 'sr-nope' }, { remarks: 'x', attachments: [] })).rejects.toThrow(/no longer exists/);
  });

  it('an unapproved return is left Not Confirmed and moves no stock', async () => {
    const so = await makeOrder(3, { quantity: 3 });
    const dn = await addDelivery(deliveryFromOrder(so, so.lines[0], 3), 1);
    const dl = dn.lines[0];
    const before = await stockOf();
    const line = newSrLine({ itemId: dl.itemId, itemNo: dl.itemNo, quantity: 1, warehouse: dl.warehouse, itemsPerUnit: dl.itemsPerUnit, unitPrice: dl.unitPrice, taxCode: dl.taxCode, baseType: 'DN', baseId: dn.id, baseLineId: dl.id });
    const saved = await addSalesReturn(returnInput([line], { approved: false }), 1);
    expect(saved.status).toBe('Not Confirmed');
    expect(saved.docNum).toBeGreaterThan(0);
    expect(await stockOf()).toBe(before);
  });

  it('addSalesReturn rejects returning more than the delivery has left (SrPostError lists the line)', async () => {
    const so = await makeOrder(2, { quantity: 2 });
    const dn = await addDelivery(deliveryFromOrder(so, so.lines[0], 2), 1);
    const dl = dn.lines[0];
    const line = newSrLine({ itemId: dl.itemId, itemNo: dl.itemNo, quantity: 5, warehouse: dl.warehouse, itemsPerUnit: dl.itemsPerUnit, unitPrice: dl.unitPrice, taxCode: dl.taxCode, baseType: 'DN', baseId: dn.id, baseLineId: dl.id });
    await expect(addSalesReturn(returnInput([line]), 1)).rejects.toBeInstanceOf(SrPostError);
    try {
      await addSalesReturn(returnInput([line]), 1);
    } catch (e) {
      expect((e as SrPostError).lineIds).toContain(line.id);
      expect((e as SrPostError).message).toMatch(/left to return/);
    }
  });

  it('an approved return brings stock back in, opens, posts a balanced SR entry', async () => {
    const start = await stockOf();
    const { sr } = await returnFromFreshDelivery(4, 2);
    expect(sr.status).toBe('Open');
    expect(sr.docNum).toBeGreaterThan(0);
    // delivered 4 then returned 2 → net -2 from start.
    expect(await stockOf()).toBe(start - 4 + 2);
    // Each returned line carries the FIFO cost it came back at.
    expect(sr.lines[0].unitCostLc).toBeGreaterThan(0);
    // srOpenQty on the live Open return.
    expect(srOpenQty(sr.lines[0], sr)).toBe(2);
    // The SR journal (built from live item cost) balances.
    const groups = await itemGroups.list();
    const je = srJournal(sr, await listItems(), groups);
    expect(imbalance(je)).toBe(0);
  });

  it('cancelSalesReturn takes the stock back out and sets Cancelled', async () => {
    const start = await stockOf();
    const { sr } = await returnFromFreshDelivery(4, 2);
    expect(await stockOf()).toBe(start - 4 + 2);
    const cancelled = await cancelSalesReturn(sr);
    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.closeDate).toBeTruthy();
    // stock back to delivered-only level.
    expect(await stockOf()).toBe(start - 4);
  });

  it('cancelSalesReturn refuses once a line has been credited', async () => {
    const { sr } = await returnFromFreshDelivery(4, 2);
    const credited: SalesReturn = { ...sr, lines: sr.lines.map((l) => ({ ...l, creditedQty: 1 })) };
    await expect(cancelSalesReturn(credited)).rejects.toThrow(/Already credited/);
  });

  it('recallSalesReturn returns a Draft with approved cleared', async () => {
    const { sr } = await returnFromFreshDelivery(3, 1);
    const recalled = await recallSalesReturn(sr);
    expect(recalled.status).toBe('Draft');
    expect(recalled.approved).toBe(false);
  });

  it('closeWithReplacementDelivery closes an Open return and stamps the replacement; non-Open throws', async () => {
    const { sr } = await returnFromFreshDelivery(3, 1);
    const closed = await closeWithReplacementDelivery(sr, 'dn-replacement');
    expect(closed.status).toBe('Closed');
    expect(closed.replacementDnId).toBe('dn-replacement');
    expect(closed.closeDate).toBeTruthy();
    await expect(closeWithReplacementDelivery(closed, 'dn-x')).rejects.toThrow(/Only Open/);
  });

  it('the seeded sales return loads and numbers', async () => {
    const all = await listSalesReturns();
    const seeded = all.find((r) => r.id === 'sr-001')!;
    expect(seeded).toBeTruthy();
    expect(srNumber(seeded)).toBe('SRT-2026-0001');
    expect((await getSalesReturn('SRT-2026-0001'))!.id).toBe('sr-001');
    expect(await getSalesReturn('no-such-return')).toBeNull();
  });
});

// ── arCreditMemos: pure helpers ─────────────────────────────────────────────────

describe('arCreditMemos pure helpers', () => {
  it('arCmNumber / arCmTotals / arCmTotal compute the memo number and totals', () => {
    expect(arCmNumber({ seriesId: 'acms-primary', docNum: 3, postingDate: '2026-10-05' })).toBe('ACM-2026-0003');
    const line = newArCmLine({ itemId: ITEM_ID, quantity: 2, unitPrice: 2000, taxCode: 'OVAT', itemsPerUnit: 1, discountPct: 0 });
    const m = { lines: [line], discountPct: 0, freight: 0, freightTaxCode: 'OVAT', rounding: false } as ArCreditMemo;
    expect(arCmTotals(m, RATE_OF).total).toBeCloseTo(4480, 2);
    expect(arCmTotal({ ...m, postingDate: '2026-06-15' } as ArCreditMemo, CODES)).toBeCloseTo(4480, 2);
  });

  it('netArCredit subtracts the applied amount', () => {
    expect(netArCredit(4480, 1000)).toBeCloseTo(3480, 2);
    expect(netArCredit(4480, 4480)).toBeCloseTo(0, 2);
  });

  it('receivesStock is true only for returnGoods on a stocked item', () => {
    expect(receivesStock(newArCmLine({ itemId: ITEM_ID, returnGoods: true }), mItems)).toBe(true);
    expect(receivesStock(newArCmLine({ itemId: ITEM_ID, returnGoods: false }), mItems)).toBe(false);
    // SVC-MANUALS (itm-044) is a non-inventory service item.
    expect(receivesStock(newArCmLine({ itemId: 'itm-044', returnGoods: true }), mItems)).toBe(false);
  });

  it('baseArInvoiceIds lists the distinct invoice ids the lines credit', () => {
    const m = { lines: [newArCmLine({ invoiceId: 'inv-1' }), newArCmLine({ invoiceId: 'inv-1' }), newArCmLine({ invoiceId: '' }), newArCmLine({ invoiceId: 'inv-2' })] } as ArCreditMemo;
    expect(baseArInvoiceIds(m).sort()).toEqual(['inv-1', 'inv-2']);
  });

  it('arCmJournal: Dr revenue + Dr output VAT / Cr A/R, plus Dr Inventory / Cr COGS for returned goods; balanced', async () => {
    const groups = await itemGroups.list();
    // A returnGoods line that also carries stock back.
    const line = newArCmLine({ itemId: ITEM_ID, quantity: 2, unitPrice: 2000, taxCode: 'OVAT', itemsPerUnit: 1, discountPct: 0, warehouse: WAREHOUSE, unitCostLc: 1500, returnGoods: true });
    const je = arCmJournal(
      { lines: [line], discountPct: 0, freight: 0, freightTaxCode: 'OVAT', controlAccount: '1120', docType: 'Item' },
      1,
      { items: mItems, groups, codes: CODES, rateOf: RATE_OF },
    );
    expect(imbalance(je)).toBe(0);
    // A/R control is credited (customer receivable goes down).
    expect(je.some((l) => l.account === '1120' && l.credit > 0)).toBe(true);
    // Output VAT (reversed) is debited.
    expect(je.some((l) => l.debit > 0)).toBe(true);

    // Service docType uses the line GL account (default 4030) and no inventory lines.
    const svc = newArCmLine({ itemId: '', quantity: 1, unitPrice: 1000, taxCode: 'OVAT', itemsPerUnit: 1, discountPct: 0, glAccount: '', returnGoods: false });
    const svcJe = arCmJournal(
      { lines: [svc], discountPct: 0, freight: 100, freightTaxCode: 'OVAT', controlAccount: '1120', docType: 'Service' },
      1,
      { items: mItems, groups, codes: CODES, rateOf: RATE_OF },
    );
    expect(imbalance(svcJe)).toBe(0);
    expect(svcJe.some((l) => l.account === '4030')).toBe(true);
    // Freight income reversed (debited).
    expect(svcJe.some((l) => l.debit > 0)).toBe(true);
  });

  it('arCreditMemoFromInvoice copies invoice lines, caps qty, and defaults returnGoods for stocked items', () => {
    const inv = {
      id: 'inv-1',
      seriesId: 'ars-primary',
      docNum: 9,
      postingDate: '2026-05-01',
      lines: [
        { id: 'il-1', itemId: ITEM_ID, itemNo: 'A', description: 'Acc', quantity: 3, uomCode: 'pc', uomName: 'Piece', itemsPerUnit: 1, warehouse: WAREHOUSE, priceListId: '', unitPrice: 2000, discountPct: 0, priceSource: 'Manual', taxCode: 'OVAT', glAccount: '', commissionPct: 0, unitCostLc: 1500 },
      ],
    } as never;
    const out = arCreditMemoFromInvoice(inv, [{ lineId: 'il-1', qty: 10 }, { lineId: 'gone', qty: 1 }], mItems);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(3); // capped at invoice qty
    expect(out[0].baseType).toBe('ARIN');
    expect(out[0].invoiceId).toBe('inv-1');
    expect(out[0].returnGoods).toBe(true); // stocked
  });

  it('arCreditMemoFromReturn copies return lines with returnGoods=false and open-qty cap', () => {
    const r = {
      id: 'sr-x',
      status: 'Open',
      seriesId: 'srs-primary',
      docNum: 2,
      postingDate: '2026-05-01',
      lines: [newSrLine({ id: 'srl-1', itemId: ITEM_ID, itemNo: 'A', quantity: 5, creditedQty: 1, unitPrice: 2000, taxCode: 'OVAT', warehouse: WAREHOUSE, unitCostLc: 1500, returnReason: 'Defective' })],
    } as unknown as SalesReturn;
    const out = arCreditMemoFromReturn(r, [{ lineId: 'srl-1', qty: 10 }], mItems, srNumber, srOpenQty);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(4); // open = 5 - 1
    expect(out[0].baseType).toBe('SRT');
    expect(out[0].returnGoods).toBe(false);
    expect(out[0].invoiceId).toBe('');
    expect(out[0].returnReason).toBe('Defective');
  });
});

// ── arCreditMemos: saving + posting ─────────────────────────────────────────────

describe('arCreditMemos save / add / apply / cancel / recall', () => {
  it('saveArCmDraft stores a Draft; getArCreditMemo finds seeds by number', async () => {
    const draft = await saveArCmDraft(cmInput([]));
    expect(draft.status).toBe('Draft');
    expect(draft.docNum).toBe(0);
    const all = await listArCreditMemos();
    expect(all.some((m) => m.id === 'acm-001')).toBe(true);
    expect((await getArCreditMemo('ACM-2026-0001'))!.id).toBe('acm-001');
    expect(await getArCreditMemo('nope')).toBeNull();
  });

  it('saveArCmRemarks patches an existing memo and throws for a missing one', async () => {
    const draft = await saveArCmDraft(cmInput([]));
    const patched = await saveArCmRemarks(draft, { remarks: 'reviewed' });
    expect(patched.remarks).toBe('reviewed');
    await expect(saveArCmRemarks({ ...draft, id: 'acm-nope' }, { remarks: 'x' })).rejects.toThrow(/no longer exists/);
  });

  it('an unapproved memo is left Not Confirmed and moves no stock', async () => {
    const start = await stockOf();
    const line = newArCmLine({ itemId: ITEM_ID, itemNo: seedItem.itemNo, quantity: 1, warehouse: WAREHOUSE, unitPrice: 2000, taxCode: 'OVAT', itemsPerUnit: 1, unitCostLc: 1500, returnGoods: true, baseType: '' });
    const saved = await addArCreditMemo(cmInput([line], { approved: false }), 1, 0, new Map());
    expect(saved.status).toBe('Not Confirmed');
    expect(saved.docNum).toBeGreaterThan(0);
    expect(await stockOf()).toBe(start);
  });

  it('a standalone memo returning goods brings stock in, applies nothing (no base invoice), stays Open', async () => {
    const start = await stockOf();
    const line = newArCmLine({ itemId: ITEM_ID, itemNo: seedItem.itemNo, quantity: 2, warehouse: WAREHOUSE, unitPrice: 2000, taxCode: 'OVAT', itemsPerUnit: 1, unitCostLc: 1500, returnGoods: true, baseType: '', invoiceId: '' });
    const credit = 4480;
    const saved = await addArCreditMemo(cmInput([line]), 1, credit, new Map());
    expect(saved.status).toBe('Open'); // no invoice to apply to → credit stays open
    expect(saved.appliedAmount).toBe(0);
    expect(await stockOf()).toBe(start + 2); // returnGoods stock back in
  });

  it('a memo copied from an invoice applies the credit, closes within tolerance, and reduces the invoice balance', async () => {
    // Build an invoice to credit (standalone, no withholding → due = total).
    const so = await makeOrder(4, { quantity: 4 });
    const dn = await addDelivery(deliveryFromOrder(so, so.lines[0], 4), 1);
    const dl = dn.lines[0];
    const arLine = newArLine({ itemId: dl.itemId, itemNo: dl.itemNo, quantity: 4, warehouse: dl.warehouse, itemsPerUnit: dl.itemsPerUnit, unitPrice: dl.unitPrice, taxCode: dl.taxCode, unitCostLc: dl.unitCostLc, baseType: 'DN', baseId: dn.id, baseLineId: dl.id, baseRow: 1 });
    const inv = await addArInvoice(
      {
        customerId: CUSTOMER_ID, customerCode: customer.code, customerName: customer.name, contactId: '', customerRef: '', currency: 'PHP',
        seriesId: 'ars-primary', docNum: 0, status: 'Draft', postingDate: '2026-06-17', dueDate: '2026-07-17', documentDate: '2026-06-17', closeDate: '',
        docType: 'Item', lines: [arLine], shipTo: '', billTo: '', shippingType: '', language: 'English', trackingNo: '', blockDunning: false,
        bpChannelName: '', bpChannelContact: '', journalRemark: 'A/R – test', projectId: '', paymentTermId: 'pt-004', paymentMethod: 'BANK', indicator: '',
        federalTaxId: '', orderNumber: '', dueMonths: 0, dueDays: 0, cashDiscountDays: 0, references: [], controlAccount: '1120', paymentBlock: false,
        maxCashDiscount: false, installments: 1, useShippedGoodsAccount: false, attachments: [], salesEmployeeId: '', ownerId: OWNER, discountPct: 0,
        freight: 0, freightTaxCode: 'OVAT', rounding: false, remarks: '', appliedAmount: 0, fxRate: 1, approved: true,
      } as Parameters<typeof addArInvoice>[0],
      1,
      { codes: CODES, withholding: [] },
    );
    const balBefore = arAmounts(inv, customer, mItems, CODES).balanceDue;

    const cmLine = newArCmLine({ itemId: dl.itemId, itemNo: dl.itemNo, quantity: 2, warehouse: dl.warehouse, itemsPerUnit: dl.itemsPerUnit, unitPrice: dl.unitPrice, taxCode: dl.taxCode, unitCostLc: dl.unitCostLc, baseType: 'ARIN', baseId: inv.id, baseLineId: inv.lines[0].id, baseRow: 1, invoiceId: inv.id, returnGoods: true });
    const credit = 2 * 2000 * 1.12; // 4480
    const balances: ArInvoiceBalances = new Map([[inv.id, { docNo: 'SI', balance: balBefore, total: balBefore }]]);
    const memo = await addArCreditMemo(cmInput([cmLine]), 1, credit, balances);

    expect(memo.appliedAmount).toBeCloseTo(credit, 2);
    expect(memo.applications).toHaveLength(1);
    expect(memo.applications[0].invoiceId).toBe(inv.id);
    // The whole credit was absorbed by the larger invoice balance → nothing left → Closed.
    expect(memo.status).toBe('Closed');
    expect(memo.closeDate).toBeTruthy();
    const invAfter = await getArInvoice(inv.id);
    expect(arAmounts(invAfter!, customer, mItems, CODES).balanceDue).toBeCloseTo(balBefore - credit, 2);
  });

  it('applyArCredit spreads leftover credit to other invoices and rejects over-applying', async () => {
    // A standalone Open memo carrying open credit (no base invoice applied on add).
    const line = newArCmLine({ itemId: ITEM_ID, itemNo: seedItem.itemNo, quantity: 2, warehouse: WAREHOUSE, unitPrice: 2000, taxCode: 'OVAT', itemsPerUnit: 1, unitCostLc: 1500, returnGoods: false, baseType: '', invoiceId: '' });
    const credit = 4480;
    const memo = await addArCreditMemo(cmInput([line]), 1, credit, new Map());
    expect(memo.appliedAmount).toBe(0);

    // Over-applying throws.
    await expect(applyArCredit(memo, credit, [{ invoiceId: 'any', docNo: 'SI', amount: credit + 100, total: 999999 }])).rejects.toThrow(/left/);

    // Build a real invoice to apply the credit to.
    const so = await makeOrder(2, { quantity: 2 });
    const dn = await addDelivery(deliveryFromOrder(so, so.lines[0], 2), 1);
    const dl = dn.lines[0];
    const arLine = newArLine({ itemId: dl.itemId, itemNo: dl.itemNo, quantity: 2, warehouse: dl.warehouse, itemsPerUnit: dl.itemsPerUnit, unitPrice: dl.unitPrice, taxCode: dl.taxCode, unitCostLc: dl.unitCostLc, baseType: 'DN', baseId: dn.id, baseLineId: dl.id, baseRow: 1 });
    const inv = await addArInvoice(
      {
        customerId: CUSTOMER_ID, customerCode: customer.code, customerName: customer.name, contactId: '', customerRef: '', currency: 'PHP',
        seriesId: 'ars-primary', docNum: 0, status: 'Draft', postingDate: '2026-06-17', dueDate: '2026-07-17', documentDate: '2026-06-17', closeDate: '',
        docType: 'Item', lines: [arLine], shipTo: '', billTo: '', shippingType: '', language: 'English', trackingNo: '', blockDunning: false,
        bpChannelName: '', bpChannelContact: '', journalRemark: 'A/R – test', projectId: '', paymentTermId: 'pt-004', paymentMethod: 'BANK', indicator: '',
        federalTaxId: '', orderNumber: '', dueMonths: 0, dueDays: 0, cashDiscountDays: 0, references: [], controlAccount: '1120', paymentBlock: false,
        maxCashDiscount: false, installments: 1, useShippedGoodsAccount: false, attachments: [], salesEmployeeId: '', ownerId: OWNER, discountPct: 0,
        freight: 0, freightTaxCode: 'OVAT', rounding: false, remarks: '', appliedAmount: 0, fxRate: 1, approved: true,
      } as Parameters<typeof addArInvoice>[0],
      1,
      { codes: CODES, withholding: [] },
    );
    const bal = arAmounts(inv, customer, mItems, CODES).balanceDue; // 4480
    const applied = await applyArCredit(memo, credit, [{ invoiceId: inv.id, docNo: 'SI', amount: bal, total: bal }]);
    expect(applied.appliedAmount).toBeCloseTo(credit, 2);
    expect(applied.status).toBe('Closed'); // credit fully used
    const invAfter = await getArInvoice(inv.id);
    expect(arAmounts(invAfter!, customer, mItems, CODES).balanceDue).toBeCloseTo(0, 2);
  });

  it('cancelArCreditMemo reverses applications and takes returned goods back out', async () => {
    // Memo from invoice (returnGoods) applied to the invoice, then cancelled.
    const so = await makeOrder(4, { quantity: 4 });
    const dn = await addDelivery(deliveryFromOrder(so, so.lines[0], 4), 1);
    const dl = dn.lines[0];
    const arLine = newArLine({ itemId: dl.itemId, itemNo: dl.itemNo, quantity: 4, warehouse: dl.warehouse, itemsPerUnit: dl.itemsPerUnit, unitPrice: dl.unitPrice, taxCode: dl.taxCode, unitCostLc: dl.unitCostLc, baseType: 'DN', baseId: dn.id, baseLineId: dl.id, baseRow: 1 });
    const inv = await addArInvoice(
      {
        customerId: CUSTOMER_ID, customerCode: customer.code, customerName: customer.name, contactId: '', customerRef: '', currency: 'PHP',
        seriesId: 'ars-primary', docNum: 0, status: 'Draft', postingDate: '2026-06-17', dueDate: '2026-07-17', documentDate: '2026-06-17', closeDate: '',
        docType: 'Item', lines: [arLine], shipTo: '', billTo: '', shippingType: '', language: 'English', trackingNo: '', blockDunning: false,
        bpChannelName: '', bpChannelContact: '', journalRemark: 'A/R – test', projectId: '', paymentTermId: 'pt-004', paymentMethod: 'BANK', indicator: '',
        federalTaxId: '', orderNumber: '', dueMonths: 0, dueDays: 0, cashDiscountDays: 0, references: [], controlAccount: '1120', paymentBlock: false,
        maxCashDiscount: false, installments: 1, useShippedGoodsAccount: false, attachments: [], salesEmployeeId: '', ownerId: OWNER, discountPct: 0,
        freight: 0, freightTaxCode: 'OVAT', rounding: false, remarks: '', appliedAmount: 0, fxRate: 1, approved: true,
      } as Parameters<typeof addArInvoice>[0],
      1,
      { codes: CODES, withholding: [] },
    );
    const bal = arAmounts(inv, customer, mItems, CODES).balanceDue;
    const stockBeforeMemo = await stockOf();
    const cmLine = newArCmLine({ itemId: dl.itemId, itemNo: dl.itemNo, quantity: 2, warehouse: dl.warehouse, itemsPerUnit: dl.itemsPerUnit, unitPrice: dl.unitPrice, taxCode: dl.taxCode, unitCostLc: dl.unitCostLc, baseType: 'ARIN', baseId: inv.id, baseLineId: inv.lines[0].id, baseRow: 1, invoiceId: inv.id, returnGoods: true });
    const credit = 2 * 2000 * 1.12;
    const memo = await addArCreditMemo(cmInput([cmLine]), 1, credit, new Map([[inv.id, { docNo: 'SI', balance: bal, total: bal }]]));
    expect(await stockOf()).toBe(stockBeforeMemo + 2); // goods came back
    expect(memo.appliedAmount).toBeCloseTo(credit, 2);

    const totalsMap = new Map<string, number>([[inv.id, bal]]);
    const cancelled = await cancelArCreditMemo(memo, totalsMap);
    expect(cancelled.status).toBe('Cancelled');
    expect(cancelled.appliedAmount).toBe(0);
    expect(cancelled.applications).toEqual([]);
    // Goods went back out.
    expect(await stockOf()).toBe(stockBeforeMemo);
    // Invoice balance restored.
    const invAfter = await getArInvoice(inv.id);
    expect(arAmounts(invAfter!, customer, mItems, CODES).balanceDue).toBeCloseTo(bal, 2);
  });

  it('a memo copied from a sales return credits the return line and reopens it on cancel', async () => {
    const { sr } = await returnFromFreshDelivery(4, 2);
    expect(sr.lines[0].creditedQty).toBe(0);
    const srl = sr.lines[0];
    const cmLine = newArCmLine({ itemId: srl.itemId, itemNo: srl.itemNo, quantity: 2, warehouse: srl.warehouse, itemsPerUnit: srl.itemsPerUnit, unitPrice: srl.unitPrice, taxCode: srl.taxCode, unitCostLc: srl.unitCostLc, baseType: 'SRT', baseId: sr.id, baseLineId: srl.id, baseRow: 1, invoiceId: '', returnGoods: false });
    const credit = 2 * srl.unitPrice * 1.12;
    const memo = await addArCreditMemo(cmInput([cmLine]), 1, credit, new Map());

    // The return line was credited → the return closed (fully credited).
    const srAfter = await getSalesReturn(sr.id);
    expect(srAfter!.lines[0].creditedQty).toBeCloseTo(2, 2);
    expect(srAfter!.status).toBe('Closed');
    expect(srAfter!.closeDate).toBeTruthy();

    // Cancel → creditedQty backs out, the return reopens.
    const cancelled = await cancelArCreditMemo(memo, new Map());
    expect(cancelled.status).toBe('Cancelled');
    const srReopened = await getSalesReturn(sr.id);
    expect(srReopened!.lines[0].creditedQty).toBeCloseTo(0, 2);
    expect(srReopened!.status).toBe('Open');
  });

  it('recallArCreditMemo returns a Draft with approved cleared', async () => {
    const draft = await saveArCmDraft(cmInput([]));
    const recalled = await recallArCreditMemo(draft);
    expect(recalled.status).toBe('Draft');
    expect(recalled.approved).toBe(false);
  });
});
