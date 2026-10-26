import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
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
  Tooltip,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { useListPage } from '../../../components/form/DataTable';
import { DN_STATUSES, type Delivery } from '../../../mocks/deliveries';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { dnNumber, dnTotal, listDeliveries } from '../../../services/deliveries';
import { useAsync } from '../../../services/useAsync';
import { listSalesOrders, soNumber } from '../../../services/salesOrders';
import { DN_LIST_PATH, DN_STATUS_INTENT } from '../paths';

export function DeliveryList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listDeliveries(), taxCodes.list(), listSalesOrders()]), []);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();
  const [orders, codes, salesOrders] = data ?? [undefined, [], []];
  /** The sales orders a delivery was copied from, by number ("SO-2026-0021"). */
  const baseOrders = (d: Delivery) => {
    const ids = [...new Set(d.lines.filter((l) => l.baseType === 'SO' && l.baseId).map((l) => l.baseId))];
    return ids.map((id) => salesOrders.find((o) => o.id === id)).filter((o) => o !== undefined).map(soNumber);
  };
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
    onChange: resetPage,
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

  const { visible: onPage, pagination } = paginate(rows);

  const columns: TableColumn<Delivery>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (so) => (
        <TableContent href={`#${DN_LIST_PATH}/${so.docNum ? dnNumber(so) : so.id}`} subcopy={so.customerRef ? `Customer ref. ${so.customerRef}` : undefined}>{dnNumber(so)}</TableContent>
      ),
    },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (so) => <TableContent subcopy={so.customerCode}>{so.customerName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (so) => formatDate(so.postingDate) },
    { key: 'trackingNo', header: 'Tracking no.', cell: (so) => so.trackingNo || '—' },
    {
      key: 'qty',
      header: 'Shipped',
      align: 'end',
      cell: (so) => {
        const shipped = so.lines.filter((l) => l.quantity > 0);
        // Nothing shipped: a muted dash, so deliveries with stock on them stand out.
        if (!shipped.length) return <span className="text-(--color-text-caption)">-</span>;
        // Hover the quantity to see what was shipped, line by line, and the order it came from.
        return (
          <Tooltip
            position="bottom"
            align="end"
            message={
              <div className="flex flex-col gap-1">
                {baseOrders(so).length ? <span className="font-semibold">From {baseOrders(so).join(', ')}</span> : null}
                {shipped.map((l) => (
                  <span key={l.id}>
                    {l.quantity.toLocaleString('en-PH')} {l.uomCode} · {l.description || l.itemNo}
                  </span>
                ))}
              </div>
            }
          >
            {shipped.reduce((n, l) => n + l.quantity, 0).toLocaleString('en-PH')}
          </Tooltip>
        );
      },
    },
    { key: 'total', header: 'Total', align: 'end', cell: (so) => `${so.currency} ${formatAmount(totalOf(so))}` },
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
          resetPage();
        }}
        icon="local_shipping"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32} iconVariant="outline"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="medium" shape="pill" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${DN_LIST_PATH}/new`)}>
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
        {orders ? (
          <Table
            caption="Deliveries"
            columns={columns}
            rows={onPage}
            getRowId={(so) => so.id}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            pagination={pagination}
          />
        ) : (
          <Text tone="muted" className="p-4">Loading deliveries…</Text>
        )}
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
