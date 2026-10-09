/**
 * Seeded purchasing history after the bill: payments, goods returns, A/P credit memos and down
 * payment requests — built together with the receipts and bills they touch, so applied amounts,
 * statuses and returned quantities tie out (the purchasing audit checks them).
 *
 * Amounts use the app's own totals and withholding rules. Like the other seeds, this is history:
 * item stock already reflects it, and it has no journal entries (the ledger starts from what's
 * posted in the app).
 */
import { ADVANCES_TO_SUPPLIERS, DPR_SERIES, newDprLine, type DownPaymentRequest } from '../mocks/apDownPayments';
import { MEMO_SERIES, newMemoLine, type ApCreditMemo, type MemoLine } from '../mocks/apCreditMemos';
import { SEED_AP_INVOICES, type ApInvoice } from '../mocks/apInvoices';
import { SEED_GOODS_RECEIPTS, type GoodsReceipt } from '../mocks/goodsReceipts';
import { RETURN_SERIES, newReturnLine, type GoodsReturn, type ReturnLine } from '../mocks/goodsReturns';
import { SEED_ITEMS } from '../mocks/items';
import { blankMeans, blankPayment, newAccountRow, newCheckRow, type OutgoingPayment, type PaymentRow } from '../mocks/outgoingPayments';
import { SEED_PARTNERS } from '../mocks/partners';
import { SEED_PURCHASE_ORDERS, type PurchaseOrder } from '../mocks/purchaseOrders';
import { RETAIL_RETURNS } from '../mocks/retailHistory';
import { SEED_COMPANY_TAX, SEED_TAX_CODES, SEED_TAX_GROUPS, SEED_WITHHOLDING, SEED_WITHHOLDING_GROUPS, rateAt, vatNotPaidToVendor } from '../mocks/taxes';
import { SEED_RATES } from '../mocks/currencies';
import { rateOn } from './masterData';
import { poTotals, poWithholding } from './purchaseOrders';
import type { TaxMasterData } from './taxDetermination';

const round2 = (n: number) => Math.round(n * 100) / 100;
const TAX: TaxMasterData = { company: SEED_COMPANY_TAX[0], codes: SEED_TAX_CODES, groups: SEED_TAX_GROUPS, withholding: SEED_WITHHOLDING, withholdingGroups: SEED_WITHHOLDING_GROUPS };
const vendorOf = (id: string) => SEED_PARTNERS.find((p) => p.id === id)!;
const fxOn = (currency: string, date: string) => (currency === 'PHP' ? 1 : (rateOn(SEED_RATES, currency, date)?.rate ?? 0));
const rateOf = (date: string) => (code: string) => {
  const c = SEED_TAX_CODES.find((x) => x.code === code);
  return c ? (rateAt(c, date) ?? 0) : 0;
};
const reverse = (code: string) => vatNotPaidToVendor(SEED_TAX_CODES.find((x) => x.code === code));

/** Total and net due (after withholding) of a bill-shaped document, as the forms work them out. */
function amounts(doc: Pick<ApInvoice, 'discountPct' | 'freight' | 'freightTaxCode' | 'postingDate' | 'vendorId'> & { lines: { itemId: string; quantity: number; unitPrice: number; discountPct: number; taxCode: string }[] }, downPayment = 0) {
  const totals = poTotals(doc, rateOf(doc.postingDate), undefined, reverse);
  const withholding = poWithholding(doc, vendorOf(doc.vendorId), SEED_ITEMS, TAX, doc.postingDate);
  const wt = round2(withholding.filter((w) => w.deducted).reduce((n, w) => n + w.amount, 0));
  return { total: totals.total, wt, net: round2(totals.total - wt - downPayment) };
}

const apNo = (inv: ApInvoice) => `Primary ${inv.docNum}`;
const grNo = (gr: GoodsReceipt) => `Primary ${gr.docNum}`;

export interface PurchasingHistory {
  receipts: GoodsReceipt[];
  invoices: ApInvoice[];
  payments: OutgoingPayment[];
  returns: GoodsReturn[];
  memos: ApCreditMemo[];
  downPayments: DownPaymentRequest[];
}

