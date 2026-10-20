import type { Errors } from '../../../../components/form/fields';
import { CARD_PAYABLE_ACCOUNT, newCardRow, newCheckRow, type PaymentMeans } from '../../../../mocks/outgoingPayments';
import type { Partner } from '../../../../mocks/partners';
import { overallAmount, type PaymentInput } from '../../../../services/outgoingPayments';
import type { PayablesMasters } from '../payables';

export type OpDraft = PaymentInput;

/** One payment means per payment for now; combined means (payment lines) come later. */
export type MeansTab = 'transfer' | 'cash' | 'card' | 'check';
export const MEANS_LABEL: Record<MeansTab, string> = { transfer: 'Bank Transfer', cash: 'Cash', card: 'Credit Card', check: 'Check' };

/** Where a validation problem shows: the header cards, the bills table or the payment method. */
export type OpArea = 'bills' | 'method';

export interface OpContext {
  vendor?: Partner;
  /** PHP per unit of the payment currency on the posting date (or as posted). */
  fx: number;
  readOnly: boolean;
  /** Opened from a selection or a saved draft: the vendor is fixed. */
  vendorLocked: boolean;
}

export interface OpSectionProps {
  draft: OpDraft;
  update: (patch: Partial<OpDraft>) => void;
  errors: Errors;
  m: PayablesMasters;
  ctx: OpContext;
}

/** The means a saved payment used: whichever carries the amount, else whichever has a line. */
export function meansTabOf(means: PaymentMeans): MeansTab {
  if (means.checks.length) return 'check';
  if (means.cards.length) return 'card';
  if (means.cash.amount) return 'cash';
  return 'transfer';
}

/**
 * The payment means with `tab` carrying the whole amount to pay, and the others empty. The
 * amount isn't typed: it always equals what the bills table pays.
 */
export function applyMeans(d: OpDraft, tab: MeansTab): PaymentMeans {
  const amount = overallAmount(d);
  const { means } = d;
  return {
    ...means,
    bankCharge: 0,
    transfer: { ...means.transfer, amount: tab === 'transfer' ? amount : 0 },
    cash: { ...means.cash, amount: tab === 'cash' ? amount : 0 },
    checks: tab === 'check' ? [{ ...(means.checks[0] ?? newCheckRow({ account: means.transfer.account, dueDate: d.postingDate })), amount }] : [],
    cards: tab === 'card' ? [{ ...(means.cards[0] ?? newCardRow({ account: CARD_PAYABLE_ACCOUNT })), amount }] : [],
  };
}
