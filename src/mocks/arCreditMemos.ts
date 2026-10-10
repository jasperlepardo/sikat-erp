/**
 * A/R credit memos (Sales › Returns & Credits). The credit note we issue to a customer.
 * Fields follow the SAP B1 A/R Credit Memo field map.
 *
 * Settled here, for the prototype:
 * - Item-type only, like the other sales documents.
 * - Lines copy from A/R invoices, or are entered by hand.
 * - A line from an invoice either returns the goods (stock back in at the invoice's cost) or is a
 *   price adjustment only.
 * - When added, the credit is applied to the invoices it came from, up to their balances. Credit
 *   left over stays open (Open Balance) and is applied to the customer's other open invoices with
 *   Apply credit.
 */
import { CURRENT_USER_ID, type DocumentSeries } from './common';
import { blankArInvoice, newArLine, SEED_AR_INVOICES, SEED_CREDITED, type ArInvoice, type ArLine } from './arInvoices';
import { SEED_PARTNERS, formatAddress } from './partners';
import { SEED_SALES_RETURNS } from './salesReturns';
import { termId } from './masters';

export type ArCmStatus = 'Draft' | 'Open' | 'Closed' | 'Cancelled';
export const AR_CM_STATUSES: ArCmStatus[] = ['Draft', 'Open', 'Closed', 'Cancelled'];

export type ArCmBaseType = 'ARIN' | 'SRT' | '';

export interface ArCmLine extends Omit<ArLine, 'baseType' | 'shippedGoods' | 'wtaxLiable'> {
  baseType: ArCmBaseType;
  returnReason: string;
  /** Put the goods back in inventory. Off = price adjustment only. */
  returnGoods: boolean;
  /** The A/R invoice this line credits. */
  invoiceId: string;
}

/** Credit applied to a customer's invoice: by this memo when added, or later with Apply credit. */
export interface CreditApplication {
  invoiceId: string;
  docNo: string;
  amount: number;
  date: string;
}

export interface ArCreditMemo extends Omit<ArInvoice, 'lines' | 'status'> {
  status: ArCmStatus;
  lines: ArCmLine[];
  applications: CreditApplication[];
}

export const AR_CREDIT_SERIES: DocumentSeries[] = [
  {
    id: 'acms-primary',
    name: 'Credit Memo',
    prefix: '',
    firstNo: 1,
    manual: false,
    isDefault: true,
    active: true,
    segments: [
      { type: 'literal', value: 'ACM' },
      { type: 'year' },
      { type: 'sequence', padding: 4 },
    ],
  },
];

export function blankArCreditMemo(today: string, ownerId: string): Omit<ArCreditMemo, 'id'> {
  const base = blankArInvoice(today, ownerId);
  return {
    ...base,
    seriesId: AR_CREDIT_SERIES[0].id,
    status: 'Draft',
    paymentTermId: termId('Net 30'),
    lines: [],
    applications: [],
  };
}

export const newArCmLine = (patch: Partial<ArCmLine> = {}): ArCmLine => {
  const { shippedGoods: _sg, wtaxLiable: _wt, ...base } = newArLine();
  return {
    ...base,
    id: `acl-${crypto.randomUUID().slice(0, 8)}`,
    baseType: '',
    returnReason: '',
    returnGoods: true,
    invoiceId: '',
    ...patch,
  };
};

// ── Seed ─────────────────────────────────────────────────────────────────────
// Numbered in date order. What each one credits is in SEED_CREDITED (mocks/arInvoices.ts), which
// the invoices' applied amounts include.

const bp = (id: string) => SEED_PARTNERS.find((p) => p.id === id)!;
const sr = (id: string) => SEED_SALES_RETURNS.find((r) => r.id === id)!;
const inv = (id: string) => SEED_AR_INVOICES.find((i) => i.id === id)!;
const arNo = (i: ArInvoice) => `${i.seriesId === 'ars-or' ? 'OR' : 'SI'}-${i.postingDate.slice(0, 4)}-${String(i.docNum).padStart(4, '0')}`;

/** A memo's header for a customer, from the document it was copied from. */
function memo(id: string, docNum: number, customerId: string, date: string, from: Pick<ArInvoice, 'contactId' | 'salesEmployeeId' | 'shipTo' | 'customerRef' | 'paymentTermId'>, patch: Partial<ArCreditMemo>): ArCreditMemo {
  const customer = bp(customerId);
  const bill = customer.addresses.find((a) => a.id === customer.defaultBillToId) ?? customer.addresses[0];
  return {
    ...blankArCreditMemo(date, CURRENT_USER_ID),
    id,
    docNum,
    customerId: customer.id,
    customerCode: customer.code,
    customerName: customer.name,
    contactId: from.contactId,
    currency: 'PHP',
    postingDate: date,
    documentDate: date,
    customerRef: from.customerRef,
    paymentTermId: from.paymentTermId || customer.customerPaymentTermId || termId('Net 30'),
    federalTaxId: customer.tin,
    salesEmployeeId: from.salesEmployeeId,
    billTo: bill ? formatAddress(bill, customer.name) : '',
    shipTo: from.shipTo,
    journalRemark: `A/R Credit Memos – ${customer.code}`,
    controlAccount: '1120',
    ...patch,
  };
}

