import { Combobox, FormField, Icon, IconButton, Select } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section } from '../../../../components/form/fields';
import type { QtTabProps } from './types';

interface QtCustomerCardProps extends QtTabProps {
  onPickCustomer: (id: string | null) => void;
  onOpenDetails: () => void;
}

export function QtCustomerCard({ draft, update, errors, ctx, m, onPickCustomer, onOpenDetails }: QtCustomerCardProps) {
  const { customer, added, readOnly } = ctx;
  return (
    <Section
      icon="storefront"
      title="Customer"
      actions={
        <IconButton type="button" label="Customer details" size="small" shape="pill" intent="white" variant="ghost" disabled={!customer} onClick={onOpenDetails}>
          <Icon size={16}>tune</Icon>
        </IconButton>
      }
    >
      <Fields>
        <div className="md:col-span-2">
          {customer && added ? (
            <ReadOnly label="Customer" value={draft.customerName} description={`${draft.customerCode} · ${draft.currency}`} />
          ) : (
            <FormField label="Customer" required error={errors.customerId}>
              {(p) => (
                <Combobox
                  {...p}
                  placeholder="Search customers"
                  options={m.customers
                    .filter((c) => c.status !== 'Inactive' || c.id === draft.customerId)
                    .map((c) => ({ value: c.id, label: c.name, subLabel: c.code, subLabelPlacement: 'top' as const, description: c.currency, text: `${c.code} ${c.name}` }))}
                  value={draft.customerId || null}
                  onValueChange={onPickCustomer}
                />
              )}
            </FormField>
          )}
        </div>
        <FormField label="Currency" className="md:col-span-2">
          {(p) => (
            <Select
              {...p}
              disabled={added || readOnly}
              options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
              value={draft.currency}
              onValueChange={(currency) => update({ currency })}
            />
          )}
        </FormField>
      </Fields>
    </Section>
  );
}
