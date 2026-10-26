/**
 * End-to-end unit tests for the sales posting services: the real add / post / save / cancel / copy
 * functions, not just the pure footer totals (covered by salesTotals-style tests elsewhere).
 *
 * Strategy: each test builds its own Open sales order from a well-stocked FIFO accessory item via
 * the real `saveSalesOrder`, then exercises the downstream document services, asserting the
 * DOCUMENTED, observable effects — item stock, SO delivered/open quantities, document status,
 * invoice balances, and that every posted journal entry balances.
 *
 * Isolation: collections hold module-level state across tests in a file, so every test resets the
 * collections it touches first and reads the live rows it needs through the services' list/get.
 */
import { describe, expect, it } from 'vitest';

import { SEED_ITEMS, mergedItems } from '../../mocks/items';
import { SEED_PARTNERS } from '../../mocks/partners';
import { SEED_TAX_CODES, rateFrom } from '../../mocks/taxes';
import { SEED_TAX } from '../withholding';

import { blankSalesOrder, newSoLine, type SalesOrder, type SoLine } from '../../mocks/salesOrders';
import { getSalesOrder, openQty as soOpenQty, saveSalesOrder } from '../salesOrders';

import { newDnLine, type Delivery } from '../../mocks/deliveries';
import { addDelivery, cancelDelivery, dnOpenQty, getDelivery } from '../deliveries';

import { newArLine } from '../../mocks/arInvoices';
import { addArInvoice, arAmounts, cancelArInvoice, getArInvoice, type ArWithholding } from '../arInvoices';

import { newRiLine } from '../../mocks/reserveInvoices';
import { addReserveInvoice, cancelReserveInvoice } from '../reserveInvoices';

import { newSrLine } from '../../mocks/salesReturns';
import { addSalesReturn, srOpenQty } from '../salesReturns';

import { newArCmLine } from '../../mocks/arCreditMemos';
import { addArCreditMemo, type ArInvoiceBalances } from '../arCreditMemos';

import { blankBlanketAgreement, newBaLine } from '../../mocks/blanketAgreements';
import { baTotals, getBlanketAgreement, openQty as baOpenQty } from '../blanketAgreements';

import { customerWithholding } from '../withholding';
import { listItems } from '../items';
import { listJournalEntries } from '../journalEntries';

// ── Shared fixtures ────────────────────────────────────────────────────────────

const OWNER = 'emp-001';
/** A FIFO accessory with plenty of uncommitted stock in WH-001 (ACC-PWR20). */
const ITEM_ID = 'apl-0361';
const WAREHOUSE = 'WH-001';
/** A Company that is a top withholding agent → 1% EWT on goods. */
const CUSTOMER_ID = 'bp-002';
const RATE_OF = rateFrom(SEED_TAX_CODES, '2026-06-15');
const CODES = SEED_TAX_CODES;

const mItems = mergedItems(SEED_ITEMS);
const seedItem = mItems.find((i) => i.id === ITEM_ID)!;
const customer = SEED_PARTNERS.find((p) => p.id === CUSTOMER_ID)!;

/** Live in-stock for ITEM_ID in WAREHOUSE, read through the items service. */
async function stockOf(itemId = ITEM_ID, warehouse = WAREHOUSE): Promise<number> {
  const items = await listItems();
  const it = items.find((i) => i.id === itemId)!;
  return it.warehouses.find((w) => w.code === warehouse)?.inStock ?? 0;
}

/** Build and post an Open sales order with a single line of `qty` of ITEM_ID. */
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
  const input = {
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
  };
  return saveSalesOrder(input);
}

/** A delivery copied from a sales order line, shipping `qty`. */
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
  };
}

/** Assert a posted journal entry for an originId exists and balances. Returns that entry. */
async function balancedEntryFor(originId: string, origin: string) {
  const entries = await listJournalEntries();
  const je = entries.find((e) => e.originId === originId && e.origin === origin && e.status === 'Posted');
  expect(je, `expected a ${origin} journal entry for ${originId}`).toBeTruthy();
  const debit = je!.lines.reduce((n, l) => n + (l.debit || 0), 0);
  const credit = je!.lines.reduce((n, l) => n + (l.credit || 0), 0);
  expect(Math.round((debit - credit) * 100) / 100).toBe(0);
  return je!;
}

// ── Deliveries ──────────────────────────────────────────────────────────────────

