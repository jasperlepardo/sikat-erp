import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Icon,
  Panel,
  PanelHeader,
  Table,
  TableAmount,
  TableLink,
  TableStatus,
  TableSubcontent,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { EMPTY_FILTER, oneRule } from '../../../components/filter/engine';
import { choiceField, dateField, numberField, textField } from '../../../components/filter/fieldKit';
import { useListPresets } from '../../../components/filter/useListPresets';
import type { BuiltInView } from '../../../components/filter/useListViews';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { ORIGIN_LABEL, type JournalEntry } from '../../../mocks/journalEntries';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { jeNumber, jeTotals, listJournalEntries } from '../../../services/journalEntries';
import { useAsync } from '../../../services/useAsync';
import { JE_LIST_PATH, JE_STATUS_INTENT } from './JournalEntryDetail';

const JE_VIEWS: BuiltInView[] = [
  { id: 'all', name: 'All journal entries', filter: EMPTY_FILTER },
  { id: 'manual', name: 'Manual entries', filter: oneRule('origin', 'is', 'JE') },
  { id: 'documents', name: 'Entries from documents', filter: oneRule('origin', 'isNot', 'JE') },
  { id: 'reversed', name: 'Reversed entries', filter: oneRule('status', 'is', 'Reversed') },
];

export function JournalEntryList() {
  const navigate = useNavigate();
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
  const presets = useListPresets({
    list: 'journal-entries',
    fields,
    builtIns: JE_VIEWS,
    defaultSort: { key: 'transNo', direction: 'desc' },
    rows: entries,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(entries ?? []).filter(
      (e) =>
        (!q ||
          [jeNumber(e), e.origin, ORIGIN_LABEL[e.origin], e.originNo, e.remarks, e.ref1, e.ref2, e.ref3, e.transCode, ...e.lines.map((l) => `${l.account} ${l.remarks}`)]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (e: JournalEntry): string | number => (sort.key === 'amount' ? jeTotals(e.lines).debit : sort.key === 'transNo' ? e.transNo : String(e[sort.key as keyof JournalEntry] ?? ''));
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [entries, presets.filter, query, sort]);

  const open = (e: JournalEntry) => navigate(`${JE_LIST_PATH}/${e.id}`);
  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<JournalEntry>[] = [
    {
      key: 'transNo',
      header: 'No.',
      sortable: true,
      cell: (e) => (
        <TableSubcontent subcopy={`Trans. ${e.transNo}`}>
          <TableLink onClick={() => open(e)}>{jeNumber(e)}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'postingDate', header: 'Posting date', sortable: true, cell: (e) => formatDate(e.postingDate) },
    {
      key: 'origin',
      header: 'Origin',
      sortable: true,
      cell: (e) => <TableSubcontent subcopy={ORIGIN_LABEL[e.origin]}>{e.origin === 'JE' ? 'JE' : `${e.origin} ${e.originNo}`}</TableSubcontent>,
    },
    { key: 'remarks', header: 'Remarks', cell: (e) => <TableSubcontent subcopy={[e.ref1, e.ref2].filter(Boolean).join(' · ') || undefined}>{e.remarks || '—'}</TableSubcontent> },
    { key: 'amount', header: 'Amount', sortable: true, cell: (e) => <TableAmount currency="PHP">{formatAmount(jeTotals(e.lines).debit)}</TableAmount> },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (e) => <TableStatus intent={JE_STATUS_INTENT[e.status]}>{e.reverses ? 'Reversal' : e.status}</TableStatus>,
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search journal entries"
        searchPlaceholder="Search by number, origin, remarks, reference or account"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        icon="menu_book"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="extra-large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${JE_LIST_PATH}/new`)}>
            New journal entry
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        {presets.bar(null)}
        <Card className={fillCardClass(onPage.length)}>
          {entries ? (
            <Table
              caption="Journal entries"
              columns={columns}
              rows={onPage}
              getRowId={(e) => e.id}
              sort={sort}
              onSortChange={setSort}
              layout="fill"
              onRowAction={open}
              pagination={{
                page,
                pageSize,
                total: rows.length,
                pageSizes: PAGE_SIZES,
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size);
                  setPage(1);
                },
              }}
            />
          ) : (
            <Text tone="muted" className="p-4">Loading journal entries…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
