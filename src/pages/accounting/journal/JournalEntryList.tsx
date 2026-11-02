import { useLocation } from 'react-router';
import { Alert, TableAmount, TableContent, TableStatus, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { EMPTY_FILTER, oneRule } from '../../../components/filter/engine';
import { choiceField, dateField, numberField, textField } from '../../../components/filter/fieldKit';
import type { BuiltInView } from '../../../components/filter/useListViews';
import { ORIGIN_LABEL, type JournalEntry } from '../../../mocks/journalEntries';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { jeNumber, jeTotals, listJournalEntries } from '../../../services/journalEntries';
import { useAsync } from '../../../services/useAsync';
import { JE_LIST_PATH, JE_NOUN, JE_STATUS_INTENT } from '../paths';

const JE_VIEWS: BuiltInView[] = [
  { id: 'all', name: 'All journal entries', filter: EMPTY_FILTER },
  { id: 'manual', name: 'Manual entries', filter: oneRule('origin', 'is', 'JE') },
  { id: 'documents', name: 'Entries from documents', filter: oneRule('origin', 'isNot', 'JE') },
  { id: 'reversed', name: 'Reversed entries', filter: oneRule('status', 'is', 'Reversed') },
];

export function JournalEntryList({ compact, selectedId }: { compact?: boolean; selectedId?: string } = {}) {
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const entries = useAsync(listJournalEntries, []);

  const fields = [
    numberField<JournalEntry>('transNo', 'Trans. no.', (e) => e.transNo),
    textField<JournalEntry>('no', 'No.', jeNumber),
    dateField<JournalEntry>('postingDate', 'Posting date', (e) => e.postingDate),
    dateField<JournalEntry>('dueDate', 'Due date', (e) => e.dueDate),
    choiceField<JournalEntry>('origin', 'Origin', ORIGIN_LABEL, (e) => e.origin),
    textField<JournalEntry>('originNo', 'Origin no.', (e) => e.originNo),
    textField<JournalEntry>('remarks', 'Remarks', (e) => e.remarks),
    textField<JournalEntry>('ref', 'Reference', (e) => [e.ref1, e.ref2, e.ref3]),
    textField<JournalEntry>('account', 'Account', (e) => e.lines.map((l) => l.account)),
    numberField<JournalEntry>('amount', 'Amount', (e) => jeTotals(e.lines).debit),
    choiceField<JournalEntry>('status', 'Status', ['Posted', 'Reversed'], (e) => e.status),
  ];

  const columns: TableColumn<JournalEntry>[] = [
    { key: 'transNo', header: 'No.', sortable: true, cell: (e) => <TableContent href={`#${JE_LIST_PATH}/${e.id}`} subcopy={`Trans. ${e.transNo}`}>{jeNumber(e)}</TableContent> },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (e) => formatDate(e.postingDate) },
    { key: 'origin', header: 'Origin', sortable: true, cell: (e) => <TableContent subcopy={ORIGIN_LABEL[e.origin]}>{e.origin === 'JE' ? 'JE' : `${e.origin} ${e.originNo}`}</TableContent> },
    { key: 'remarks', header: 'Remarks', cell: (e) => <TableContent subcopy={[e.ref1, e.ref2].filter(Boolean).join(' · ') || undefined}>{e.remarks || '—'}</TableContent> },
    { key: 'amount', header: 'Amount', sortable: true, cell: (e) => <TableAmount currency="PHP">{formatAmount(jeTotals(e.lines).debit)}</TableAmount> },
    { key: 'status', header: 'Status', sortable: true, cell: (e) => <TableStatus intent={JE_STATUS_INTENT[e.status]}>{e.reverses ? 'Reversal' : e.status}</TableStatus> },
  ];

  return (
    <ListPage
      rows={entries}
      columns={columns}
      fields={fields}
      noun={JE_NOUN}
      icon="menu_book"
      basePath={JE_LIST_PATH}
      listKey="journal-entries"
      builtIns={JE_VIEWS}
      defaultSort={{ key: 'transNo', direction: 'desc' }}
      search={{ placeholder: 'Search by number, origin, remarks, reference or account', label: 'Search journal entries' }}
      header={notice ? <Alert intent="success" variant="outline" title="Saved">{notice}</Alert> : undefined}
      emptyMessage={`No ${JE_NOUN.many} yet. Most post automatically from documents; create a manual one with New ${JE_NOUN.one}.`}
      compact={compact}
      selectedId={selectedId}
      filterFn={(e, q) => !q || [jeNumber(e), e.origin, ORIGIN_LABEL[e.origin], e.originNo, e.remarks, e.ref1, e.ref2, e.ref3, e.transCode, ...e.lines.map((l) => `${l.account} ${l.remarks}`)].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (e: JournalEntry): string | number =>
          sort.key === 'amount' ? jeTotals(e.lines).debit : sort.key === 'transNo' ? e.transNo : String(e[sort.key as keyof JournalEntry] ?? '');
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
