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
import { DN_SERIES } from '../mocks/deliveries';
import { RETURN_SERIES } from '../mocks/goodsReturns';
import { TRANSFER_SERIES } from '../mocks/inventoryTransfers';
import { COUNT_SERIES, POSTING_SERIES } from '../mocks/inventoryCountings';
import { INCOMING_SERIES } from '../mocks/incomingPayments';
import { PAYMENT_SERIES } from '../mocks/outgoingPayments';
import { JE_SERIES } from '../mocks/journalEntries';
import { createCollection } from './store';

// Purchasing — v2 bumps the key so stale localStorage reloads with the new prefix seeds
export const poSeries = createCollection<DocumentSeries>('sikat-erp:po-series:v2', PO_SERIES, 'ser');
export const grSeries = createCollection<DocumentSeries>('sikat-erp:gr-series', GR_SERIES, 'grs');
export const apSeries = createCollection<DocumentSeries>('sikat-erp:ap-series', AP_SERIES, 'aps');
export const memoSeries = createCollection<DocumentSeries>('sikat-erp:memo-series', MEMO_SERIES, 'cms');
export const dprSeries = createCollection<DocumentSeries>('sikat-erp:dpr-series', DPR_SERIES, 'dps');
export const outgoingPaymentSeries = createCollection<DocumentSeries>('sikat-erp:payment-series', PAYMENT_SERIES, 'ops');
export const returnSeries = createCollection<DocumentSeries>('sikat-erp:return-series', RETURN_SERIES, 'rts');

// Sales
export const soSeries = createCollection<DocumentSeries>('sikat-erp:so-series', SO_SERIES, 'sos');
export const dnSeries = createCollection<DocumentSeries>('sikat-erp:dn-series', DN_SERIES, 'dns');
export const arSeries = createCollection<DocumentSeries>('sikat-erp:ar-series', AR_SERIES, 'ars');
export const incomingPaymentSeries = createCollection<DocumentSeries>('sikat-erp:incoming-series', INCOMING_SERIES, 'rcs');

// Inventory
export const transferSeries = createCollection<DocumentSeries>('sikat-erp:transfer-series', TRANSFER_SERIES, 'its');
export const countSeries = createCollection<DocumentSeries>('sikat-erp:count-series', COUNT_SERIES, 'ics');
export const postingSeries = createCollection<DocumentSeries>('sikat-erp:posting-series', POSTING_SERIES, 'ips');

// Accounting
export const jeSeries = createCollection<DocumentSeries>('sikat-erp:je-series', JE_SERIES, 'jes');

/**
 * Format a document number: prefix + docNum when a prefix is set,
 * otherwise "Series Name docNum". Returns `placeholder` (default "Draft") when docNum is 0.
 */
export function formatDocNum(
  series: Pick<DocumentSeries, 'name' | 'prefix'>,
  docNum: number,
  placeholder = 'Draft',
): string {
  if (!docNum) return placeholder;
  return series.prefix ? `${series.prefix}${docNum}` : `${series.name} ${docNum}`;
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

/** Metadata about each document type for display in the settings page. */
export interface DocTypeConfig {
  key: string;
  label: string;
  icon: string;
  collection: ReturnType<typeof createCollection<DocumentSeries>>;
  fallback: DocumentSeries[];
}

export const DOC_TYPES: DocTypeConfig[] = [
  { key: 'purchase-orders', label: 'Purchase Orders', icon: 'shopping_cart', collection: poSeries, fallback: PO_SERIES },
  { key: 'goods-receipts', label: 'Goods Receipts', icon: 'inventory', collection: grSeries, fallback: GR_SERIES },
  { key: 'ap-invoices', label: 'AP Invoices (Bills)', icon: 'receipt_long', collection: apSeries, fallback: AP_SERIES },
  { key: 'ap-credit-memos', label: 'AP Credit Memos', icon: 'undo', collection: memoSeries, fallback: MEMO_SERIES },
  { key: 'down-payment-requests', label: 'Down Payment Requests', icon: 'payments', collection: dprSeries, fallback: DPR_SERIES },
  { key: 'outgoing-payments', label: 'Outgoing Payments', icon: 'arrow_circle_up', collection: outgoingPaymentSeries, fallback: PAYMENT_SERIES },
  { key: 'goods-returns', label: 'Goods Returns', icon: 'keyboard_return', collection: returnSeries, fallback: RETURN_SERIES },
  { key: 'sales-orders', label: 'Sales Orders', icon: 'storefront', collection: soSeries, fallback: SO_SERIES },
  { key: 'deliveries', label: 'Deliveries', icon: 'local_shipping', collection: dnSeries, fallback: DN_SERIES },
  { key: 'ar-invoices', label: 'AR Invoices', icon: 'request_quote', collection: arSeries, fallback: AR_SERIES },
  { key: 'incoming-payments', label: 'Incoming Payments', icon: 'arrow_circle_down', collection: incomingPaymentSeries, fallback: INCOMING_SERIES },
  { key: 'inventory-transfers', label: 'Inventory Transfers', icon: 'swap_horiz', collection: transferSeries, fallback: TRANSFER_SERIES },
  { key: 'stock-counts', label: 'Stock Counts', icon: 'fact_check', collection: countSeries, fallback: COUNT_SERIES },
  { key: 'inventory-postings', label: 'Inventory Postings', icon: 'post_add', collection: postingSeries, fallback: POSTING_SERIES },
  { key: 'journal-entries', label: 'Journal Entries', icon: 'menu_book', collection: jeSeries, fallback: JE_SERIES },
];
