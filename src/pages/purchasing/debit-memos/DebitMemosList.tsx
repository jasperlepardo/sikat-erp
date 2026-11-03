import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { dateField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef } from '../../settings/masterDefs';
import { formatDate } from '../../../services/dates';
import { formatMoney } from '../../../services/format';
import { listCreditMemos, memoNumber, memoTotal } from '../../../services/apCreditMemos';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import type { MemoStatus } from '../../../mocks/apCreditMemos';
import { MEMO_LIST_PATH, MEMO_NOUN, MEMO_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

const STATUSES: MemoStatus[] = ['Draft', 'Not Confirmed', 'Open', 'Closed', 'Cancelled'];

interface Row {
  id: string;
  docNum: number;
  number: string;
  ref: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  postingDate: string;
  base: string;
  reasons: string;
  currency: string;
  total: number;
  status: MemoStatus;
  search: string;
}

export function DebitMemosList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listCreditMemos(), taxCodes.list()]), []);
  const [memos, codes] = data ?? [undefined, []];

  const rows: Row[] | undefined = memos?.map((c) => ({
    id: c.id,
    docNum: c.docNum,
    number: memoNumber(c),
    ref: c.vendorRef,
    vendorId: c.vendorId,
    vendorCode: c.vendorCode,
    vendorName: c.vendorName,
    postingDate: c.postingDate,
    base: [...new Set(c.lines.map((l) => l.baseDocNo).filter(Boolean))].join(', '),
    reasons: [...new Set(c.lines.map((l) => l.returnReason).filter(Boolean))].join(', '),
    currency: c.currency,
    total: memoTotal(c, codes),
    status: c.status,
    search: [memoNumber(c), c.vendorCode, c.vendorName, c.vendorRef, ...c.lines.map((l) => `${l.itemNo} ${l.baseDocNo}`)].join(' ').toLowerCase(),
  }));

  const fields = [
    textField<Row>('no', `${cap(MEMO_NOUN.one)} no.`, (r) => r.number),
    partnerField<Row>('vendor', 'Vendor', (r) => r.vendorId, (r) => r.vendorName, rows),
    textField<Row>('vendorCode', 'Vendor code', (r) => r.vendorCode),
    textField<Row>('ref', 'Vendor credit note no.', (r) => r.ref),
    dateField<Row>('postingDate', 'Posting date', (r) => r.postingDate),
    textField<Row>('base', 'Based on', (r) => r.base),
    textField<Row>('reason', 'Reason', (r) => r.reasons),
    numberField<Row>('total', 'Total credit', (r) => r.total),
    statusField<Row>(scopeStatuses(draftsOnly, STATUSES)),
    masterField<Row>('currency', 'Currency', currencyDef, (r) => r.currency),
  ];

  const allColumns: ListColumn<Row>[] = [
    { key: 'docNum', header: `${cap(MEMO_NOUN.one)} no.`, locked: true, cell: (r) => <TableContent href={`#${MEMO_LIST_PATH}/${r.docNum ? r.number : r.id}`}>{r.number}</TableContent> },
    { key: 'ref', header: 'Vendor credit note no.', cell: (r) => r.ref || '—' },
    { key: 'base', header: 'Based on', cell: (r) => r.base || <span className="text-muted">Entered by hand</span> },
    { key: 'vendorName', header: 'Vendor', cell: (r) => r.vendorName || '—' },
    { key: 'status', header: 'Status', cell: (r) => <TableStatus intent={MEMO_STATUS_INTENT[r.status]}>{r.status}</TableStatus> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (r) => formatDate(r.postingDate) },
    { key: 'reasons', header: 'Reason', defaultHidden: true, cell: (r) => r.reasons || '—' },
    { key: 'total', header: 'Total credit', align: 'end', cell: (r) => formatMoney(r.total, r.currency) },
  ];
  const { columns, manager } = useListColumns('ap-credit-memos', allColumns);

  return (
    <ListPage
      rows={rows}
      columns={columns}
      fields={fields}
      noun={MEMO_NOUN}
      icon="assignment_return"
      basePath={MEMO_LIST_PATH}
      listKey="ap-credit-memos"
      builtIns={draftSplit(draftsOnly, STATUSES)}
      scope={draftScope(draftsOnly, STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., vendor, vendor ref., item or base document', label: `Search ${MEMO_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage="No credit memos yet. Start one from an A/P invoice or goods return (More actions › Create A/P credit memo), or with New A/P credit memo."
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? r.number : r.id}
      filterFn={(r, q) => !q || r.search.includes(q)}
    />
  );
}
