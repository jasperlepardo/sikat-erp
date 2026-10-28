import type { DocType } from '../mocks/approvalRules';
import type { PurchasingSettings } from '../mocks/purchaseOrders';
import type { SalesSettings } from '../mocks/salesOrders';
import { CURRENT_USER_ID } from '../mocks/common';
import { getApprovalRule } from './approvalRules';
import { getPurchasingSettings } from './purchaseOrders';
import { getSalesSettings } from './salesOrders';

/** Each document type's "Require approval" switch (Settings › Sales / Purchasing). */
const REQUIRED: Record<DocType, () => boolean> = {
  QT: () => sales('requireQuotationApproval'),
  SO: () => sales('requireSoApproval'),
  DN: () => sales('requireDeliveryApproval'),
  ARINV: () => sales('requireArInvoiceApproval'),
  SR: () => sales('requireSalesReturnApproval'),
  ARCM: () => sales('requireArCreditMemoApproval'),
  RC: () => sales('requireIncomingPaymentApproval'),
  ARRI: () => sales('requireArReserveInvoiceApproval'),
  RFQ: () => purchasing('requireRfqApproval'),
  PO: () => purchasing('requirePoApproval'),
  GRPO: () => purchasing('requireGrpoApproval'),
  APINV: () => purchasing('requireApInvoiceApproval'),
  GRET: () => purchasing('requireGoodsReturnApproval'),
  CM: () => purchasing('requireApCreditMemoApproval'),
  DPR: () => purchasing('requireDprApproval'),
  PMT: () => purchasing('requireOutgoingPaymentApproval'),
  APRI: () => purchasing('requireApReserveInvoiceApproval'),
  DPI: () => purchasing('requireDpiApproval'),
};

function sales(field: keyof SalesSettings) {
  return getSalesSettings()[field] === true;
}

function purchasing(field: keyof PurchasingSettings) {
  return getPurchasingSettings()[field] === true;
}

/**
 * Whether the current user may approve this document type: its named approver, or anyone when
 * approval is required but no approver is set.
 */
export const isApprover = (docType: DocType): boolean => {
  const { approverId } = getApprovalRule(docType);
  return approverId === '' || approverId === CURRENT_USER_ID;
};

/**
 * Whether a new document of this type has to be approved by someone else before it opens. When the
 * current user is its approver, they create it directly.
 */
export const needsApproval = (docType: DocType): boolean => REQUIRED[docType]() && getApprovalRule(docType).approverId !== CURRENT_USER_ID;
