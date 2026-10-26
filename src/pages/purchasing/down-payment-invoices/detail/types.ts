import type { Errors } from '../../../../components/form/fields';
import type { Account } from '../../../../mocks/chartOfAccounts';
import type { DownPaymentInvoice } from '../../../../mocks/apDownPaymentInvoices';
import type { PurchaseOrder } from '../../../../mocks/purchaseOrders';
import type { PoMasters } from '../../purchase-orders/detail/types';
import type { GrContext } from '../../goods-receipts/detail/types';

export type DpiDraft = Omit<DownPaymentInvoice, 'id'> & { id?: string };

export interface DpiMasters extends PoMasters {
  orders: PurchaseOrder[];
  accounts: Account[];
}

export interface DpiSectionProps {
  draft: DpiDraft;
  update: (patch: Partial<DpiDraft>) => void;
  errors: Errors;
  m: DpiMasters;
  ctx: GrContext;
}
