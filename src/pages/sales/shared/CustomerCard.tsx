import { CardField, FormLabel, Icon, IconButton, Link, List, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
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
  return (
    <Section icon="person" title="Customer">
      <div>
        {customer ? (
          <div className="sikat-field-group" data-orientation="horizontal">
            <FormLabel required>Customer</FormLabel>
            <List.Group>
              <List.Card
                title={<Link onClick={onOpenDetails}>{customer.name}</Link>}
                icon={option(customer).icon}
                fields={option(customer).fields}
                badge={<Icon size={12}>check</Icon>}
                data-selected
                actions={
                  <div style={{ display: 'flex', gap: 'var(--spacing-1, 4px)' }}>
                    <IconButton type="button" label="Customer details" intent="default" variant="link" size="extra-small" onClick={onOpenDetails}>
                      <Icon size={16}>edit</Icon>
                    </IconButton>
                    {!locked && (
                      <IconButton type="button" label="Clear selection" intent="default" variant="link" size="extra-small" onClick={() => onPickCustomer(null)}>
                        <Icon size={16}>close</Icon>
                      </IconButton>
                    )}
                  </div>
                }
              />
            </List.Group>
          </div>
        ) : (
          <CardField
            label="Customer"
            required
            placeholder="Search customers"
            options={customers.filter((c) => c.status !== 'Inactive').map(option)}
            value=""
            onValueChange={(id) => onPickCustomer(id || null)}
          />
        )}
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
