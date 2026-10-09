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
import { DN_STATUSES, type Delivery } from '../../../mocks/deliveries';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { dnNumber, dnTotal, listDeliveries } from '../../../services/deliveries';
import { useAsync } from '../../../services/useAsync';
import { DN_STATUS_INTENT } from './detail/DeliveryDetail';
import { DN_LIST_PATH } from './detail/types';

export function DeliveryList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listDeliveries(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [orders, codes] = data ?? [undefined, []];
  const totalOf = (so: Delivery) => dnTotal(so, codes);
  const fields = [
    textField<Delivery>('no', 'No.', dnNumber),
    textField<Delivery>('customer', 'Customer', (d) => d.customerName),
    textField<Delivery>('customerCode', 'Customer code', (d) => d.customerCode),
    textField<Delivery>('customerRef', 'Customer ref.', (d) => d.customerRef),
    dateField<Delivery>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<Delivery>('deliveryDate', 'Delivery date', (d) => d.deliveryDate),
    textField<Delivery>('order', 'Order', (d) => d.orderNumber),
    textField<Delivery>('trackingNo', 'Tracking no.', (d) => d.trackingNo),
    numberField<Delivery>('total', 'Total', totalOf),
    statusField<Delivery>(DN_STATUSES),
    masterField<Delivery>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<Delivery>('salesEmployee', 'Sales employee', salesEmployeeDef, (d) => d.salesEmployeeId),
    linesField<Delivery>(),
  ];
  const presets = useListPresets({
    list: 'deliveries',
    fields,
    builtIns: statusViews('deliveries', DN_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: orders,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(orders ?? []).filter(
      (so) =>
        (!q || [dnNumber(so), so.customerCode, so.customerName, so.customerRef, so.orderNumber, so.trackingNo, ...so.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (so: Delivery): string | number => (sort.key === 'total' ? totalOf(so) : sort.key === 'docNum' ? so.docNum : String(so[sort.key as keyof Delivery] ?? ''));
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, presets.filter, query, sort, codes]);

  const open = (so: Delivery) => navigate(`${DN_LIST_PATH}/${so.id}`);
  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<Delivery>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (so) => (
        <TableSubcontent subcopy={so.customerRef ? `Customer ref. ${so.customerRef}` : undefined}>
          <TableLink onClick={() => open(so)}>{dnNumber(so)}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (so) => <TableSubcontent subcopy={so.customerCode}>{so.customerName || '—'}</TableSubcontent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (so) => formatDate(so.postingDate) },
    { key: 'trackingNo', header: 'Tracking no.', cell: (so) => so.trackingNo || '—' },
    {
      key: 'qty',
      header: 'Shipped',
      cell: (so) => (
        <TableSubcontent subcopy={so.orderNumber ? `Order ${so.orderNumber}` : `${so.lines.length} line${so.lines.length === 1 ? '' : 's'}`}>
          {so.lines.reduce((n, l) => n + l.quantity, 0).toLocaleString('en-PH')}
        </TableSubcontent>
      ),
    },
    { key: 'total', header: 'Total', sortable: true, cell: (so) => <TableAmount currency={so.currency}>{formatAmount(totalOf(so))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (so) => <TableStatus intent={DN_STATUS_INTENT[so.status]}>{so.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search deliveries"
        searchPlaceholder="Search by delivery no., customer, order, tracking no. or item"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        icon="local_shipping"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${DN_LIST_PATH}/new`)}>
            New delivery
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
              caption="Deliveries"
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
            <Text tone="muted" className="p-4">Loading deliveries…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
