import type { ReactNode } from 'react';
import { List, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { formatAmount } from '../../../../services/format';
import { qtTotals } from '../../../../services/quotations';
import type { QtTabProps } from './types';

function TotalRow({ label, value, code, input, strong }: { label: string; value: number; code: string; input?: ReactNode; strong?: boolean }) {
  const emphasis = (node: ReactNode) => (strong ? <Text as="span" weight="semibold" tone="heading">{node}</Text> : node);
  return (
    <List.Item
      title={<span className="flex items-center gap-2"><span className="whitespace-nowrap">{emphasis(label)}</span>{input ? <span className="flex-none">{input}</span> : null}</span>}
      content={<span className="whitespace-nowrap tabular-nums">{emphasis(`${code} ${formatAmount(value)}`)}</span>}
    />
  );
}

export function QtTotalsFooter({ draft, update, ctx }: QtTabProps) {
  const totals = qtTotals(draft, ctx.rateOf);
  const code = draft.currency;
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <List.Group divider>
        <TotalRow label="Total before discount" value={totals.beforeDiscount} code={code} />
        <TotalRow
          label="Discount"
          value={totals.discount ? -totals.discount : 0}
          code={code}
          input={<TextField aria-label="Document discount %" type="number" min={0} className="w-24" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />}
        />
        <TotalRow label="Tax" value={totals.tax} code={code} />
        <TotalRow label="Total" value={totals.total} code={code} strong />
      </List.Group>
    </fieldset>
  );
}
