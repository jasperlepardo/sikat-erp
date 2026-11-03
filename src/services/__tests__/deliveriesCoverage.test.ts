/**
 * Deliveries beyond the happy path in salesFlows.test.ts: why a delivery can't post (stock, order
 * state, partial delivery), unapproved deliveries, the journal's account choices, invoiced
 * quantities closing and reopening a delivery, and revenue recognized when a delivery fulfils an
 * A/R reserve invoice.
 */
import { describe, expect, it } from 'vitest';
import { SEED_ITEM_GROUPS } from '../../mocks/itemMasters';
import { SEED_ITEMS, mergedItems, type Item } from '../../mocks/items';
import { SEED_PARTNERS } from '../../mocks/partners';
import { SEED_TAX_CODES } from '../../mocks/taxes';
import { SHIPPED_GOODS_ACCOUNT, newDnLine, type Delivery, type DnLine } from '../../mocks/deliveries';
import { blankSalesOrder, newSoLine, type SalesOrder } from '../../mocks/salesOrders';
import { newRiLine } from '../../mocks/reserveInvoices';
import { closeSalesOrder, saveSalesOrder } from '../salesOrders';
import { addReserveInvoice } from '../reserveInvoices';
import { listJournalEntries } from '../journalEntries';
import {
  DnPostError, addDelivery, applyInvoiced, cancelDelivery, closeDelivery, deliveryProblems, dnInventoryQty, dnJournal, dnNumber,
  dnTotal, getDelivery, recallDelivery, saveDeliveryDraft, saveDeliveryNotes,
} from '../deliveries';

const OWNER = 'emp-001';
const ITEM_ID = 'apl-0361'; // FIFO accessory, well stocked in WH-001
const WH = 'WH-001';
const customer = SEED_PARTNERS.find((p) => p.id === 'bp-002')!;
const items = mergedItems(SEED_ITEMS);
const item = items.find((i) => i.id === ITEM_ID)!;

async function order(qty: number, allowPartialDelivery = true): Promise<SalesOrder> {
  return saveSalesOrder({
    ...blankSalesOrder(OWNER),
    customerId: customer.id, customerCode: customer.code, customerName: customer.name, currency: 'PHP',
    postingDate: '2026-06-15', documentDate: '2026-06-15', dueDate: '2026-07-15', approved: true, allowPartialDelivery,
    lines: [newSoLine({ itemId: ITEM_ID, itemNo: item.itemNo, quantity: qty, warehouse: WH, unitPrice: 2000, taxCode: 'OVAT', priceSource: 'Base price' })],
  });
}

const line = (patch: Partial<DnLine> = {}): DnLine =>
  newDnLine({ itemId: ITEM_ID, itemNo: item.itemNo, quantity: 1, warehouse: WH, unitPrice: 2000, taxCode: 'OVAT', ...patch });

const fromOrder = (so: SalesOrder, qty: number): DnLine =>
  line({ quantity: qty, baseType: 'SO', baseId: so.id, baseLineId: so.lines[0].id, baseDocNo: String(so.docNum), baseRow: 1 });

const delivery = (lines: DnLine[], patch: Partial<Delivery> = {}): Omit<Delivery, 'id'> => ({
  customerId: customer.id, customerCode: customer.code, customerName: customer.name, contactId: '', customerRef: '', currency: 'PHP',
  seriesId: 'dns-primary', docNum: 0, status: 'Draft', postingDate: '2026-06-16', deliveryDate: '2026-06-16', documentDate: '2026-06-16',
  dueDate: '2026-07-16', closeDate: '', lines, shipTo: '', billTo: '', shippingType: '', language: 'English', trackingNo: '', stampNo: '',
  pickPackRemarks: '', bpChannelName: '', bpChannelContact: '', journalRemark: 'Deliveries – test', projectId: '', paymentTermId: 'pt-004',
  paymentMethod: 'BANK', indicator: '', federalTaxId: '', orderNumber: '', dueMonths: 0, dueDays: 0, cashDiscountDays: 0, references: [],
  useShippedGoodsAccount: false, attachments: [], salesEmployeeId: '', ownerId: OWNER, discountPct: 0, freight: 0, freightTaxCode: 'OVAT',
  rounding: false, remarks: '', fxRate: 1, approved: true, ...patch,
});