export const SEED_AR_CREDIT_MEMOS: ArCreditMemo[] = [
  // ACM-2026-0001: Standalone price-correction credit memo for Clarkfield.
  // Their MacBook Airs (ar-c01) were billed at the wrong price — 1 unit overbilled by ₱5,000 net.
  // No goods return; a price adjustment only. Not applied yet: the invoice was already paid.
  (() => {
    const invoice = inv('ar-c01');
    const invLine = invoice.lines[0];
    return memo('acm-001', 1, 'bp-004', '2026-08-20', { ...invoice, customerRef: 'CGSI-PRICE-ADJ-0814' }, {
      status: 'Open',
      dueDate: '2026-09-19',
      appliedAmount: 0,
      remarks: 'Price correction — MacBook Airs billed at the standard Wholesale price instead of the agreed PEZA rate. Credit for the difference on 1 unit.',
      lines: [newArCmLine({
        id: 'acm-001-1', itemId: invLine.itemId, itemNo: invLine.itemNo, description: invLine.description, quantity: 1,
        uomCode: invLine.uomCode, uomName: invLine.uomName, itemsPerUnit: 1, warehouse: invLine.warehouse, priceListId: invLine.priceListId,
        // Clarkfield is zero-rated (PEZA), so no VAT.
        unitPrice: 5000, discountPct: 0, priceSource: 'Manual', taxCode: '32', unitCostLc: 0,
        baseType: 'ARIN', baseId: invoice.id, baseLineId: invLine.id, baseDocNo: arNo(invoice), baseRow: 1,
        returnReason: '', returnGoods: false, invoiceId: invoice.id,
      })],
      applications: [],
    });
  })(),

  // ACM-2026-0002: Northgate's 2 defective iPhones, sent back after they were billed — so copied
  // from the invoice with the goods returned, and applied to it straight away.
  (() => {
    const invoice = inv('ar-003');
    const invLine = invoice.lines[0];
    const credit = SEED_CREDITED['ar-003'];
    return memo('acm-002', 2, invoice.customerId, '2026-09-25', { ...invoice, customerRef: 'NPM-RMA-2026-0012' }, {
      status: 'Closed',
      closeDate: '2026-09-25',
      dueDate: '2026-09-25',
      appliedAmount: credit,
      remarks: 'Customer reported screen flickering on both units. RMA issued; units received at MNL warehouse.',
      lines: [newArCmLine({
        id: 'acm-002-1', itemId: invLine.itemId, itemNo: invLine.itemNo, description: invLine.description, quantity: 2,
        uomCode: invLine.uomCode, uomName: invLine.uomName, itemsPerUnit: invLine.itemsPerUnit, warehouse: invLine.warehouse, priceListId: invLine.priceListId,
        unitPrice: invLine.unitPrice, discountPct: invLine.discountPct, priceSource: invLine.priceSource, taxCode: invLine.taxCode, unitCostLc: invLine.unitCostLc,
        baseType: 'ARIN', baseId: invoice.id, baseLineId: invLine.id, baseDocNo: arNo(invoice), baseRow: 1,
        returnReason: 'Defective', returnGoods: true, invoiceId: invoice.id,
      })],
      applications: [{ invoiceId: invoice.id, docNo: arNo(invoice), amount: credit, date: '2026-09-25' }],
    });
  })(),

  // ACM-2026-0003: Credit for Bayanihan's wrong-spec MacBook Air return (SRT-2026-0001), copied from
  // the return — the goods already came back, so returnGoods: false. A memo from a return isn't
  // tied to an invoice: its credit was applied with Apply credit to the invoice billing the delivery.
  (() => {
    const ret = sr('sr-001');
    const rl = ret.lines[0];
    const invoice = inv('ar-008');
    const credit = SEED_CREDITED['ar-008'];
    return memo('acm-003', 3, ret.customerId, '2026-10-05', { ...ret, paymentTermId: ret.paymentTermId }, {
      status: 'Closed',
      closeDate: '2026-10-05',
      dueDate: '2026-11-04',
      appliedAmount: credit,
      remarks: 'Credits the wrong-spec MacBook Air returned on SRT-2026-0001. Applied to SI-2026-0012.',
      lines: [newArCmLine({
        id: 'acm-003-1', itemId: rl.itemId, itemNo: rl.itemNo, description: rl.description, quantity: 1,
        uomCode: rl.uomCode, uomName: rl.uomName, itemsPerUnit: rl.itemsPerUnit, warehouse: rl.warehouse, priceListId: rl.priceListId,
        unitPrice: rl.unitPrice, discountPct: rl.discountPct, priceSource: rl.priceSource, taxCode: rl.taxCode, unitCostLc: rl.unitCostLc,
        baseType: 'SRT', baseId: ret.id, baseLineId: rl.id, baseDocNo: `SRT-${ret.postingDate.slice(0, 4)}-${String(ret.docNum).padStart(4, '0')}`, baseRow: 1,
        returnReason: rl.returnReason, returnGoods: false, invoiceId: '',
      })],
      applications: [{ invoiceId: invoice.id, docNo: arNo(invoice), amount: credit, date: '2026-10-05' }],
    });
  })(),
];
