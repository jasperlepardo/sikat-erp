import { useLocation } from 'react-router';
import { Alert, TableAmount, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { RFQ_STATUSES, type Rfq } from '../../../mocks/rfqs';
import { todayISO, formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listRfqs, rfqNumber, rfqTotal } from '../../../services/rfqs';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { RFQ_LIST_PATH, RFQ_NOUN, RFQ_STATUS_INTENT } from '../paths';

export function RfqList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listRfqs(), taxCodes.list()]), []);
  const [rfqs, codes] = data ?? [undefined, []];
  const totalOf = (q: Rfq) => rfqTotal(q, codes);
  const today = todayISO();

  const fields = [
    textField<Rfq>('no', 'No.', rfqNumber),
    partnerField<Rfq>('vendor', 'Vendor', (d) => d.vendorId, (d) => d.vendorName, rfqs),
    textField<Rfq>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<Rfq>('vendorRef', 'Vendor quote no.', (d) => d.vendorRef),
    dateField<Rfq>('postingDate', 'Posting date', (d) => d.postingDate),
    dateField<Rfq>('validUntil', 'Valid until', (d) => d.validUntil),
    numberField<Rfq>('total', 'Total', totalOf),
    statusField<Rfq>(scopeStatuses(draftsOnly, RFQ_STATUSES)),
    masterField<Rfq>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<Rfq>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyerId),
    linesField<Rfq>(),
  ];

  const allColumns: ListColumn<Rfq>[] = [
    { key: 'docNum', header: 'No.', sortable: true, locked: true, cell: (rfq) => <TableContent href={`#${RFQ_LIST_PATH}/${rfq.docNum ? rfqNumber(rfq) : rfq.id}`} subcopy={rfq.vendorRef ? `Vendor quote no. ${rfq.vendorRef}` : undefined}>{rfqNumber(rfq)}</TableContent> },
    { key: 'vendorName', header: 'Vendor', sortable: true, cell: (rfq) => <TableContent subcopy={rfq.vendorCode}>{rfq.vendorName || '—'}</TableContent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (rfq) => formatDate(rfq.postingDate) },
    {
      key: 'validUntil',
      header: 'Valid until',
      sortable: true,
      cell: (rfq) =>
        !rfq.validUntil ? '—' : rfq.status === 'Open' && rfq.validUntil < today ? (
          <TableContent subcopy="Expired"><span className="text-danger">{formatDate(rfq.validUntil)}</span></TableContent>
        ) : formatDate(rfq.validUntil),
    },
    {
      key: 'lines',
      header: 'Lines',
      cell: (rfq) => {
        const total = rfq.lines.length;
        const quoted = rfq.lines.filter((l) => l.quotedQty > 0 || l.quotedDate).length;
        return <TableContent subcopy={total ? `${quoted} of ${total} quoted` : undefined}>{total} {total === 1 ? 'line' : 'lines'}</TableContent>;
      },
    },
    { key: 'total', header: 'Total', sortable: true, cell: (rfq) => <TableAmount currency={rfq.currency}>{formatAmount(totalOf(rfq))}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (rfq) => <TableStatus intent={RFQ_STATUS_INTENT[rfq.status]}>{rfq.status}</TableStatus> },
  ];
  const { columns, manager } = useListColumns('purchase-quotations', allColumns);

  return (
    <ListPage
      rows={rfqs}
      columns={columns}
      fields={fields}
      noun={RFQ_NOUN}
      icon="description"
      basePath={RFQ_LIST_PATH}
      listKey="purchase-quotations"
      builtIns={draftSplit(draftsOnly, RFQ_STATUSES)}
      scope={draftScope(draftsOnly, RFQ_STATUSES)}
      defaultSort={{ key: 'postingDate', direction: 'desc' }}
      search={{ placeholder: 'Search by RFQ no., vendor, ref. or item', label: 'Search purchase quotations' }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${RFQ_NOUN.many} yet. Start one from a purchase request (More actions › Create ${RFQ_NOUN.one}), or with New ${RFQ_NOUN.one}.`}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? rfqNumber(r) : r.id}
      filterFn={(rfq, q) => !q || [rfqNumber(rfq), rfq.vendorCode, rfq.vendorName, rfq.vendorRef, ...rfq.lines.map((l) => `${l.itemNo} ${l.description}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (rfq: Rfq): string | number =>
          sort.key === 'total' ? totalOf(rfq) : sort.key === 'docNum' ? rfq.docNum : String(rfq[sort.key as keyof Rfq] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