describe('addDelivery', () => {
  it('moves stock out, marks the SO line delivered, and posts a balanced COGS/Inventory entry', async () => {
    const before = await stockOf();
    const so = await makeOrder(4);
    const line = so.lines[0];

    const saved = await addDelivery(deliveryFromOrder(so, line, 4), 1);

    expect(saved.status).toBe('Open');
    expect(saved.docNum).toBeGreaterThan(0);
    // Stock left the warehouse.
    expect(await stockOf()).toBe(before - 4);
    // The SO line counts it as delivered and the line/order closed (fully delivered).
    const soAfter = await getSalesOrder(so.id);
    expect(soAfter!.lines[0].deliveredQty).toBe(4);
    expect(soAfter!.status).toBe('Closed');
    expect(soOpenQty(soAfter!.lines[0])).toBe(0);
    // The posting moved cost: Dr COGS / Cr Inventory, balanced.
    const je = await balancedEntryFor(saved.id, 'DN');
    expect(je.lines.length).toBeGreaterThanOrEqual(2);
    // The delivery line carries the FIFO cost it went out at.
    expect(saved.lines[0].unitCostLc).toBeGreaterThan(0);
  });

  it('on a partial delivery the SO stays Open with the remainder open', async () => {
    const so = await makeOrder(6, { quantity: 6 });
    const saved = await addDelivery(deliveryFromOrder(so, so.lines[0], 4), 1);

    expect(saved.status).toBe('Open');
    const soAfter = await getSalesOrder(so.id);
    expect(soAfter!.lines[0].deliveredQty).toBe(4);
    expect(soOpenQty(soAfter!.lines[0])).toBe(2);
    expect(soAfter!.status).toBe('Open');
    // Each delivery line still has its full quantity left to invoice while Open.
    expect(dnOpenQty(saved.lines[0], saved)).toBe(4);
  });

  it('cancelDelivery puts the stock back, reopens the SO line, and reverses the entry', async () => {
    const before = await stockOf();
    const so = await makeOrder(5);
    const dn = await addDelivery(deliveryFromOrder(so, so.lines[0], 5), 1);
    expect(await stockOf()).toBe(before - 5);

    const cancelled = await cancelDelivery(dn);
    expect(cancelled.status).toBe('Cancelled');
    // Stock back to where it started.
    expect(await stockOf()).toBe(before);
    // The SO line reopened.
    const soAfter = await getSalesOrder(so.id);
    expect(soAfter!.lines[0].deliveredQty).toBe(0);
    expect(soAfter!.status).toBe('Open');
    // A reversing entry now exists for the delivery (the original is Reversed).
    const entries = await listJournalEntries();
    const original = entries.find((e) => e.originId === dn.id && e.origin === 'DN' && !e.reverses);
    expect(original!.status).toBe('Reversed');
    expect(entries.some((e) => e.reverses === original!.id)).toBe(true);
  });
});

// ── A/R invoices ────────────────────────────────────────────────────────────────

