/**
 * List-page paths and status colours for sales documents. Only type imports here: shared helpers and
 * other pages import these, and importing them from a page module pulls that whole page into
 * every chunk that links to it.
 */
import type { Noun } from '../../components/form/noun';
import type { ArCmStatus } from '../../mocks/arCreditMemos';
import type { ArStatus } from '../../mocks/reserveInvoices';
import type { BaStatus } from '../../mocks/blanketAgreements';
import type { DnStatus } from '../../mocks/deliveries';
import type { IncomingStatus } from '../../mocks/incomingPayments';
import type { SoStatus } from '../../mocks/salesOrders';
import type { SrStatus } from '../../mocks/salesReturns';

export const QT_LIST_PATH = '/sales/quotations';
export const QT_NOUN: Noun = { one: 'quotation', many: 'quotations' };

export const QT_STATUS_INTENT: Record<string, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const SO_LIST_PATH = '/sales/sales-orders';
export const SO_NOUN: Noun = { one: 'sales order', many: 'sales orders' };

export const SO_STATUS_INTENT: Record<SoStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const DN_LIST_PATH = '/sales/deliveries';
export const DN_NOUN: Noun = { one: 'delivery', many: 'deliveries' };

export const DN_STATUS_INTENT: Record<DnStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = { Draft: 'default', 'Not Confirmed': 'warning', Open: 'primary', Closed: 'success', Cancelled: 'danger' };

export const AR_LIST_PATH = '/sales/customer-invoices';
export const AR_NOUN: Noun = { one: 'A/R invoice', many: 'A/R invoices' };

export const AR_STATUS_INTENT: Record<ArStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = { Draft: 'default', 'Not Confirmed': 'warning', Open: 'primary', Closed: 'success', Cancelled: 'danger' };

export const RI_LIST_PATH = '/sales/reserve-invoices';
export const RI_NOUN: Noun = { one: 'A/R reserve invoice', many: 'A/R reserve invoices' };

export const RI_STATUS_INTENT: Record<ArStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const RC_LIST_PATH = '/sales/incoming-payments';
export const RC_NOUN: Noun = { one: 'incoming payment', many: 'incoming payments' };

export const RC_STATUS_INTENT: Record<IncomingStatus, 'default' | 'success' | 'danger' | 'warning'> = { Draft: 'default', 'Not Confirmed': 'warning', Posted: 'success', Cancelled: 'danger' };

export const BA_LIST_PATH = '/sales/agreements';
export const BA_NOUN: Noun = { one: 'sales blanket agreement', many: 'sales blanket agreements' };

export const BA_STATUS_INTENT: Record<BaStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  Approved: 'primary',
  'On Hold': 'warning',
  Terminated: 'danger',
  Closed: 'success',
};

export const AR_CM_LIST_PATH = '/sales/credit-memos';
export const ARCM_NOUN: Noun = { one: 'A/R credit memo', many: 'A/R credit memos' };

export const SR_LIST_PATH = '/sales/sales-returns';
export const SR_NOUN: Noun = { one: 'sales return', many: 'sales returns' };

export const ARCM_STATUS_INTENT: Record<ArCmStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const SR_STATUS_INTENT: Record<SrStatus, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  Draft: 'default',
  'Not Confirmed': 'warning',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};
