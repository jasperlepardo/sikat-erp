import { useNavigate } from 'react-router';
import { Tabs } from '@jasperlepardo/sikat-design-system';

/** Purchasing › Bills holds two lists: A/P invoices and the down payment requests paid ahead of them. */
export function BillsTabs({ value, counts }: { value: 'invoices' | 'requests'; counts?: { invoices: number; requests: number } }) {
  const navigate = useNavigate();
  return (
    <Tabs
      variant="outline"
      value={value}
      onValueChange={(v) => navigate(v === 'invoices' ? '/purchasing/bills' : '/purchasing/bills/down-payment-requests')}
      items={[
        { value: 'invoices', label: 'A/P invoices', badge: counts ? String(counts.invoices) : undefined },
        { value: 'requests', label: 'Down payment requests', badge: counts ? String(counts.requests) : undefined },
      ]}
    />
  );
}