describe('addArInvoice', () => {
  it('numbers and opens a standalone invoice, ships its stock, and stamps withholding', async () => {
    const before = await stockOf();
    const line = newArLine({
      itemId: ITEM_ID,
      itemNo: seedItem.itemNo,
      description: seedItem.name,
      quantity: 5,
      warehouse: WAREHOUSE,
      unitPrice: 2000,
      taxCode: 'OVAT',
      wtaxLiable: true,
      baseType: '',
    });
    const input = {
      customerId: CUSTOMER_ID,
      customerCode: customer.code,
      customerName: customer.name,
      contactId: '',
      customerRef: '',
      currency: 'PHP',
      seriesId: 'ars-primary',
      docNum: 0,
      status: 'Draft' as const,
      postingDate: '2026-06-15',
      dueDate: '2026-07-15',
      documentDate: '2026-06-15',
      closeDate: '',
      docType: 'Item' as const,
      lines: [line],
      shipTo: '',
      billTo: '',
      shippingType: '',
      language: 'English',
      trackingNo: '',
      blockDunning: false,
      bpChannelName: '',
      bpChannelContact: '',
      journalRemark: 'A/R Invoices – test',
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
    };
    const withholding: ArWithholding[] = customerWithholding(
      { ...input, lines: [{ ...line }] },
      customer,
      mItems,
      RATE_OF,
      SEED_TAX,
    );

    const saved = await addArInvoice(input, 1, { codes: CODES, withholding });

    expect(saved.status).toBe('Open');
    expect(saved.docNum).toBeGreaterThan(0);
    // Standalone stocked invoice ships its own stock.
    expect(await stockOf()).toBe(before - 5);
    // Withholding was stamped (1% EWT on a Company top-agent).
    expect(saved.withholdingSummary).toEqual(withholding);
    expect(saved.withholdingSummary!.reduce((n, w) => n + w.amount, 0)).toBeCloseTo(100, 2);
    // Balanced A/R + revenue + VAT + COGS/Inventory entry.
    await balancedEntryFor(saved.id, 'IN');
  });

  it('invoicing a delivery in full closes the delivery (invoicedQty up) and the SO', async () => {
    const so = await makeOrder(4);
    const dn = await addDelivery(deliveryFromOrder(so, so.lines[0], 4), 1);
    const dl = dn.lines[0];
    const stockAfterDelivery = await stockOf();

    const arLine = newArLine({
      itemId: dl.itemId,
      itemNo: dl.itemNo,
      description: dl.description,
      quantity: 4,
      warehouse: dl.warehouse,
      itemsPerUnit: dl.itemsPerUnit,
      unitPrice: dl.unitPrice,
      taxCode: dl.taxCode,
      unitCostLc: dl.unitCostLc,
      baseType: 'DN',
      baseId: dn.id,
      baseLineId: dl.id,
      baseRow: 1,
    });
    const input = {
      customerId: CUSTOMER_ID,
      customerCode: customer.code,
      customerName: customer.name,
      contactId: '',
      customerRef: '',
      currency: 'PHP',
      seriesId: 'ars-primary',
      docNum: 0,
      status: 'Draft' as const,
      postingDate: '2026-06-17',
      dueDate: '2026-07-17',
      documentDate: '2026-06-17',
      closeDate: '',
      docType: 'Item' as const,
      lines: [arLine],
      shipTo: '',
      billTo: '',
      shippingType: '',
      language: 'English',
      trackingNo: '',
      blockDunning: false,
      bpChannelName: '',
      bpChannelContact: '',
      journalRemark: 'A/R Invoices – test',
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
    } as Parameters<typeof addArInvoice>[0];

    const saved = await addArInvoice(input, 1, { codes: CODES, withholding: [] });

    expect(saved.status).toBe('Open');
    // A DN-sourced line does NOT ship stock again (the delivery already did).
    expect(await stockOf()).toBe(stockAfterDelivery);
    // The delivery is now billed in full → Closed.
    const dnAfter = await getDelivery(dn.id);
    expect(dnAfter!.lines[0].invoicedQty).toBe(4);
    expect(dnAfter!.status).toBe('Closed');
  });

  it('cancelArInvoice restores shipped stock and reverses the entry', async () => {
    const before = await stockOf();
    const line = newArLine({
      itemId: ITEM_ID,
      itemNo: seedItem.itemNo,
      quantity: 3,
      warehouse: WAREHOUSE,
      unitPrice: 2000,
      taxCode: 'OVAT',
      baseType: '',
    });
    const input = {
      customerId: CUSTOMER_ID,
      customerCode: customer.code,
      customerName: customer.name,
      contactId: '',
      customerRef: '',
      currency: 'PHP',
      seriesId: 'ars-primary',
      docNum: 0,
      status: 'Draft' as const,
      postingDate: '2026-06-15',
      dueDate: '2026-07-15',
      documentDate: '2026-06-15',
      closeDate: '',
      docType: 'Item' as const,
      lines: [line],
      shipTo: '',
      billTo: '',
      shippingType: '',
      language: 'English',
      trackingNo: '',
      blockDunning: false,
      bpChannelName: '',
      bpChannelContact: '',
      journalRemark: 'A/R Invoices – test',
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
    };
    const saved = await addArInvoice(input, 1, { codes: CODES, withholding: [] });
    expect(await stockOf()).toBe(before - 3);

    const cancelled = await cancelArInvoice(saved);
    expect(cancelled.status).toBe('Cancelled');
    expect(await stockOf()).toBe(before);
    const entries = await listJournalEntries();
    const original = entries.find((e) => e.originId === saved.id && e.origin === 'IN' && !e.reverses);
    expect(original!.status).toBe('Reversed');
  });
});

// ── Incoming payments ─────────────────────────────────────────────────────────

