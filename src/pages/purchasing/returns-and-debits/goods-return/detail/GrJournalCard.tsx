import { List, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../../components/form/fields';
import { accountText, type Account } from '../../../../../mocks/chartOfAccounts';
import { formatAmount } from '../../../../../services/format';

interface JournalLine { account: string; debit?: number; credit?: number; }

export function GrJournalCard({ journal, accounts }: { journal: JournalLine[]; accounts: Account[] }) {
  return (
    <Section icon="account_balance" title="Journal entry">
      {journal.length ? (
        <List.Group divider>
          {journal.map((j) => (
            <List.Item key={j.account} title={accountText(j.account, accounts)} content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit ?? 0)}`}</span>} />
          ))}
        </List.Group>
      ) : null}
      <Text variant="small" tone="muted">
        In PHP, at the cost the goods came in at. Goods Received Not Invoiced is cleared by the vendor's A/P credit memo (for billed goods) or by billing less (for goods not yet billed). Total credit is what the vendor owes back, VAT included.
      </Text>
    </Section>
  );
}
