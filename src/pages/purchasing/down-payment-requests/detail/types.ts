import type { Errors } from '../../../../components/form/fields';
import type { Account } from '../../../../mocks/chartOfAccounts';
import type { Attachment } from '../../../../mocks/common';
import { type DownPaymentRequest } from '../../../../mocks/apDownPayments';
import type { PurchaseOrder } from '../../../../mocks/purchaseOrders';
import type { PoMasters } from '../../purchase-orders/detail/types';
import type { GrContext } from '../../goods-receipts/detail/types';

;


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
