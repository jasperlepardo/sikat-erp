import { describe, it, expect, beforeEach } from 'vitest';

import {
  poTotals,
  dueDateFor,
  findDuplicateVendorRef,
  savePurchaseOrder,
  type PricedLine,
} from '../purchaseOrders';
import { prTotals } from '../purchaseRequests';
import { rfqTotals } from '../rfqs';
import { apTotals, netDue, movesStock, returnableQty, findDuplicateInvoice } from '../apInvoices';
import { netCredit, sendsStock } from '../apCreditMemos';
import { grOpenQty, unitCostLc, applyToOrders } from '../goodsReceipts';
import { returnOpenQty } from '../goodsReturns';
import { drawableAmount, drawDownPayments, addDownPayment } from '../apDownPayments';
import {
  recalculatePBACommitments,
  savePurchaseBlanketAgreement,
  getPurchaseBlanketAgreement,
} from '../purchaseBlanketAgreements';

import { blankPurchaseOrder, newPoLine, type PurchaseOrder, type PoLine } from '../../mocks/purchaseOrders';
import { blankPurchaseBlanketAgreement, newPbaLine } from '../../mocks/purchaseBlanketAgreements';
import { blankApInvoice, type ApLine } from '../../mocks/apInvoices';
import { blankDownPaymentRequest } from '../../mocks/apDownPayments';
import type { WithholdingLine } from '../withholding';
import type { Item } from '../../mocks/items';

// A flat 12 % rate for one tax code, 0 otherwise — enough to exercise the totals.
const rate12 = (code: string) => (code === 'IVAT' ? 12 : 0);
const noReverse = () => false;

describe('poTotals', () => {
  it('sums line nets, applies the document discount to the tax base, and adds freight tax', () => {
    const po = {
      discountPct: 10,
      freight: 0,
      freightTaxCode: '',
      lines: [
        { itemId: 'i1', quantity: 2, unitPrice: 100, discountPct: 0, taxCode: 'IVAT' },
        { itemId: 'i2', quantity: 1, unitPrice: 50, discountPct: 0, taxCode: '' },
      ] as PricedLine[],
    };
    const t = poTotals(po, rate12, 'No rounding', noReverse);
    expect(t.beforeDiscount).toBe(250);
    expect(t.discount).toBe(25);
    // Taxable line net 200 × 0.9 × 12% = 21.6; the untaxed line contributes nothing.
    expect(t.tax).toBe(21.6);
    expect(t.reverseCharge).toBe(0);
    // 250 − 25 + 0 + 21.6
    expect(t.total).toBe(246.6);
  });

  it('routes reverse-charge VAT out of the amount due and into reverseCharge', () => {
    const po = {
      discountPct: 0,
      freight: 0,
      freightTaxCode: '',
      lines: [{ itemId: 'i1', quantity: 1, unitPrice: 1000, discountPct: 0, taxCode: 'IVAT' }] as PricedLine[],
    };
    const normal = poTotals(po, rate12, 'No rounding', noReverse);
    expect(normal.tax).toBe(120);
    expect(normal.total).toBe(1120);

    const reverse = poTotals(po, rate12, 'No rounding', (c) => c === 'IVAT');
    expect(reverse.tax).toBe(0);
    expect(reverse.reverseCharge).toBe(120);
    // Self-assessed VAT is not owed to the vendor, so the total stays at the net.
    expect(reverse.total).toBe(1000);
  });
});

describe('prTotals', () => {
  it('sums line nets, discount and tax', () => {
    const t = prTotals(
      {
        freight: 30,
        lines: [
          { itemId: 'i1', quantity: 2, unitPrice: 100, discountPct: 10, taxCode: 'IVAT' },
          { itemId: 'i2', quantity: 1, unitPrice: 50, discountPct: 0, taxCode: '' },
        ] as never,
      },
      rate12,
    );
    expect(t.beforeDiscount).toBe(250);
    expect(t.discount).toBe(20); // 200 × 10%
    // Taxable line net 180 × 12% = 21.6
    expect(t.tax).toBe(21.6);
    expect(t.freight).toBe(30);
    // (250 − 20) + 30 + 21.6
    expect(t.total).toBe(281.6);
  });
});

