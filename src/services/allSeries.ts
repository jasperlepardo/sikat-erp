/**
 * All document-numbering series collections. Every document type that auto-assigns
 * a number has one collection here so series can be edited in Settings › Document
 * Numbering. Each service imports its own collection from here.
 */
import type { DocumentSeries } from '../mocks/common';
import { PO_SERIES } from '../mocks/purchaseOrders';
import { SO_SERIES } from '../mocks/salesOrders';
import { GR_SERIES } from '../mocks/goodsReceipts';
import { AP_SERIES } from '../mocks/apInvoices';
import { MEMO_SERIES } from '../mocks/apCreditMemos';
import { DPR_SERIES } from '../mocks/apDownPayments';
import { AR_SERIES } from '../mocks/arInvoices';
import { AR_CREDIT_SERIES } from '../mocks/arCreditMemos';
import { DN_SERIES } from '../mocks/deliveries';
import { RETURN_SERIES } from '../mocks/goodsReturns';
import { SR_SERIES } from '../mocks/salesReturns';
import { QT_SERIES } from '../mocks/quotations';
import { TRANSFER_SERIES } from '../mocks/inventoryTransfers';
import { COUNT_SERIES, POSTING_SERIES } from '../mocks/inventoryCountings';
import { INCOMING_SERIES } from '../mocks/incomingPayments';
import { PAYMENT_SERIES } from '../mocks/outgoingPayments';
import { JE_SERIES } from '../mocks/journalEntries';
import { BA_SERIES } from '../mocks/blanketAgreements';
import { BUSINESS_TYPES } from '../mocks/masters';
import { createCollection } from './store';
import { bpGroups, territories } from './partnerMasters';
import { currencies } from './masterData';

// Purchasing — v2 bumps the key so stale localStorage reloads with the new prefix seeds
export const poSeries = createCollection<DocumentSeries>('sikat-erp:po-series:v2', PO_SERIES, 'ser');
export const grSeries = createCollection<DocumentSeries>('sikat-erp:gr-series', GR_SERIES, 'grs');
export const apSeries = createCollection<DocumentSeries>('sikat-erp:ap-series', AP_SERIES, 'aps');
export const memoSeries = createCollection<DocumentSeries>('sikat-erp:memo-series', MEMO_SERIES, 'cms');
export const dprSeries = createCollection<DocumentSeries>('sikat-erp:dpr-series', DPR_SERIES, 'dps');
export const outgoingPaymentSeries = createCollection<DocumentSeries>('sikat-erp:payment-series', PAYMENT_SERIES, 'ops');
export const returnSeries = createCollection<DocumentSeries>('sikat-erp:return-series', RETURN_SERIES, 'rts');

// Sales Returns
export const srSeries = createCollection<DocumentSeries>('sikat-erp:sr-series', SR_SERIES, 'srs');

// Sales
export const qtSeries = createCollection<DocumentSeries>('sikat-erp:qt-series', QT_SERIES, 'qts');
export const soSeries = createCollection<DocumentSeries>('sikat-erp:so-series', SO_SERIES, 'sos');
export const dnSeries = createCollection<DocumentSeries>('sikat-erp:dn-series', DN_SERIES, 'dns');
export const arSeries = createCollection<DocumentSeries>('sikat-erp:ar-series', AR_SERIES, 'ars');
export const arCreditSeries = createCollection<DocumentSeries>('sikat-erp:ar-credit-series', AR_CREDIT_SERIES, 'acms');
export const incomingPaymentSeries = createCollection<DocumentSeries>('sikat-erp:incoming-series', INCOMING_SERIES, 'rcs');

// Inventory
export const transferSeries = createCollection<DocumentSeries>('sikat-erp:transfer-series', TRANSFER_SERIES, 'its');
export const countSeries = createCollection<DocumentSeries>('sikat-erp:count-series', COUNT_SERIES, 'ics');
export const postingSeries = createCollection<DocumentSeries>('sikat-erp:posting-series', POSTING_SERIES, 'ips');

// Sales Blanket Agreements
export const baSeries = createCollection<DocumentSeries>('sikat-erp:ba-series', BA_SERIES, 'bas');

