import { List, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { dnJournal } from '../../../../services/deliveries';
import { formatAmount } from '../../../../services/format';
import type { DnSectionProps } from './types';

export function DnJournalCard({ draft, ctx, m }: DnSectionProps) {
  const journal = dnJournal(draft, m.items, m.inv.groups, ctx.added);
  return (
    <Section icon="account_balance" title="Journal entry">
      {journal.length ? (
        <List.Group divider>
          {journal.map((j) => (
            <List.Item
              key={j.account}
              title={accountText(j.account, m.accounts)}
              content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>}
            />
          ))}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">
          Adding moves the cost of the stock shipped: Dr COGS (or Shipped Goods) / Cr Inventory, at item cost.
        </Text>
      )}
      <Text variant="small" tone="muted">
        {ctx.added ? 'As posted, at the cost the stock left at.' : 'At current item cost. Revenue and output VAT post on the A/R invoice.'}
      </Text>
    </Section>
  );
}
