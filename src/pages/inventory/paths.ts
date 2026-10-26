/**
 * List-page paths and status colours for inventory documents. Only type imports here: shared helpers and
 * other pages import these, and importing them from a page module pulls that whole page into
 * every chunk that links to it.
 */
import type { CountStatus } from '../../mocks/inventoryCountings';
import type { TransferRequestStatus } from '../../mocks/inventoryTransferRequests';
import type { TransferStatus } from '../../mocks/inventoryTransfers';

export const TRANSFER_LIST_PATH = '/inventory/inventory-transfers';

export const TRANSFER_STATUS_INTENT: Record<TransferStatus, 'default' | 'success'> = {
  Draft: 'default',
  Posted: 'success',
};

export const TRANSFER_REQUEST_LIST_PATH = '/inventory/transfer-requests';

export const TRANSFER_REQUEST_STATUS_INTENT: Record<TransferRequestStatus, 'primary' | 'success'> = {
  Open: 'primary',
  Closed: 'success',
};

export const COUNT_STATUS_INTENT: Record<CountStatus, 'primary' | 'default'> = { Open: 'primary', Closed: 'default' };

export const COUNT_LIST_PATH = '/inventory/stock-counts';

export const POSTING_LIST_PATH = '/inventory/stock-counts/postings';
