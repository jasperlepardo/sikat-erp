export interface JournalPattern {
  id: string;
  name: string;
  template: string;
  isDefault: boolean;
  active: boolean;
}

export interface PatternVariable {
  key: string;
  label: string;
  description: string;
}

// Variable groups — assembled per doc type in the service.
export const DOC_VARS: PatternVariable[] = [
  { key: 'docType', label: 'Doc type', description: 'Document type name, e.g. "Purchase Invoice"' },
  { key: 'docNo', label: 'Doc no.', description: 'Document number, e.g. "PI-2026-00015"' },
  { key: 'postingDate', label: 'Posting date', description: 'Posting date (YYYY-MM-DD)' },
  { key: 'documentDate', label: 'Document date', description: 'Document date (YYYY-MM-DD)' },
  { key: 'series', label: 'Series', description: 'Series name' },
  { key: 'remarks', label: 'Remarks', description: 'Free-text remarks entered on the document, e.g. "Purchase of office chairs"' },
];

export const PARTNER_VARS: PatternVariable[] = [
  { key: 'entityCode', label: 'Partner code', description: 'Customer or vendor code' },
  { key: 'entityName', label: 'Partner name', description: 'Customer or vendor name' },
];

export const ACCOUNTING_VARS: PatternVariable[] = [
  { key: 'currency', label: 'Currency', description: 'Document currency code, e.g. "PHP"' },
  { key: 'projectCode', label: 'Project', description: 'BP project code' },
];

export const SALES_VARS: PatternVariable[] = [
  { key: 'salesEmployee', label: 'Sales employee', description: 'Sales employee name' },
  { key: 'contactName', label: 'Contact', description: 'Contact person full name' },
];

export const INVENTORY_VARS: PatternVariable[] = [
  { key: 'fromWarehouse', label: 'From warehouse', description: 'Source warehouse code' },
  { key: 'toWarehouse', label: 'To warehouse', description: 'Destination warehouse code' },
  { key: 'reference', label: 'Reference', description: 'Document reference number or note' },
];

export const REFERENCE_VARS: PatternVariable[] = [INVENTORY_VARS[2]];

export const PAYMENT_VARS: PatternVariable[] = [
  { key: 'paymentMethod', label: 'Payment method', description: 'Payment method code, e.g. "BANK"' },
  { key: 'accountCode', label: 'Account', description: 'G/L account code' },
];

// Seed data — one default pattern per doc type.
export const PO_PATTERNS: JournalPattern[] = [{ id: 'jp-po-1', name: 'Default', template: 'Purchase Orders – {entityCode}', isDefault: true, active: true }];
export const GR_PATTERNS: JournalPattern[] = [{ id: 'jp-gr-1', name: 'Default', template: 'Goods Receipt PO – {entityCode}', isDefault: true, active: true }];
export const AP_PATTERNS: JournalPattern[] = [{ id: 'jp-ap-1', name: 'Default', template: 'A/P Invoices – {entityCode}', isDefault: true, active: true }];
export const APCM_PATTERNS: JournalPattern[] = [{ id: 'jp-apcm-1', name: 'Default', template: 'A/P Credit Memo – {entityCode}', isDefault: true, active: true }];
export const DPR_PATTERNS: JournalPattern[] = [{ id: 'jp-dpr-1', name: 'Default', template: 'A/P Down Payment – {entityCode}', isDefault: true, active: true }];
export const OP_PATTERNS: JournalPattern[] = [{ id: 'jp-op-1', name: 'Default', template: 'Outgoing – {entityCode}', isDefault: true, active: true }];
export const GRTN_PATTERNS: JournalPattern[] = [{ id: 'jp-grtn-1', name: 'Default', template: 'Goods Returns – {entityCode}', isDefault: true, active: true }];
export const SO_PATTERNS: JournalPattern[] = [{ id: 'jp-so-1', name: 'Default', template: 'Sales Orders – {entityCode}', isDefault: true, active: true }];
export const DN_PATTERNS: JournalPattern[] = [{ id: 'jp-dn-1', name: 'Default', template: 'Deliveries – {entityCode}', isDefault: true, active: true }];
export const AR_PATTERNS: JournalPattern[] = [{ id: 'jp-ar-1', name: 'Default', template: 'A/R Invoices – {entityCode}', isDefault: true, active: true }];
export const IP_PATTERNS: JournalPattern[] = [{ id: 'jp-ip-1', name: 'Default', template: 'Incoming – {entityCode}', isDefault: true, active: true }];
export const IT_PATTERNS: JournalPattern[] = [{ id: 'jp-it-1', name: 'Default', template: 'Inventory Transfers – {fromWarehouse} to {toWarehouse}', isDefault: true, active: true }];
export const SC_PATTERNS: JournalPattern[] = [{ id: 'jp-sc-1', name: 'Default', template: 'Inventory Posting', isDefault: true, active: true }];
export const ISP_PATTERNS: JournalPattern[] = [{ id: 'jp-isp-1', name: 'Default', template: 'Inventory Posting – {reference}', isDefault: true, active: true }];
export const JE_PATTERNS: JournalPattern[] = [{ id: 'jp-je-1', name: 'Default', template: 'Journal Entry', isDefault: true, active: true }];
export const RI_PATTERNS: JournalPattern[] = [{ id: 'jp-ri-1', name: 'Default', template: 'Reserve Invoice – {entityCode}', isDefault: true, active: true }];
export const LC_PATTERNS: JournalPattern[] = [{ id: 'jp-lc-1', name: 'Default', template: 'Landed Costs – {entityCode}', isDefault: true, active: true }];
