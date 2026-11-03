import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { PBA_STATUSES, type PurchaseBlanketAgreement } from '../../../mocks/purchaseBlanketAgreements';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { listPurchaseBlanketAgreements, pbaNumber, pbaTotals } from '../../../services/purchaseBlanketAgreements';
import { useAsync } from '../../../services/useAsync';
import { useDocTitle } from '../../../services/useDocTitle';
import { dateField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { PBA_LIST_PATH, PBA_NOUN, PBA_STATUS_INTENT } from '../paths';

export function PurchaseBlanketAgreementList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const agreements = useAsync(listPurchaseBlanketAgreements, []);
  useDocTitle('Purchase Blanket Agreements');

  const totalOf = (pba: PurchaseBlanketAgreement) => pbaTotals(pba).plannedTotal;

  const fields = [
    textField<PurchaseBlanketAgreement>('no', 'No.', pbaNumber),
    partnerField<PurchaseBlanketAgreement>('vendor', 'Vendor', (d) => d.vendorId, (d) => d.vendorName, agreements),
    textField<PurchaseBlanketAgreement>('vendorRef', 'Vendor agreement no.', (d) => d.vendorRef),
    dateField<PurchaseBlanketAgreement>('startDate', 'Start date', (d) => d.startDate),
    dateField<PurchaseBlanketAgreement>('endDate', 'End date', (d) => d.endDate),
    statusField<PurchaseBlanketAgreement>(scopeStatuses(draftsOnly, PBA_STATUSES)),
  ];

  const allColumns: ListColumn<PurchaseBlanketAgreement>[] = [
    { key: 'no', header: 'No.', sortable: true, locked: true, cell: (pba) => <TableContent href={`#${PBA_LIST_PATH}/${pba.docNum ? pbaNumber(pba) : pba.id}`}>{pba.docNum ? pbaNumber(pba) : <Text tone="muted">Draft</Text>}</TableContent> },
    { key: 'status', header: 'Status', sortable: true, cell: (pba) => <TableStatus intent={PBA_STATUS_INTENT[pba.status]}>{pba.status}</TableStatus> },
    { key: 'vendor', header: 'Vendor', sortable: true, cell: (pba) => <TableContent subcopy={pba.vendorCode}>{pba.vendorName || '—'}</TableContent> },
    { key: 'description', header: 'Description', defaultHidden: true, cell: (pba) => pba.description || <Text tone="muted">—</Text> },
    { key: 'startDate', header: 'Start date', sortable: true, cell: (pba) => formatDate(pba.startDate) },
    { key: 'endDate', header: 'End date', sortable: true, defaultHidden: true, cell: (pba) => pba.endDate ? formatDate(pba.endDate) : <Text tone="muted">—</Text> },
    { key: 'total', header: 'Planned total', sortable: true, cell: (pba) => { const totals = pbaTotals(pba); return <span className="tabular-nums">{pba.currency} {formatAmount(totals.plannedTotal)}</span>; } },
  ];
  const { columns, manager } = useListColumns('purchase-blanket-agreements', allColumns);

  return (
    <ListPage
      rows={agreements}
      columns={columns}
      fields={fields}
      noun={PBA_NOUN}
      icon="handshake"
      basePath={PBA_LIST_PATH}
      listKey="purchase-blanket-agreements"
      builtIns={draftSplit(draftsOnly, PBA_STATUSES)}
      scope={draftScope(draftsOnly, PBA_STATUSES)}
      defaultSort={{ key: 'startDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., vendor, or description', label: `Search ${PBA_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? pbaNumber(r) : r.id}
      filterFn={(pba, q) => !q || [pbaNumber(pba), pba.vendorCode, pba.vendorName, pba.vendorRef, pba.description].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (pba: PurchaseBlanketAgreement): string | number =>
          sort.key === 'total' ? totalOf(pba) : String(pba[sort.key as keyof PurchaseBlanketAgreement] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
