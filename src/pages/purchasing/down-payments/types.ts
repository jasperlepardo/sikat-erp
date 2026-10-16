import type { Errors } from '../../../components/form/fields';
import type { Account } from '../../../mocks/chartOfAccounts';
import type { Attachment } from '../../../mocks/common';
import { DPR_STATUSES, type DownPaymentRequest, type DprStatus } from '../../../mocks/apDownPayments';
import type { PurchaseOrder } from '../../../mocks/purchaseOrders';
import type { PoMasters } from '../orders/detail/types';
import type { GrContext } from '../receipts/detail/types';

export type { DPR_STATUSES };

export const DPR_STATUS_INTENT: Record<DprStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export type DprDraft = Omit<DownPaymentRequest, 'id'> & { id?: string; attachments?: Attachment[] };

export interface DprMasters extends PoMasters {
  orders: PurchaseOrder[];
  accounts: Account[];
}

export interface DprSectionProps {
  draft: DprDraft;
  update: (patch: Partial<DprDraft>) => void;
  errors: Errors;
  m: DprMasters;
  ctx: GrContext;
}
