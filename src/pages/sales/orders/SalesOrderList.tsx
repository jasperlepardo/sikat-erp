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
import { SO_STATUSES, type SalesOrder } from '../../../mocks/salesOrders';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listSalesOrders, openQty, soNumber, soTotal } from '../../../services/salesOrders';
import { useAsync } from '../../../services/useAsync';
import { SO_STATUS_INTENT } from './detail/SalesOrderDetail';
import { SO_LIST_PATH } from './detail/types';

export function SalesOrderList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listSalesOrders(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [orders, codes] = data ?? [undefined, []];
  const totalOf = (so: SalesOrder) => soTotal(so, codes);
  const fields = [
    textField<SalesOrder>('no', 'No.', soNumber),
    textField<SalesOrder>('customer', 'Customer', (d) => d.customerName),
    textField<SalesOrder>('customerCode', 'Customer code', (d) => d.customerCode),
    textField<SalesOrder>('customerRef', 'Customer ref.', (d) => d.customerRef),
    dateField<SalesOrder>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<SalesOrder>('deliveryDate', 'Delivery date', (d) => d.deliveryDate),
    numberField<SalesOrder>('total', 'Total', totalOf),
    statusField<SalesOrder>(SO_STATUSES),
    masterField<SalesOrder>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<SalesOrder>('salesEmployee', 'Sales employee', salesEmployeeDef, (d) => d.salesEmployeeId),
    linesField<SalesOrder>(),
  ];
  const presets = useListPresets({
    list: 'sales-orders',
    fields,
    builtIns: statusViews('sales orders', SO_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: orders,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(orders ?? []).filter(
      (so) =>
        (!q || [soNumber(so), so.customerCode, so.customerName, so.customerRef, ...so.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (so: SalesOrder): string | number => (sort.key === 'total' ? totalOf(so) : sort.key === 'docNum' ? so.docNum : String(so[sort.key as keyof SalesOrder] ?? ''));
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, presets.filter, query, sort, codes]);

  const open = (so: SalesOrder) => navigate(`${SO_LIST_PATH}/${so.id}`);
  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<SalesOrder>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (so) => (
        <TableSubcontent subcopy={so.customerRef ? `Customer ref. ${so.customerRef}` : undefined}>
          <TableLink onClick={() => open(so)}>{soNumber(so)}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (so) => <TableSubcontent subcopy={so.customerCode}>{so.customerName || '—'}</TableSubcontent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (so) => formatDate(so.postingDate) },
    { key: 'deliveryDate', header: 'Delivery date', sortable: true, cell: (so) => (so.deliveryDate ? formatDate(so.deliveryDate) : '—') },
    {
      key: 'open',
      header: 'Open qty',
      cell: (so) => (
        <TableSubcontent subcopy={`${so.lines.length} line${so.lines.length === 1 ? '' : 's'}`}>
          {so.docType === 'Service' ? 'Service' : so.lines.reduce((n, l) => n + openQty(l), 0).toLocaleString('en-PH')}
        </TableSubcontent>
      ),
    },
    { key: 'total', header: 'Total', sortable: true, cell: (so) => <TableAmount currency={so.currency}>{formatAmount(totalOf(so))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (so) => <TableStatus intent={SO_STATUS_INTENT[so.status]}>{so.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search sales orders"
        searchPlaceholder="Search by order no., customer, customer ref. or item"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        icon="shopping_bag"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${SO_LIST_PATH}/new`)}>
            New sales order
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
              caption="Sales orders"
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
            <Text tone="muted" className="p-4">Loading sales orders…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
