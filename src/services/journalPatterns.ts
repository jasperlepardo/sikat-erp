import {
  type JournalPattern,
  type PatternVariable,
  DOC_VARS, PARTNER_VARS, ACCOUNTING_VARS, SALES_VARS, INVENTORY_VARS, REFERENCE_VARS, PAYMENT_VARS,
  PO_PATTERNS, GR_PATTERNS, AP_PATTERNS, APCM_PATTERNS, DPR_PATTERNS, OP_PATTERNS, GRTN_PATTERNS,
  SO_PATTERNS, DN_PATTERNS, AR_PATTERNS, IP_PATTERNS, IT_PATTERNS, SC_PATTERNS, ISP_PATTERNS, JE_PATTERNS, LC_PATTERNS, RI_PATTERNS,
} from '../mocks/journalPatterns';
import { createCollection, type Collection } from './store';

export type { JournalPattern, PatternVariable };

export interface JournalContext {
  docType?: string;
  docNo?: string;
  postingDate?: string;
  documentDate?: string;
  series?: string;
  entityCode?: string;
  entityName?: string;
  currency?: string;
  projectCode?: string;
  salesEmployee?: string;
  contactName?: string;
  fromWarehouse?: string;
  toWarehouse?: string;
  reference?: string;
  paymentMethod?: string;
  accountCode?: string;
}

export interface DocPatternConfig {
  key: string;
  label: string;
  icon: string;
  collection: Collection<JournalPattern>;
  variables: PatternVariable[];
  /** Overrides the default sample values shown in the template preview. */
  sample?: Partial<Record<string, string>>;
}

// One collection per doc type — same subset as document-numbering in settingsNav.
export const poPatterns = createCollection<JournalPattern>('sikat-erp:po-patterns', PO_PATTERNS, 'jp');
export const grPatterns = createCollection<JournalPattern>('sikat-erp:gr-patterns', GR_PATTERNS, 'jp');
export const apPatterns = createCollection<JournalPattern>('sikat-erp:ap-patterns', AP_PATTERNS, 'jp');
export const apcmPatterns = createCollection<JournalPattern>('sikat-erp:apcm-patterns', APCM_PATTERNS, 'jp');
export const dprPatterns = createCollection<JournalPattern>('sikat-erp:dpr-patterns', DPR_PATTERNS, 'jp');
export const opPatterns = createCollection<JournalPattern>('sikat-erp:op-patterns', OP_PATTERNS, 'jp');
export const grtnPatterns = createCollection<JournalPattern>('sikat-erp:grtn-patterns', GRTN_PATTERNS, 'jp');
export const soPatterns = createCollection<JournalPattern>('sikat-erp:so-patterns-jp', SO_PATTERNS, 'jp');
export const dnPatterns = createCollection<JournalPattern>('sikat-erp:dn-patterns', DN_PATTERNS, 'jp');
export const arPatterns = createCollection<JournalPattern>('sikat-erp:ar-patterns', AR_PATTERNS, 'jp');
export const ipPatterns = createCollection<JournalPattern>('sikat-erp:ip-patterns', IP_PATTERNS, 'jp');
export const itPatterns = createCollection<JournalPattern>('sikat-erp:it-patterns', IT_PATTERNS, 'jp');
export const scPatterns = createCollection<JournalPattern>('sikat-erp:sc-patterns', SC_PATTERNS, 'jp');
export const ispPatterns = createCollection<JournalPattern>('sikat-erp:isp-patterns', ISP_PATTERNS, 'jp');
export const jePatterns = createCollection<JournalPattern>('sikat-erp:je-patterns', JE_PATTERNS, 'jp');
export const lcPatterns = createCollection<JournalPattern>('sikat-erp:lc-patterns', LC_PATTERNS, 'jp');
export const riPatterns = createCollection<JournalPattern>('sikat-erp:ri-patterns', RI_PATTERNS, 'jp');

const PURCHASING = [...DOC_VARS, ...PARTNER_VARS, ...ACCOUNTING_VARS];
const SALES = [...DOC_VARS, ...PARTNER_VARS, ...ACCOUNTING_VARS, ...SALES_VARS];
const PAYMENTS_PURCHASE = [...DOC_VARS, ...PARTNER_VARS, ...ACCOUNTING_VARS, ...PAYMENT_VARS];
const PAYMENTS_SALES = [...DOC_VARS, ...PARTNER_VARS, ...ACCOUNTING_VARS, ...PAYMENT_VARS];

const VENDOR = { entityCode: 'VD-001', entityName: 'ABC Supplies', remarks: 'Purchase of office chairs' };
const CUSTOMER = { entityCode: 'BP-001', entityName: 'XYZ Corporation', remarks: 'Sales of laptop units' };

