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
import { boolField, choiceField, dateField, numberField, textField } from '../../../components/filter/fieldKit';
import { statusViews, useListPresets } from '../../../components/filter/useListPresets';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, fillCardClass } from '../../../components/form/DataTable';
import type { JournalVoucher } from '../../../mocks/journalVouchers';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { jeTotals } from '../../../services/journalEntries';
import { hasPosted, listVouchers, voucherStatus } from '../../../services/journalVouchers';
import { useAsync } from '../../../services/useAsync';

export const JV_LIST_PATH = '/accounting/journal-vouchers';
export const entryPath = (voucherId: string, entryId: string) => `${JV_LIST_PATH}/${voucherId}/entries/${entryId}`;

/** Open, Partly posted (some entries posted, others still open) or Closed. */
export function voucherState(v: JournalVoucher) {
  const status = voucherStatus(v);
  if (status === 'Closed') return { label: 'Closed', intent: 'default' as const };
  return hasPosted(v) ? { label: 'Partly posted', intent: 'warning' as const } : { label: 'Open', intent: 'success' as const };
}

const debitOf = (v: JournalVoucher) => v.entries.reduce((n, e) => n + jeTotals(e.lines).debit, 0);

export function JournalVoucherList() {
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const vouchers = useAsync(listVouchers, []);
  const fields = [
    numberField<JournalVoucher>('voucherNo', 'Voucher no.', (v) => v.voucherNo),
    dateField<JournalVoucher>('createdOn', 'Created', (v) => v.createdOn),
    textField<JournalVoucher>('createdBy', 'Created by', (v) => v.createdBy),
    textField<JournalVoucher>('remarks', 'Remarks', (v) => v.entries.map((e) => e.remarks)),
    textField<JournalVoucher>('account', 'Account', (v) => v.entries.flatMap((e) => e.lines.map((l) => l.account))),
    numberField<JournalVoucher>('entries', 'Entries', (v) => v.entries.length),
    numberField<JournalVoucher>('amount', 'Debits', debitOf),
    choiceField<JournalVoucher>('status', 'Status', ['Open', 'Closed'], voucherStatus),
    boolField<JournalVoucher>('partlyPosted', 'Partly posted', (v) => voucherState(v).label === 'Partly posted'),
  ];
  const presets = useListPresets({
    list: 'journal-vouchers',
    fields,
    builtIns: statusViews('journal vouchers', ['Open', 'Closed']),
    defaultSort: { key: 'voucherNo', direction: 'desc' },
    rows: vouchers,
    onChange: () => setPage(1),
  });
  const { sort, setSort } = presets;
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = presets.apply(vouchers ?? []).filter(
      (v) =>
        (!q ||
          [String(v.voucherNo), v.createdBy, ...v.entries.flatMap((e) => [e.remarks, e.ref1, e.ref2, e.ref3, ...e.lines.map((l) => `${l.account} ${l.remarks}`)])]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    if (!sort) return filtered;
    const dir = sort.direction === 'asc' ? 1 : -1;
    const value = (v: JournalVoucher): string | number =>
      sort.key === 'amount' ? debitOf(v) : sort.key === 'entries' ? v.entries.length : sort.key === 'status' ? voucherState(v).label : sort.key === 'createdOn' ? v.createdOn : v.voucherNo;
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [vouchers, presets.filter, query, sort]);

  const open = (v: JournalVoucher) => navigate(`${JV_LIST_PATH}/${v.id}`);
  const onPage = rows.slice((page - 1) * pageSize, page * pageSize);

  const columns: TableColumn<JournalVoucher>[] = [
    { key: 'voucherNo', header: 'Voucher No.', sortable: true, cell: (v) => <TableLink onClick={() => open(v)}>{v.voucherNo}</TableLink> },
    {
      key: 'entries',
      header: 'Entries',
      sortable: true,
      cell: (v) => {
        const posted = v.entries.filter((e) => e.entryStatus === 'Closed').length;
        return (
          <TableSubcontent subcopy={posted ? `${posted} posted` : 'None posted'}>
            {`${v.entries.length} entr${v.entries.length === 1 ? 'y' : 'ies'}`}
          </TableSubcontent>
        );
      },
    },
    { key: 'remarks', header: 'Remarks', cell: (v) => v.entries[0]?.remarks || '—' },
    { key: 'amount', header: 'Debits', sortable: true, cell: (v) => <TableAmount currency="PHP">{formatAmount(debitOf(v))}</TableAmount> },
    { key: 'createdOn', header: 'Created', sortable: true, cell: (v) => <TableSubcontent subcopy={v.createdBy}>{formatDate(v.createdOn)}</TableSubcontent> },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (v) => {
        const s = voucherState(v);
        return <TableStatus intent={s.intent}>{s.label}</TableStatus>;
      },
    },
  ];

  return (
    <Panel className="flex-1">
      <PanelHeader
        showSearch
        searchLabel="Search journal vouchers"
        searchPlaceholder="Search by voucher number, remarks, reference, account or who created it"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        icon="folder_open"
        title={presets.menu}
        actions={
          <Button intent="primary" variant="solid" size="extra-large" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => navigate(`${JV_LIST_PATH}/new/entries/new`)}>
            New voucher
          </Button>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        {notice ? (
          <Alert intent="success" variant="outline" title="Done">
            {notice}
          </Alert>
        ) : null}
        {presets.bar(null)}
        <Card className={fillCardClass(onPage.length)}>
          {vouchers ? (
            <Table
              caption="Journal vouchers"
              columns={columns}
              rows={onPage}
              getRowId={(v) => v.id}
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
            <Text tone="muted" className="p-4">Loading journal vouchers…</Text>
          )}
        </Card>
      </Panel.Body>
      {presets.panel}
    </Panel>
  );
}
