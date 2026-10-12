import { CardField, Icon, IconButton, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../components/form/fields';
import type { Partner } from '../../../mocks/partners';

interface CustomerCardProps {
  customers: Partner[];
  customerId: string;
  /** The picked customer, when it's found; enables the details button. */
  customer: Partner | undefined;
  onPickCustomer: (id: string | null) => void;
  onOpenDetails: () => void;
  /** The customer can't change any more (added, or set by the copied document). */
  locked: boolean;
  error?: string;
  hint?: string;
  overCredit?: boolean;
}

/** A sales document's customer: picked as a card with code and TIN, details in the side panel. */
export function CustomerCard({ customers, customerId, customer, onPickCustomer, onOpenDetails, locked, error, hint, overCredit }: CustomerCardProps) {
  return (
    <Section
      icon="person"
      title="Customer"
      actions={
        <IconButton type="button" label="Customer details" size="small" shape="pill" intent="white" variant="ghost" disabled={!customer} onClick={onOpenDetails}>
          <Icon size={16}>tune</Icon>
        </IconButton>
      }
    >
      <div>
        <CardField
          label="Customer"
          required
          placeholder="Search customers"
          options={customers
            .filter((c) => c.status !== 'Inactive' || c.id === customerId)
            .map((c): CardFieldOption => ({
              value: c.id,
              label: c.name,
              icon: <Icon size={16}>person</Icon>,
              fields: [
                { label: 'Code', value: c.code },
                ...(c.tin ? [{ label: 'TIN', value: c.tin }] : []),
              ],
            }))}
          value={customerId}
          onValueChange={(id) => onPickCustomer(id || null)}
          readOnly={!!customer && locked}
        />
        {error ? <Text variant="small" tone="danger">{error}</Text> : null}
        {hint ? <Text variant="small" tone="muted">{hint}</Text> : null}
        {overCredit ? (
          <div className="flex items-center gap-1 mt-1">
            <Icon size={14} style={{ color: 'var(--color-text-danger)' }}>warning</Icon>
            <Text variant="small" tone="danger">Over credit limit</Text>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
