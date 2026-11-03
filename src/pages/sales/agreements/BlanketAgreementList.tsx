import { useLocation } from 'react-router';
import { Alert, TableContent, TableStatus, Text } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { useListColumns, type ListColumn } from '../../../components/form/listColumns';
import { BA_STATUSES, type BlanketAgreement } from '../../../mocks/blanketAgreements';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { listBlanketAgreements, baNumber, baTotals } from '../../../services/blanketAgreements';
import { useAsync } from '../../../services/useAsync';
import { useDocTitle } from '../../../services/useDocTitle';
import { dateField, partnerField, statusField, textField } from '../../../components/filter/fieldKit';
import { draftScope, draftSplit, scopeStatuses } from '../../../components/filter/useListPresets';
import { BA_LIST_PATH, BA_NOUN, BA_STATUS_INTENT } from '../paths';

export function BlanketAgreementList({ draftsOnly = false, compact, selectedId }: { draftsOnly?: boolean; compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const agreements = useAsync(listBlanketAgreements, []);
  useDocTitle('Blanket Agreements');

  const totalOf = (ba: BlanketAgreement) => baTotals(ba).plannedTotal;

  const fields = [
    textField<BlanketAgreement>('no', 'No.', baNumber),
    partnerField<BlanketAgreement>('customer', 'Customer', (d) => d.customerId, (d) => d.customerName, agreements),
    textField<BlanketAgreement>('customerRef', 'Customer agreement no.', (d) => d.customerRef),
    dateField<BlanketAgreement>('startDate', 'Start date', (d) => d.startDate),
    dateField<BlanketAgreement>('endDate', 'End date', (d) => d.endDate),
    statusField<BlanketAgreement>(scopeStatuses(draftsOnly, BA_STATUSES)),
  ];

  const allColumns: ListColumn<BlanketAgreement>[] = [
    { key: 'no', header: 'No.', sortable: true, locked: true, cell: (ba) => <TableContent href={`#${BA_LIST_PATH}/${ba.docNum ? baNumber(ba) : ba.id}`}>{ba.docNum ? baNumber(ba) : <Text tone="muted">Draft</Text>}</TableContent> },
    { key: 'status', header: 'Status', sortable: true, cell: (ba) => <TableStatus intent={BA_STATUS_INTENT[ba.status]}>{ba.status}</TableStatus> },
    { key: 'customer', header: 'Customer', sortable: true, cell: (ba) => <TableContent subcopy={ba.customerCode}>{ba.customerName || '—'}</TableContent> },
    { key: 'description', header: 'Description', defaultHidden: true, cell: (ba) => (ba.description ? <span className="block whitespace-normal">{ba.description}</span> : <Text tone="muted">—</Text>) },
    { key: 'startDate', header: 'Start date', align: 'end', cell: (ba) => formatDate(ba.startDate) },
    { key: 'endDate', header: 'End date', align: 'end', defaultHidden: true, cell: (ba) => ba.endDate ? formatDate(ba.endDate) : <Text tone="muted">—</Text> },
    { key: 'total', header: 'Planned total', align: 'end', cell: (ba) => { const totals = baTotals(ba); return <span className="tabular-nums">{ba.currency} {formatAmount(totals.plannedTotal)}</span>; } },
  ];
  const { columns, manager } = useListColumns('blanket-agreements', allColumns);

  return (
    <ListPage
      rows={agreements}
      columns={columns}
      fields={fields}
      noun={BA_NOUN}
      icon="description"
      basePath={BA_LIST_PATH}
      listKey="blanket-agreements"
      builtIns={draftSplit(draftsOnly, BA_NOUN.many, BA_STATUSES)}
      scope={draftScope(draftsOnly, BA_STATUSES)}
      defaultSort={{ key: 'startDate', direction: 'desc' }}
      search={{ placeholder: 'Search by no., customer, or description', label: `Search ${BA_NOUN.many}` }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      toolbarExtra={manager}
      compact={compact}
      selectedId={selectedId}
      getRowId={(r) => r.docNum ? baNumber(r) : r.id}
      filterFn={(ba, q) => !q || [baNumber(ba), ba.customerCode, ba.customerName, ba.customerRef, ba.description].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (ba: BlanketAgreement): string | number =>
          sort.key === 'total' ? totalOf(ba) : String(ba[sort.key as keyof BlanketAgreement] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
