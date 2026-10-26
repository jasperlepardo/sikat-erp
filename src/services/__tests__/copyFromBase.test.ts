import { describe, it, expect } from 'vitest';

import { srLineFromDelivery, srOpenQty } from '../salesReturns';
import { arCreditMemoFromInvoice, arCreditMemoFromReturn } from '../arCreditMemos';
import { grOpenQty } from '../goodsReceipts';
import { returnableQty } from '../apInvoices';
import { returnOpenQty } from '../goodsReturns';
import {
  returnFromReceipt,
  returnFromInvoice,
  memoFromInvoice,
  memoFromReturn,
} from '../../pages/purchasing/shared/returnsTypes';
import { dnLineFromOrder } from '../../pages/sales/deliveries/detail/types';
import { arLineFromDelivery, arLineFromOrder } from '../../pages/sales/invoices/detail/types';
import { lineage } from '../../pages/purchasing/shared/lineage';
import { coveredLines, type DocNode } from '../../pages/purchasing/shared/documentLinks';

import { newDnLine, type Delivery, type DnLine } from '../../mocks/deliveries';
import { newSoLine, type SalesOrder, type SoLine } from '../../mocks/salesOrders';
import { newGrLine, type GoodsReceipt, type GrLine } from '../../mocks/goodsReceipts';
import { newApLine, type ApInvoice, type ApLine } from '../../mocks/apInvoices';
import { newReturnLine, type GoodsReturn, type ReturnLine } from '../../mocks/goodsReturns';
import { type ArInvoice } from '../../mocks/arInvoices';
import { type SalesReturn, type SrLine } from '../../mocks/salesReturns';
import { type Item } from '../../mocks/items';

// ── Fixtures ───────────────────────────────────────────────────────────────────
// Minimal base documents/lines. These helpers are pure: they read only the line
// fields and the base doc's identity/number fields, so partial fixtures suffice.

/** A stocked item and a service (non-stocked) item, enough for the returnGoods branches. */
const items = [
  { id: 'itm-stocked', inventoryItem: true, revenueAccount: '4011', vendors: [] },
  { id: 'itm-service', inventoryItem: false, revenueAccount: '', vendors: [] },
] as unknown as Item[];

const docHead = { seriesId: '', docNum: 1, postingDate: '2026-06-01' };

// ── Sales: delivery → sales return ───────────────────────────────────────────────

function deliveryFixture(): Delivery {
  const line = newDnLine({
    id: 'dnl-1',
    itemId: 'itm-stocked',
    itemNo: 'A1',
    description: 'Widget',
    quantity: 10,
    unitPrice: 250,
    discountPct: 5,
    taxCode: 'V12',
    baseType: 'SO',
    invoicedQty: 3,
  });
  return { id: 'dn-1', ...docHead, lines: [line] } as unknown as Delivery;
}

describe('srLineFromDelivery', () => {
  it('carries quantity, price, tax code and stamps baseType/baseId from the delivery', () => {
    const dn = deliveryFixture();
    const [line] = srLineFromDelivery(dn, [{ lineId: 'dnl-1', qty: 7 }]);

    expect(line.quantity).toBe(7);
    expect(line.unitPrice).toBe(250);
    expect(line.discountPct).toBe(5);
    expect(line.taxCode).toBe('V12');
    expect(line.baseType).toBe('DN');
    expect(line.baseId).toBe('dn-1');
    expect(line.baseLineId).toBe('dnl-1');
    expect(line.creditedQty).toBe(0);
  });

  it('skips picks whose lineId is not on the delivery', () => {
    const dn = deliveryFixture();
    expect(srLineFromDelivery(dn, [{ lineId: 'nope', qty: 5 }])).toEqual([]);
  });

  it('drops the delivery-only invoicedQty field from the copied line', () => {
    const dn = deliveryFixture();
    const [line] = srLineFromDelivery(dn, [{ lineId: 'dnl-1', qty: 7 }]);
    expect('invoicedQty' in line).toBe(false);
  });
});

describe('srOpenQty', () => {
  it('is quantity minus creditedQty while Open, and 0 otherwise', () => {
    const line = { quantity: 10, creditedQty: 4 } as unknown as SrLine;
    expect(srOpenQty(line, { status: 'Open' })).toBe(6);
    expect(srOpenQty(line, { status: 'Closed' })).toBe(0);
    expect(srOpenQty(line, { status: 'Draft' })).toBe(0);
  });
});

