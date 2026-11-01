import { CustomerDetailsPanel } from '../../../shared/CustomerDetailsPanel';
import type { SrSectionProps } from '../../types';

interface SrCustomerDetailsPanelProps extends SrSectionProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The customer side panel for a sales return. Payment and accounting now live on the inline payment
 * card; this panel carries only the customer identity, addresses and order details.
 */
export function SrCustomerDetailsPanel({ draft, update, ctx, open, onClose }: SrCustomerDetailsPanelProps) {
  if (!open || !ctx.customer) return null;
  return (
    <CustomerDetailsPanel
      customer={ctx.customer}
      draft={draft}
      update={update}
      readOnly={ctx.readOnly}
      noun="return"
      open={open}
      onClose={onClose}
      orderNumberHint="Set by Copy from delivery."
    />
  );
}
