import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { dateField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { arCmNumber, arCmTotal, listArCreditMemos } from '../../../services/arCreditMemos';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import type { ArCmStatus } from '../../../mocks/arCreditMemos';
import { AR_CM_LIST_PATH, ARCM_NOUN, ARCM_STATUS_INTENT } from '../paths';

const STATUSES: ArCmStatus[] = ['Draft', 'Not Confirmed', 'Open', 'Closed', 'Cancelled'];

interface Row {
  id: string;
  docNum: number;
  number: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  postingDate: string;
  basedOn: string;
  currency: string;
  total: number;
  applied: number;
  status: ArCmStatus;
  search: string;
}

export function ArCreditMemoList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string }) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listArCreditMemos(), taxCodes.list()]), []);
  const [memos, codes] = data ?? [undefined, []];

  const rows: Row[] | undefined = memos?.map((m) => ({
    id: m.id,
    docNum: m.docNum,
    number: arCmNumber(m),
    customerId: m.customerId,
    customerCode: m.customerCode,
    customerName: m.customerName,
    postingDate: m.postingDate,
    basedOn: [...new Set(m.lines.filter((l) => l.baseDocNo).map((l) => l.baseDocNo).filter(Boolean))].join(', '),
    currency: m.currency,
    total: arCmTotal(m, codes),
    applied: m.appliedAmount,
    status: m.status,
    search: [arCmNumber(m), m.customerCode, m.customerName, ...m.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase(),
  }));

  const fields = [
    textField<Row>('no', 'No.', (r) => r.number),
    partnerField<Row>('customer', 'Customer', (r) => r.customerId, (r) => r.customerName, rows),
    textField<Row>('customerCode', 'Customer code', (r) => r.customerCode),
    dateField<Row>('postingDate', 'Posting date', (r) => r.postingDate),
    textField<Row>('basedOn', 'Based on', (r) => r.basedOn),
    numberField<Row>('total', 'Total', (r) => r.total),
    statusField<Row>(scopeStatuses(draftsOnly, STATUSES)),
  ];

  const allColumns: ListColumn<Row>[] = [
    { key: 'docNum', header: 'No.', sortable: true, locked: true, cell: (r) => <TableContent href={`#${AR_CM_LIST_PATH}/${r.docNum ? r.number : r.id}`}>{r.number}</TableContent> },
    { key: 'customerName', header: 'Customer', sortable: true, cell: (r) => <TableContent subcopy={r.customerCode}>{r.customerName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (r) => formatDate(r.postingDate) },
    { key: 'basedOn', header: 'Based on', cell: (r) => r.basedOn || '—' },
    { key: 'total', header: 'Total', align: 'end', cell: (r) => `${r.currency} ${formatAmount(r.total)}` },
    {
      key: 'applied',
      header: 'Applied',
      align: 'end',
      // Nothing applied yet: a muted dash, so applied memos stand out.
      cell: (r) => (r.applied ? `${r.currency} ${formatAmount(r.applied)}` : <span className="text-caption">-</span>),
    },
    { key: 'status', header: 'Status', sortable: true, cell: (r) => <TableStatus intent={ARCM_STATUS_INTENT[r.status]}>{r.status}</TableStatus> },
  ];
  const { columns, manager } = useListColumns('ar-credit-memos', allColumns);

  return (
    <ListPage
      rows={rows}
      columns={columns}
      fields={fields}
      noun={ARCM_NOUN}
      icon="assignment_return"
      basePath={AR_CM_LIST_PATH}
      listKey="ar-credit-memos"
      builtIns={draftSplit(draftsOnly, ARCM_NOUN.many, STATUSES)}
      scope={draftScope(draftsOnly, STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., customer, or item', label: `Search ${ARCM_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${ARCM_NOUN.many} yet. Start one from a sales return (More actions › Create ${ARCM_NOUN.one}), or with New ${ARCM_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? r.number : r.id}
      filterFn={(r, q) => !q || r.search.includes(q)}
    />
  );
}
