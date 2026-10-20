import { Badge, List, Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import { formatAmount } from '../../../../services/format';
import type { OpSectionProps } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Summary: always reconciles with the bills table — ticked rows plus any amount on account. */
export function OpSummaryCard({ draft, ctx, hint }: Pick<OpSectionProps, 'draft' | 'ctx'> & { hint?: string }) {
  const code = draft.currency;
  const ticked = draft.rows.filter((r) => r.selected && r.amount > 0);
  const totalBalance = round2(draft.rows.reduce((n, r) => n + r.balanceDue, 0));
  const toBills = round2(ticked.reduce((n, r) => n + r.amount, 0));
  const toPay = round2(toBills + draft.onAccount);
  const line = (label: string, n: number, strong = false) => (
    <List.Item
      key={label}
      title={strong ? <strong>{label}</strong> : label}
      content={<span className={`whitespace-nowrap tabular-nums ${strong ? 'font-semibold' : ''}`}>{code} {formatAmount(n)}</span>}
    />
  );
  const todo = (label: string) => (
    <List.Item key={label} title={<span className="text-(--color-text-placeholder)">{label}</span>} content={<Badge size="small" intent="default">TODO</Badge>} />
  );

  return (
    <Section icon="functions" title="Summary">
      <List.Group divider>
        {ctx.readOnly ? (
          <>
            {line('Amount paid', toPay, true)}
            {draft.onAccount ? line('On account', draft.onAccount) : null}
          </>
        ) : (
          <>
            {line('Total balance due', totalBalance)}
            {line('Amount to pay', toPay, true)}
            {draft.onAccount ? line('On account', draft.onAccount) : null}
            {line('Remaining balance', round2(totalBalance - toBills))}
          </>
        )}
        {todo('Withholding tax')}
        {code !== 'PHP' ? todo(`Exchange rate (${code} at ${ctx.fx || '—'})`) : null}
      </List.Group>
      {hint ? <Text variant="small" tone="muted">{hint}</Text> : null}
    </Section>
  );
}
