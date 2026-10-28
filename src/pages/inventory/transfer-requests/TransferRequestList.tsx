import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import {
  Alert,
  Card,
  Panel,
  Table,
  TableContent,
  TableStatus,
  type TableColumn,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../components/form/PageHeader';
import { cap } from '../../../components/form/noun';
import { TRANSFER_REQUEST_STATUSES, type InventoryTransferRequest } from '../../../mocks/inventoryTransferRequests';
import { formatDate } from '../../../services/dates';
import {
  listTransferRequests,
  requestDestinations,
  requestOpenQty,
  requestedQty,
  transferRequestNumber,
} from '../../../services/inventoryTransferRequests';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { salesEmployeeDef } from '../../settings/masterDefs';
import { fillCardClass, useListPage } from '../../../components/form/DataTable';
import { TRANSFER_REQUEST_LIST_PATH, TRANSFER_REQUEST_NOUN, TRANSFER_REQUEST_STATUS_INTENT } from '../paths';

export function TransferRequestList() {
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
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();
  const presets = useListPresets({
    list: 'inventory-transfer-requests',
    fields,
    builtIns: statusViews(TRANSFER_REQUEST_NOUN.many, TRANSFER_REQUEST_STATUSES),
    defaultSort: { key: 'dueDate', direction: 'asc' },
    rows: requests,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(requests ?? []).filter(
      (r) =>
        !q ||
        [transferRequestNumber(r), r.fromWarehouse, ...requestDestinations(r), r.ref2, r.remarks, ...r.lines.map((l) => `${l.itemNo} ${l.description}`)]
          .join(' ')
          .toLowerCase()
          .includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (r: InventoryTransferRequest): string | number =>
      sort.key === 'openQty' ? requestOpenQty(r) : sort.key === 'docNum' ? r.docNum : String(r[sort.key as keyof InventoryTransferRequest] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, presets.filter, query, sort]);

  const { visible: onPage, pagination } = paginate(rows);

  const columns: TableColumn<InventoryTransferRequest>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (r) => <TableContent href={`#${TRANSFER_REQUEST_LIST_PATH}/${r.id}`}>{transferRequestNumber(r)}</TableContent>,
    },
    {
      key: 'fromWarehouse',
      header: 'From → To',
      sortable: true,
      cell: (r) => (
        <TableContent subcopy={r.remarks || undefined}>
          {r.fromWarehouse} → {requestDestinations(r).join(', ') || '—'}
        </TableContent>
      ),
    },
    { key: 'dueDate', header: 'Due date', sortable: true, cell: (r) => (r.dueDate ? formatDate(r.dueDate) : '—') },
    {
      key: 'openQty',
      header: 'Open quantity',
      sortable: true,
      cell: (r) => (
        <TableContent subcopy={`of ${requestedQty(r).toLocaleString('en-PH')} requested`}>{requestOpenQty(r).toLocaleString('en-PH')}</TableContent>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (r) => <TableStatus intent={TRANSFER_REQUEST_STATUS_INTENT[r.status]}>{r.status}</TableStatus>,
    },
  ];

  return (
    <Panel className="flex-1">
      <PageHeader
        showSearch
        searchLabel="Search transfer requests"
        searchPlaceholder="Search by request no., warehouse, item or remarks"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        icon="move_up"
        title={presets.menu}
        create={{ noun: TRANSFER_REQUEST_NOUN, to: TRANSFER_REQUEST_LIST_PATH }}
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        {presets.bar(null)}
        <Card className={fillCardClass(onPage.length)}>
          {requests ? (
            <Table
              caption={cap(TRANSFER_REQUEST_NOUN.many)}
              columns={columns}
              rows={onPage}
              getRowId={(r) => r.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              pagination={pagination}
            />
          ) : (
            <Text tone="muted" className="p-4">Loading transfer requests…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
