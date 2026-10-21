import { CardField, Icon, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../components/form/fields';
import type { Partner } from '../../../mocks/partners';

interface CustomerCardProps {
  customers: Partner[];
  customerId: string;
  /** The picked customer, when it's found; enables the card's pencil (details panel). */
  customer: Partner | undefined;
  onPickCustomer: (id: string | null) => void;
  onOpenDetails: () => void;
  /** The customer can't change any more (added, or set by the copied document). */
  locked: boolean;
  error?: string;
  hint?: string;
  overCredit?: boolean;
}

const option = (c: Partner): CardFieldOption => ({
  value: c.id,
  label: c.name,
  icon: <Icon size={16}>person</Icon>,
  fields: [
    { label: 'Code', value: c.code },
    ...(c.tin ? [{ label: 'TIN', value: c.tin }] : []),
  ],
});

/** A sales document's customer: picked as a card with code and TIN; the card's pencil opens the details panel. */
export function CustomerCard({ customers, customer, onPickCustomer, onOpenDetails, locked, error, hint, overCredit }: CustomerCardProps) {
  // Keep the picked customer selectable even once it's been deactivated.
  const options = customers.filter((c) => c.status !== 'Inactive' || c.id === customer?.id).map(option);
  return (
    <Section icon="person" title="Customer">
      <div>
        <CardField
          label="Customer"
          required
          placeholder="Search customers"
          options={options}
          value={customer?.id ?? ''}
          onValueChange={(id) => onPickCustomer(id || null)}
          onEdit={customer ? onOpenDetails : undefined}
          editLabel="Customer details"
          readOnly={locked}
          error={error}
          hint={hint}
        />
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
