import { useNavigate } from 'react-router';
import {
  Card,
  Icon,
  Panel,
  Table,
  TableAmount,
  TableLink,
  TableStatus,
  TableSubcontent,
  Text,
  type TableColumn,
} from '@jasperlepardo/sikat-design-system';
import { ORIGIN_LABEL, type JournalEntry } from '../../mocks/journalEntries';
import { type JournalVoucher } from '../../mocks/journalVouchers';
import { formatDate, todayISO } from '../../services/dates';
import { formatAmount } from '../../services/format';
import { jeTotals, jeNumber, listJournalEntries } from '../../services/journalEntries';
import { listVouchers, voucherStatus } from '../../services/journalVouchers';
import { useAsync } from '../../services/useAsync';
import { Stat } from '../../components/Stat';
import { JE_LIST_PATH, JE_STATUS_INTENT } from './journal/JournalEntryDetail';
import { JV_LIST_PATH, voucherState } from './vouchers/JournalVoucherList';

const debitOf = (v: JournalVoucher) => v.entries.reduce((n, e) => n + jeTotals(e.lines).debit, 0);

export function AccountingDashboard() {
  const navigate = useNavigate();
  const data = useAsync(() => Promise.all([listJournalEntries(), listVouchers()]), []);
  const [entries, vouchers] = data ?? [undefined, undefined];

  const today = todayISO();
  const thisMonth = today.slice(0, 7);
  const postedThisMonth = entries?.filter((e) => e.postingDate.startsWith(thisMonth)) ?? [];
  const openVouchers = vouchers?.filter((v) => voucherStatus(v) === 'Open') ?? [];

  const recentEntries = [...(entries ?? [])].sort((a, b) => b.postingDate.localeCompare(a.postingDate) || b.transNo - a.transNo).slice(0, 6);
  const recentVouchers = [...(vouchers ?? [])].sort((a, b) => b.createdOn.localeCompare(a.createdOn)).slice(0, 6);

  const jeColumns: TableColumn<JournalEntry>[] = [
    {
      key: 'transNo',
      header: 'No.',
      cell: (e) => (
        <TableSubcontent subcopy={`Trans. ${e.transNo}`}>
          <TableLink onClick={() => navigate(`${JE_LIST_PATH}/${e.id}`)}>{jeNumber(e)}</TableLink>
        </TableSubcontent>
      ),
    },
    { key: 'postingDate', header: 'Date', cell: (e) => formatDate(e.postingDate) },
    {
      key: 'origin',
      header: 'Origin',
      cell: (e) => (
        <TableSubcontent subcopy={ORIGIN_LABEL[e.origin]}>
          {e.origin === 'JE' ? 'JE' : `${e.origin} ${e.originNo}`}
        </TableSubcontent>
      ),
    },
    { key: 'amount', header: 'Amount', cell: (e) => <TableAmount currency="PHP">{formatAmount(jeTotals(e.lines).debit)}</TableAmount> },
    { key: 'status', header: 'Status', cell: (e) => <TableStatus intent={JE_STATUS_INTENT[e.status]}>{e.reverses ? 'Reversal' : e.status}</TableStatus> },
  ];

  const jvColumns: TableColumn<JournalVoucher>[] = [
    {
      key: 'voucherNo',
      header: 'Voucher No.',
      cell: (v) => <TableLink onClick={() => navigate(`${JV_LIST_PATH}/${v.id}`)}>{v.voucherNo}</TableLink>,
    },
    {
      key: 'entries',
      header: 'Entries',
      cell: (v) => {
        const posted = v.entries.filter((e) => e.entryStatus === 'Closed').length;
        return (
          <TableSubcontent subcopy={posted ? `${posted} posted` : 'None posted'}>
            {`${v.entries.length} entr${v.entries.length === 1 ? 'y' : 'ies'}`}
          </TableSubcontent>
        );
      },
    },
    { key: 'amount', header: 'Debits', cell: (v) => <TableAmount currency="PHP">{formatAmount(debitOf(v))}</TableAmount> },
    { key: 'createdOn', header: 'Created', cell: (v) => formatDate(v.createdOn) },
    { key: 'status', header: 'Status', cell: (v) => { const s = voucherState(v); return <TableStatus intent={s.intent}>{s.label}</TableStatus>; } },
  ];

  return (
    <Panel className="flex-1">
      <Panel.Body>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat
            icon="menu_book"
            label="Journal entries"
            value={entries ? String(entries.length) : '—'}
            sub="total posted"
          />
          <Stat
            icon="today"
            label="Posted this month"
            value={entries ? String(postedThisMonth.length) : '—'}
            sub={today.slice(0, 7)}
          />
          <Stat
            icon="folder_open"
            label="Open vouchers"
            value={vouchers ? String(openVouchers.length) : '—'}
            sub="pending posting"
          />
          <Stat
            icon="swap_horiz"
            label="Reversals"
            value={entries ? String(entries.filter((e) => e.reverses).length) : '—'}
            sub="journal entries"
          />
        </div>

        <div className="grid gap-2 lg:grid-cols-2">
          <Card>
            <Card.Header icon={<Icon size={24}>menu_book</Icon>} actions={<Text variant="small" tone="muted" as="button" onClick={() => navigate(JE_LIST_PATH)}>See all</Text>}>
              Recent journal entries
            </Card.Header>
            <Card.Content>
              {recentEntries.length ? (
                <Table columns={jeColumns} rows={recentEntries} getRowId={(e) => e.id} layout="scroll" />
              ) : (
                <Text tone="muted" variant="small">No journal entries yet.</Text>
              )}
            </Card.Content>
          </Card>

          <Card>
            <Card.Header icon={<Icon size={24}>folder_open</Icon>} actions={<Text variant="small" tone="muted" as="button" onClick={() => navigate(JV_LIST_PATH)}>See all</Text>}>
              Recent journal vouchers
            </Card.Header>
            <Card.Content>
              {recentVouchers.length ? (
                <Table columns={jvColumns} rows={recentVouchers} getRowId={(v) => v.id} layout="scroll" />
              ) : (
                <Text tone="muted" variant="small">No journal vouchers yet.</Text>
              )}
            </Card.Content>
          </Card>
        </div>
      </Panel.Body>
    </Panel>
  );
}
