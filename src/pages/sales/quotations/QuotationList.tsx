import { useLocation } from 'react-router';
import { Alert, Badge, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { QUOTATION_STATUSES, type Quotation } from '../../../mocks/quotations';
import { todayISO, formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listQuotations, qtNumber, qtTotal } from '../../../services/quotations';
import { useAsync } from '../../../services/useAsync';
import { dateField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { QT_LIST_PATH, QT_NOUN, QT_STATUS_INTENT } from '../paths';

export function QuotationList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listQuotations(), taxCodes.list()]), []);
  const [quotes, codes] = data ?? [undefined, []];
  const totalOf = (q: Quotation) => qtTotal(q, codes);
  const today = todayISO();

  const fields = [
    textField<Quotation>('no', 'No.', qtNumber),
    partnerField<Quotation>('customer', 'Customer', (q) => q.customerId, (q) => q.customerName, quotes),
    textField<Quotation>('customerCode', 'Customer code', (q) => q.customerCode),
    textField<Quotation>('customerRef', 'Customer inquiry no.', (q) => q.customerRef),
    dateField<Quotation>('postingDate', 'Posting date', (q) => q.postingDate),
    dateField<Quotation>('validUntil', 'Valid until', (q) => q.validUntil),
    numberField<Quotation>('total', 'Total', totalOf),
    statusField<Quotation>(scopeStatuses(draftsOnly, QUOTATION_STATUSES)),
  ];

  const allColumns: ListColumn<Quotation>[] = [
    { key: 'docNum', header: 'No.', sortable: true, locked: true, cell: (q) => <TableContent href={`#${QT_LIST_PATH}/${q.docNum ? qtNumber(q) : q.id}`} subcopy={q.customerRef || undefined}>{qtNumber(q)}</TableContent> },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (q) => <TableContent subcopy={q.customerCode}>{q.customerName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (q) => formatDate(q.postingDate) },
    {
      key: 'validUntil',
      header: 'Valid until',
      align: 'end',
      cell: (q) => {
        if (!q.validUntil) return <span className="text-muted text-sm">—</span>;
        const expired = q.status === 'Open' && q.validUntil < today;
        return (
          <span className="flex items-center justify-end gap-1">
            <span className={expired ? 'text-danger' : ''}>{formatDate(q.validUntil)}</span>
            {expired ? <Badge size="small" intent="danger">Expired</Badge> : null}
          </span>
        );
      },
    },
    { key: 'total', header: 'Total', align: 'end', cell: (q) => `${q.currency} ${formatAmount(totalOf(q))}` },
    { key: 'status', header: 'Status', sortable: true, cell: (q) => <TableStatus intent={QT_STATUS_INTENT[q.status]}>{q.status}</TableStatus> },
  ];
  const { columns, manager } = useListColumns('quotations', allColumns);

  return (
    <ListPage
      rows={quotes}
      columns={columns}
      fields={fields}
      noun={QT_NOUN}
      icon="request_quote"
      basePath={QT_LIST_PATH}
      listKey="quotations"
      builtIns={draftSplit(draftsOnly, QT_NOUN.many, QUOTATION_STATUSES)}
      scope={draftScope(draftsOnly, QUOTATION_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., customer, or item', label: `Search ${QT_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? qtNumber(r) : r.id}
      filterFn={(qt, q) => !q || [qtNumber(qt), qt.customerCode, qt.customerName, qt.customerRef, ...qt.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (qt: Quotation): string | number =>
          sort.key === 'total' ? totalOf(qt) : sort.key === 'docNum' ? qt.docNum : String(qt[sort.key as keyof Quotation] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