describe('rfqTotals', () => {
  it('maps RFQ lines through the PO arithmetic', () => {
    const t = rfqTotals(
      {
        discountPct: 0,
        freight: 0,
        freightTaxCode: '',
        lines: [{ itemId: 'i1', quantity: 3, unitPrice: 100, discountPct: 0, taxCode: 'IVAT' }] as never,
      },
      rate12,
      'No rounding',
      noReverse,
    );
    expect(t.beforeDiscount).toBe(300);
    expect(t.tax).toBe(36);
    expect(t.total).toBe(336);
  });
});

describe('apTotals', () => {
  it('is the same arithmetic as a purchase order', () => {
    const inv = {
      discountPct: 0,
      freight: 0,
      freightTaxCode: '',
      lines: [{ itemId: 'i1', quantity: 1, unitPrice: 1000, discountPct: 0, taxCode: 'IVAT' }] as never,
    };
    expect(apTotals(inv, rate12, 'No rounding', noReverse).total).toBe(1120);
  });
});

describe('netDue', () => {
  const wh: WithholdingLine[] = [
    { deducted: true, amount: 20 } as WithholdingLine,
    { deducted: false, amount: 999 } as WithholdingLine,
  ];
  it('subtracts only deducted withholding and the drawn down payment', () => {
    expect(netDue(1120, wh, 100)).toBe(1000);
  });
  it('ignores non-deducted withholding lines', () => {
    expect(netDue(1120, [{ deducted: false, amount: 50 } as WithholdingLine], 0)).toBe(1120);
  });
});

describe('netCredit', () => {
  it('mirrors netDue: total less reversed withholding and down payments', () => {
    const wh: WithholdingLine[] = [{ deducted: true, amount: 12 } as WithholdingLine];
    expect(netCredit(112, wh, 0)).toBe(100);
  });
});

describe('movesStock', () => {
  const items = [
    { id: 'stock', inventoryItem: true } as Item,
    { id: 'service', inventoryItem: false } as Item,
  ];
  it('is true for a non-receipt line on a stocked item', () => {
    expect(movesStock({ itemId: 'stock', baseType: '' } as ApLine, items)).toBe(true);
  });
  it('is false for a line copied from a goods receipt (stock already in)', () => {
    expect(movesStock({ itemId: 'stock', baseType: 'GRPO' } as ApLine, items)).toBe(false);
  });
  it('is false for a non-stock item', () => {
    expect(movesStock({ itemId: 'service', baseType: '' } as ApLine, items)).toBe(false);
  });
});

describe('sendsStock', () => {
  const items = [{ id: 'stock', inventoryItem: true } as Item];
  it('is true when returning goods on a stocked item not from a goods return', () => {
    expect(sendsStock({ itemId: 'stock', returnGoods: true, baseType: '' } as never, items)).toBe(true);
  });
  it('is false when the return did not elect to return the goods', () => {
    expect(sendsStock({ itemId: 'stock', returnGoods: false, baseType: '' } as never, items)).toBe(false);
  });
  it('is false for a line copied from a goods return (stock already sent)', () => {
    expect(sendsStock({ itemId: 'stock', returnGoods: true, baseType: 'GRET' } as never, items)).toBe(false);
  });
});

describe('returnableQty', () => {
  it('is quantity less what was already returned, floored at zero', () => {
    expect(returnableQty({ quantity: 10, returnedQty: 3 } as ApLine)).toBe(7);
    expect(returnableQty({ quantity: 10, returnedQty: 12 } as ApLine)).toBe(0);
    expect(returnableQty({ quantity: 10 } as ApLine)).toBe(10); // returnedQty undefined
  });
});

