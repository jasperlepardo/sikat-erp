import { CardField, Icon, IconButton, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../../components/form/fields';
import type { SoTabProps } from './types';

interface CustomerCardProps extends SoTabProps {
  overCredit: boolean;
  onPickCustomer: (id: string | null) => void;
  onOpenDetails: () => void;
}

export function CustomerCard({ draft, ctx, m, errors, overCredit, onPickCustomer, onOpenDetails }: CustomerCardProps) {
  const customer = ctx.customer;
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
          options={m.customers
            .filter((c) => c.status !== 'Inactive' || c.id === draft.customerId)
            .map((c): CardFieldOption => ({
              value: c.id,
              label: c.name,
              icon: <Icon size={16}>person</Icon>,
              fields: [
                { label: 'Code', value: c.code },
                ...(c.tin ? [{ label: 'TIN', value: c.tin }] : []),
              ],
            }))}
          value={draft.customerId}
          onValueChange={(id) => onPickCustomer(id || null)}
          readOnly={!!(customer && ctx.added)}
        />
        {errors.customerId && <Text variant="small" tone="danger">{errors.customerId}</Text>}
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
