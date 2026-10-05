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
  Tabs,
  Text,
  TextField,
  type TableColumn,
  type TableSort,
} from '@jasperlepardo/sikat-design-system';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import { ORIGIN_LABEL, type JournalEntry } from '../../../mocks/journalEntries';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { jeNumber, jeTotals, listJournalEntries } from '../../../services/journalEntries';
import { useAsync } from '../../../services/useAsync';
import { JE_LIST_PATH, JE_STATUS_INTENT } from './JournalEntryDetail';

type Filter = 'all' | 'manual' | 'documents' | 'reversed';
const FILTERS: { value: Filter; label: string; test: (e: JournalEntry) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'manual', label: 'Manual', test: (e) => e.origin === 'JE' },
  { value: 'documents', label: 'From documents', test: (e) => e.origin !== 'JE' },
  { value: 'reversed', label: 'Reversed', test: (e) => e.status === 'Reversed' },
];

export function JournalEntryList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const entries = useAsync(listJournalEntries, []);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort | null>({ key: 'transNo', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.value === filter)!.test;
    const filtered = (entries ?? []).filter(
      (e) =>
        test(e) &&
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
  }, [entries, filter, query, sort]);

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
        icon="menu_book"
        title="Journal Entries"
        subcopy="Every posting in the ledger: entries typed in by hand, and the ones documents make when they're added or cancelled."
        actions={
          <Button intent="primary" variant="solid" size="extra-large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${JE_LIST_PATH}/new`)}>
            New journal entry
          </Button>
        }
        tabs={
          <Tabs
            variant="outline"
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter);
              setPage(1);
            }}
            items={FILTERS.map((f) => ({ value: f.value, label: f.label, badge: String(entries?.filter(f.test).length ?? '') }))}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Saved">
            {notice}
          </Alert>
        ) : null}
        <TextField
          aria-label="Search journal entries"
          placeholder="Search by number, origin, remarks, reference or account"
          leadingIcon={<Icon size={20}>search</Icon>}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setPage(1);
          }}
        />
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
    </Panel>
  );
}
