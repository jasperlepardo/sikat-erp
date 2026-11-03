import { useLocation } from 'react-router';
import { Alert, Badge, TableContent } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { DPI_STATUSES, type DownPaymentInvoice } from '../../../mocks/apDownPaymentInvoices';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { listDownPaymentInvoices, dpiNumber, dpiTotals } from '../../../services/apDownPaymentInvoices';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import { rateAt } from '../../../mocks/taxes';
import { dateField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { DPI_LIST_PATH, DPI_NOUN, DPI_STATUS_INTENT } from '../paths';

export function DpiList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listDownPaymentInvoices(), taxCodes.list()]), []);
  const [invoices, codes] = data ?? [undefined, []];

  const rateOf = (inv: DownPaymentInvoice, code: string) => {
    const c = codes.find((x) => x.code === code);
    return c ? (rateAt(c, inv.postingDate) ?? 0) : 0;
  };
  const totalOf = (inv: DownPaymentInvoice) => dpiTotals(inv, (code) => rateOf(inv, code)).total;

  const fields = [
    textField<DownPaymentInvoice>('no', 'No.', dpiNumber),
    partnerField<DownPaymentInvoice>('vendor', 'Vendor', (d) => d.vendorId, (d) => d.vendorName, invoices),
    dateField<DownPaymentInvoice>('postingDate', 'Posting date', (d) => d.postingDate),
    numberField<DownPaymentInvoice>('total', 'Total', totalOf),
    statusField<DownPaymentInvoice>(scopeStatuses(draftsOnly, DPI_STATUSES)),
  ];

  const allColumns: ListColumn<DownPaymentInvoice>[] = [
    { key: 'docNum', header: 'No.', sortable: true, locked: true, cell: (d) => <TableContent href={`#${DPI_LIST_PATH}/${d.id}`}>{dpiNumber(d)}</TableContent> },
    { key: 'vendorName', header: 'Vendor', sortable: true, cell: (d) => <TableContent subcopy={d.vendorCode}>{d.vendorName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (d) => formatDate(d.postingDate) },
    { key: 'dueDate', header: 'Due date', defaultHidden: true, cell: (d) => d.dueDate ? formatDate(d.dueDate) : '—' },
    { key: 'total', header: 'Total', sortable: true, cell: (d) => <span className="tabular-nums">{d.currency} {formatAmount(totalOf(d))}</span> },
    { key: 'status', header: 'Status', sortable: true, cell: (d) => <Badge size="small" intent={DPI_STATUS_INTENT[d.status]}>{d.status}</Badge> },
  ];
  const { columns, manager } = useListColumns('down-payment-invoices', allColumns);

  return (
    <ListPage
      rows={invoices}
      columns={columns}
      fields={fields}
      noun={DPI_NOUN}
      icon="receipt_long"
      basePath={DPI_LIST_PATH}
      listKey="down-payment-invoices"
      builtIns={draftSplit(draftsOnly, DPI_NOUN.many, DPI_STATUSES)}
      scope={draftScope(draftsOnly, DPI_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no. or vendor', label: `Search ${DPI_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${DPI_NOUN.many} yet. Start one from a purchase order (More actions › Create ${DPI_NOUN.one}), or with New ${DPI_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      filterFn={(d, q) => !q || [dpiNumber(d), d.vendorName].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (d: DownPaymentInvoice): string | number =>
          sort.key === 'total' ? totalOf(d) : sort.key === 'docNum' ? d.docNum : String(d[sort.key as keyof DownPaymentInvoice] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