const messages = async (lines: DnLine[]) => (await deliveryProblems(delivery(lines), items)).map((p) => p.message).join(' ');

describe('delivery helpers', () => {
  it('counts items per unit, defaulting to one', () => {
    expect(dnInventoryQty({ quantity: 3, itemsPerUnit: 0 })).toBe(3);
    expect(dnInventoryQty({ quantity: 3, itemsPerUnit: 12 })).toBe(36);
  });

  it('totals with the codes in force, and numbers from its series', () => {
    const d = { ...delivery([line({ quantity: 2, unitPrice: 1000 }), line({ taxCode: 'NOPE', unitPrice: 500 })]), id: 'x' } as Delivery;
    expect(dnTotal(d, SEED_TAX_CODES)).toBe(2740); // 2,000 + 12% + 500 at no VAT
    expect(dnNumber({ seriesId: 'dns-primary', docNum: 7, postingDate: '2026-06-16' })).toMatch(/0007$/);
  });

  it('journals to Shipped Goods when asked, at the item\'s own accounts when set by item, and skips non-stock or zero-cost lines', () => {
    const itemLevel: Item = { ...item, id: 'il', glBy: 'Item Level', cogsAccount: '5099' };
    const service = items.find((i) => !i.inventoryItem)!;
    const all = [...items, itemLevel];
    const lines = [line({ itemId: 'il' }), line({ itemId: service.id }), line({ itemId: 'nope' }), line({ quantity: 0 })];
    const own = dnJournal({ lines, useShippedGoodsAccount: false }, all, SEED_ITEM_GROUPS);
    expect(own.find((l) => l.account === '5099')?.debit).toBe(item.itemCost);
    const shipped = dnJournal({ lines, useShippedGoodsAccount: true }, all, SEED_ITEM_GROUPS);
    expect(shipped.find((l) => l.account === SHIPPED_GOODS_ACCOUNT)?.debit).toBe(item.itemCost);
    expect(shipped.reduce((n, l) => n + l.debit - l.credit, 0)).toBeCloseTo(0, 2);
  });
});

describe('why a delivery cannot post', () => {
  it('more than the warehouse has in stock', async () => {
    expect(await messages([line({ quantity: 5000 })])).toMatch(/shipping 5000 pc but WH-001 has \d+ in stock/);
    expect(await messages([line({ warehouse: 'WH-NOPE' })])).toContain('has 0 in stock');
  });

  it('an order line that no longer exists, is closed, has less open, or must ship in full', async () => {
    expect(await messages([line({ baseType: 'SO', baseLineId: 'gone', baseDocNo: '99' })])).toContain('order 99 or its line no longer exists');

    const closed = await order(2);
    await closeSalesOrder(closed);
    expect(await messages([fromOrder(closed, 1)])).toContain("is closed — it can't be delivered");

    const open = await order(3);
    expect(await messages([fromOrder(open, 4)])).toContain('has 3 open');

    const whole = await order(3, false);
    expect(await messages([fromOrder(whole, 2)])).toContain("doesn't allow partial delivery");
    expect(await messages([fromOrder(whole, 3)])).toBe('');
  });

  it('adding refuses with every failing line', async () => {
    const err = await addDelivery(delivery([line({ id: 'bad', quantity: 5000 })]), 1).catch((e) => e);
    expect(err).toBeInstanceOf(DnPostError);
    expect(err.lineIds).toEqual(['bad']);
  });
});