// Accounting
export const jeSeries = createCollection<DocumentSeries>('sikat-erp:je-series', JE_SERIES, 'jes');

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Format a document number from its series definition.
 * - When `segments` are defined: renders each segment joined by "-", using `date` for year/month parts.
 * - Otherwise: `prefix + docNum` or `"Series Name docNum"`.
 * - Returns `placeholder` (default "Draft") when docNum is 0.
 * Pass an ISO date string (e.g. "2026-10-10") as the third argument for year/month segments.
 */
export function formatDocNum(
  series: Pick<DocumentSeries, 'name' | 'prefix' | 'segments'>,
  docNum: number,
  dateOrPlaceholder = 'Draft',
  placeholder = 'Draft',
): string {
  const isDate = /^\d{4}-\d{2}/.test(dateOrPlaceholder);
  const date = isDate ? dateOrPlaceholder : undefined;
  const ph = isDate ? placeholder : dateOrPlaceholder;
  if (!docNum) return ph;
  if (series.segments?.length) {
    return series.segments.map((seg) => {
      switch (seg.type) {
        case 'literal': return seg.value ?? '';
        case 'year': return date ? date.slice(0, 4) : new Date().getFullYear().toString();
        case 'year_short': return date ? date.slice(2, 4) : String(new Date().getFullYear()).slice(2);
        case 'month': return date ? date.slice(5, 7) : String(new Date().getMonth() + 1).padStart(2, '0');
        case 'month_name': return date ? MONTH_NAMES[Number(date.slice(5, 7)) - 1] : MONTH_NAMES[new Date().getMonth()];
        case 'sequence': return String(docNum).padStart(seg.padding ?? 4, '0');
        default: return '';
      }
    }).join('-');
  }
  return series.prefix ? `${series.prefix}${docNum}` : `${series.name} ${docNum}`;
}

/**
 * Find the first active series whose conditions all match the given context.
 * Returns undefined if no series matches. Falls back to the caller choosing the default.
 */
export function matchingSeries(
  all: readonly DocumentSeries[],
  context: Record<string, string | undefined>,
): DocumentSeries | undefined {
  return all.find((s) => {
    if (!s.active || !s.conditions?.length) return false;
    return s.conditions.every((c) => context[c.field] === c.value);
  });
}

/**
 * Look up a series from a live collection by id, falling back to the default or
 * the first. Pass the seed array as a last-resort fallback.
 */
export function seriesLookup(
  collection: { snapshot: () => readonly DocumentSeries[] },
  id: string,
  fallback: readonly DocumentSeries[],
): DocumentSeries {
  const all = collection.snapshot();
  return (
    all.find((s) => s.id === id) ??
    all.find((s) => s.isDefault) ??
    all[0] ??
    fallback[0]
  ) as DocumentSeries;
}

/** A named field available as a condition for auto-selecting a document series. */
export interface ConditionField {
  field: string;
  label: string;
  options: () => { value: string; label: string }[];
}

/** Metadata about each document type for display in the settings page. */
export interface DocTypeConfig {
  key: string;
  label: string;
  icon: string;
  collection: ReturnType<typeof createCollection<DocumentSeries>>;
  fallback: DocumentSeries[];
  /** Condition fields available for auto-selection routing on this document type. */
  conditionFields?: ConditionField[];
}

// Condition fields for each document type — options() is called at render time, not module load.
const bizTypes = (): { value: string; label: string }[] => BUSINESS_TYPES.map((t) => ({ value: t, label: t }));
const bpGroupOpts = (): { value: string; label: string }[] => bpGroups.snapshot().filter((g) => g.active).map((g) => ({ value: g.id, label: g.name }));
const territoryOpts = (): { value: string; label: string }[] => territories.snapshot().filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }));
const currencyOpts = (): { value: string; label: string }[] => currencies.snapshot().filter((c) => c.active).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));
const paymentMethodOpts = (): { value: string; label: string }[] => [
  { value: 'CASH', label: 'Cash' }, { value: 'BANK', label: 'Bank transfer' },
  { value: 'CARD', label: 'Credit / debit card' }, { value: 'GCASH', label: 'GCash' }, { value: 'CHECK', label: 'Check' },
];

