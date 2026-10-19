import { List, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import { accountText, type Account } from '../../../../mocks/chartOfAccounts';
import { formatAmount } from '../../../../services/format';

interface JournalLine { account: string; debit?: number; credit?: number; }

export function CmJournalCard({ journal, accounts, code, fx }: { journal: JournalLine[]; accounts: Account[]; code: string; fx: number }) {
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
        In PHP{code === 'PHP' ? '' : ` at ${fx}`}. Dr the vendor (what they owe back) and the withholding reversed / Cr Inventory for goods sent back (or price adjustments on stock), Goods Received Not Invoiced for lines from a goods return, and input VAT.
      </Text>
    </Section>
  );
}
