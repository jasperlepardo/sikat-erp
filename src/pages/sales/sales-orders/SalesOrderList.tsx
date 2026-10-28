import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import {
  Alert,
  Panel,
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
import { PageHeader } from '../../../components/form/PageHeader';
import { cap } from '../../../components/form/noun';
import { SO_STATUSES, type SalesOrder } from '../../../mocks/salesOrders';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listSalesOrders, openQty, soNumber, soTotal } from '../../../services/salesOrders';
import { useAsync } from '../../../services/useAsync';
import { SO_LIST_PATH, SO_NOUN, SO_STATUS_INTENT } from '../paths';

export function SalesOrderList() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listSalesOrders(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();
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
    builtIns: statusViews(SO_NOUN.many, SO_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: orders,
    onChange: resetPage,
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

  const { visible: onPage, pagination } = paginate(rows);

  const columns: TableColumn<SalesOrder>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (so) => (
        <TableContent href={`#${SO_LIST_PATH}/${so.docNum ? soNumber(so) : so.id}`} subcopy={so.customerRef ? `Customer ref. ${so.customerRef}` : undefined}>{soNumber(so)}</TableContent>
      ),
    },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (so) => <TableContent subcopy={so.customerCode}>{so.customerName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (so) => formatDate(so.postingDate) },
    { key: 'deliveryDate', header: 'Delivery date', align: 'end', cell: (so) => (so.deliveryDate ? formatDate(so.deliveryDate) : '—') },
    {
      key: 'open',
      header: 'Open qty',
      align: 'end',
      cell: (so) => {
        if (so.docType === 'Service') return 'Service';
        const open = so.lines.filter((l) => openQty(l) > 0);
        const total = open.reduce((n, l) => n + openQty(l), 0).toLocaleString('en-PH');
        // Nothing open (delivered, cancelled or closed): a muted dash, so open orders stand out.
        if (!open.length) return <span className="text-caption">-</span>;
        // Hover the quantity to see what's still open, line by line.
        return (
          <Tooltip
            position="bottom"
            message={
              <div className="flex flex-col gap-1">
                {open.map((l) => (
                  <span key={l.id}>
                    {openQty(l).toLocaleString('en-PH')} {l.uomCode} · {l.description || l.itemNo}
                  </span>
                ))}
              </div>
            }
          >
            {total}
          </Tooltip>
        );
      },
    },
    { key: 'total', header: 'Total', align: 'end', cell: (so) => `${so.currency} ${formatAmount(totalOf(so))}` },
    { key: 'status', header: 'Status', sortable: true, cell: (so) => <TableStatus intent={SO_STATUS_INTENT[so.status]}>{so.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PageHeader
        showSearch
        searchLabel={`Search ${SO_NOUN.many}`}
        searchPlaceholder="Search by order no., customer, customer ref. or item"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        icon="shopping_bag"
        title={presets.menu}
        create={{ noun: SO_NOUN, to: SO_LIST_PATH }}
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
            caption={cap(SO_NOUN.many)}
            columns={columns}
            rows={onPage}
            getRowId={(so) => so.id}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            pagination={pagination}
          />
        ) : (
          <Text tone="muted" className="p-4">Loading {SO_NOUN.many}…</Text>
        )}
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
