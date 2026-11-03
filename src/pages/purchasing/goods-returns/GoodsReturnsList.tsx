import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { dateField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef } from '../../settings/masterDefs';
import { formatDate } from '../../../services/dates';
import { formatMoney } from '../../../services/format';
import { listGoodsReturns, returnNumber, returnTotal } from '../../../services/goodsReturns';
import { taxCodes } from '../../../services/masterData';
import { useAsync } from '../../../services/useAsync';
import type { ReturnStatus } from '../../../mocks/goodsReturns';
import { RETURN_LIST_PATH, RETURN_NOUN, RETURN_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

const STATUSES: ReturnStatus[] = ['Draft', 'Not Confirmed', 'Open', 'Closed', 'Cancelled'];

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
  status: ReturnStatus;
  search: string;
}

export function GoodsReturnsList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listGoodsReturns(), taxCodes.list()]), []);
  const [returns, codes] = data ?? [undefined, []];

  const rows: Row[] | undefined = returns?.map((r) => ({
    id: r.id,
    docNum: r.docNum,
    number: returnNumber(r),
    ref: r.vendorRef,
    vendorId: r.vendorId,
    vendorCode: r.vendorCode,
    vendorName: r.vendorName,
    postingDate: r.postingDate,
    base: [...new Set(r.lines.map((l) => l.baseDocNo).filter(Boolean))].join(', '),
    reasons: [...new Set(r.lines.map((l) => l.returnReason).filter(Boolean))].join(', '),
    currency: r.currency,
    total: returnTotal(r, codes),
    status: r.status,
    search: [returnNumber(r), r.vendorCode, r.vendorName, r.vendorRef, ...r.lines.map((l) => `${l.itemNo} ${l.baseDocNo}`)].join(' ').toLowerCase(),
  }));

  const fields = [
    textField<Row>('no', `${cap(RETURN_NOUN.one)} no.`, (r) => r.number),
    partnerField<Row>('vendor', 'Vendor', (r) => r.vendorId, (r) => r.vendorName, rows),
    textField<Row>('vendorCode', 'Vendor code', (r) => r.vendorCode),
    textField<Row>('ref', 'Vendor RMA no.', (r) => r.ref),
    dateField<Row>('postingDate', 'Posting date', (r) => r.postingDate),
    textField<Row>('base', 'Based on', (r) => r.base),
    textField<Row>('reason', 'Reason', (r) => r.reasons),
    numberField<Row>('total', 'Total', (r) => r.total),
    statusField<Row>(scopeStatuses(draftsOnly, STATUSES)),
    masterField<Row>('currency', 'Currency', currencyDef, (r) => r.currency),
  ];

  const allColumns: ListColumn<Row>[] = [
    { key: 'docNum', header: `${cap(RETURN_NOUN.one)} no.`, locked: true, cell: (r) => <TableContent href={`#${RETURN_LIST_PATH}/${r.docNum ? r.number : r.id}`}>{r.number}</TableContent> },
    { key: 'ref', header: 'Vendor RMA no.', cell: (r) => r.ref || '—' },
    { key: 'base', header: 'Based on', cell: (r) => r.base || <span className="text-muted">Entered by hand</span> },
    { key: 'vendorName', header: 'Vendor', cell: (r) => r.vendorName || '—' },
    { key: 'status', header: 'Status', cell: (r) => <TableStatus intent={RETURN_STATUS_INTENT[r.status]}>{r.status}</TableStatus> },
    { key: 'postingDate', header: 'Posting date', align: 'end', cell: (r) => formatDate(r.postingDate) },
    { key: 'reasons', header: 'Reason', defaultHidden: true, cell: (r) => r.reasons || '—' },
    { key: 'total', header: 'Total', align: 'end', cell: (r) => formatMoney(r.total, r.currency) },
  ];
  const { columns, manager } = useListColumns('goods-returns', allColumns);

  return (
    <ListPage
      rows={rows}
      columns={columns}
      fields={fields}
      noun={RETURN_NOUN}
      icon="assignment_return"
      basePath={RETURN_LIST_PATH}
      listKey="goods-returns"
      builtIns={draftSplit(draftsOnly, STATUSES)}
      scope={draftScope(draftsOnly, STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., vendor, vendor ref., item or base document', label: `Search ${RETURN_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage="No goods returns yet. Start one from a goods receipt or A/P invoice (More actions › Create goods return), or with New goods return."
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? r.number : r.id}
      filterFn={(r, q) => !q || r.search.includes(q)}
    />
  );
}
