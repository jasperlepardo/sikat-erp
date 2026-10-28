const DOC_TYPES = ['RFQ', 'PO', 'GRPO', 'APINV', 'GRET', 'CM', 'DPR', 'PMT', 'QT', 'SO', 'DN', 'ARINV', 'SR', 'ARCM', 'RC', 'ARRI', 'APRI', 'DPI'] as const;
export type DocType = typeof DOC_TYPES[number];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  RFQ: 'Purchase Quotation',
  PO: 'Purchase Order',
  GRPO: 'Goods Receipt',
  APINV: 'A/P Invoice',
  GRET: 'Goods Return',
  CM: 'A/P Credit Memo',
  DPR: 'Down Payment Request',
  PMT: 'Outgoing Payment',
  QT: 'Sales Quotation',
  SO: 'Sales Order',
  DN: 'Delivery',
  ARINV: 'A/R Invoice',
  SR: 'Sales Return',
  ARCM: 'A/R Credit Memo',
  RC: 'Incoming Payment',
  ARRI: 'A/R Reserve Invoice',
  APRI: 'A/P Reserve Invoice',
  DPI: 'A/P Down Payment Invoice',
};

export interface ApprovalRule {
  id: DocType;
  approverId: string;
}

export const SEED_APPROVAL_RULES: ApprovalRule[] = DOC_TYPES.map((id) => ({ id, approverId: '' }));
