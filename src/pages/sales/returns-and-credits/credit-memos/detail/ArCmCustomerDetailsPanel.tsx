import { CustomerDetailsPanel } from '../../../shared/CustomerDetailsPanel';
import type { ArCmSectionProps } from '../../types';

interface ArCmCustomerDetailsPanelProps extends ArCmSectionProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The customer side panel for an A/R credit memo. Payment and accounting now live on the inline
 * payment card; this panel carries only the customer identity, addresses and order details.
 */
export function ArCmCustomerDetailsPanel({ draft, update, ctx, open, onClose }: ArCmCustomerDetailsPanelProps) {
  if (!open || !ctx.customer) return null;
  return (
    <CustomerDetailsPanel
      customer={ctx.customer}
      draft={draft}
      update={update}
      readOnly={ctx.readOnly}
      noun="credit memo"
      open={open}
      onClose={onClose}
      orderNumberHint="Set by Copy from."
    />
  );
}