// ── Sales: order → delivery, order/delivery → A/R invoice ─────────────────────────

function orderFixture(): SalesOrder {
  const line = newSoLine({
    id: 'sol-1',
    itemId: 'itm-stocked',
    itemNo: 'A1',
    description: 'Widget',
    quantity: 10,
    unitPrice: 300,
    discountPct: 10,
    taxCode: 'V12',
  });
  return { id: 'so-1', ...docHead, lines: [line] } as unknown as SalesOrder;
}

describe('dnLineFromOrder', () => {
  it('copies item/qty/price/tax and stamps baseType SO + baseRow', () => {
    const so = orderFixture();
    const l = so.lines[0] as SoLine;
    const line: DnLine = dnLineFromOrder(so, l, 4);

    expect(line.itemId).toBe('itm-stocked');
    expect(line.quantity).toBe(4);
    expect(line.unitPrice).toBe(300);
    expect(line.discountPct).toBe(10);
    expect(line.taxCode).toBe('V12');
    expect(line.baseType).toBe('SO');
    expect(line.baseId).toBe('so-1');
    expect(line.baseLineId).toBe('sol-1');
    expect(line.baseRow).toBe(1);
  });
});

describe('arLineFromOrder', () => {
  it('copies the order line and carries the wtaxLiable flag', () => {
    const so = orderFixture();
    const l = so.lines[0] as SoLine;
    const line = arLineFromOrder(so, l, 4, true);

    expect(line.quantity).toBe(4);
    expect(line.unitPrice).toBe(300);
    expect(line.taxCode).toBe('V12');
    expect(line.baseType).toBe('SO');
    expect(line.baseId).toBe('so-1');
    expect(line.baseRow).toBe(1);
    expect(line.wtaxLiable).toBe(true);
  });
});

describe('arLineFromDelivery', () => {
  it('copies the delivery line, carries shippedGoods from the delivery and wtaxLiable', () => {
    const base = deliveryFixture();
    const dn = { ...base, useShippedGoodsAccount: true } as Delivery;
    const l = dn.lines[0] as DnLine;
    const line = arLineFromDelivery(dn, l, 6, false);

    expect(line.quantity).toBe(6);
    expect(line.unitPrice).toBe(250);
    expect(line.taxCode).toBe('V12');
    expect(line.baseType).toBe('DN');
    expect(line.baseId).toBe('dn-1');
    expect(line.baseRow).toBe(1);
    expect(line.shippedGoods).toBe(true);
    expect(line.wtaxLiable).toBe(false);
  });
});

// ── Sales: A/R invoice / sales return → A/R credit memo ───────────────────────────

function arInvoiceFixture(): ArInvoice {
  return {
    id: 'ari-1',
    ...docHead,
    lines: [
      {
        id: 'aril-1',
        itemId: 'itm-stocked',
        itemNo: 'A1',
        description: 'Widget',
        quantity: 10,
        uomCode: 'EA',
        uomName: 'Each',
        itemsPerUnit: 1,
        warehouse: 'WH1',
        priceListId: '',
        unitPrice: 250,
        discountPct: 5,
        priceSource: '',
        taxCode: 'V12',
        glAccount: '4011',
        commissionPct: 0,
        unitCostLc: 100,
      },
      {
        id: 'aril-2',
        itemId: 'itm-service',
        itemNo: 'S1',
        description: 'Service',
        quantity: 2,
        uomCode: 'EA',
        uomName: 'Each',
        itemsPerUnit: 1,
        warehouse: '',
        priceListId: '',
        unitPrice: 500,
        discountPct: 0,
        priceSource: '',
        taxCode: 'V12',
        glAccount: '4020',
        commissionPct: 0,
        unitCostLc: 0,
      },
    ],
  } as unknown as ArInvoice;
}

