import { Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import { formatAmount } from '../../../../services/format';

interface Totals {
  plannedTotal: number;
  committedTotal: number;
  cumulativeTotal: number;
  openTotal: number;
}

interface Props {
  currency: string;
  totals: Totals;
  settlementProbability: number;
}

export function SummaryCard({ currency, totals, settlementProbability }: Props) {
  return (
    <Section icon="functions" title="Summary">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <Text variant="small" tone="muted">Planned total</Text>
          <Text weight="semibold" tone="heading">{currency} {formatAmount(totals.plannedTotal)}</Text>
        </div>
        <div>
          <Text variant="small" tone="muted">Ordered</Text>
          <Text weight="semibold">{currency} {formatAmount(totals.committedTotal)}</Text>
        </div>
        <div>
          <Text variant="small" tone="muted">Received</Text>
          <Text weight="semibold">{currency} {formatAmount(totals.cumulativeTotal)}</Text>
        </div>
        <div>
          <Text variant="small" tone="muted">Open</Text>
          <Text weight="semibold" tone={totals.openTotal === 0 ? 'muted' : 'default'}>
            {currency} {formatAmount(totals.openTotal)}
          </Text>
        </div>
      </div>
      {settlementProbability > 0 && (
        <Text variant="small" tone="muted" className="mt-2">
          Settlement probability: {settlementProbability}%
        </Text>
      )}
    </Section>
  );
}
