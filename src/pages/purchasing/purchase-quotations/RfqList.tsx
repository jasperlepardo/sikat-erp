import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { RFQ_STATUSES, type Rfq } from '../../../mocks/rfqs';
import { formatDate } from '../../../services/dates';
import { formatMoney } from '../../../services/format';
import { taxCodes } from '../../../services/masterData';
import { listRfqs, rfqNumber, rfqTotal } from '../../../services/rfqs';
import { useAsync } from '../../../services/useAsync';
import { dateField, linesField, masterField, numberField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { currencyDef, salesEmployeeDef } from '../../settings/masterDefs';
import { RFQ_LIST_PATH, RFQ_NOUN, RFQ_STATUS_INTENT } from '../paths';
import { cap } from '../../../components/form/noun';

export function RfqList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const data = useAsync(() => Promise.all([listRfqs(), taxCodes.list()]), []);
  const [rfqs, codes] = data ?? [undefined, []];
  const totalOf = (q: Rfq) => rfqTotal(q, codes);

  const fields = [
    textField<Rfq>('no', `${cap(RFQ_NOUN.one)} no.`, rfqNumber),
    partnerField<Rfq>('vendor', 'Vendor', (d) => d.vendorId, (d) => d.vendorName, rfqs),
    textField<Rfq>('vendorCode', 'Vendor code', (d) => d.vendorCode),
    textField<Rfq>('vendorRef', 'Vendor quote no.', (d) => d.vendorRef),
    dateField<Rfq>('postingDate', 'Quotation date', (d) => d.postingDate),
    dateField<Rfq>('validUntil', 'Valid until', (d) => d.validUntil),
    numberField<Rfq>('total', 'Total', totalOf),
    statusField<Rfq>(scopeStatuses(draftsOnly, RFQ_STATUSES)),
    masterField<Rfq>('currency', 'Currency', currencyDef, (d) => d.currency),
    masterField<Rfq>('buyer', 'Buyer', salesEmployeeDef, (d) => d.buyerId),
    linesField<Rfq>(),
  ];

  const allColumns: ListColumn<Rfq>[] = [
    { key: 'docNum', header: `${cap(RFQ_NOUN.one)} no.`, locked: true, cell: (rfq) => <TableContent href={`#${RFQ_LIST_PATH}/${rfq.docNum ? rfqNumber(rfq) : rfq.id}`}>{rfqNumber(rfq)}</TableContent> },
    { key: 'vendorRef', header: 'Vendor quote no.', cell: (rfq) => rfq.vendorRef || '—' },
    { key: 'vendorName', header: 'Vendor', cell: (rfq) => rfq.vendorName || '—' },
    { key: 'status', header: 'Status', cell: (rfq) => <TableStatus intent={RFQ_STATUS_INTENT[rfq.status]}>{rfq.status}</TableStatus> },
    { key: 'postingDate', header: 'Quotation date', align: 'end', cell: (rfq) => formatDate(rfq.postingDate) },
    {
      key: 'validUntil',
      header: 'Valid until',
      align: 'end',
      cell: (rfq) =>
        !rfq.validUntil ? '—' : rfq.status === 'Expired' ? (
          <span className="text-danger">{formatDate(rfq.validUntil)}</span>
        ) : formatDate(rfq.validUntil),
    },
    { key: 'total', header: 'Total', align: 'end', cell: (rfq) => formatMoney(totalOf(rfq), rfq.currency) },
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
