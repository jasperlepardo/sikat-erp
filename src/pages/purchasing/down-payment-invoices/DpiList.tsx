import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { Alert, Badge, Panel, Table, TableContent, Text, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../components/form/PageHeader';
import { DPI_STATUSES, type DownPaymentInvoice } from '../../../mocks/apDownPaymentInvoices';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { listDownPaymentInvoices, dpiNumber, dpiTotals } from '../../../services/apDownPaymentInvoices';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { rateAt } from '../../../mocks/taxes';
import { dateField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { useListPage } from '../../../components/form/DataTable';
import { cap } from '../../../components/form/noun';
import { DPI_LIST_PATH, DPI_NOUN, DPI_STATUS_INTENT } from '../paths';

export function DpiList() {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listDownPaymentInvoices(), taxCodes.list()]), []);
  const [query, setQuery] = useState('');
  const { resetPage, paginate } = useListPage();

  const [invoices, codes] = data ?? [undefined, []];

  const rateOf = (inv: DownPaymentInvoice, code: string) => {
    const c = codes.find((x) => x.code === code);
    return c ? (rateAt(c, inv.postingDate) ?? 0) : 0;
  };
  const totalOf = (inv: DownPaymentInvoice) => dpiTotals(inv, (code) => rateOf(inv, code)).total;

  const fields = [
    textField<DownPaymentInvoice>('no', 'No.', dpiNumber),
    textField<DownPaymentInvoice>('vendor', 'Vendor', (d) => d.vendorName),
    dateField<DownPaymentInvoice>('postingDate', 'Posting date', (d) => d.postingDate),
    numberField<DownPaymentInvoice>('total', 'Total', totalOf),
    statusField<DownPaymentInvoice>(DPI_STATUSES),
  ];
  const presets = useListPresets({
    list: 'down-payment-invoices',
    fields,
    builtIns: statusViews(DPI_NOUN.many, DPI_STATUSES),
    defaultSort: { key: 'postingDate', direction: 'desc' },
    rows: invoices,
    onChange: resetPage,
  });
  const { sort, setSort } = presets;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(invoices ?? []).filter((d) =>
      !q || [dpiNumber(d), d.vendorName].join(' ').toLowerCase().includes(q),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (d: DownPaymentInvoice): string | number =>
      sort.key === 'total' ? totalOf(d) : sort.key === 'docNum' ? d.docNum : String(d[sort.key as keyof DownPaymentInvoice] ?? '');
    return [...filtered].sort((a, b) => { const x = value(a), y = value(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, presets.filter, query, sort]);

  const columns: TableColumn<DownPaymentInvoice>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (d) => <TableContent href={`#${DPI_LIST_PATH}/${d.id}`}>{dpiNumber(d)}</TableContent> },
    { key: 'vendorName', header: 'Vendor', sortable: true, cell: (d) => <TableContent subcopy={d.vendorCode}>{d.vendorName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (d) => formatDate(d.postingDate) },
    { key: 'dueDate', header: 'Due date', cell: (d) => d.dueDate ? formatDate(d.dueDate) : '—' },
    { key: 'total', header: 'Total', sortable: true, cell: (d) => <span className="tabular-nums">{d.currency} {formatAmount(totalOf(d))}</span> },
    { key: 'status', header: 'Status', sortable: true, cell: (d) => <Badge size="small" intent={DPI_STATUS_INTENT[d.status]}>{d.status}</Badge> },
  ];

  const { visible, pagination } = paginate(rows);

  return (
    <Panel className="flex-1">
      <PageHeader
        showSearch
        searchLabel={`Search ${DPI_NOUN.many}`}
        searchPlaceholder="Search by no. or vendor"
        searchValue={query}
        onSearchChange={(v) => { setQuery(v); resetPage(); }}
        icon="receipt_long"
        title={presets.menu}
        create={{ noun: DPI_NOUN, to: DPI_LIST_PATH }}
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : null}
        {presets.bar(null)}
        {invoices ? (
          <Table caption={cap(DPI_NOUN.many)} columns={columns} rows={visible} getRowId={(d) => d.id} sort={sort} onSortChange={setSort} layout="fill" pagination={pagination} />
        ) : (
          <Text tone="muted" className="p-4">Loading {DPI_NOUN.many}…</Text>
        )}
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
