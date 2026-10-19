import { Icon, IconButton, Panel, PanelHeader, SidePanel, TableContent, Text } from '@jasperlepardo/sikat-design-system';
import type { TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../components/form/DataTable';
import { Stat } from '../../components/Stat';
import { accountLabel, isUnder, type Account } from '../../mocks/chartOfAccounts';
import { ORIGIN_LABEL, type JournalEntry, type JeLine } from '../../mocks/journalEntries';
import { formatDate } from '../../services/dates';
import { formatAmount } from '../../services/format';
import { jeNumber, listJournalEntries, rowAccount } from '../../services/journalEntries';
import { listPartners } from '../../services/partners';
import { useAsync } from '../../services/useAsync';
import { JE_LIST_PATH } from './journal/JournalEntryDetail';

interface Posting {
  id: string;
  je: JournalEntry;
  line: JeLine;
  account: string;
  /** Balance after this row, debit positive. */
  running: number;
}

/** "1,234.00 Dr" / "1,234.00 Cr": a balance with its side. */
export const signedBalance = (n: number) => (n ? `${formatAmount(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}` : formatAmount(0));

/**
 * Account Balance: every posted row on the account (a title account: on every account under it),
 * oldest first, with the running balance. Each row opens its journal entry.
 */
export function AccountBalancePanel({ account, all, onClose }: { account: Account; all: readonly Account[]; onClose: () => void }) {
  const data = useAsync(() => Promise.all([listJournalEntries(), listPartners()]), []);
  const codes = new Set([account.code, ...all.filter((a) => isUnder(a, account.code, all as Account[])).map((a) => a.code)]);

  const postings: Posting[] = [];
  if (data) {
    const [entries, partners] = data;
    let running = 0;
    const sorted = [...entries].sort((a, b) => a.postingDate.localeCompare(b.postingDate) || a.transNo - b.transNo);
    for (const je of sorted)
      je.lines.forEach((line, i) => {
        const code = rowAccount(line, partners);
        if (!codes.has(code)) return;
        running = Math.round((running + (line.debit || 0) - (line.credit || 0)) * 100) / 100;
        postings.push({ id: `${je.id}-${line.id || i}`, je, line, account: code, running });
      });
  }
  const debit = postings.reduce((n, p) => n + (p.line.debit || 0), 0);
  const credit = postings.reduce((n, p) => n + (p.line.credit || 0), 0);
  const balance = postings.at(-1)?.running ?? 0;
  const nameOf = (code: string) => all.find((a) => a.code === code)?.name ?? code;

  const columns: TableColumn<Posting>[] = [
    { key: 'date', header: 'Posting date', cell: (p) => formatDate(p.je.postingDate) },
    {
      key: 'entry',
      header: 'Entry',
      cell: (p) => (
        <TableContent href={`#${JE_LIST_PATH}/${p.je.id}`} subcopy={p.je.origin === 'JE' ? 'Journal entry' : `${ORIGIN_LABEL[p.je.origin]} ${p.je.originNo}`}>
          {jeNumber(p.je)}
        </TableContent>
      ),
    },
    ...(account.title ? [{ key: 'account', header: 'Account', cell: (p: Posting) => `${p.account} ${nameOf(p.account)}` }] : []),
    { key: 'remarks', header: 'Remarks', cell: (p) => <Text variant="small">{p.line.remarks || p.je.remarks}</Text> },
    { key: 'debit', header: 'Debit', cell: (p) => <span className="tabular-nums">{p.line.debit ? formatAmount(p.line.debit) : ''}</span> },
    { key: 'credit', header: 'Credit', cell: (p) => <span className="tabular-nums">{p.line.credit ? formatAmount(p.line.credit) : ''}</span> },
    { key: 'running', header: 'Balance', cell: (p) => <span className="tabular-nums">{signedBalance(p.running)}</span> },
  ];

  return (
    <SidePanel overlay onOverlayClick={onClose}>
      <PanelHeader
        type="details"
        icon="account_balance"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={`Account balance · ${accountLabel(account)}`}
        actions={
          <IconButton type="button" intent="default" variant="link" label="Close" onClick={onClose}>
            <Icon size={20}>close</Icon>
          </IconButton>
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat icon="account_balance" label="Balance" value={`PHP ${signedBalance(balance)}`} sub={account.title ? `All ${codes.size - 1} accounts under it` : `${postings.length} postings`} />
          <Stat icon="arrow_upward" label="Debits" value={`PHP ${formatAmount(debit)}`} sub="Total debited" />
          <Stat icon="arrow_downward" label="Credits" value={`PHP ${formatAmount(credit)}`} sub="Total credited" />
        </div>
        {data ? (
          <DataTable
            variant="card"
            icon="receipt_long"
            title="Postings"
            description="Every posted row, oldest first. Open an entry to see its source document."
            rows={postings}
            getRowId={(p) => p.id}
            columns={columns}
            unsortable={columns.map((c) => c.key)}
            empty={<Text variant="small" tone="muted">Nothing has posted to this account yet.</Text>}
          />
        ) : (
          <Text tone="muted" className="p-4">Loading…</Text>
        )}
      </Panel.Body>
    </SidePanel>
  );
}