const SO_FIELDS: ConditionField[] = [
  { field: 'businessType', label: 'Business type', options: bizTypes },
  { field: 'bpGroupId', label: 'BP group', options: bpGroupOpts },
  { field: 'territoryId', label: 'Territory', options: territoryOpts },
  { field: 'currency', label: 'Currency', options: currencyOpts },
];
const PO_FIELDS: ConditionField[] = [
  { field: 'businessType', label: 'Business type', options: bizTypes },
  { field: 'bpGroupId', label: 'BP group', options: bpGroupOpts },
  { field: 'currency', label: 'Currency', options: currencyOpts },
];
const AR_FIELDS: ConditionField[] = [
  { field: 'businessType', label: 'Business type', options: bizTypes },
  { field: 'bpGroupId', label: 'BP group', options: bpGroupOpts },
  { field: 'currency', label: 'Currency', options: currencyOpts },
];
const PAYMENT_FIELDS: ConditionField[] = [
  { field: 'currency', label: 'Currency', options: currencyOpts },
  { field: 'paymentMethod', label: 'Payment method', options: paymentMethodOpts },
];

export const DOC_TYPES: DocTypeConfig[] = [
  { key: 'purchase-orders', label: 'Purchase Orders', icon: 'shopping_cart', collection: poSeries, fallback: PO_SERIES, conditionFields: PO_FIELDS },
  { key: 'goods-receipts', label: 'Goods Receipts', icon: 'inventory', collection: grSeries, fallback: GR_SERIES },
  { key: 'ap-invoices', label: 'AP Invoices (Bills)', icon: 'receipt_long', collection: apSeries, fallback: AP_SERIES, conditionFields: PO_FIELDS },
  { key: 'ap-credit-memos', label: 'AP Credit Memos', icon: 'undo', collection: memoSeries, fallback: MEMO_SERIES },
  { key: 'down-payment-requests', label: 'Down Payment Requests', icon: 'payments', collection: dprSeries, fallback: DPR_SERIES },
  { key: 'outgoing-payments', label: 'Outgoing Payments', icon: 'arrow_circle_up', collection: outgoingPaymentSeries, fallback: PAYMENT_SERIES, conditionFields: PAYMENT_FIELDS },
  { key: 'goods-returns', label: 'Goods Returns', icon: 'keyboard_return', collection: returnSeries, fallback: RETURN_SERIES },
  { key: 'sales-returns', label: 'Sales Returns', icon: 'assignment_return', collection: srSeries, fallback: SR_SERIES, conditionFields: AR_FIELDS },
  { key: 'sales-orders', label: 'Sales Orders', icon: 'storefront', collection: soSeries, fallback: SO_SERIES, conditionFields: SO_FIELDS },
  { key: 'deliveries', label: 'Deliveries', icon: 'local_shipping', collection: dnSeries, fallback: DN_SERIES, conditionFields: AR_FIELDS },
  { key: 'ar-invoices', label: 'AR Invoices', icon: 'request_quote', collection: arSeries, fallback: AR_SERIES, conditionFields: AR_FIELDS },
  { key: 'ar-credit-memos', label: 'A/R Credit Memos', icon: 'undo', collection: arCreditSeries, fallback: AR_CREDIT_SERIES, conditionFields: AR_FIELDS },
  { key: 'incoming-payments', label: 'Incoming Payments', icon: 'arrow_circle_down', collection: incomingPaymentSeries, fallback: INCOMING_SERIES, conditionFields: PAYMENT_FIELDS },
  { key: 'inventory-transfers', label: 'Inventory Transfers', icon: 'swap_horiz', collection: transferSeries, fallback: TRANSFER_SERIES },
  { key: 'stock-counts', label: 'Stock Counts', icon: 'fact_check', collection: countSeries, fallback: COUNT_SERIES },
  { key: 'inventory-postings', label: 'Inventory Postings', icon: 'post_add', collection: postingSeries, fallback: POSTING_SERIES },
  { key: 'blanket-agreements', label: 'Blanket Agreements', icon: 'description', collection: baSeries, fallback: BA_SERIES, conditionFields: SO_FIELDS },
  { key: 'journal-entries', label: 'Journal Entries', icon: 'menu_book', collection: jeSeries, fallback: JE_SERIES },
];
