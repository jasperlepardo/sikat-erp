import type { ComponentProps } from 'react';
import type { Errors } from '../../../components/form/fields';
import type { DnContext, DnMasters } from '../deliveries/detail/types';
import { CustomerDetailsPanel } from './CustomerDetailsPanel';

type InvoiceDetails = ComponentProps<typeof CustomerDetailsPanel>['draft'];

interface InvoiceCustomerDetailsPanelProps {
  draft: InvoiceDetails;
  update: (patch: Partial<InvoiceDetails>) => void;
  errors: Errors;
  m: DnMasters;
  ctx: DnContext;
  open: boolean;
  onClose: () => void;
  /** "invoice", "reserve invoice". */
  noun: string;
  /** Kept for call-site parity; the journal remark now lives on the inline payment card. */
  remarkDefault?: string;
}

/**
 * The customer side panel for an A/R invoice or reserve invoice. Payment and accounting now live on
 * the inline payment card; this panel carries only the customer identity, addresses and order details.
 */
export function InvoiceCustomerDetailsPanel({ draft, update, ctx, open, onClose, noun }: InvoiceCustomerDetailsPanelProps) {
  if (!open || !ctx.customer) return null;
  return (
    <CustomerDetailsPanel
      customer={ctx.customer}
      draft={draft}
      update={update}
      readOnly={ctx.readOnly}
      noun={noun}
      open={open}
      onClose={onClose}
      orderNumberHint="Set by Copy from."
    />
  );
}
