import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { GRR_STATUSES, type GoodsReturnRequest } from '../../../mocks/goodsReturnRequests';
import { formatDate } from '../../../services/dates';
import { listGoodsReturnRequests, grrNumber } from '../../../services/goodsReturnRequests';
import { useAsync } from '../../../services/useAsync';
import { dateField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { statusViews } from '../../../components/filter/useListPresets';
import { GRR_LIST_PATH, GRR_NOUN, GRR_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

export function GoodsReturnRequestList({ compact, selectedId }: { compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const requests = useAsync(listGoodsReturnRequests, []);

  const fields = [
    textField<GoodsReturnRequest>('no', `${cap(GRR_NOUN.one)} no.`, grrNumber),
    partnerField<GoodsReturnRequest>('vendor', 'Vendor', (r) => r.vendorId, (r) => r.vendorName, requests),
    dateField<GoodsReturnRequest>('postingDate', 'Request date', (r) => r.postingDate),
    statusField<GoodsReturnRequest>(GRR_STATUSES),
  ];

  const allColumns: ListColumn<GoodsReturnRequest>[] = [
    { key: 'docNum', header: `${cap(GRR_NOUN.one)} no.`, locked: true, cell: (r) => <TableContent href={`#${GRR_LIST_PATH}/${r.docNum ? grrNumber(r) : r.id}`}>{grrNumber(r)}</TableContent> },
    { key: 'vendorName', header: 'Vendor', cell: (r) => r.vendorName || '—' },
    { key: 'postingDate', header: 'Request date', align: 'end', cell: (r) => formatDate(r.postingDate) },
    { key: 'requiredDate', header: 'Required by', align: 'end', defaultHidden: true, cell: (r) => r.requiredDate ? formatDate(r.requiredDate) : '—' },
    { key: 'status', header: 'Status', cell: (r) => <TableStatus intent={GRR_STATUS_INTENT[r.status]}>{r.status}</TableStatus> },
  ];
  const { columns, manager } = useListColumns('goods-return-requests', allColumns);

  return (
    <ListPage
      rows={requests}
      columns={columns}
      fields={fields}
      noun={GRR_NOUN}
      icon="assignment_return"
      basePath={GRR_LIST_PATH}
      listKey="goods-return-requests"
      builtIns={statusViews(GRR_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., vendor or item', label: `Search ${GRR_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${GRR_NOUN.many} yet. Start one from a goods receipt or A/P invoice (More actions › Create ${GRR_NOUN.one}), or with New ${GRR_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? grrNumber(r) : r.id}
      filterFn={(r, q) => !q || [grrNumber(r), r.vendorName, ...r.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (r: GoodsReturnRequest): string | number =>
          sort.key === 'docNum' ? r.docNum : String(r[sort.key as keyof GoodsReturnRequest] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