describe('arCreditMemoFromInvoice', () => {
  it('carries qty/price/tax, stamps baseType ARIN + invoiceId, and sets returnGoods for stocked items', () => {
    const inv = arInvoiceFixture();
    const [stocked, service] = arCreditMemoFromInvoice(
      inv,
      [
        { lineId: 'aril-1', qty: 4 },
        { lineId: 'aril-2', qty: 2 },
      ],
      items,
    );

    expect(stocked.quantity).toBe(4);
    expect(stocked.unitPrice).toBe(250);
    expect(stocked.taxCode).toBe('V12');
    expect(stocked.baseType).toBe('ARIN');
    expect(stocked.baseId).toBe('ari-1');
    expect(stocked.baseLineId).toBe('aril-1');
    expect(stocked.invoiceId).toBe('ari-1');
    expect(stocked.returnGoods).toBe(true); // stocked item
    expect(stocked.baseRow).toBe(1);

    expect(service.returnGoods).toBe(false); // non-stocked item
    expect(service.baseRow).toBe(2);
  });

  it('caps the copied quantity at the invoice line quantity', () => {
    const inv = arInvoiceFixture();
    const [line] = arCreditMemoFromInvoice(inv, [{ lineId: 'aril-1', qty: 99 }], items);
    expect(line.quantity).toBe(10); // capped at invoice line qty, not 99
  });
});

function salesReturnFixture(status: SalesReturn['status'] = 'Open'): SalesReturn {
  const line: SrLine = {
    id: 'srl-1',
    itemId: 'itm-stocked',
    itemNo: 'A1',
    description: 'Widget',
    quantity: 8,
    uomCode: 'EA',
    uomName: 'Each',
    itemsPerUnit: 1,
    warehouse: 'WH1',
    priceListId: '',
    unitPrice: 250,
    discountPct: 5,
    priceSource: '',
    taxCode: 'V12',
    baseType: 'DN',
    baseId: 'dn-1',
    baseLineId: 'dnl-1',
    baseDocNo: 'DN-2026-0001',
    unitCostLc: 100,
    returnReason: 'Defective',
    countryOfOriginCode: '',
    creditedQty: 3,
  } as unknown as SrLine;
  return { id: 'sr-1', ...docHead, status, lines: [line] } as unknown as SalesReturn;
}

describe('arCreditMemoFromReturn', () => {
  const srNumberFn = () => 'SRT-2026-0001';
  const openFn = (l: SalesReturn['lines'][number], r: Pick<SalesReturn, 'status'>) => srOpenQty(l as SrLine, r);

  it('copies only the OPEN quantity (quantity - creditedQty) and stamps baseType SRT, returnGoods false', () => {
    const r = salesReturnFixture('Open');
    // Open qty is 8 - 3 = 5; ask for more and it caps at the open qty.
    const [line] = arCreditMemoFromReturn(r, [{ lineId: 'srl-1', qty: 99 }], items, srNumberFn, openFn);

    expect(line.quantity).toBe(5);
    expect(line.unitPrice).toBe(250);
    expect(line.taxCode).toBe('V12');
    expect(line.baseType).toBe('SRT');
    expect(line.baseId).toBe('sr-1');
    expect(line.baseLineId).toBe('srl-1');
    expect(line.baseDocNo).toBe('SRT-2026-0001');
    expect(line.returnGoods).toBe(false); // stock already came back on the return
    expect(line.invoiceId).toBe('');
    expect(line.returnReason).toBe('Defective');
  });

  it('copies 0 open quantity when the return is not Open', () => {
    const r = salesReturnFixture('Closed');
    const [line] = arCreditMemoFromReturn(r, [{ lineId: 'srl-1', qty: 5 }], items, srNumberFn, openFn);
    expect(line.quantity).toBe(0);
  });

  it('falls back to the item revenue account for the G/L account', () => {
    const r = salesReturnFixture('Open');
    const [line] = arCreditMemoFromReturn(r, [{ lineId: 'srl-1', qty: 2 }], items, srNumberFn, openFn);
    expect(line.glAccount).toBe('4011'); // itm-stocked.revenueAccount
  });
});

// ── Purchasing: receipt / invoice → goods return ──────────────────────────────────

