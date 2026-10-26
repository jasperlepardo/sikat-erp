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
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { dateField, linesField, masterField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { useListPage } from '../../../components/form/DataTable';
import { AR_STATUSES, type ArInvoice } from '../../../mocks/arInvoices';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { arNumber, arTotal, listArInvoices } from '../../../services/arInvoices';
import { useAsync } from '../../../services/useAsync';
import { listDeliveries } from '../../../services/deliveries';
import { listSalesOrders, soNumber } from '../../../services/salesOrders';
import { AR_LIST_PATH, AR_STATUS_INTENT } from '../paths';

export function ArInvoiceList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listArInvoices(), taxCodes.list(), listSalesOrders(), listDeliveries()]), []);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();
  const [orders, codes, salesOrders, deliveries] = data ?? [undefined, [], [], []];
  /** The sales orders an invoice bills, by number ("SO-2026-0021"): copied from the order, or from a delivery of it. */
  const baseOrders = (inv: ArInvoice) => {
    const ids = new Set<string>();
    for (const l of inv.lines) {
      if (l.baseType === 'SO' && l.baseId) ids.add(l.baseId);
      if (l.baseType === 'DN' && l.baseId) {
        const dn = deliveries.find((d) => d.id === l.baseId);
        const dnLine = dn?.lines.find((x) => x.id === l.baseLineId);
        if (dnLine?.baseType === 'SO' && dnLine.baseId) ids.add(dnLine.baseId);
      }
    }
    return [...ids].map((id) => salesOrders.find((o) => o.id === id)).filter((o) => o !== undefined).map(soNumber);
  };
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
    onChange: resetPage,
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

  const { visible: onPage, pagination } = paginate(rows);

  const columns: TableColumn<ArInvoice>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (so) => (
        <TableContent href={`#${AR_LIST_PATH}/${so.docNum ? arNumber(so) : so.id}`} subcopy={so.customerRef ? `Customer ref. ${so.customerRef}` : undefined}>{arNumber(so)}</TableContent>
      ),
    },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (so) => <TableContent subcopy={so.customerCode}>{so.customerName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (so) => formatDate(so.postingDate) },
    { key: 'orderNumber', header: 'Order', cell: (so) => baseOrders(so).join(', ') || so.orderNumber || '—' },
    { key: 'dueDate', header: 'Due date', align: 'end', cell: (so) => formatDate(so.dueDate) },
    { key: 'total', header: 'Total', align: 'end', cell: (so) => `${so.currency} ${formatAmount(totalOf(so))}` },
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
          resetPage();
        }}
        icon="receipt"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32} iconVariant="outline"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="medium" shape="pill" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${AR_LIST_PATH}/new`)}>
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
        {orders ? (
          <Table
            caption="A/R invoices"
            columns={columns}
            rows={onPage}
            getRowId={(so) => so.id}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            pagination={pagination}
          />
        ) : (
          <Text tone="muted" className="p-4">Loading invoices…</Text>
        )}
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