export const DOC_PATTERN_TYPES: DocPatternConfig[] = [
  { key: 'purchase-orders',       label: 'Purchase Orders',       icon: 'shopping_cart',    collection: poPatterns,   variables: PURCHASING,        sample: { ...VENDOR, docNo: 'PO-2026-00015' } },
  { key: 'goods-receipts',        label: 'Goods Receipts',        icon: 'inventory',        collection: grPatterns,   variables: PURCHASING,        sample: { ...VENDOR, docNo: 'GRPO-2026-00015' } },
  { key: 'ap-invoices',           label: 'AP Invoices',           icon: 'receipt_long',     collection: apPatterns,   variables: PURCHASING,        sample: { ...VENDOR, docNo: 'PI-2026-00015' } },
  { key: 'ap-credit-memos',       label: 'AP Credit Memos',       icon: 'undo',             collection: apcmPatterns, variables: PURCHASING,        sample: { ...VENDOR, docNo: 'PCM-2026-00015' } },
  { key: 'down-payment-requests', label: 'Down Payment Requests', icon: 'payments',         collection: dprPatterns,  variables: PURCHASING,        sample: { ...VENDOR, docNo: 'DPR-2026-00015' } },
  { key: 'outgoing-payments',     label: 'Outgoing Payments',     icon: 'arrow_circle_up',  collection: opPatterns,   variables: PAYMENTS_PURCHASE, sample: { ...VENDOR, docNo: 'OP-2026-00015' } },
  { key: 'goods-returns',         label: 'Goods Returns',         icon: 'keyboard_return',  collection: grtnPatterns, variables: PURCHASING,        sample: { ...VENDOR, docNo: 'GR-2026-00015' } },
  { key: 'sales-orders',          label: 'Sales Orders',          icon: 'storefront',       collection: soPatterns,   variables: SALES,             sample: { ...CUSTOMER, docNo: 'SO-2026-00015' } },
  { key: 'deliveries',            label: 'Deliveries',            icon: 'local_shipping',   collection: dnPatterns,   variables: SALES,             sample: { ...CUSTOMER, docNo: 'DN-2026-00015' } },
  { key: 'ar-invoices',           label: 'AR Invoices',           icon: 'request_quote',    collection: arPatterns,   variables: SALES,             sample: { ...CUSTOMER, docNo: 'SI-2026-00015' } },
  { key: 'reserve-invoices',      label: 'Reserve Invoices',      icon: 'receipt_long',     collection: riPatterns,   variables: SALES,             sample: { ...CUSTOMER, docNo: 'RI-2026-00001' } },
  { key: 'incoming-payments',     label: 'Incoming Payments',     icon: 'arrow_circle_down', collection: ipPatterns,  variables: PAYMENTS_SALES,    sample: { ...CUSTOMER, docNo: 'RC-2026-00015' } },
  { key: 'inventory-transfers',   label: 'Inventory Transfers',   icon: 'swap_horiz',       collection: itPatterns,   variables: [...DOC_VARS, ...INVENTORY_VARS], sample: { docNo: 'IT-2026-00015', fromWarehouse: 'WH-MNL', toWarehouse: 'WH-CEB' } },
  { key: 'stock-counts',          label: 'Stock Counts',          icon: 'fact_check',       collection: scPatterns,   variables: [...DOC_VARS, ...REFERENCE_VARS], sample: { docNo: 'SC-2026-00015', reference: 'Month-end count' } },
  { key: 'inventory-postings',    label: 'Inventory Postings',    icon: 'post_add',         collection: ispPatterns,  variables: [...DOC_VARS, ...REFERENCE_VARS], sample: { docNo: 'IP-2026-00015', reference: 'Opening stock adjustment' } },
  { key: 'journal-entries',       label: 'Journal Entries',       icon: 'menu_book',        collection: jePatterns,   variables: [...DOC_VARS],     sample: { docNo: 'JE-2026-00015' } },
  { key: 'landed-costs',          label: 'Landed Costs',          icon: 'calculate',        collection: lcPatterns,   variables: PURCHASING,        sample: { ...VENDOR, docNo: 'LC-2026-00001' } },
];

export function defaultJournalRemark(docTypeKey: string, context: JournalContext): string {
  const config = DOC_PATTERN_TYPES.find((d) => d.key === docTypeKey);
  if (!config) return '';
  const all = config.collection.snapshot();
  const pattern = all.find((p) => p.isDefault && p.active) ?? all.find((p) => p.active);
  if (!pattern) return '';
  const substituted = pattern.template.replace(/\{(\w+)\}/g, (_, key) =>
    (context as Record<string, string | undefined>)[key] ?? ''
  );
  // Split on " – " or " - " (with surrounding whitespace), drop empty segments, rejoin.
  // This prevents dangling separators when optional variables like {remarks} are blank.
  const parts = substituted.split(/\s+[–\-]\s+/);
  return parts.map((p) => p.trim()).filter(Boolean).join(' – ');
}
