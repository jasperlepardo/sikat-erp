import type { ReactNode } from 'react';
import { List, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../components/form/fields';
import { accountText, type Account } from '../../../mocks/chartOfAccounts';
import { formatAmount } from '../../../services/format';

interface Props {
  journal: { account: string; debit: number; credit: number }[];
  accounts: Account[];
  empty: string;
  note: ReactNode;
}

export function ReturnJournalCard({ journal, accounts, empty, note }: Props) {
  return (
    <Section icon="account_balance" title="Journal entry">
      {journal.length ? (
        <List.Group divider>
          {journal.map((j) => (
            <List.Item key={j.account} title={accountText(j.account, accounts)} content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>} />
          ))}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">{empty}</Text>
      )}
      <Text variant="small" tone="muted">{note}</Text>
    </Section>
  );
}
