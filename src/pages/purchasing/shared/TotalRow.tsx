import type { ReactNode } from 'react';
import { List, Text } from '@jasperlepardo/sikat-design-system';
import { formatAmount } from '../../../services/format';

export function TotalRow({ label, value, code, input, strong }: { label: string; value: number; code: string; input?: ReactNode; strong?: boolean }) {
  const emphasis = (node: ReactNode) => (strong ? <Text as="span" weight="semibold" tone="heading">{node}</Text> : node);
  return (
    <List.Item
      title={
        <span className="flex items-center gap-2">
          <span className="whitespace-nowrap">{emphasis(label)}</span>
          {input ? <span className="min-w-24 flex-none">{input}</span> : null}
        </span>
      }
      content={<span className="whitespace-nowrap tabular-nums">{emphasis(`${code} ${formatAmount(value)}`)}</span>}
    />
  );
}

export function TotalNote({ children }: { children: ReactNode }) {
  return (
    <List.Item
      variant="value-only"
      content={
        <Text variant="small" tone="muted">
          {children}
        </Text>
      }
    />
  );
}
