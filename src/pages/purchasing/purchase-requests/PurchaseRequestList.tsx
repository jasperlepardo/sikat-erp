import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { PR_STATUSES, type PurchaseRequest } from '../../../mocks/purchaseRequests';
import { rateFrom } from '../../../mocks/taxes';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listPurchaseRequests, prNumber, prTotals } from '../../../services/purchaseRequests';
import { useAsync } from '../../../services/useAsync';
import { nameIn } from '../../../services/partnerMasters';
import { branches, departments } from '../../../services/peopleMasters';
import { dateField, numberField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews } from '../../../components/filter/useListPresets';
import { PR_LIST_PATH, PR_NOUN, PR_STATUS_INTENT } from '../paths';

export function PurchaseRequestList({ compact, selectedId }: { compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listPurchaseRequests(), taxCodes.list()]), []);
  const [requests, codes] = data ?? [undefined, []];

  const totalOf = (pr: PurchaseRequest) => prTotals(pr, rateFrom(codes, pr.postingDate)).total;
  const branchOf = (r: PurchaseRequest) => (r.branchId ? nameIn(branches, r.branchId) : '');

  const fields = [
    textField<PurchaseRequest>('no', 'No.', prNumber),
    textField<PurchaseRequest>('requester', 'Requester', (r) => r.requesterName),
    textField<PurchaseRequest>('branch', 'Branch', branchOf),
    dateField<PurchaseRequest>('postingDate', 'Posting date', (r) => r.postingDate),
    dateField<PurchaseRequest>('requiredDate', 'Required date', (r) => r.requiredDate),
    numberField<PurchaseRequest>('total', 'Total', totalOf),
    statusField<PurchaseRequest>(PR_STATUSES),
  ];

  const columns: TableColumn<PurchaseRequest>[] = [
    { key: 'docNum', header: 'No.', sortable: true, cell: (r) => <TableContent href={`#${PR_LIST_PATH}/${r.docNum ? prNumber(r) : r.id}`}>{prNumber(r)}</TableContent> },
    { key: 'requesterName', header: 'Requester', sortable: true, cell: (r) => <TableContent subcopy={branchOf(r)}>{r.requesterName || '—'}</TableContent> },
    { key: 'departmentId', header: 'Department', cell: (r) => (r.departmentId ? nameIn(departments, r.departmentId) : '—') },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (r) => formatDate(r.postingDate) },
    { key: 'requiredDate', header: 'Required by', sortable: true, cell: (r) => (r.requiredDate ? formatDate(r.requiredDate) : '—') },
    { key: 'lines', header: 'Lines', cell: (r) => <TableContent subcopy={`${r.lines.filter((l) => l.status === 'Open').length} open`}>{r.lines.length}</TableContent> },
    { key: 'total', header: 'Est. total', sortable: true, cell: (r) => <span className="tabular-nums">PHP {formatAmount(totalOf(r))}</span> },
    { key: 'status', header: 'Status', sortable: true, cell: (r) => <TableStatus intent={PR_STATUS_INTENT[r.status]}>{r.status}</TableStatus> },
  ];

  return (
    <ListPage
      rows={requests}
      columns={columns}
      fields={fields}
      noun={PR_NOUN}
      icon="inbox"
      basePath={PR_LIST_PATH}
      listKey="purchase-requests"
      builtIns={statusViews(PR_NOUN.many, PR_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by request no., requester, branch or item', label: 'Search purchase requests' }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? prNumber(r) : r.id}
      filterFn={(r, q) => !q || [prNumber(r), r.requesterName, branchOf(r), ...r.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
    />
  );
}
