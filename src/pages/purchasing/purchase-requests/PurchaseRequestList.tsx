import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { PR_STATUSES, type PurchaseRequest } from '../../../mocks/purchaseRequests';
import { rateFrom } from '../../../mocks/taxes';
import { formatDate } from '../../../services/dates';
import { formatMoney } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listPurchaseRequests, prNumber, prTotals } from '../../../services/purchaseRequests';
import { useAsync } from '../../../services/useAsync';
import { nameIn } from '../../../services/partnerMasters';
import { branches, departments } from '../../../services/peopleMasters';
import { choiceField, dateField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews } from '../../../components/filter/useListPresets';
import { PR_LIST_PATH, PR_NOUN, PR_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

export function PurchaseRequestList({ compact, selectedId }: { compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listPurchaseRequests(), taxCodes.list()]), []);
  const [requests, codes] = data ?? [undefined, []];

  const totalOf = (pr: PurchaseRequest) => prTotals(pr, rateFrom(codes, pr.postingDate)).total;
  const branchOf = (r: PurchaseRequest) => (r.branchId ? nameIn(branches, r.branchId) : '');

  const uniqueRequesters = [...new Set((requests ?? []).map((r) => r.requesterName).filter(Boolean))].sort();

  const fields = [
    textField<PurchaseRequest>('no', `${cap(PR_NOUN.one)} no.`, prNumber),
    choiceField<PurchaseRequest>('requester', 'Requester', uniqueRequesters, (r) => r.requesterName),
    partnerField<PurchaseRequest>('branch', 'Branch', (r) => r.branchId ?? '', branchOf, requests),
    dateField<PurchaseRequest>('postingDate', 'Request date', (r) => r.postingDate),
    dateField<PurchaseRequest>('requiredDate', 'Required date', (r) => r.requiredDate),
    numberField<PurchaseRequest>('total', 'Total', totalOf),
    statusField<PurchaseRequest>(PR_STATUSES),
  ];

  const allColumns: ListColumn<PurchaseRequest>[] = [
    { key: 'docNum', header: `${cap(PR_NOUN.one)} no.`, locked: true, cell: (r) => <TableContent href={`#${PR_LIST_PATH}/${r.docNum ? prNumber(r) : r.id}`}>{prNumber(r)}</TableContent> },
    { key: 'requesterName', header: 'Requester', cell: (r) => r.requesterName || '—' },
    { key: 'departmentId', header: 'Department', defaultHidden: true, cell: (r) => (r.departmentId ? nameIn(departments, r.departmentId) : '—') },
    { key: 'status', header: 'Status', cell: (r) => <TableStatus intent={PR_STATUS_INTENT[r.status]}>{r.status}</TableStatus> },
    { key: 'postingDate', header: 'Request date', align: 'end', cell: (r) => formatDate(r.postingDate) },
    { key: 'requiredDate', header: 'Required by', align: 'end', cell: (r) => (r.requiredDate ? formatDate(r.requiredDate) : '—') },
    { key: 'total', header: 'Est. total', align: 'end', cell: (r) => formatMoney(totalOf(r)) },
  ];
  const { columns, manager } = useListColumns('purchase-requests', allColumns);

  return (
    <ListPage
      rows={requests}
      columns={columns}
      fields={fields}
      noun={PR_NOUN}
      icon="inbox"
      basePath={PR_LIST_PATH}
      listKey="purchase-requests"
      builtIns={statusViews(PR_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by request no., requester, branch or item', label: 'Search purchase requests' }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? prNumber(r) : r.id}
      filterFn={(r, q) => !q || [prNumber(r), r.requesterName, branchOf(r), ...r.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
    />
  );
}