describe('addIncomingPayment', () => {
  it('settles an invoice to zero (closing it) and reopens it on cancel', async () => {
    // Build a standalone invoice, no withholding, so the due amount equals total.
    const line = newArLine({
      itemId: ITEM_ID,
      itemNo: seedItem.itemNo,
      quantity: 2,
      warehouse: WAREHOUSE,
      unitPrice: 2000,
      taxCode: 'OVAT',
      baseType: '',
    });
    const invInput = {
      customerId: CUSTOMER_ID,
      customerCode: customer.code,
      customerName: customer.name,
      contactId: '',
      customerRef: '',
      currency: 'PHP',
      seriesId: 'ars-primary',
      docNum: 0,
      status: 'Draft' as const,
      postingDate: '2026-06-15',
      dueDate: '2026-07-15',
      documentDate: '2026-06-15',
      closeDate: '',
      docType: 'Item' as const,
      lines: [line],
      shipTo: '',
      billTo: '',
      shippingType: '',
      language: 'English',
      trackingNo: '',
      blockDunning: false,
      bpChannelName: '',
      bpChannelContact: '',
      journalRemark: 'A/R Invoices – test',
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
    };
    const inv = await addArInvoice(invInput, 1, { codes: CODES, withholding: [] });
    const octx = { customers: SEED_PARTNERS, items: mItems, codes: CODES };
    const due = arAmounts(inv, customer, mItems, CODES).due; // 2*2000 + 12% VAT = 4480

    const { addIncomingPayment, cancelIncomingPayment } = await import('../incomingPayments');

    const row = {
      id: `${inv.id}-1`,
      invoiceId: inv.id,
      docNo: '',
      installment: 0,
      installments: 1,
      docDate: inv.postingDate,
      dueDate: inv.dueDate,
      total: due,
      balanceDue: due,
      amount: due,
      wtAmount: 0,
      blocked: false,
      cashDiscountPct: 0,
      invoiceFx: 1,
      controlAccount: '1120',
      projectId: '',
      selected: true,
    };
    const payInput = {
      customerId: CUSTOMER_ID,
      type: 'Customer' as const,
      currency: 'PHP',
      seriesId: 'rcs-primary',
      docNum: 0,
      status: 'Draft' as const,
      postingDate: '2026-06-20',
      dueDate: '2026-06-20',
      documentDate: '2026-06-20',
      cancelDate: '',
      reference: '',
      journalRemark: 'Incoming – test',
      controlAccount: '1120',
      rows: [row],
      accountRows: [],
      onAccount: 0,
      means: {
        transfer: { account: '1021', amount: due, date: '2026-06-20', reference: '' },
        cash: { account: '', amount: 0 },
        checks: [],
        cards: [],
        checkAccount: '1012',
        cardAccount: '1013',
      },
      projectId: '',
      transNo: 0,
      attachments: [],
      ownerId: OWNER,
      remarks: '',
      fxRate: 1,
      approved: true,
    } as unknown as Parameters<typeof addIncomingPayment>[0];

    const pay = await addIncomingPayment(payInput, 1, octx);
    expect(pay.status).toBe('Posted');

    // The invoice is paid in full and closed.
    const invPaid = await getArInvoice(inv.id);
    expect(invPaid!.appliedAmount).toBeCloseTo(due, 2);
    expect(invPaid!.status).toBe('Closed');
    expect(arAmounts(invPaid!, customer, mItems, CODES).balanceDue).toBeCloseTo(0, 2);

    // Cancelling the payment restores the balance and reopens the invoice.
    const cancelled = await cancelIncomingPayment(pay, 'current', octx);
    expect(cancelled.status).toBe('Cancelled');
    const invBack = await getArInvoice(inv.id);
    expect(invBack!.appliedAmount).toBeCloseTo(0, 2);
    expect(invBack!.status).toBe('Open');
  });
});

// ── Reserve invoices ─────────────────────────────────────────────────────────