function goodsReceiptFixture(status: GoodsReceipt['status'] = 'Open'): GoodsReceipt {
  const line: GrLine = newGrLine({
    id: 'grl-1',
    itemId: 'itm-stocked',
    itemNo: 'A1',
    description: 'Widget',
    quantity: 10,
    unitPrice: 200,
    discountPct: 0,
    taxCode: 'V12',
    invoicedQty: 3,
    returnedQty: 1,
  });
  return { id: 'gr-1', ...docHead, status, lines: [line] } as unknown as GoodsReceipt;
}

describe('returnFromReceipt', () => {
  it('copies only the OPEN receipt quantity (qty - invoiced - returned) and stamps baseType GRPO', () => {
    const gr = goodsReceiptFixture('Open');
    const open = grOpenQty(gr.lines[0] as GrLine, gr); // 10 - 3 - 1 = 6
    expect(open).toBe(6);

    const [line] = returnFromReceipt(gr, [{ lineId: 'grl-1', qty: 99 }], items);
    expect(line.quantity).toBe(6); // capped at open qty
    expect(line.unitPrice).toBe(200);
    expect(line.taxCode).toBe('V12');
    expect(line.baseType).toBe('GRPO');
    expect(line.baseId).toBe('gr-1');
    expect(line.baseLineId).toBe('grl-1');
  });

  it('copies 0 when the receipt is not Open', () => {
    const gr = goodsReceiptFixture('Closed');
    const [line] = returnFromReceipt(gr, [{ lineId: 'grl-1', qty: 5 }], items);
    expect(line.quantity).toBe(0);
  });
});

function apInvoiceFixture(): ApInvoice {
  const line: ApLine = newApLine({
    id: 'apl-1',
    itemId: 'itm-stocked',
    itemNo: 'A1',
    description: 'Widget',
    quantity: 10,
    unitPrice: 200,
    discountPct: 0,
    taxCode: 'V12',
    returnedQty: 4,
  });
  return { id: 'api-1', ...docHead, lines: [line] } as unknown as ApInvoice;
}

describe('returnFromInvoice', () => {
  it('copies only the returnable quantity (qty - returned) and stamps baseType APINV', () => {
    const inv = apInvoiceFixture();
    expect(returnableQty(inv.lines[0] as ApLine)).toBe(6); // 10 - 4

    const [line] = returnFromInvoice(inv, [{ lineId: 'apl-1', qty: 99 }]);
    expect(line.quantity).toBe(6);
    expect(line.unitPrice).toBe(200);
    expect(line.taxCode).toBe('V12');
    expect(line.baseType).toBe('APINV');
    expect(line.baseId).toBe('api-1');
    expect(line.baseLineId).toBe('apl-1');
  });
});

// ── Purchasing: invoice / return → A/P credit (debit) memo ────────────────────────

describe('memoFromInvoice', () => {
  it('copies qty/price/tax, caps at invoice line qty, stamps baseType APINV + invoiceId', () => {
    const inv = apInvoiceFixture();
    const [line] = memoFromInvoice(inv, [{ lineId: 'apl-1', qty: 99 }], items);

    expect(line.quantity).toBe(10); // capped at invoice line qty
    expect(line.unitPrice).toBe(200);
    expect(line.taxCode).toBe('V12');
    expect(line.baseType).toBe('APINV');
    expect(line.baseId).toBe('api-1');
    expect(line.baseLineId).toBe('apl-1');
    expect(line.invoiceId).toBe('api-1');
    // Stocked item with returnable qty left → returns its goods.
    expect(line.returnGoods).toBe(true);
  });

  it('does not return goods for a non-stocked item', () => {
    const inv = {
      id: 'api-2',
      ...docHead,
      lines: [newApLine({ id: 'apl-2', itemId: 'itm-service', itemNo: 'S1', quantity: 2, unitPrice: 500, taxCode: 'V12', returnedQty: 0 })],
    } as unknown as ApInvoice;
    const [line] = memoFromInvoice(inv, [{ lineId: 'apl-2', qty: 2 }], items);
    expect(line.returnGoods).toBe(false);
  });
});

function goodsReturnFixture(status: GoodsReturn['status'] = 'Open'): GoodsReturn {
  // baseType APINV so the return line "needs credit" (returnOpenQty > 0).
  const line: ReturnLine = newReturnLine({
    id: 'rl-1',
    itemId: 'itm-stocked',
    itemNo: 'A1',
    description: 'Widget',
    quantity: 7,
    unitPrice: 200,
    taxCode: 'V12',
    baseType: 'APINV',
    baseId: 'api-1',
    creditedQty: 2,
  });
  return { id: 'gret-1', ...docHead, vendorId: 'vn-1', status, lines: [line] } as unknown as GoodsReturn;
}

