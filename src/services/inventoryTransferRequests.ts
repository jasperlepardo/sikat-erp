import {
  SEED_TRANSFER_REQUESTS,
  TRANSFER_REQUEST_SERIES,
  type InventoryTransferRequest,
  type TransferRequestLine,
} from '../mocks/inventoryTransferRequests';
import type { InventoryTransfer } from '../mocks/inventoryTransfers';
import { transferRequestSeries, seriesLookup, formatDocNum } from './allSeries';
import { todayISO } from './dates';
import { createCollection } from './store';

const requests = createCollection<InventoryTransferRequest>('sikat-erp:inventory-transfer-requests', SEED_TRANSFER_REQUESTS, 'itr');

export const listTransferRequests = requests.list;
export const getTransferRequest = requests.get;

export type TransferRequestInput = Omit<InventoryTransferRequest, 'id'> & { id?: string };

const seriesOf = (id: string) => seriesLookup(transferRequestSeries, id, TRANSFER_REQUEST_SERIES);
/** "ITR-2026-0002", or the series name before the request is added. */
export const transferRequestNumber = (r: Pick<InventoryTransferRequest, 'seriesId' | 'docNum' | 'postingDate'>) =>
  formatDocNum(seriesOf(r.seriesId), r.docNum, r.postingDate);

export const openQty = (l: Pick<TransferRequestLine, 'openQty'>) => Math.max(0, l.openQty);
export const requestedQty = (r: Pick<InventoryTransferRequest, 'lines'>) => r.lines.reduce((n, l) => n + l.quantity, 0);
export const requestOpenQty = (r: Pick<InventoryTransferRequest, 'lines'>) => r.lines.reduce((n, l) => n + openQty(l), 0);
/** Every destination on the request: the header's, plus any a line overrides it with. */
export const requestDestinations = (r: Pick<InventoryTransferRequest, 'lines' | 'toWarehouse'>) =>
  [...new Set([r.toWarehouse, ...r.lines.map((l) => l.toWarehouse)].filter(Boolean))];

/** Add or save an open request. Adding assigns the next number; nothing moves either way. */
export async function saveTransferRequest(input: TransferRequestInput): Promise<InventoryTransferRequest> {
  if (input.docNum) return requests.save(input);
  const series = seriesOf(input.seriesId);
  const all = await requests.list();
  const docNum = Math.max(series.firstNo - 1, ...all.filter((r) => r.seriesId === series.id).map((r) => r.docNum)) + 1;
  return requests.save({ ...input, docNum });
}

/** Close by hand: what's still open is no longer needed. Can't be undone. */
export async function closeTransferRequest(r: InventoryTransferRequest): Promise<InventoryTransferRequest> {
  return requests.save({ ...r, status: 'Closed', closeDate: todayISO() });
}

/**
 * A posted transfer copied from a request: each line it fulfils loses the transferred quantity
 * (never below 0), and the request closes once nothing is open.
 */
export async function fulfilTransferRequest(t: Pick<InventoryTransfer, 'baseRequestId' | 'postingDate' | 'lines'>) {
  if (!t.baseRequestId) return;
  const r = await requests.get(t.baseRequestId);
  if (!r || r.status === 'Closed') return;
  const sent = new Map<string, number>();
  for (const l of t.lines) if (l.baseLineId) sent.set(l.baseLineId, (sent.get(l.baseLineId) ?? 0) + l.quantity);
  const lines = r.lines.map((l) => (sent.has(l.id) ? { ...l, openQty: Math.max(0, l.openQty - sent.get(l.id)!) } : l));
  const done = lines.every((l) => l.openQty <= 0);
  await requests.save({ ...r, lines, ...(done ? { status: 'Closed' as const, closeDate: t.postingDate } : {}) });
}