describe('delivery lifecycle', () => {
  it('an unapproved delivery is numbered Not Confirmed and moves nothing; it recalls to draft', async () => {
    const d = await addDelivery(delivery([line()], { approved: false }), 58);
    expect([d.status, d.fxRate]).toEqual(['Not Confirmed', 58]);
    expect(d.docNum).toBeGreaterThan(0);
    const recalled = await recallDelivery(d);
    expect([recalled.status, recalled.approved]).toEqual(['Draft', false]);
  });

  it('finds by id or number, saves notes, and refuses notes on a missing delivery', async () => {
    const d = await addDelivery(delivery([line()], { approved: false }), 1);
    expect((await getDelivery(dnNumber(d)))?.id).toBe(d.id);
    expect(await getDelivery('nope')).toBeNull();
    expect((await saveDeliveryNotes(d.id, { remarks: 'Left at reception', attachments: [] })).remarks).toBe('Left at reception');
    await expect(saveDeliveryNotes('gone', { remarks: '', attachments: [] })).rejects.toThrow('no longer exists');
    expect((await saveDeliveryDraft(delivery([line()]))).status).toBe('Draft');
  });

  it('invoicing closes it, a cancelled invoice reopens it, and a billed delivery cannot be cancelled', async () => {
    const d = await addDelivery(delivery([line({ quantity: 2 }), line({ quantity: 1 })]), 1);
    const [a, b] = d.lines;
    await applyInvoiced([{ baseId: d.id, baseLineId: a.id, quantity: 2 }, { baseId: 'gone', baseLineId: 'x', quantity: 1 }], 1);
    expect((await getDelivery(d.id))?.status).toBe('Open');
    await applyInvoiced([{ baseId: d.id, baseLineId: b.id, quantity: 1 }], 1);
    const billed = (await getDelivery(d.id))!;
    expect([billed.status, billed.closeDate]).toEqual(['Closed', '2026-06-15']);
    await expect(cancelDelivery(billed)).rejects.toThrow('Already billed');

    await applyInvoiced([{ baseId: d.id, baseLineId: b.id, quantity: 5 }], -1);
    const reopened = (await getDelivery(d.id))!;
    expect([reopened.status, reopened.closeDate, reopened.lines[1].invoicedQty]).toEqual(['Open', '', 0]);
  });

  it('a cancelled delivery stays cancelled when invoices move, and can be closed by hand', async () => {
    const d = await addDelivery(delivery([line()]), 1);
    const cancelled = await cancelDelivery(d);
    await applyInvoiced([{ baseId: d.id, baseLineId: d.lines[0].id, quantity: 1 }], 1);
    expect((await getDelivery(d.id))?.status).toBe('Cancelled');
    expect((await closeDelivery({ ...cancelled, status: 'Open' })).status).toBe('Closed');
  });
});

describe('delivering against an A/R reserve invoice', () => {
  async function reserveInvoice(docType: 'Item' | 'Service') {
    const riLine = newRiLine({ itemId: ITEM_ID, itemNo: item.itemNo, quantity: 4, warehouse: WH, unitPrice: 1000, taxCode: 'OVAT', openQtyForIt: 0, glAccount: docType === 'Service' ? '4031' : '' });
    return addReserveInvoice(
      {
        ...delivery([]), seriesId: 'ris-primary', docType, lines: [riLine], blockDunning: false, allowPartialDelivery: true, controlAccount: '1120',
        paymentBlock: false, maxCashDiscount: false, installments: 1, appliedAmount: 0, discountPct: 10, postingDate: '2026-06-15',
      } as never,
      1,
      { codes: SEED_TAX_CODES, withholding: [], items },
    );
  }

  it('moves the delivered share of the deferred revenue to revenue, and puts it back on cancel', async () => {
    const ri = await reserveInvoice('Item');
    const rl = ri.lines[0];
    const dn = await addDelivery(delivery([line({ quantity: 2, riId: ri.id, riLineId: rl.id }), line({ riId: ri.id, riLineId: 'gone' })]), 1);
    const je = (await listJournalEntries()).find((e) => e.originId === dn.id && e.origin === 'DN')!;
    expect(je.lines.find((l) => l.account === '2165')?.debit).toBe(1800); // 4,000 × 90% × 2/4
    expect(je.lines.reduce((n, l) => n + (l.debit || 0) - (l.credit || 0), 0)).toBeCloseTo(0, 2);
    expect((await cancelDelivery(dn)).status).toBe('Cancelled');
  });

  it('a service reserve invoice recognizes to its line\'s G/L account', async () => {
    const ri = await reserveInvoice('Service');
    const dn = await addDelivery(delivery([line({ quantity: 1, riId: ri.id, riLineId: ri.lines[0].id })]), 1);
    const je = (await listJournalEntries()).find((e) => e.originId === dn.id && e.origin === 'DN')!;
    expect(je.lines.find((l) => l.account === '4031')?.credit).toBe(900);
  });
});
