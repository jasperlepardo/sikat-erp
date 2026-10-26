import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { formatDate } from '../../../services/dates';
import {
  Alert,
  Button,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableContent,
  TableStatus,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { PR_STATUSES, type PurchaseRequest } from '../../../mocks/purchaseRequests';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listPurchaseRequests, prNumber, prTotals } from '../../../services/purchaseRequests';
import { useAsync } from '../../../services/useAsync';
import { nameIn } from '../../../services/partnerMasters';
import { branches, departments } from '../../../services/peopleMasters';
import { dateField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { useListPage } from '../../../components/form/DataTable';
import { PR_LIST_PATH, PR_STATUS_INTENT } from '../paths';

export function PurchaseRequestList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listPurchaseRequests(), taxCodes.list(), branches.list(), departments.list()]), []);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();

  const [requests, codes] = data ?? [undefined, []];

  const totalOf = (pr: PurchaseRequest) =>
    prTotals(pr, (code) => {
      const c = codes.find((x) => x.code === code);
      return c ? 0 : 0; // tax codes loaded separately; totals here are info price only
    }).total;

  const branchOf = (r: PurchaseRequest) => (r.branchId ? nameIn(branches, r.branchId) : '');

  const fields = [
    textField<PurchaseRequest>('no', 'No.', prNumber),
    textField<PurchaseRequest>('requester', 'Requester', (r) => r.requesterName),
    textField<PurchaseRequest>('branch', 'Branch', branchOf),
    dateField<PurchaseRequest>('postingDate', 'Posting date', (r) => r.postingDate),
    dateField<PurchaseRequest>('requiredDate', 'Required date', (r) => r.requiredDate),
    numberField<PurchaseRequest>('total', 'Total', totalOf),
    statusField<PurchaseRequest>(PR_STATUSES),
  ];
  const presets = useListPresets({
    list: 'purchase-requests',
    fields,
    builtIns: statusViews('purchase requests', PR_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: requests,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(requests ?? []).filter((r) =>
      !q ||
      [prNumber(r), r.requesterName, branchOf(r), ...r.lines.map((l) => `${l.itemNo} ${l.description}`)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (r: PurchaseRequest): string | number =>
      sort.key === 'total' ? totalOf(r) : sort.key === 'docNum' ? r.docNum : String(r[sort.key as keyof PurchaseRequest] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, presets.filter, query, sort]);

  const columns: TableColumn<PurchaseRequest>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (r) => (
        <TableContent href={`#${PR_LIST_PATH}/${r.docNum ? prNumber(r) : r.id}`}>{prNumber(r)}</TableContent>
      ),
    },
    {
      key: 'requesterName',
      header: 'Requester',
      sortable: true,
      cell: (r) => <TableContent subcopy={branchOf(r)}>{r.requesterName || '—'}</TableContent>,
    },
    {
      key: 'departmentId',
      header: 'Department',
      cell: (r) => (r.departmentId ? nameIn(departments, r.departmentId) : '—'),
    },
    {
      key: 'postingDate',
      header: 'Posting date',
      sortable: true,
      cell: (r) => formatDate(r.postingDate),
    },
    {
      key: 'requiredDate',
      header: 'Required by',
      sortable: true,
      cell: (r) => (r.requiredDate ? formatDate(r.requiredDate) : '—'),
    },
    {
      key: 'lines',
      header: 'Lines',
      cell: (r) => (
        <TableContent subcopy={`${r.lines.filter((l) => l.status === 'Open').length} open`}>
          {r.lines.length}
        </TableContent>
      ),
    },
    {
      key: 'total',
      header: 'Est. total',
      sortable: true,
      cell: (r) => <span className="tabular-nums">PHP {formatAmount(totalOf(r))}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (r) => <TableStatus intent={PR_STATUS_INTENT[r.status]}>{r.status}</TableStatus>,
    },
  ];

  const { visible, pagination } = paginate(rows);

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search purchase requests"
        searchPlaceholder="Search by request no., requester, branch or item"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        icon="inbox"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={presets.menu}
        actions={
          <Button
            intent="primary"
            variant="solid"
            size="medium"
            shape="pill"
            leadingIcon={<Icon size={20}>add</Icon>}
            onClick={() => navigate(`${PR_LIST_PATH}/new`)}
          >
            New request
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        {presets.bar(null)}
        {requests ? (
          <Table
            caption="Purchase requests"
            columns={columns}
            rows={visible}
            getRowId={(r) => r.id}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            pagination={pagination}
          />
        ) : (
          <Text tone="muted" className="p-4">Loading purchase requests…</Text>
        )}
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
