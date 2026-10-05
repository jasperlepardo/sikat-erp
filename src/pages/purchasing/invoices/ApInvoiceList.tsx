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
  TableAmount,
  TableLink,
  TableStatus,
  TableSubcontent,
  Tabs,
  TextField,
  type TableColumn,
  type TableSort,
  Text,
} from '@jasperlepardo/sikat-design-system';
import { AP_STATUSES, type ApInvoice, type ApStatus } from '../../../mocks/apInvoices';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { apNumber, apTotal, listApInvoices } from '../../../services/apInvoices';
import { todayISO } from '../../../services/dates';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { AP_LIST_PATH, AP_STATUS_INTENT } from './detail/ApInvoiceDetail';

type Filter = 'all' | ApStatus;

export function ApInvoiceList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listApInvoices(), taxCodes.list()]), []);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'postingDate', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [invoices, codes] = data ?? [undefined, []];
  const totalOf = (inv: ApInvoice) => apTotal(inv, codes);
  const today = todayISO();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (invoices ?? []).filter(
      (inv) =>
        (filter === 'all' || inv.status === filter) &&
        (!q ||
          [apNumber(inv), inv.vendorCode, inv.vendorName, inv.vendorRef, inv.orderNumber, ...inv.lines.map((l) => `${l.itemNo} ${l.description} ${l.baseDocNo}`)]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (inv: ApInvoice): string | number =>
      sort.key === 'total' ? totalOf(inv) : sort.key === 'docNum' ? inv.docNum : String(inv[sort.key as keyof ApInvoice] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, filter, query, sort, codes]);

  const open = (inv: ApInvoice) => navigate(`${AP_LIST_PATH}/${inv.id}`);
  const count = (f: Filter) => String(invoices?.filter((inv) => f === 'all' || inv.status === f).length ?? '');

  const columns: TableColumn<ApInvoice>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (inv) => (
        <TableSubcontent subcopy={inv.vendorRef ? `Vendor ref. ${inv.vendorRef}` : undefined}>
          <TableLink onClick={() => open(inv)}>{apNumber(inv)}</TableLink>
        </TableSubcontent>
      ),
    },
    {
      key: 'vendorName',
      header: 'Vendor',
      sortable: true,
      cell: (inv) => <TableSubcontent subcopy={inv.vendorCode}>{inv.vendorName || '—'}</TableSubcontent>,
    },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (inv) => formatDate(inv.postingDate) },
    {
      key: 'dueDate',
      header: 'Due date',
      sortable: true,
      cell: (inv) => (
        <TableSubcontent subcopy={inv.status === 'Open' && inv.dueDate && inv.dueDate < today ? 'Overdue' : inv.paymentBlock ? 'Payment block' : undefined}>
          {inv.dueDate ? formatDate(inv.dueDate) : '—'}
        </TableSubcontent>
      ),
    },
    { key: 'orderNumber', header: 'Purchase order', sortable: true, cell: (inv) => (inv.orderNumber ? `PO ${inv.orderNumber}` : <span className="text-muted">Without PO</span>) },
    { key: 'total', header: 'Total', sortable: true, cell: (inv) => <TableAmount currency={inv.currency}>{formatAmount(totalOf(inv))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (inv) => <TableStatus intent={AP_STATUS_INTENT[inv.status]}>{inv.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="request_quote"
        title="Bills"
        subcopy="A/P invoices from vendors: what you owe, billed against goods receipts or purchase orders."
        actions={
          <Button intent="primary" variant="solid" size="extra-large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${AP_LIST_PATH}/new`)}>
            New A/P invoice
          </Button>
        }
        tabs={
          <Tabs
            variant="outline"
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter);
              setPage(1);
            }}
            items={(['all', ...AP_STATUSES] as Filter[]).map((f) => ({ value: f, label: f === 'all' ? 'All' : f, badge: count(f) }))}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        <TextField
          aria-label="Search bills"
          placeholder="Search by invoice no., vendor, vendor invoice no., PO or receipt no., or item"
          leadingIcon={<Icon size={20}>search</Icon>}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setPage(1);
          }}
        />
        <Card className={fillCardClass(rows.slice((page - 1) * pageSize, page * pageSize).length)}>
          {invoices ? (
            <Table
              caption="A/P invoices"
              columns={columns}
              rows={rows.slice((page - 1) * pageSize, page * pageSize)}
              getRowId={(inv) => inv.id}
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
            <Text tone="muted" className="p-4">Loading bills…</Text>
          )}
        </Card>
      </Panel.Body>
    </Panel>
  );
}
