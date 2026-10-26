/**
 * List-page paths and status colours for accounting documents. Only type imports here: shared helpers and
 * other pages import these, and importing them from a page module pulls that whole page into
 * every chunk that links to it.
 */
export const JE_LIST_PATH = '/accounting/journal-entries';

export const JE_STATUS_INTENT = { Posted: 'success', Reversed: 'default' } as const;

export const JV_LIST_PATH = '/accounting/journal-vouchers';

export const entryPath = (voucherId: string, entryId: string) => `${JV_LIST_PATH}/${voucherId}/entries/${entryId}`;