function build(): PurchasingHistory {
  const receipts = structuredClone(SEED_GOODS_RECEIPTS);
  const invoices = structuredClone(SEED_AP_INVOICES);
  // Receipts and bills are numbered in date order, so they're found by the PO they came from.
  const gr = (poId: string) => receipts.find((r) => r.lines.some((l) => l.baseId === poId))!;
  const inv = (poId: string) => invoices.find((i) => i.lines.some((l) => l.baseId === gr(poId).id))!;
  const po = (docNum: number) => SEED_PURCHASE_ORDERS.find((p) => p.docNum === docNum)!;

  /** Apply `amount` of payment or credit to a bill; it closes once nothing is left. */
  const settle = (bill: ApInvoice, amount: number, date: string) => {
    const { net } = amounts(bill, bill.downPayment);
    bill.appliedAmount = round2(bill.appliedAmount + amount);
    if (bill.appliedAmount >= net - 0.005) Object.assign(bill, { status: 'Closed', closeDate: date });
  };

  // ── Outgoing payments ───────────────────────────────────────────────────────
  let payNo = 510000;
  const payments: OutgoingPayment[] = [];
  const billRow = (bill: ApInvoice, amount?: number): PaymentRow => {
    const a = amounts(bill, bill.downPayment);
    const balance = round2(a.net - bill.appliedAmount);
    return {
      id: `pr-${bill.id}`, invoiceId: bill.id, docNo: apNo(bill), vendorRef: bill.vendorRef, docDate: bill.postingDate, dueDate: bill.dueDate,
      total: a.net, wtAmount: a.wt, balanceDue: balance, cashDiscountPct: 0, amount: amount ?? balance, invoiceFx: bill.fxRate || 1,
      projectId: bill.projectId, selected: true, docType: 'APINV',
    };
  };
  const pay = (id: string, date: string, vendorId: string, rows: PaymentRow[], means: (amount: number) => Partial<OutgoingPayment['means']>, patch: Partial<OutgoingPayment> = {}) => {
    const v = vendorOf(vendorId);
    const currency = v.currency === 'All currencies' ? 'PHP' : v.currency;
    const overall = round2(rows.reduce((n, r) => n + r.amount, 0));
    const p: OutgoingPayment = {
      ...blankPayment(date),
      id,
      vendorId, vendorCode: v.code, payeeName: v.name, contactId: v.defaultContactId, projectId: v.projectId,
      docNum: ++payNo, status: 'Posted', currency, fxRate: fxOn(currency, date), controlAccount: v.payableAccount || '2010',
      journalRemark: `Outgoing – ${v.code}`, rows, means: { ...blankMeans(date), ...means(overall) },
      ...patch,
    };
    payments.push(p);
    for (const r of rows.filter((x) => x.docType !== 'DPR')) settle(invoices.find((i) => i.id === r.invoiceId)!, r.amount, date);
    return p;
  };
  const transfer = (account: string, date: string, reference: string) => (amount: number) => ({ transfer: { account, date, reference, amount } });

  // Techzone, paid by InstaPay the week it fell due.
  const techzone = inv('po-008');
  pay('op-001', '2026-09-20', techzone.vendorId, [billRow(techzone)], transfer('1015', '2026-09-20', 'InstaPay 0920-5512'));
  // PHLPost: registered mail paid from petty cash the next day.
  const postal = inv('po-019');
  pay('op-002', '2026-09-12', postal.vendorId, [billRow(postal)], (amount) => ({ cash: { account: '1011', amount } }));
  // The launch photographer, by BPI check.
  const photo = inv('po-022');
  pay('op-003', '2026-09-21', photo.vendorId, [billRow(photo)], (amount) => ({ checks: [newCheckRow({ id: 'chk-seed-1', account: '1016', dueDate: '2026-09-21', checkNo: 200001, amount })] }), { reference: 'OR 1187' });
  // Apple, from the USD account at the 1 Oct rate — booked at the 2 Sep rate, so a realized exchange difference.
  const apple = inv('po-007');
  pay('op-004', '2026-10-01', apple.vendorId, [billRow(apple)], transfer('1018', '2026-10-01', 'TT 26-1001-APL'));
  // Meralco, straight to G/L: September electricity for two stores.
  payments.push({
    ...blankPayment('2026-09-28'),
    id: 'op-005', type: 'Account', payeeName: 'Manila Electric Company (Meralco)', payTo: 'Lopez Building, Ortigas Avenue, Pasig City',
    docNum: ++payNo, status: 'Posted', fxRate: 1, journalRemark: 'Outgoing – 6110', reference: 'SOA Sep 2026',
    accountRows: [
      newAccountRow({ id: 'acr-seed-1', account: '6110', remarks: 'Electricity – Greenbelt 3, September', amount: 48250.6 }),
      newAccountRow({ id: 'acr-seed-2', account: '6110', remarks: 'Electricity – Pasig warehouse, September', amount: 21480.15 }),
    ],
    means: { ...blankMeans('2026-09-28'), transfer: { account: '1015', date: '2026-09-28', reference: 'Bills payment 0928', amount: 69730.75 } },
  });

  // ── Down payment requests ───────────────────────────────────────────────────
  const dprLines = (p: PurchaseOrder) =>
    p.lines.map((l, i) =>
      newDprLine({
        id: `dl-seed-${p.id}-${i + 1}`, itemId: l.itemId, itemNo: l.itemNo, name: l.name, description: l.description, quantity: l.quantity,
        uomCode: l.uomCode, uomName: l.uomName, itemsPerUnit: l.itemsPerUnit, priceListId: l.priceListId, unitPrice: l.unitPrice, discountPct: l.discountPct,
        taxCode: l.taxCode, blanketAgreement: l.blanketAgreement, baseType: 'PO', baseId: p.id, baseLineId: l.id, baseDocNo: `${p.seriesId === 'ser-import' ? 'Import' : 'Primary'} ${p.docNum}`,
        bpCatalogNo: l.bpCatalogNo, countryOfOriginCode: SEED_ITEMS.find((x) => x.id === l.itemId)?.countryOfOriginCode ?? '', warehouse: '', binId: '',
      }),
    );
  const request = (id: string, docNum: number, p: PurchaseOrder, date: string, dpmPct: number, vendorRef: string): DownPaymentRequest => {
    const v = vendorOf(p.vendorId);
    return {
      id, vendorId: v.id, vendorCode: v.code, vendorName: v.name, contactId: p.contactId, vendorRef, currency: p.currency, seriesId: DPR_SERIES[0].id, docNum,
      status: 'Open', postingDate: date, dueDate: date, documentDate: date, closeDate: '', lines: dprLines(p), shipTo: p.shipTo, payTo: '', shippingType: p.shippingType,
      language: 'English', journalRemark: `A/P Down Payment – ${v.code}`, paymentTermId: p.paymentTermId, paymentMethod: v.defaultPaymentMethod, cashDiscountDays: 0,
      projectId: p.projectId, indicator: '', orderNumber: `${p.seriesId === 'ser-import' ? 'Import' : 'Primary'} ${p.docNum}`, references: [], buyerId: p.buyerId, ownerId: p.ownerId,
      remarks: '', discountPct: p.discountPct, freight: 0, freightTaxCode: '', fxRate: fxOn(p.currency, date), controlAccount: v.payableAccount || '2010',
      paymentBlock: false, maxCashDiscount: false, installments: 1, consolidatingBpId: '', paymentOrderRun: true, appliedAmount: 0,
      dpmPct, paidLc: 0, drawnAmount: 0, downPaymentAccount: v.downPaymentClearingAccount || ADVANCES_TO_SUPPLIERS,
    };
  };
  const dprTotal = (d: DownPaymentRequest) => {
    const t = poTotals({ ...d, freight: 0 }, rateOf(d.postingDate), undefined, reverse);
    return round2((t.beforeDiscount - t.discount) * (d.dpmPct / 100) + t.tax * (d.dpmPct / 100));
  };
  // Apple wants 30% ahead on the DepEd iPads — not paid yet.
  const ipads = request('dp-001', 630001, po(860003), '2026-10-01', 30, 'PROFORMA APL-26-3391');
  // Luzon wants half up front on the backordered MacBooks — paid, not yet drawn (the goods haven't come).
  const macs = request('dp-002', 630002, po(260034), '2026-09-24', 50, 'PI-26-00871');
  const macsDue = dprTotal(macs);
  const macsPay = pay(
    'op-006', '2026-09-26', macs.vendorId,
    [{ id: 'pr-dp-002', invoiceId: macs.id, docNo: `Primary ${macs.docNum}`, vendorRef: macs.vendorRef, docDate: macs.postingDate, dueDate: macs.dueDate, total: macsDue, wtAmount: 0, balanceDue: macsDue, cashDiscountPct: 0, amount: macsDue, invoiceFx: 1, projectId: macs.projectId, selected: true, docType: 'DPR', account: macs.downPaymentAccount }],
    transfer('1015', '2026-09-26', 'InstaPay 0926-7731'),
  );
  Object.assign(macs, { appliedAmount: macsDue, paidLc: round2(macsDue * macsPay.fxRate) });
  for (const d of [ipads]) d.fxRate = fxOn(d.currency, d.postingDate);

  // The store replenishment bills: Luzon's iPhones by InstaPay, Techzone's accessories by BPI check, and
  // Apple's iPad Air import from the USD account. Luzon's second September bill (po-044) isn't due yet.
  const iphones = inv('po-041');
  pay('op-007', '2026-10-05', iphones.vendorId, [billRow(iphones)], transfer('1015', '2026-10-05', 'InstaPay 1005-6120'));
  const accessories = inv('po-042');
  pay('op-008', '2026-10-07', accessories.vendorId, [billRow(accessories)], (amount) => ({ checks: [newCheckRow({ id: 'chk-seed-2', account: '1016', dueDate: '2026-10-07', checkNo: 200002, amount })] }), { reference: 'OR 2291' });
  const ipadAir = inv('po-043');
  pay('op-009', '2026-10-06', ipadAir.vendorId, [billRow(ipadAir)], transfer('1018', '2026-10-06', 'TT 26-1006-APL'));

  // ── Goods returns ───────────────────────────────────────────────────────────
  const returns: GoodsReturn[] = [];
  const retLine = (patch: Partial<ReturnLine>) => newReturnLine(patch);
  // 1 iPhone 18 Pro from the Luzon receipt, dead on arrival — not billed yet, so nothing to credit.
  const g7 = gr('po-002');
  const g7l = g7.lines[0];
  g7l.returnedQty = 1;
  const { invoicedQty: _i, returnedQty: _r, id: _id, ...g7base } = g7l;
  returns.push({
    ...structuredClone(g7), id: 'rt-001', seriesId: RETURN_SERIES[0].id, docNum: 610001, status: 'Closed', postingDate: '2026-10-02', documentDate: '2026-10-02', dueDate: '2026-10-02', closeDate: '2026-10-02',
    vendorRef: 'RMA-LID-2610-014', journalRemark: `Goods Returns – ${g7.vendorCode}`, consolidatingBpId: '', attachments: [], remarks: 'Dead on arrival — no display on power-up.',
    lines: [retLine({ ...g7base, id: 'rl-seed-1', quantity: 1, baseType: 'GRPO', baseId: g7.id, baseLineId: g7l.id, baseDocNo: grNo(g7), returnReason: 'Defective', countryOfOriginCode: '' })],
  });
  // 2 iPhone 17 from the billed Luzon delivery, boxes crushed in transit — credited on memo 620001.
  const b6 = inv('po-001');
  const b6l = b6.lines.find((l) => l.itemNo === 'IPH-17-256-BLK')!;
  b6l.returnedQty = 2;
  const { returnedQty: _q, receiptCostLc: _rc, bpCatalogNo: _bp, baseType: _bt, id: _bid, ...b6base } = b6l;
  const crushed = retLine({ ...b6base, id: 'rl-seed-2', quantity: 2, baseType: 'APINV', baseId: b6.id, baseLineId: b6l.id, baseDocNo: apNo(b6), returnReason: 'Damaged in transit', creditedQty: 2 });
  returns.push({
    ...structuredClone(receipts.find((r) => r.id === b6l.baseId)!), id: 'rt-002', seriesId: RETURN_SERIES[0].id, docNum: 610002, status: 'Closed', postingDate: '2026-09-25', documentDate: '2026-09-25', dueDate: '2026-09-25', closeDate: '2026-09-27',
    vendorRef: 'RMA-LID-2609-088', journalRemark: `Goods Returns – ${b6.vendorCode}`, consolidatingBpId: '', attachments: [], remarks: 'Two units arrived with crushed boxes; vendor authorized the return.',
    orderNumber: b6.orderNumber, lines: [crushed],
  });

  // ── A/P credit memos ────────────────────────────────────────────────────────
  const memos: ApCreditMemo[] = [];
  const memoOf = (id: string, docNum: number, bill: ApInvoice, date: string, lines: MemoLine[], vendorRef: string, remarks: string): ApCreditMemo => ({
    ...structuredClone(bill), id, seriesId: MEMO_SERIES[0].id, docNum, status: 'Open', postingDate: date, documentDate: date, dueDate: date, closeDate: '',
    vendorRef, journalRemark: `A/P Credit Memo – ${bill.vendorCode}`, remarks, lines, applications: [], appliedAmount: 0, downPayment: 0, paymentOrderRun: false,
  });
  // Luzon's credit note for the two crushed iPhones, copied from return 610002 and applied to the po-001 bill.
  const m1Line = newMemoLine({ ...b6base, id: 'ml-seed-1', quantity: 2, baseType: 'GRET', baseId: 'rt-002', baseLineId: crushed.id, baseDocNo: 'Primary 610002', returnGoods: false, invoiceId: b6.id, returnReason: 'Damaged in transit' });
  const m1 = memoOf('cm-001', 620001, b6, '2026-09-27', [m1Line], 'CN-LID-2609-031', 'Credit for return 610002.');
  const m1Credit = amounts(m1).net;
  settle(b6, m1Credit, m1.postingDate);
  Object.assign(m1, { appliedAmount: m1Credit, applications: [{ invoiceId: b6.id, docNo: apNo(b6), amount: m1Credit, date: m1.postingDate }], status: 'Closed', closeDate: m1.postingDate });
  memos.push(m1);
  // Techzone's 5% volume rebate on the September cables — the bill was already paid, so the credit waits to be applied.
  const cables = techzone.lines.find((l) => l.itemNo === 'ACC-CBL1M')!;
  const { returnedQty: _q2, baseType: _bt2, id: _cid, ...cableBase } = cables;
  const m2 = memoOf('cm-002', 620002, techzone, '2026-10-03', [newMemoLine({ ...cableBase, id: 'ml-seed-2', unitPrice: round2(cables.unitPrice * 0.05), baseType: 'APINV', baseId: techzone.id, baseLineId: cables.id, baseDocNo: apNo(techzone), returnGoods: false, invoiceId: techzone.id, returnReason: 'Other', freeText: '5% volume rebate, September' })], 'CN-TZ-2610-004', 'Volume rebate on USB-C cables.');
  memos.push(m2);

  // ── Store replenishment returns (mocks/retailHistory.ts) ────────────────────
  // Sent back after the bill and credited in full; the credit goes on the bill before it's paid.
  for (const r of RETAIL_RETURNS) {
    const bill = inv(r.poId);
    const bl = bill.lines.find((l) => l.itemNo === r.itemNo)!;
    bl.returnedQty = (bl.returnedQty ?? 0) + r.quantity;
    const { returnedQty: _rq, receiptCostLc: _rcl, bpCatalogNo: _bpc, baseType: _bty, id: _lid, ...base } = bl;
    const rl = retLine({ ...base, id: `rl-${r.id}`, quantity: r.quantity, baseType: 'APINV', baseId: bill.id, baseLineId: bl.id, baseDocNo: apNo(bill), returnReason: r.reason, creditedQty: r.quantity });
    returns.push({
      ...structuredClone(receipts.find((x) => x.id === bl.baseId)!), id: r.id, seriesId: RETURN_SERIES[0].id, docNum: r.docNum, status: 'Closed', postingDate: r.date, documentDate: r.date, dueDate: r.date, closeDate: r.date,
      vendorRef: r.vendorRef, journalRemark: `Goods Returns – ${bill.vendorCode}`, consolidatingBpId: '', attachments: [], remarks: r.remarks, orderNumber: bill.orderNumber, lines: [rl],
    });
    const ml = newMemoLine({ ...base, id: `ml-${r.id}`, quantity: r.quantity, baseType: 'GRET', baseId: r.id, baseLineId: rl.id, baseDocNo: `Primary ${r.docNum}`, returnGoods: false, invoiceId: bill.id, returnReason: r.reason });
    const memo = memoOf(`cm-${r.id}`, r.memoNo, bill, r.date, [ml], r.memoRef, `Credit for return ${r.docNum}.`);
    const credit = amounts(memo).net;
    settle(bill, credit, memo.postingDate);
    Object.assign(memo, { appliedAmount: credit, applications: [{ invoiceId: bill.id, docNo: apNo(bill), amount: credit, date: memo.postingDate }], status: 'Closed', closeDate: memo.postingDate });
    memos.push(memo);
  }

  // ── July–October bills ──────────────────────────────────────────────────────
  // Paid around the due date; Luzon's 4 Oct bill (po-054) isn't due yet.
  const payBill = (id: string, poId: string, date: string, means: (amount: number) => Partial<OutgoingPayment['means']>) => {
    const bill = inv(poId);
    pay(id, date, bill.vendorId, [billRow(bill)], means);
  };
  payBill('op-010', 'po-046', '2026-08-07', transfer('1015', '2026-08-07', 'InstaPay 0807-4410'));
  payBill('op-011', 'po-047', '2026-08-13', transfer('1015', '2026-08-13', 'InstaPay 0813-2087'));
  payBill('op-012', 'po-049', '2026-08-29', transfer('1018', '2026-08-29', 'TT 26-0829-APL'));
  payBill('op-013', 'po-048', '2026-08-27', transfer('1016', '2026-08-27', 'BPI InstaPay 0827-1190'));
  payBill('op-014', 'po-050', '2026-09-04', transfer('1015', '2026-09-04', 'InstaPay 0904-3356'));
  payBill('op-015', 'po-055', '2026-09-10', transfer('1015', '2026-09-10', 'InstaPay 0910-6602'));
  payBill('op-016', 'po-051', '2026-09-17', (amount) => ({ checks: [newCheckRow({ id: 'chk-seed-3', account: '1016', dueDate: '2026-09-17', checkNo: 200003, amount })] }));
  payBill('op-017', 'po-052', '2026-09-24', transfer('1015', '2026-09-24', 'InstaPay 0924-7781'));
  payBill('op-018', 'po-056', '2026-09-25', transfer('1018', '2026-09-25', 'TT 26-0925-APL'));
  payBill('op-019', 'po-057', '2026-09-28', transfer('1015', '2026-09-28', 'InstaPay 0928-1145'));
  payBill('op-020', 'po-058', '2026-10-07', transfer('1017', '2026-10-07', 'UnionBank PESONet 1007-0042'));
  payBill('op-021', 'po-053', '2026-10-06', transfer('1016', '2026-10-06', 'BPI InstaPay 1006-9024'));

  // Numbered in date order, like payments added one after another.
  payments.sort((a, b) => a.postingDate.localeCompare(b.postingDate) || a.id.localeCompare(b.id)).forEach((p, n) => (p.docNum = 510001 + n));

  return { receipts, invoices, payments, returns, memos, downPayments: [ipads, macs] };
}

export const PURCHASING_HISTORY: PurchasingHistory = build();
