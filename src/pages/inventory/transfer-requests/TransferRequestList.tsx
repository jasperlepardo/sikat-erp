import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { TRANSFER_REQUEST_STATUSES, type InventoryTransferRequest } from '../../../mocks/inventoryTransferRequests';
import { formatDate } from '../../../services/dates';
import { listTransferRequests, requestDestinations, requestOpenQty, requestedQty, transferRequestNumber } from '../../../services/inventoryTransferRequests';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews } from '../../../components/filter/useListPresets';
import { salesEmployeeDef } from '../../settings/masterDefs';
import { TRANSFER_REQUEST_LIST_PATH, TRANSFER_REQUEST_NOUN, TRANSFER_REQUEST_STATUS_INTENT } from '../paths';

export function TransferRequestList({ compact, selectedId }: { compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const requests = useAsync(listTransferRequests, []);
  const fields = [
    textField<InventoryTransferRequest>('no', 'No.', transferRequestNumber),
    textField<InventoryTransferRequest>('from', 'From warehouse', (d) => d.fromWarehouse),
    textField<InventoryTransferRequest>('to', 'To warehouse', requestDestinations),
    dateField<InventoryTransferRequest>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<InventoryTransferRequest>('dueDate', 'Due date', (d) => d.dueDate),
    numberField<InventoryTransferRequest>('openQty', 'Open quantity', requestOpenQty),
    statusField<InventoryTransferRequest>(TRANSFER_REQUEST_STATUSES),
    masterField<InventoryTransferRequest>('salesEmployee', 'Sales employee', salesEmployeeDef, (d) => d.salesEmployeeId),
    textField<InventoryTransferRequest>('remarks', 'Remarks', (d) => d.remarks),
    linesField<InventoryTransferRequest>(),
  ];

  const columns: TableColumn<InventoryTransferRequest>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (r) => <TableContent href={`#${TRANSFER_REQUEST_LIST_PATH}/${r.id}`}>{transferRequestNumber(r)}</TableContent> },
    { key: 'fromWarehouse', header: 'From → To', sortable: true, cell: (r) => <TableContent subcopy={r.remarks || undefined}>{r.fromWarehouse} → {requestDestinations(r).join(', ') || '—'}</TableContent> },
    { key: 'dueDate', header: 'Due date', sortable: true, cell: (r) => (r.dueDate ? formatDate(r.dueDate) : '—') },
    { key: 'openQty', header: 'Open quantity', sortable: true, cell: (r) => <TableContent subcopy={`of ${requestedQty(r).toLocaleString('en-PH')} requested`}>{requestOpenQty(r).toLocaleString('en-PH')}</TableContent> },
    { key: 'status', header: 'Status', sortable: true, cell: (r) => <TableStatus intent={TRANSFER_REQUEST_STATUS_INTENT[r.status]}>{r.status}</TableStatus> },
  ];

  return (
    <ListPage
      rows={requests}
      columns={columns}
      fields={fields}
      noun={TRANSFER_REQUEST_NOUN}
      icon="move_up"
      basePath={TRANSFER_REQUEST_LIST_PATH}
      listKey="inventory-transfer-requests"
      builtIns={statusViews(TRANSFER_REQUEST_NOUN.many, TRANSFER_REQUEST_STATUSES)}
      defaultSort={{ key: 'dueDate', direction: 'asc' }}
      search={{ placeholder: 'Search by request no., warehouse, item or remarks', label: 'Search transfer requests' }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      compact={compact}
      selectedId={selectedId}
      filterFn={(r, q) => !q || [transferRequestNumber(r), r.fromWarehouse, ...requestDestinations(r), r.ref2, r.remarks, ...r.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (r: InventoryTransferRequest): string | number =>
          sort.key === 'openQty' ? requestOpenQty(r) : sort.key === 'docNum' ? r.docNum : String(r[sort.key as keyof InventoryTransferRequest] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