describe('addReserveInvoice', () => {
  it('opens and posts A/R + revenue but does NOT move stock; openQtyForIt = quantity', async () => {
    const before = await stockOf();
    const line = newRiLine({
      itemId: ITEM_ID,
      itemNo: seedItem.itemNo,
      quantity: 3,
      warehouse: WAREHOUSE,
      unitPrice: 2000,
      taxCode: 'OVAT',
      openQtyForIt: 0,
    });
    const input = {
      customerId: CUSTOMER_ID,
      customerCode: customer.code,
      customerName: customer.name,
      contactId: '',
      customerRef: '',
      currency: 'PHP',
      seriesId: 'ris-primary',
      docNum: 0,
      status: 'Draft' as const,
      postingDate: '2026-06-15',
      dueDate: '2026-07-15',
      documentDate: '2026-06-15',
      closeDate: '',
      docType: 'Item' as const,
      lines: [line],
      shipTo: '',
      billTo: '',
      shippingType: '',
      language: 'English',
      trackingNo: '',
      blockDunning: false,
      bpChannelName: '',
      bpChannelContact: '',
      allowPartialDelivery: true,
      journalRemark: 'Reserve Invoices – test',
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
    };

    const saved = await addReserveInvoice(input, 1, { codes: CODES, withholding: [], items: mItems });

    expect(saved.status).toBe('Open');
    expect(saved.docNum).toBeGreaterThan(0);
    // No stock movement — inventory relief waits for a delivery.
    expect(await stockOf()).toBe(before);
    // Every line is fully open for delivery.
    expect(saved.lines[0].openQtyForIt).toBe(3);
    // A balanced A/R + revenue + VAT entry (no inventory lines).
    const je = await balancedEntryFor(saved.id, 'RI');
    expect(je.lines.some((l) => l.account === '1340')).toBe(false); // no shipped-goods relief

    // Cancel reverses the entry (no stock to restore).
    const cancelled = await cancelReserveInvoice(saved);
    expect(cancelled.status).toBe('Cancelled');
    expect(await stockOf()).toBe(before);
    const entries = await listJournalEntries();
    const original = entries.find((e) => e.originId === saved.id && e.origin === 'RI' && !e.reverses);
    expect(original!.status).toBe('Reversed');
  });
});

// ── Sales return → A/R credit memo ────────────────────────────────────────────

describe('sales return and A/R credit memo', () => {
  it('a return brings stock back; the credit memo from it reduces the invoice open amount', async () => {
    const start = await stockOf();

    // Order → deliver 6 → invoice 4 (invoice Open with a balance; 2 left un-invoiced on the DN to return).
    const so = await makeOrder(6, { quantity: 6 });
    const dn = await addDelivery(deliveryFromOrder(so, so.lines[0], 6), 1);
    const dl = dn.lines[0];
    const arLine = newArLine({
      itemId: dl.itemId,
      itemNo: dl.itemNo,
      description: dl.description,
      quantity: 4,
      warehouse: dl.warehouse,
      itemsPerUnit: dl.itemsPerUnit,
      unitPrice: dl.unitPrice,
      taxCode: dl.taxCode,
      unitCostLc: dl.unitCostLc,
      baseType: 'DN',
      baseId: dn.id,
      baseLineId: dl.id,
      baseRow: 1,
    });
    const inv = await addArInvoice(
      {
        customerId: CUSTOMER_ID,
        customerCode: customer.code,
        customerName: customer.name,
        contactId: '',
        customerRef: '',
        currency: 'PHP',
        seriesId: 'ars-primary',
        docNum: 0,
        status: 'Draft',
        postingDate: '2026-06-17',
        dueDate: '2026-07-17',
        documentDate: '2026-06-17',
        closeDate: '',
        docType: 'Item',
        lines: [arLine],
        shipTo: '',
        billTo: '',
        shippingType: '',
        language: 'English',
        trackingNo: '',
        blockDunning: false,
        bpChannelName: '',
        bpChannelContact: '',
        journalRemark: 'A/R Invoices – test',
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
      },
      1,
      { codes: CODES, withholding: [] },
    );
    const invBalanceBefore = arAmounts(inv, customer, mItems, CODES).balanceDue;
    const afterInvoiceStock = await stockOf();
    expect(afterInvoiceStock).toBe(start - 6); // delivery shipped 6 (DN-sourced invoice ships no stock)

    // Sales return of 2 from the delivery — stock comes back in.
    const srLine = newSrLine({
      itemId: dl.itemId,
      itemNo: dl.itemNo,
      description: dl.description,
      quantity: 2,
      warehouse: dl.warehouse,
      itemsPerUnit: dl.itemsPerUnit,
      unitPrice: dl.unitPrice,
      taxCode: dl.taxCode,
      baseType: 'DN',
      baseId: dn.id,
      baseLineId: dl.id,
      baseRow: 1,
    });
    const sr = await addSalesReturn(
      {
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
        lines: [srLine],
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
      } as Parameters<typeof addSalesReturn>[0],
      1,
    );

    expect(sr.status).toBe('Open');
    expect(await stockOf()).toBe(afterInvoiceStock + 2); // 2 came back in
    await balancedEntryFor(sr.id, 'SR');
    expect(srOpenQty(sr.lines[0], sr)).toBe(2);

    // A/R credit memo copied from the invoice, crediting 2 — reduces the invoice balance.
    const cmLine = newArCmLine({
      itemId: dl.itemId,
      itemNo: dl.itemNo,
      description: dl.description,
      quantity: 2,
      warehouse: dl.warehouse,
      itemsPerUnit: dl.itemsPerUnit,
      unitPrice: dl.unitPrice,
      taxCode: dl.taxCode,
      unitCostLc: dl.unitCostLc,
      baseType: 'ARIN',
      baseId: inv.id,
      baseLineId: inv.lines[0].id,
      baseRow: 1,
      invoiceId: inv.id,
      returnGoods: false, // stock already came back on the return
    });
    const creditValue = 2 * 2000 * 1.12; // net + 12% VAT = 4480
    const balances: ArInvoiceBalances = new Map([
      [inv.id, { docNo: 'SI', balance: invBalanceBefore, total: invBalanceBefore }],
    ]);
    const memo = await addArCreditMemo(
      {
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
        lines: [cmLine],
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
      } as Parameters<typeof addArCreditMemo>[0],
      1,
      creditValue,
      balances,
    );

    // The credit was applied to the invoice, reducing its open amount by the credit value.
    expect(memo.appliedAmount).toBeCloseTo(creditValue, 2);
    const invAfter = await getArInvoice(inv.id);
    expect(invAfter!.appliedAmount).toBeCloseTo(creditValue, 2);
    expect(arAmounts(invAfter!, customer, mItems, CODES).balanceDue).toBeCloseTo(invBalanceBefore - creditValue, 2);
  });
});