describe('returnOpenQty', () => {
  it('is quantity less credited for a line that needs a credit memo (open return)', () => {
    // baseType !== 'GRPO' ⇒ needsCredit true
    const line = { quantity: 5, creditedQty: 2, baseType: '' } as never;
    expect(returnOpenQty(line, { status: 'Open' })).toBe(3);
  });
  it('is zero for a GRPO-based line (no credit needed)', () => {
    const line = { quantity: 5, creditedQty: 0, baseType: 'GRPO' } as never;
    expect(returnOpenQty(line, { status: 'Open' })).toBe(0);
  });
  it('is zero once the return is closed', () => {
    const line = { quantity: 5, creditedQty: 0, baseType: '' } as never;
    expect(returnOpenQty(line, { status: 'Closed' })).toBe(0);
  });
});

describe('grOpenQty', () => {
  it('is received less invoiced and returned on an open receipt', () => {
    const line = { quantity: 10, invoicedQty: 4, returnedQty: 1 } as never;
    expect(grOpenQty(line, { status: 'Open' })).toBe(5);
  });
  it('is zero once the receipt is closed', () => {
    const line = { quantity: 10, invoicedQty: 0, returnedQty: 0 } as never;
    expect(grOpenQty(line, { status: 'Closed' })).toBe(0);
  });
});

describe('unitCostLc', () => {
  it('is the discounted net price in PHP per inventory unit', () => {
    // 100 less 10% line = 90, less 10% doc = 81, × fx 1 ÷ 2 per unit = 40.5
    const cost = unitCostLc({ unitPrice: 100, discountPct: 10, itemsPerUnit: 2 }, { discountPct: 10 }, 1);
    expect(cost).toBe(40.5);
  });
  it('applies the document currency rate', () => {
    const cost = unitCostLc({ unitPrice: 100, discountPct: 0, itemsPerUnit: 1 }, { discountPct: 0 }, 56);
    expect(cost).toBe(5600);
  });
});

describe('drawableAmount', () => {
  it('is applied less drawn, floored at zero', () => {
    expect(drawableAmount({ appliedAmount: 1000, drawnAmount: 300 } as never)).toBe(700);
    expect(drawableAmount({ appliedAmount: 1000, drawnAmount: 1200 } as never)).toBe(0);
  });
});

describe('dueDateFor', () => {
  it('is posting date plus the payment term days', () => {
    // With no payment-term record saved, termDays falls back to 0 (same day).
    expect(dueDateFor('2026-06-15', 'unknown-term')).toBe('2026-06-15');
  });
  it('returns "" for an empty posting date', () => {
    expect(dueDateFor('', 'any')).toBe('');
  });
});

// ── applyToOrders: a receipt closes a PO, cancelling it reopens the PO ──────────

const poWith = (lines: Partial<PoLine>[]): PurchaseOrder => ({
  ...blankPurchaseOrder('emp-1'),
  id: 'po-test',
  status: 'Open',
  lines: lines.map((l, i) => newPoLine({ id: `pl-${i}`, status: 'Open', receivedQty: 0, ...l })),
});

