/**
 * List-page paths and status colours for purchasing documents. Only type imports here: shared helpers and
 * other pages import these, and importing them from a page module pulls that whole page into
 * every chunk that links to it.
 */
import type { StatusIntent } from '../../components/form/fields';
import type { ApRiStatus } from '../../mocks/apReserveInvoices';
import type { ApStatus } from '../../mocks/apInvoices';
import type { DprStatus } from '../../mocks/apDownPayments';
import type { DpiStatus } from '../../mocks/apDownPaymentInvoices';
import type { GrStatus } from '../../mocks/goodsReceipts';
import type { LcStatus } from '../../mocks/landedCosts';
import type { MemoStatus } from '../../mocks/apCreditMemos';
import type { PaymentStatus } from '../../mocks/outgoingPayments';
import type { PbaStatus } from '../../mocks/purchaseBlanketAgreements';
import type { PoStatus } from '../../mocks/purchaseOrders';
import type { PrStatus } from '../../mocks/purchaseRequests';
import type { ReturnStatus } from '../../mocks/goodsReturns';
import type { GrrStatus } from '../../mocks/goodsReturnRequests';
import type { RfqStatus } from '../../mocks/rfqs';

export const PO_LIST_PATH = '/purchasing/purchase-orders';

export const PO_STATUS_INTENT: Record<PoStatus, 'default' | 'primary' | 'warning' | 'success' | 'danger'> = {
  Draft: 'default',
  Open: 'primary',
  'Not Confirmed': 'warning',
  Closed: 'success',
  Cancelled: 'danger',
};

export const PR_LIST_PATH = '/purchasing/purchase-requests';

export const PR_STATUS_INTENT: Record<PrStatus, 'default' | 'primary' | 'success' | 'danger'> = {
  Open: 'primary',
  Closed: 'success',
};

export const RFQ_LIST_PATH = '/purchasing/purchase-quotations';

export const RFQ_STATUS_INTENT: Record<RfqStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const GR_LIST_PATH = '/purchasing/goods-receipts';

export const GR_STATUS_INTENT: Record<GrStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const AP_LIST_PATH = '/purchasing/vendor-invoices';

export const AP_STATUS_INTENT: Record<ApStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const APRI_LIST_PATH = '/purchasing/reserve-invoices';

export const AP_RI_STATUS_INTENT: Record<ApRiStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const PAYMENT_LIST_PATH = '/purchasing/outgoing-payments';

export const PAYMENT_STATUS_INTENT: Record<PaymentStatus, 'default' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Posted: 'success',
  Cancelled: 'danger',
};

export const DPR_LIST_PATH = '/purchasing/down-payment-requests';
export const DPI_LIST_PATH = '/purchasing/down-payment-invoices';
export const DPI_STATUS_INTENT: Record<DpiStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const DPR_STATUS_INTENT: Record<DprStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const PBA_LIST_PATH = '/purchasing/agreements';

export const PBA_STATUS_INTENT: Record<PbaStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  Approved: 'primary',
  'On Hold': 'warning',
  Terminated: 'danger',
  Closed: 'success',
};

export const RETURN_LIST_PATH = '/purchasing/goods-returns';
export const GRR_LIST_PATH = '/purchasing/goods-return-requests';
export const GRR_STATUS_INTENT: Record<GrrStatus, 'default' | 'primary' | 'success'> = {
  Open: 'primary',
  Closed: 'success',
};

export const MEMO_LIST_PATH = '/purchasing/debit-memos';

export const MEMO_STATUS_INTENT: Record<MemoStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const RETURN_STATUS_INTENT: Record<ReturnStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const LC_LIST_PATH = '/purchasing/landed-costs';

export const LC_STATUS_INTENT: Record<LcStatus, StatusIntent> = {
  Draft: 'default',
  Open: 'primary',
  Cancelled: 'danger',
};
