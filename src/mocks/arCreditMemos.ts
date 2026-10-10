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
import { blankArInvoice, newArLine, SEED_AR_INVOICES, type ArInvoice, type ArLine } from './arInvoices';
import { SEED_DELIVERIES } from './deliveries';
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

const round2 = (n: number) => Math.round(n * 100) / 100;
const bp = (id: string) => SEED_PARTNERS.find((p) => p.id === id)!;
const dn = (id: string) => SEED_DELIVERIES.find((d) => d.id === id)!;
const sr = (id: string) => SEED_SALES_RETURNS.find((r) => r.id === id)!;
const inv = (id: string) => SEED_AR_INVOICES.find((i) => i.id === id)!;

export const SEED_AR_CREDIT_MEMOS: ArCreditMemo[] = [
  // ACM-2026-0001: Credit memo for Bayanihan's wrong-spec MacBook Air return (sr-002).
  // Copied from the sales return; the goods came back via the return so returnGoods: false here.
  // Closed — applied in full to AR invoice ar-001.
  (() => {
    const ret = sr('sr-002');
    const delivery = dn('dn-001');
    const customer = bp(ret.customerId);
    const bill = customer.addresses.find((a) => a.id === customer.defaultBillToId) ?? customer.addresses[0];
    const dnLine = delivery.lines.find((l) => l.id === 'dn-001-so-001-2')!;
    const unitPrice = round2(94750 / 1.12);
    const net = round2(1 * unitPrice * (1 - 6 / 100));
    const vat = round2(net * 0.12);
    const total = round2(net + vat);
    return {
      ...blankArCreditMemo(ret.postingDate, CURRENT_USER_ID),
      id: 'acm-001',
      docNum: 1,
      status: 'Closed' as const,
      closeDate: '2026-10-05',
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      contactId: ret.contactId,
      currency: 'PHP',
      postingDate: '2026-10-05',
      documentDate: '2026-10-05',
      dueDate: '2026-11-04',
      customerRef: ret.customerRef,
      paymentTermId: ret.paymentTermId,
      federalTaxId: customer.tin,
      salesEmployeeId: ret.salesEmployeeId,
      billTo: bill ? formatAddress(bill, customer.name) : '',
      shipTo: ret.shipTo,
      journalRemark: `A/R Credit Memos – ${customer.code}`,
      controlAccount: '1120',
      appliedAmount: total,
      remarks: 'Credits the wrong-spec MacBook Air returned on SRT-2026-0002. Applied to SI-2026-0001.',
      lines: [newArCmLine({
        id: 'acm-001-1',
        itemId: dnLine.itemId,
        itemNo: dnLine.itemNo,
        description: dnLine.description,
        quantity: 1,
        uomCode: dnLine.uomCode,
        uomName: dnLine.uomName,
        itemsPerUnit: 1,
        warehouse: dnLine.warehouse,
        priceListId: dnLine.priceListId,
        unitPrice,
        discountPct: 6,
        priceSource: 'Special price: 6% off Wholesale',
        taxCode: '31',
        unitCostLc: dnLine.unitCostLc,
        baseType: 'SRT' as const,
        baseId: ret.id,
        baseLineId: ret.lines[0].id,
        baseDocNo: 'SRT-2026-0002',
        baseRow: 1,
        returnReason: 'Wrong item',
        returnGoods: false,
        invoiceId: 'ar-001',
      })],
      applications: [{ invoiceId: 'ar-001', docNo: 'SI-2026-0001', amount: total, date: '2026-10-05' }],
    } satisfies ArCreditMemo;
  })(),

  // ACM-2026-0002: Standalone price-correction credit memo for Clarkfield.
  // Their MacBook Airs (DN-2026-0012 / SI-2026-0001 ar-c01) were billed at the wrong price —
  // 1 unit overbilled by ₱5,000 net. No goods return; this is a price adjustment only.
  (() => {
    const customer = bp('bp-004');
    const bill = customer.addresses.find((a) => a.id === customer.defaultBillToId) ?? customer.addresses[0];
    const invoice = inv('ar-c01');
    const invLine = invoice.lines[0];
    const net = 5000; // Clarkfield is zero-rated (PEZA), so no VAT
    return {
      ...blankArCreditMemo(invoice.postingDate, CURRENT_USER_ID),
      id: 'acm-002',
      docNum: 2,
      status: 'Open' as const,
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      contactId: invoice.contactId,
      currency: 'PHP',
      postingDate: '2026-08-20',
      documentDate: '2026-08-20',
      dueDate: '2026-09-19',
      customerRef: 'CGSI-PRICE-ADJ-0814',
      paymentTermId: customer.customerPaymentTermId ?? termId('Net 30'),
      federalTaxId: customer.tin,
      salesEmployeeId: invoice.salesEmployeeId,
      billTo: bill ? formatAddress(bill, customer.name) : '',
      shipTo: invoice.shipTo,
      journalRemark: `A/R Credit Memos – ${customer.code}`,
      controlAccount: '1120',
      appliedAmount: 0,
      remarks: 'Price correction — MacBook Airs billed at the standard Wholesale price instead of the agreed PEZA rate. Credit for the difference on 1 unit.',
      lines: [newArCmLine({
        id: 'acm-002-1',
        itemId: invLine.itemId,
        itemNo: invLine.itemNo,
        description: invLine.description,
        quantity: 1,
        uomCode: invLine.uomCode,
        uomName: invLine.uomName,
        itemsPerUnit: 1,
        warehouse: invLine.warehouse,
        priceListId: invLine.priceListId,
        unitPrice: net,
        discountPct: 0,
        priceSource: 'Manual',
        taxCode: '32',
        unitCostLc: 0,
        baseType: 'ARIN' as const,
        baseId: invoice.id,
        baseLineId: invLine.id,
        baseDocNo: `SI-${invoice.postingDate.slice(0, 4)}-${String(invoice.docNum).padStart(4, '0')}`,
        baseRow: 1,
        returnReason: '',
        returnGoods: false,
        invoiceId: invoice.id,
      })],
      applications: [],
    } satisfies ArCreditMemo;
  })(),
];

