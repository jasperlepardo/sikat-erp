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
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { AR_STATUSES, type ArInvoice } from '../../../mocks/arInvoices';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { arNumber, arTotal, listArInvoices } from '../../../services/arInvoices';
import { useAsync } from '../../../services/useAsync';
import { AR_STATUS_INTENT } from './detail/ArInvoiceDetail';
import { AR_LIST_PATH } from './detail/types';

export function ArInvoiceList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listArInvoices(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [orders, codes] = data ?? [undefined, []];
  const totalOf = (so: ArInvoice) => arTotal(so, codes);
  const fields = [
    textField<ArInvoice>('no', 'No.', arNumber),
    textField<ArInvoice>('customer', 'Customer', (d) => d.customerName),
    textField<ArInvoice>('customerCode', 'Customer code', (d) => d.customerCode),
    textField<ArInvoice>('customerRef', 'Customer ref.', (d) => d.customerRef),
    dateField<ArInvoice>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<ArInvoice>('dueDate', 'Due date', (d) => d.dueDate),
    textField<ArInvoice>('order', 'Order', (d) => d.orderNumber),
    numberField<ArInvoice>('total', 'Total', totalOf),
    statusField<ArInvoice>(AR_STATUSES),
    masterField<ArInvoice>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<ArInvoice>('salesEmployee', 'Sales employee', salesEmployeeDef, (d) => d.salesEmployeeId),
    linesField<ArInvoice>(),
  ];
  const presets = useListPresets({
    list: 'ar-invoices',
    fields,
    builtIns: statusViews('A/R invoices', AR_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: orders,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(orders ?? []).filter(
      (so) =>
        (!q || [arNumber(so), so.customerCode, so.customerName, so.customerRef, so.orderNumber, ...so.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (so: ArInvoice): string | number => (sort.key === 'total' ? totalOf(so) : sort.key === 'docNum' ? so.docNum : String(so[sort.key as keyof ArInvoice] ?? ''));
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, presets.filter, query, sort, codes]);

  const open = (so: ArInvoice) => navigate(`${AR_LIST_PATH}/${so.id}`);
  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<ArInvoice>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (so) => (
        <TableSubcontent subcopy={so.customerRef ? `Customer ref. ${so.customerRef}` : undefined}>
          <TableLink onClick={() => open(so)}>{arNumber(so)}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (so) => <TableSubcontent subcopy={so.customerCode}>{so.customerName || '—'}</TableSubcontent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (so) => formatDate(so.postingDate) },
    { key: 'orderNumber', header: 'Order', cell: (so) => so.orderNumber || '—' },
    { key: 'dueDate', header: 'Due date', sortable: true, cell: (so) => formatDate(so.dueDate) },
    { key: 'total', header: 'Total', sortable: true, cell: (so) => <TableAmount currency={so.currency}>{formatAmount(totalOf(so))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (so) => <TableStatus intent={AR_STATUS_INTENT[so.status]}>{so.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search invoices"
        searchPlaceholder="Search by invoice no., customer, order or item"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        icon="receipt"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="extra-large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${AR_LIST_PATH}/new`)}>
            New A/R invoice
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
        <Card className={fillCardClass(onPage.length)}>
          {orders ? (
            <Table
              caption="A/R invoices"
              columns={columns}
              rows={onPage}
              getRowId={(so) => so.id}
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
            <Text tone="muted" className="p-4">Loading invoices…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
