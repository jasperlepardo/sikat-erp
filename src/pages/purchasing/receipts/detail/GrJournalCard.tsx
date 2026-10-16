import { List, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { grJournal } from '../../../../services/goodsReceipts';
import { formatAmount } from '../../../../services/format';
import type { GrSectionProps } from './types';

export function GrJournalCard({ draft, m, ctx }: GrSectionProps) {
  if (!ctx.fx) return null;

  const journal = grJournal(draft, ctx.fx, m.items, m.inv.groups);

  return (
    <Section icon="account_balance" title="Journal entry">
      {journal.length ? (
        <List.Group divider>
          {journal.map((j) => (
            <List.Item
              key={j.account}
              title={accountText(j.account, m.inv.accounts)}
              content={<span className="whitespace-nowrap tabular-nums">{j.debit ? `Dr ${formatAmount(j.debit)}` : `Cr ${formatAmount(j.credit)}`}</span>}
            />
          ))}
        </List.Group>
      ) : null}
      <Text variant="small" tone="muted">
        {journal.length
          ? `In PHP${draft.currency === 'PHP' ? '' : ` at ${ctx.fx}`}. Stock goes in at net cost after discounts; VAT isn't posted until the vendor's A/P invoice, which clears Goods Received Not Invoiced.`
          : 'Made when the receipt is added: Dr Inventory (or the cost account for non-stock items) / Cr Goods Received Not Invoiced. Add lines to see it.'}
      </Text>
    </Section>
  );
}
