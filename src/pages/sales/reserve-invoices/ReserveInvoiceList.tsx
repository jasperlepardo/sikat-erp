import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import {
  Alert,
  Panel,
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
import { PageHeader } from '../../../components/form/PageHeader';
import { cap } from '../../../components/form/noun';
import { RI_STATUSES, type ReserveInvoice } from '../../../mocks/reserveInvoices';
import { rateAt, type TaxCode } from '../../../mocks/taxes';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { riNumber, riTotals, listReserveInvoices } from '../../../services/reserveInvoices';
import { useAsync } from '../../../services/useAsync';
import { RI_LIST_PATH, RI_NOUN, RI_STATUS_INTENT } from '../paths';

const rateOfOn = (codes: readonly TaxCode[], date: string) => (code: string) => {
  const c = codes.find((x) => x.code === code);
  return c ? (rateAt(c, date) ?? 0) : 0;
};

export function ReserveInvoiceList() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listReserveInvoices(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();
  const [rows_, codes] = data ?? [undefined, []];

  const totalOf = (r: ReserveInvoice) => riTotals(r, rateOfOn(codes, r.postingDate)).total;

  const fields = [
    textField<ReserveInvoice>('no', 'No.', riNumber),
    textField<ReserveInvoice>('customer', 'Customer', (r) => r.customerName),
    textField<ReserveInvoice>('customerCode', 'Customer code', (r) => r.customerCode),
    textField<ReserveInvoice>('customerRef', 'Customer ref.', (r) => r.customerRef),
    dateField<ReserveInvoice>('postingDate', 'Posting date', (r) => r.postingDate),
    dateField<ReserveInvoice>('dueDate', 'Due date', (r) => r.dueDate),
    textField<ReserveInvoice>('order', 'Order', (r) => r.orderNumber),
    numberField<ReserveInvoice>('total', 'Total', totalOf),
    statusField<ReserveInvoice>(RI_STATUSES),
    masterField<ReserveInvoice>('currency', 'Currency', currencyDef, (r) => r.currency),
    masterField<ReserveInvoice>('salesEmployee', 'Sales employee', salesEmployeeDef, (r) => r.salesEmployeeId),
    linesField<ReserveInvoice>(),
  ];
  const presets = useListPresets({
    list: 'reserve-invoices',
    fields,
    builtIns: statusViews(RI_NOUN.many, RI_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: rows_,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(rows_ ?? []).filter(
      (r) =>
        !q ||
        [riNumber(r), r.customerCode, r.customerName, r.customerRef, r.orderNumber, ...r.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (r: ReserveInvoice): string | number =>
      sort.key === 'total' ? totalOf(r) : sort.key === 'docNum' ? r.docNum : String(r[sort.key as keyof ReserveInvoice] ?? '');
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows_, presets.filter, query, sort, codes]);

  const { visible: onPage, pagination } = paginate(rows);

  const columns: TableColumn<ReserveInvoice>[] = [
    {
      key: 'docNum',
      header: 'No.',
      sortable: true,
      cell: (r) => (
        <TableContent href={`#${RI_LIST_PATH}/${r.docNum ? riNumber(r) : r.id}`} subcopy={r.customerRef ? `Customer ref. ${r.customerRef}` : undefined}>
          {riNumber(r)}
        </TableContent>
      ),
    },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (r) => <TableContent subcopy={r.customerCode}>{r.customerName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (r) => formatDate(r.postingDate) },
    { key: 'orderNumber', header: 'Order', cell: (r) => r.orderNumber || '—' },
    { key: 'dueDate', header: 'Due date', align: 'end', cell: (r) => formatDate(r.dueDate) },
    { key: 'total', header: 'Total', align: 'end', cell: (r) => `${r.currency} ${formatAmount(totalOf(r))}` },
    { key: 'status', header: 'Status', sortable: true, cell: (r) => <TableStatus intent={RI_STATUS_INTENT[r.status]}>{r.status}</TableStatus> },
  ];

  return (
    <Panel className="flex-1">
      <PageHeader
        showSearch
        searchLabel={`Search ${RI_NOUN.many}`}
        searchPlaceholder="Search by invoice no., customer, order or item"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetPage();
        }}
        icon="receipt_long"
        title={presets.menu}
        create={{ noun: RI_NOUN, to: RI_LIST_PATH }}
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        {presets.bar(null)}
        {rows_ ? (
          <Table
            caption={cap(RI_NOUN.many)}
            columns={columns}
            rows={onPage}
            getRowId={(r) => r.id}
            sort={sort}
            onSortChange={setSort}
            layout="fill"
            pagination={pagination}
          />
        ) : (
          <Text tone="muted" className="p-4">Loading {RI_NOUN.many}…</Text>
        )}
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