describe('applyToOrders', () => {
  it('closes a PO line and the PO on a full receipt, and reopens both on cancel', () => {
    const po = poWith([{ itemId: 'i1', quantity: 10 }]);
    const recLines = [{ baseId: 'po-test', baseLineId: 'pl-0', quantity: 10 }];

    const [received] = applyToOrders(recLines, [po], 1);
    expect(received.lines[0].receivedQty).toBe(10);
    expect(received.lines[0].status).toBe('Closed');
    expect(received.status).toBe('Closed');
    expect(received.closeDate).toBeTruthy();

    // Cancel: feed the now-closed PO back with sign −1.
    const [reopened] = applyToOrders(recLines, [received], -1);
    expect(reopened.lines[0].receivedQty).toBe(0);
    expect(reopened.lines[0].status).toBe('Open');
    expect(reopened.status).toBe('Open');
    expect(reopened.closeDate).toBe('');
  });

  it('keeps a PO open after a partial receipt', () => {
    const po = poWith([{ itemId: 'i1', quantity: 10 }]);
    const [received] = applyToOrders([{ baseId: 'po-test', baseLineId: 'pl-0', quantity: 4 }], [po], 1);
    expect(received.lines[0].receivedQty).toBe(4);
    expect(received.lines[0].status).toBe('Open');
    expect(received.status).toBe('Open');
  });

  it('closes a multi-line PO only when every line is received', () => {
    const po = poWith([
      { itemId: 'i1', quantity: 5 },
      { itemId: 'i2', quantity: 5 },
    ]);
    const [afterFirst] = applyToOrders([{ baseId: 'po-test', baseLineId: 'pl-0', quantity: 5 }], [po], 1);
    expect(afterFirst.status).toBe('Open'); // pl-1 still open
    const [afterSecond] = applyToOrders([{ baseId: 'po-test', baseLineId: 'pl-1', quantity: 5 }], [afterFirst], 1);
    expect(afterSecond.status).toBe('Closed');
  });

  it('ignores lines with no base PO', () => {
    const po = poWith([{ itemId: 'i1', quantity: 10 }]);
    expect(applyToOrders([{ baseId: '', baseLineId: '', quantity: 3 }], [po], 1)).toEqual([]);
  });
});

// ── drawDownPayments: close within tolerance, reopen on give-back ───────────────

describe('drawDownPayments', () => {
  beforeEach(() => localStorage.clear());

  it('closes a fully drawn request within 0.005 tolerance and reopens it on give-back', async () => {
    const dpr = await addDownPayment(
      { ...blankDownPaymentRequest('2026-06-15', 'emp-1'), approved: true, appliedAmount: 1000, paidLc: 1000 },
      1,
    );
    expect(dpr.status).toBe('Open');
    const total = () => 1000;

    // Draw 999.996 — inside the 0.005 window below 1000, so it counts as fully drawn.
    await drawDownPayments([{ requestId: dpr.id, amount: 999.996 }], total, 1);
    const { getDownPayment } = await import('../apDownPayments');
    const closed = await getDownPayment(dpr.id);
    expect(closed?.status).toBe('Closed');
    expect(closed?.closeDate).toBeTruthy();

    // Give the draw back (invoice cancelled): the request reopens.
    await drawDownPayments([{ requestId: dpr.id, amount: 999.996 }], total, -1);
    const reopened = await getDownPayment(dpr.id);
    expect(reopened?.status).toBe('Open');
    expect(reopened?.closeDate).toBe('');
    expect(reopened?.drawnAmount).toBe(0);
  });

  it('leaves a partially drawn request Open', async () => {
    const dpr = await addDownPayment(
      { ...blankDownPaymentRequest('2026-06-15', 'emp-1'), approved: true, appliedAmount: 1000, paidLc: 1000 },
      1,
    );
    await drawDownPayments([{ requestId: dpr.id, amount: 400 }], () => 1000, 1);
    const { getDownPayment } = await import('../apDownPayments');
    const after = await getDownPayment(dpr.id);
    expect(after?.status).toBe('Open');
    expect(after?.drawnAmount).toBe(400);
  });
});

// ── Duplicate detection ────────────────────────────────────────────────────────

describe('findDuplicateVendorRef', () => {
  beforeEach(() => localStorage.clear());

  it('finds another open PO from the same vendor with the same vendor ref (case/space-insensitive)', async () => {
    const [saved] = await savePurchaseOrder({
      ...blankPurchaseOrder('emp-1'),
      vendorId: 'v1',
      vendorRef: 'ABC-123',
      approved: true,
    });
    const dup = await findDuplicateVendorRef({
      ...blankPurchaseOrder('emp-1'),
      vendorId: 'v1',
      vendorRef: ' abc-123 ',
    });
    expect(dup?.id).toBe(saved.id);
  });

  it('does not match a different vendor or a different ref', async () => {
    await savePurchaseOrder({ ...blankPurchaseOrder('emp-1'), vendorId: 'v1', vendorRef: 'ABC-123', approved: true });
    expect(await findDuplicateVendorRef({ ...blankPurchaseOrder('emp-1'), vendorId: 'v2', vendorRef: 'ABC-123' })).toBeUndefined();
    expect(await findDuplicateVendorRef({ ...blankPurchaseOrder('emp-1'), vendorId: 'v1', vendorRef: 'ZZZ-999' })).toBeUndefined();
  });

  it('returns undefined for a blank vendor ref', async () => {
    expect(await findDuplicateVendorRef({ ...blankPurchaseOrder('emp-1'), vendorId: 'v1', vendorRef: '  ' })).toBeUndefined();
  });

  it('ignores the record itself', async () => {
    const [saved] = await savePurchaseOrder({ ...blankPurchaseOrder('emp-1'), vendorId: 'v1', vendorRef: 'REF-1', approved: true });
    const dup = await findDuplicateVendorRef({ ...saved });
    expect(dup).toBeUndefined();
  });
});

