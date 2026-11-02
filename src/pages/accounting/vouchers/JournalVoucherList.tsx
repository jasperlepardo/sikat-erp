import { useLocation } from 'react-router';
import { Alert, TableAmount, TableContent, TableStatus, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { ListPage } from '../../../components/form/ListPage';
import { boolField, choiceField, dateField, numberField, textField } from '../../../components/filter/fieldKit';
import { statusViews } from '../../../components/filter/useListPresets';
import type { JournalVoucher } from '../../../mocks/journalVouchers';
import { formatDate } from '../../../services/dates';
import { formatAmount } from '../../../services/format';
import { jeTotals } from '../../../services/journalEntries';
import { listVouchers, voucherState, voucherStatus } from '../../../services/journalVouchers';
import { useAsync } from '../../../services/useAsync';
import { JV_LIST_PATH, JV_NOUN } from '../paths';

const debitOf = (v: JournalVoucher) => v.entries.reduce((n, e) => n + jeTotals(e.lines).debit, 0);

export function JournalVoucherList({ compact, selectedId }: { compact?: boolean; selectedId?: string } = {}) {
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

  const columns: TableColumn<JournalVoucher>[] = [
    { key: 'voucherNo', header: 'Voucher No.', sortable: true, cell: (v) => <TableContent href={`#${JV_LIST_PATH}/${v.id}`}>{v.voucherNo}</TableContent> },
    {
      key: 'entries',
      header: 'Entries',
      sortable: true,
      cell: (v) => {
        const posted = v.entries.filter((e) => e.entryStatus === 'Closed').length;
        return <TableContent subcopy={posted ? `${posted} posted` : 'None posted'}>{`${v.entries.length} entr${v.entries.length === 1 ? 'y' : 'ies'}`}</TableContent>;
      },
    },
    { key: 'remarks', header: 'Remarks', cell: (v) => v.entries[0]?.remarks || '—' },
    { key: 'amount', header: 'Debits', sortable: true, cell: (v) => <TableAmount currency="PHP">{formatAmount(debitOf(v))}</TableAmount> },
    { key: 'createdOn', header: 'Created', sortable: true, cell: (v) => <TableContent subcopy={v.createdBy}>{formatDate(v.createdOn)}</TableContent> },
    { key: 'status', header: 'Status', sortable: true, cell: (v) => { const s = voucherState(v); return <TableStatus intent={s.intent}>{s.label}</TableStatus>; } },
  ];

  return (
    <ListPage
      rows={vouchers}
      columns={columns}
      fields={fields}
      noun={JV_NOUN}
      icon="folder_open"
      basePath={JV_LIST_PATH}
      createPath={`${JV_LIST_PATH}/new/entries`}
      listKey="journal-vouchers"
      builtIns={statusViews(JV_NOUN.many, ['Open', 'Closed'])}
      defaultSort={{ key: 'voucherNo', direction: 'desc' }}
      search={{ placeholder: 'Search by voucher number, remarks, reference, account or who created it', label: 'Search journal vouchers' }}
      header={notice ? <Alert intent="success" variant="outline" title="Done">{notice}</Alert> : undefined}
      compact={compact}
      selectedId={selectedId}
      filterFn={(v, q) => !q || [String(v.voucherNo), v.createdBy, ...v.entries.flatMap((e) => [e.remarks, e.ref1, e.ref2, e.ref3, ...e.lines.map((l) => `${l.account} ${l.remarks}`)])].join(' ').toLowerCase().includes(q)}
      sortFn={(a, b, sort) => {
        const value = (v: JournalVoucher): string | number =>
          sort.key === 'amount' ? debitOf(v) : sort.key === 'entries' ? v.entries.length : sort.key === 'status' ? voucherState(v).label : sort.key === 'createdOn' ? v.createdOn : v.voucherNo;
        const x = value(a); const y = value(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }}
    />
  );
}
