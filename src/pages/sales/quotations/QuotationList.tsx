import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { QUOTATION_STATUSES, type Quotation } from '../../../mocks/quotations';
import { formatDate } from '../../../services/dates';
import { formatMoney } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listQuotations, qtNumber, qtTotal } from '../../../services/quotations';
import { useAsync } from '../../../services/useAsync';
import { dateField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { QT_LIST_PATH, QT_NOUN, QT_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

export function QuotationList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listQuotations(), taxCodes.list()]), []);
  const [quotes, codes] = data ?? [undefined, []];
  const totalOf = (q: Quotation) => qtTotal(q, codes);

  const fields = [
    textField<Quotation>('no', `${cap(QT_NOUN.one)} no.`, qtNumber),
    partnerField<Quotation>('customer', 'Customer', (q) => q.customerId, (q) => q.customerName, quotes),
    textField<Quotation>('customerCode', 'Customer code', (q) => q.customerCode),
    textField<Quotation>('customerRef', 'Customer inquiry no.', (q) => q.customerRef),
    dateField<Quotation>('postingDate', 'Quotation date', (q) => q.postingDate),
    dateField<Quotation>('validUntil', 'Valid until', (q) => q.validUntil),
    numberField<Quotation>('total', 'Total', totalOf),
    statusField<Quotation>(scopeStatuses(draftsOnly, QUOTATION_STATUSES)),
  ];

  const allColumns: ListColumn<Quotation>[] = [
    { key: 'docNum', header: `${cap(QT_NOUN.one)} no.`, locked: true, cell: (q) => <TableContent href={`#${QT_LIST_PATH}/${q.docNum ? qtNumber(q) : q.id}`}>{qtNumber(q)}</TableContent> },
    { key: 'customerRef', header: 'Customer inquiry no.', cell: (q) => q.customerRef || '—' },
    { key: 'customerName', header: 'Customer', cell: (q) => q.customerName || '—' },
    { key: 'status', header: 'Status', cell: (q) => <TableStatus intent={QT_STATUS_INTENT[q.status]}>{q.status}</TableStatus> },
    { key: 'postingDate', header: 'Quotation date', align: 'end', cell: (q) => formatDate(q.postingDate) },
    {
      key: 'validUntil',
      header: 'Valid until',
      align: 'end',
      cell: (q) => {
        if (!q.validUntil) return <span className="text-muted text-sm">—</span>;
        return <span className={q.status === 'Expired' ? 'text-danger' : ''}>{formatDate(q.validUntil)}</span>;
      },
    },
    { key: 'total', header: 'Total', align: 'end', cell: (q) => formatMoney(totalOf(q), q.currency) },
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
      builtIns={draftSplit(draftsOnly, QUOTATION_STATUSES)}
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