describe('memoFromReturn', () => {
  it('copies only the OPEN return quantity (qty - credited) and stamps baseType GRET', () => {
    const r = goodsReturnFixture('Open');
    expect(returnOpenQty(r.lines[0] as ReturnLine, r)).toBe(5); // 7 - 2

    const [line] = memoFromReturn(r, [{ lineId: 'rl-1', qty: 99 }], items);
    expect(line.quantity).toBe(5);
    expect(line.unitPrice).toBe(200);
    expect(line.taxCode).toBe('V12');
    expect(line.baseType).toBe('GRET');
    expect(line.baseId).toBe('gret-1');
    expect(line.baseLineId).toBe('rl-1');
    // Goods already left on the return → no stock movement on the memo.
    expect(line.returnGoods).toBe(false);
    // The return's own base was an APINV, so the memo threads the invoiceId through.
    expect(line.invoiceId).toBe('api-1');
  });

  it('copies 0 when the return is not Open', () => {
    const r = goodsReturnFixture('Closed');
    const [line] = memoFromReturn(r, [{ lineId: 'rl-1', qty: 5 }], items);
    expect(line.quantity).toBe(0);
  });
});

// ── Link graph helpers: coveredLines + lineage ────────────────────────────────────

describe('coveredLines', () => {
  it('projects lines to item/qty/uom and drops lines with no item', () => {
    const covered = coveredLines([
      { itemId: 'itm-1', itemNo: 'A1', description: 'Widget', uomCode: 'EA', quantity: 3 },
      { itemId: '', itemNo: '', uomCode: 'EA', quantity: 1 }, // no item → dropped
    ]);
    expect(covered).toEqual([{ itemId: 'itm-1', itemNo: 'A1', description: 'Widget', uomCode: 'EA', quantity: 3 }]);
  });

  it('defaults a missing quantity to 0', () => {
    const [covered] = coveredLines([{ itemId: 'itm-1', itemNo: 'A1', uomCode: 'EA' }]);
    expect(covered.quantity).toBe(0);
  });
});

describe('lineage', () => {
  // PO (base) → GRPO (this) → APINV (target). Each node links back via `bases`.
  const node = (kind: string, id: string, bases: DocNode['bases'] = []): DocNode =>
    ({
      kind,
      id,
      type: kind,
      number: `${kind}-1`,
      href: '',
      date: '2026-06-0' + id.slice(-1),
      status: 'Open',
      intent: 'default',
      currency: 'PHP',
      total: 0,
      items: [],
      bases,
    }) as unknown as DocNode;

  const covered = [{ itemId: 'itm-1', itemNo: 'A1', uomCode: 'EA', quantity: 2 }];
  const nodes: DocNode[] = [
    node('PO', '1'),
    node('GRPO', '2', [{ kind: 'PO', id: '1', lines: covered }]),
    node('APINV', '3', [{ kind: 'GRPO', id: '2', lines: covered }]),
  ];

  it('walks both base and target directions from the open document', () => {
    const chain = lineage(nodes, 'GRPO', '2');
    const kinds = chain.map((d) => d.kind);
    // Oldest base first, then this, then targets.
    expect(kinds).toEqual(['PO', 'GRPO', 'APINV']);

    const self = chain.find((d) => d.kind === 'GRPO')!;
    expect(self.relation).toBe('This');
    expect(self.depth).toBe(0);

    const base = chain.find((d) => d.kind === 'PO')!;
    expect(base.relation).toBe('Base');
    expect(base.depth).toBe(1);
    expect(base.covers).toEqual(covered);

    const target = chain.find((d) => d.kind === 'APINV')!;
    expect(target.relation).toBe('Target');
    expect(target.depth).toBe(1);
    expect(target.covers).toEqual(covered);
  });

  it('returns [] when the open document is not in the node set', () => {
    expect(lineage(nodes, 'PO', 'missing')).toEqual([]);
  });
});
