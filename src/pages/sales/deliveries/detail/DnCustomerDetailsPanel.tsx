import { CustomerDetailsPanel } from '../../shared/CustomerDetailsPanel';
import type { DnSectionProps } from './types';

interface DnCustomerDetailsPanelProps extends DnSectionProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The customer side panel for a delivery. Payment and accounting now live on the inline payment card;
 * this panel carries only the customer identity, addresses and order details.
 */
export function DnCustomerDetailsPanel({ draft, update, ctx, open, onClose }: DnCustomerDetailsPanelProps) {
  if (!open || !ctx.customer) return null;
  return (
    <CustomerDetailsPanel
      customer={ctx.customer}
      draft={draft}
      update={update}
      readOnly={ctx.readOnly}
      noun="delivery"
      open={open}
      onClose={onClose}
      orderNumberHint="Set by Copy from sales order."
    />
  );
}
