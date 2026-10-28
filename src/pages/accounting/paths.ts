/**
 * List-page paths and status colours for accounting documents. Only type imports here: shared helpers and
 * other pages import these, and importing them from a page module pulls that whole page into
 * every chunk that links to it.
 */
import type { Noun } from '../../components/form/noun';

export const JE_LIST_PATH = '/accounting/journal-entries';
export const JE_NOUN: Noun = { one: 'journal entry', many: 'journal entries' };

export const JE_STATUS_INTENT = { Posted: 'success', Reversed: 'default' } as const;

export const JV_LIST_PATH = '/accounting/journal-vouchers';
export const JV_NOUN: Noun = { one: 'journal voucher', many: 'journal vouchers' };

export const entryPath = (voucherId: string, entryId: string) => `${JV_LIST_PATH}/${voucherId}/entries/${entryId}`;

export const GL_ACCOUNT_NOUN: Noun = { one: 'G/L account', many: 'G/L accounts' };