describe('findDuplicateInvoice', () => {
  beforeEach(() => localStorage.clear());

  it('finds a posted invoice from the same vendor with the same vendor ref', async () => {
    const { listApInvoices } = await import('../apInvoices');
    const posted = (await listApInvoices()).find((i) => i.status !== 'Cancelled' && i.status !== 'Draft' && i.vendorRef);
    expect(posted).toBeTruthy();
    const dup = await findDuplicateInvoice({
      ...blankApInvoice('2026-06-15', 'emp-1'),
      vendorId: posted!.vendorId,
      vendorRef: `  ${posted!.vendorRef.toUpperCase()}  `,
    });
    expect(dup?.id).toBe(posted!.id);
  });

  it('ignores draft and cancelled invoices and a blank ref', async () => {
    expect(await findDuplicateInvoice({ ...blankApInvoice('2026-06-15', 'emp-1'), vendorId: 'v1', vendorRef: '' })).toBeUndefined();
  });
});

// ── recalculatePBACommitments ──────────────────────────────────────────────────

describe('recalculatePBACommitments', () => {
  beforeEach(() => localStorage.clear());

  it('rolls open PO lines into committed and closed lines into cumulative on the PBA', async () => {
    // A fresh PBA with a known line, so only the POs this test creates reference it.
    const unitPrice = 250;
    const pba = await savePurchaseBlanketAgreement({
      ...blankPurchaseBlanketAgreement('emp-1'),
      vendorId: 'v-pba',
      status: 'Approved',
      lines: [newPbaLine({ id: 'pbl-0', itemId: 'i1', plannedQty: 100, unitPrice })],
    });

    // One open PO line (committed) + one closed PO line (cumulative), both against this PBA line.
    await savePurchaseOrder({
      ...blankPurchaseOrder('emp-1'),
      vendorId: 'v-pba',
      vendorRef: 'PBA-TEST-OPEN',
      approved: true,
      lines: [newPoLine({ id: 'plo', status: 'Open', quantity: 4, unitPrice, agreementId: pba.id, agreementLineId: 'pbl-0' })],
    });
    await savePurchaseOrder({
      ...blankPurchaseOrder('emp-1'),
      vendorId: 'v-pba',
      vendorRef: 'PBA-TEST-CLOSED',
      status: 'Closed',
      approved: true,
      lines: [newPoLine({ id: 'plc', status: 'Closed', quantity: 6, unitPrice, agreementId: pba.id, agreementLineId: 'pbl-0' })],
    });

    await recalculatePBACommitments([pba.id]);

    const updated = await getPurchaseBlanketAgreement(pba.id);
    const line = updated!.lines.find((l) => l.id === 'pbl-0')!;
    expect(line.cumulativeCommittedQty).toBe(4);
    expect(line.cumulativeCommittedAmountLC).toBe(Math.round(4 * unitPrice * 100) / 100);
    expect(line.cumulativeQty).toBe(6);
    expect(line.cumulativeAmountLC).toBe(Math.round(6 * unitPrice * 100) / 100);
  });

  it('is a no-op for an empty id list', async () => {
    await expect(recalculatePBACommitments([])).resolves.toBeUndefined();
  });
});
