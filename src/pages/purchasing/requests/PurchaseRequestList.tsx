import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableLink,
  TableStatus,
  TableSubcontent,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { PR_STATUSES, type PurchaseRequest } from '../../../mocks/purchaseRequests';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listPurchaseRequests, prNumber, prTotals } from '../../../services/purchaseRequests';
import { useAsync } from '../../../services/useAsync';
import { PR_LIST_PATH, STATUS_INTENT } from './detail/PurchaseRequestDetail';
import { dateField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';

export function PurchaseRequestList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listPurchaseRequests(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [requests, codes] = data ?? [undefined, []];

  const totalOf = (pr: PurchaseRequest) =>
    prTotals(pr, (code) => {
      const c = codes.find((x) => x.code === code);
      return c ? 0 : 0; // tax codes loaded separately; totals here are info price only
    }).total;

  const fields = [
    textField<PurchaseRequest>('no', 'No.', prNumber),
    textField<PurchaseRequest>('requester', 'Requester', (r) => r.requesterName),
    textField<PurchaseRequest>('branch', 'Branch', (r) => r.branch),
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
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(requests ?? []).filter((r) =>
      !q ||
      [prNumber(r), r.requesterName, r.branch, ...r.lines.map((l) => `${l.itemNo} ${l.itemDescription}`)]
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

  const open = (r: PurchaseRequest) =>
    navigate(`${PR_LIST_PATH}/${r.docNum ? prNumber(r) : r.id}`);

  const columns: TableColumn<PurchaseRequest>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (r) => (
        <TableLink onClick={() => open(r)}>{prNumber(r)}</TableLink>
      ),
    },
    {
      key: 'requesterName',
      header: 'Requester',
      sortable: true,
      cell: (r) => <TableSubcontent subcopy={r.branch}>{r.requesterName || '—'}</TableSubcontent>,
    },
    {
      key: 'department',
      header: 'Department',
      cell: (r) => r.department || '—',
    },
    {
      key: 'postingDate',
      header: 'Posting date',
      sortable: true,
      cell: (r) => r.postingDate,
    },
    {
      key: 'requiredDate',
      header: 'Required by',
      sortable: true,
      cell: (r) => r.requiredDate || '—',
    },
    {
      key: 'lines',
      header: 'Lines',
      cell: (r) => (
        <TableSubcontent subcopy={`${r.lines.filter((l) => l.status === 'Open').length} open`}>
          {r.lines.length}
        </TableSubcontent>
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
      cell: (r) => <TableStatus intent={STATUS_INTENT[r.status]}>{r.status}</TableStatus>,
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search purchase requests"
        searchPlaceholder="Search by request no., requester, branch or item"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
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
        <Card className={fillCardClass(rows.slice((page - 1) * pageSize, page * pageSize).length)}>
          {requests ? (
            <Table
              caption="Purchase requests"
              columns={columns}
              rows={rows.slice((page - 1) * pageSize, page * pageSize)}
              getRowId={(r) => r.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              onRowAction={open}
              pagination={{
                page,
                pageSize,
                total: rows.length,
                pageSizes: PAGE_SIZES,
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size);
                  setPage(1);
                },
              }}
            />
          ) : (
            <Text tone="muted" className="p-4">Loading purchase requests…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
