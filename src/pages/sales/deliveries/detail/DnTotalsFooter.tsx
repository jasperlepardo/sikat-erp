import type { ReactNode } from 'react';
import { Checkbox, List, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { formatAmount } from '../../../../services/format';
import { dnTotals } from '../../../../services/deliveries';
import { SALES_SETTINGS } from '../../../../mocks/salesOrders';
import type { DnSectionProps } from './types';

function TotalRow({ label, value, code, input, strong }: { label: string; value: number; code: string; input?: ReactNode; strong?: boolean }) {
  const emphasis = (node: ReactNode) => (strong ? <Text as="span" weight="semibold" tone="heading">{node}</Text> : node);
  return (
    <List.Item
      title={<span className="flex items-center gap-2"><span className="whitespace-nowrap">{emphasis(label)}</span>{input ? <span className="flex-none">{input}</span> : null}</span>}
      content={<span className="whitespace-nowrap tabular-nums">{emphasis(`${code} ${formatAmount(value)}`)}</span>}
    />
  );
}

export function DnTotalsFooter({ draft, update, ctx, m }: DnSectionProps) {
  const docCurrency = m.currencies.find((c) => c.code === draft.currency);
  const totals = dnTotals(draft, ctx.rateOf, docCurrency?.rounding);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <List.Group divider>
        <TotalRow label="Total before discount" value={totals.beforeDiscount} code={draft.currency} />
        <TotalRow
          label="Discount"
          value={totals.discount ? -totals.discount : 0}
          code={draft.currency}
          input={<TextField aria-label="Document discount %" type="number" min={0} className="w-24" suffix="%" value={String(draft.discountPct)} onChange={(e) => update({ discountPct: Math.min(100, Number(e.currentTarget.value)) })} />}
        />
        {SALES_SETTINGS.manageFreightInDocuments ? (
          <TotalRow
            label="Freight"
            value={totals.freight}
            code={draft.currency}
            input={<TextField aria-label="Freight" type="number" min={0} className="w-32" prefix={draft.currency} value={String(draft.freight)} onChange={(e) => update({ freight: Number(e.currentTarget.value) })} />}
          />
        ) : null}
        <TotalRow
          label="Rounding"
          value={totals.rounding}
          code={draft.currency}
          input={<Checkbox aria-label="Apply rounding" checked={draft.rounding} onChange={(e) => update({ rounding: e.currentTarget.checked })}>{docCurrency?.rounding ?? 'No rounding'}</Checkbox>}
        />
        <TotalRow label="Tax" value={totals.tax} code={draft.currency} />
        <TotalRow label="Total" value={totals.total} code={draft.currency} strong />
      </List.Group>
    </fieldset>
  );
}
