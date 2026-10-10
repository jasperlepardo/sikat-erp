import type { ArCmInput, ArCmPostError } from '../../../services/arCreditMemos';
import type { ArCmStatus } from '../../../mocks/arCreditMemos';
import type { SrStatus } from '../../../mocks/salesReturns';

export const AC_LIST_PATH = '/sales/returns-and-credits';
export const AR_CM_LIST_PATH = '/sales/returns-and-credits/credit-memos';
export const SR_LIST_PATH = '/sales/returns-and-credits/returns';

export type ArCmDraft = ArCmInput;

export const ARCM_STATUS_INTENT: Record<ArCmStatus, 'default' | 'primary' | 'success' | 'danger'> = {
  Draft: 'default',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export const SR_STATUS_INTENT: Record<SrStatus, 'default' | 'primary' | 'success' | 'danger'> = {
  Draft: 'default',
  Open: 'primary',
  Closed: 'success',
  Cancelled: 'danger',
};

export type { ArCmPostError };
