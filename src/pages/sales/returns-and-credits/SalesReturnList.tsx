import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { dateField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { formatDate } from '../../../services/dates';
import { formatMoney } from '../../../services/format';
import { listSalesReturns, srNumber, srTotal } from '../../../services/salesReturns';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import type { SrStatus } from '../../../mocks/salesReturns';
import { SR_LIST_PATH, SR_NOUN, SR_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

const STATUSES: SrStatus[] = ['Draft', 'Not Confirmed', 'Open', 'Closed', 'Cancelled'];

interface Row {
  id: string;
  docNum: number;
  number: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  postingDate: string;
  basedOn: string;
  reasons: string;
  currency: string;
  total: number;
  status: SrStatus;
  search: string;
}

export function SalesReturnList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string }) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listSalesReturns(), taxCodes.list()]), []);
  const [returns, codes] = data ?? [undefined, []];

  const rows: Row[] | undefined = returns?.map((r) => ({
    id: r.id,
    docNum: r.docNum,
    number: srNumber(r),
    customerId: r.customerId,
    customerCode: r.customerCode,
    customerName: r.customerName,
    postingDate: r.postingDate,
    basedOn: [...new Set(r.lines.filter((l) => l.baseDocNo).map((l) => l.baseDocNo))].join(', '),
    reasons: [...new Set(r.lines.map((l) => l.returnReason).filter(Boolean))].join(', '),
    currency: r.currency,
    total: srTotal(r, codes),
    status: r.status,
    search: [srNumber(r), r.customerCode, r.customerName, r.customerRef, ...r.lines.map((l) => `${l.itemNo} ${l.baseDocNo}`)].join(' ').toLowerCase(),
  }));

  const fields = [
    textField<Row>('no', `${cap(SR_NOUN.one)} no.`, (r) => r.number),
    partnerField<Row>('customer', 'Customer', (r) => r.customerId, (r) => r.customerName, rows),
    textField<Row>('customerCode', 'Customer code', (r) => r.customerCode),
    dateField<Row>('postingDate', 'Posting date', (r) => r.postingDate),
    textField<Row>('basedOn', 'Based on', (r) => r.basedOn),
    textField<Row>('reason', 'Reason', (r) => r.reasons),
    numberField<Row>('total', 'Total', (r) => r.total),
    statusField<Row>(scopeStatuses(draftsOnly, STATUSES)),
  ];

  const allColumns: ListColumn<Row>[] = [
    { key: 'docNum', header: `${cap(SR_NOUN.one)} no.`, locked: true, cell: (r) => <TableContent href={`#${SR_LIST_PATH}/${r.docNum ? r.number : r.id}`}>{r.number}</TableContent> },
    { key: 'basedOn', header: 'Based on', cell: (r) => r.basedOn || <span className="text-muted">Entered by hand</span> },
    { key: 'customerName', header: 'Customer', cell: (r) => r.customerName || '—' },
    { key: 'status', header: 'Status', cell: (r) => <TableStatus intent={SR_STATUS_INTENT[r.status]}>{r.status}</TableStatus> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (r) => formatDate(r.postingDate) },
    { key: 'reasons', header: 'Reason', defaultHidden: true, cell: (r) => r.reasons || '—' },
    { key: 'total', header: 'Total', align: 'end', cell: (r) => formatMoney(r.total, r.currency) },
  ];
  const { columns, manager } = useListColumns('sales-returns', allColumns);

  return (
    <ListPage
      rows={rows}
      columns={columns}
      fields={fields}
      noun={SR_NOUN}
      icon="assignment_return"
      basePath={SR_LIST_PATH}
      listKey="sales-returns"
      builtIns={draftSplit(draftsOnly, STATUSES)}
      scope={draftScope(draftsOnly, STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., customer, or item', label: `Search ${SR_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${SR_NOUN.many} yet. Start one from a delivery (More actions › Create ${SR_NOUN.one}), or with New ${SR_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? r.number : r.id}
      filterFn={(r, q) => !q || r.search.includes(q)}
    />
  );
}