// ── Blanket agreements ─────────────────────────────────────────────────────────

describe('blanket-agreement commitments', () => {
  it('recompute committed/cumulative as linked orders open and close', async () => {
    // A fresh approved agreement for one item, 20 planned.
    const baLine = newBaLine({
      itemId: ITEM_ID,
      itemNo: seedItem.itemNo,
      description: seedItem.name,
      itemGroupId: seedItem.itemGroupId,
      plannedQty: 20,
      unitPrice: 2000,
    });
    const { saveBlanketAgreement, recalculateBACommitments } = await import('../blanketAgreements');
    const ba = await saveBlanketAgreement({
      ...blankBlanketAgreement(OWNER),
      customerId: CUSTOMER_ID,
      customerCode: customer.code,
      customerName: customer.name,
      currency: 'PHP',
      status: 'Approved',
      startDate: '2026-06-01',
      lines: [baLine],
    });
    const baId = ba.id;
    const baLineId = ba.lines[0].id;

    // Link an Open sales order line to the agreement → committed moves to its quantity.
    const so = await makeOrder(6, { agreementId: baId, agreementLineId: baLineId });
    // saveSalesOrder recalculates commitments for referenced BAs automatically.
    const after = await getBlanketAgreement(baId);
    expect(after!.lines[0].cumulativeCommittedQty).toBe(6);
    expect(after!.lines[0].cumulativeCommittedAmountLC).toBeCloseTo(6 * 2000, 2);
    expect(after!.lines[0].cumulativeQty).toBe(0);
    expect(baOpenQty(after!.lines[0])).toBe(20); // openQty = planned - cumulative(0)

    // Deliver the order in full → SO closes, its line closes → committed → cumulative.
    await addDelivery(deliveryFromOrder(so, so.lines[0], 6), 1);
    await recalculateBACommitments([baId]);
    const done = await getBlanketAgreement(baId);
    expect(done!.lines[0].cumulativeCommittedQty).toBe(0);
    expect(done!.lines[0].cumulativeQty).toBe(6);
    expect(done!.lines[0].cumulativeAmountLC).toBeCloseTo(6 * 2000, 2);
    expect(baOpenQty(done!.lines[0])).toBe(14);

    const totals = baTotals(done!);
    expect(totals.plannedTotal).toBeCloseTo(20 * 2000, 2);
    expect(totals.cumulativeTotal).toBeCloseTo(6 * 2000, 2);
  });
});
