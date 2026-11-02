import { CardField, Icon, Link, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../components/form/fields';
import type { Partner } from '../../../mocks/partners';
import { PartnerAvatar } from '../../../components/PartnerAvatar';

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

const option = (c: Partner, onOpenDetails?: () => void): CardFieldOption => {
  const detail = [c.code, c.tin ?? ''].filter(Boolean).join(' · ');
  return {
    value: c.id,
    label: c.name,
    icon: <PartnerAvatar partner={c} size={40} />,
    texts: onOpenDetails ? [
      { variant: 'small' as const, children: <Link onClick={(e) => { e.stopPropagation(); onOpenDetails(); }}>{c.name}</Link> },
      ...(detail ? [{ variant: 'caption' as const, children: detail }] : []),
    ] : undefined,
    fields: onOpenDetails ? undefined : [
      { label: 'Code', value: c.code },
      ...(c.tin ? [{ label: 'TIN', value: c.tin }] : []),
    ],
    href: onOpenDetails ? undefined : `#/sales/customers/${c.id}`,
  };
};

/** A sales document's customer: picked as a card whose name links to the details panel (or the customer record). */
export function CustomerCard({ customers, customer, onPickCustomer, onOpenDetails, locked, error, hint, overCredit }: CustomerCardProps) {
  // Keep the picked customer selectable even once it's been deactivated.
  const options = customers.filter((c) => c.status !== 'Inactive' || c.id === customer?.id).map((c) => option(c, onOpenDetails));
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
