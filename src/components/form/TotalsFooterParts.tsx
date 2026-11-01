import type { ReactNode } from 'react';
import { Text } from '@jasperlepardo/sikat-design-system';
import { formatAmount } from '../../services/format';

/**
 * Totals-footer building blocks (Figma "Total Card"): breakdown rows on a subtle
 * secondary surface, above emphasized total bars on a bordered tertiary surface.
 * Shared by SalesTotalsFooter, PurchTotalsFooter, and the per-document `extraRows`
 * so every sales/purchasing document foots out the same way.
 */

/** A currency amount, with the en-dash convention for negatives: "PHP 12.00" / "–PHP 12.00". */
export const amt = (v: number, code: string) => (v < 0 ? `–${code} ${formatAmount(-v)}` : `${code} ${formatAmount(v)}`);

const SURFACE = { backgroundColor: 'var(--color-bg-secondary)' };
const BAR = {
  backgroundColor: 'var(--color-bg-tertiary)',
  borderColor: 'var(--color-border-neutral-subtle)',
};

/** A breakdown row on the subtle surface: label (+ optional inline editor) left, amount right. */
export function TotalsRow({
  label,
  value,
  input,
  tone = 'heading',
}: {
  label: ReactNode;
  value: ReactNode;
  /** Inline control or hint rendered next to the label (discount %, freight field, tooltip…). */
  input?: ReactNode;
  tone?: 'heading' | 'danger';
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-1.5" style={SURFACE}>
      <div className="flex items-center gap-2">
        <Text variant="small" weight="medium" tone="heading">{label}</Text>
        {input}
      </div>
      <Text variant="small" weight="medium" tone={tone} className="tabular-nums">{value}</Text>
    </div>
  );
}

/** An emphasized total bar on its own bordered tertiary surface (Total, Net to receive, Balance due…). */
export function TotalsBar({
  label,
  value,
  tone = 'heading',
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: 'heading' | 'danger';
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-y px-4 py-1.5" style={BAR}>
      <Text variant="body" weight="semibold" tone={tone}>{label}</Text>
      <Text variant="body" weight="semibold" tone={tone} className="tabular-nums">{value}</Text>
    </div>
  );
}

/** A full-width muted note sharing the breakdown's subtle surface. */
export function TotalsNote({ children, align }: { children: ReactNode; align?: 'right' }) {
  return (
    <div className="px-4 py-1" style={SURFACE}>
      <Text variant="small" tone="muted" className={align === 'right' ? 'block text-right' : undefined}>
        {children}
      </Text>
    </div>
  );
}
