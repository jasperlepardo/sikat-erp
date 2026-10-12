import { Combobox, FormField, Icon, IconButton, Select } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section } from '../../../../components/form/fields';
import type { DnSectionProps } from './types';

interface DnCustomerCardProps extends DnSectionProps {
  onPickCustomer: (id: string | null) => void;
  onOpenDetails: () => void;
}

export function DnCustomerCard({ draft, update, errors, ctx, m, onPickCustomer, onOpenDetails }: DnCustomerCardProps) {
  const ro = ctx.readOnly;
  return (
    <Section
      icon="person"
      title="Customer"
      actions={
        <IconButton type="button" label="Customer details" size="small" shape="pill" intent="white" variant="ghost" disabled={!ctx.customer} onClick={onOpenDetails}>
          <Icon size={16}>tune</Icon>
        </IconButton>
      }
    >
      <Fields>
        <div className="md:col-span-2">
          {ctx.based || ro ? (
            <ReadOnly
              label="Customer"
              value={draft.customerName || '—'}
              description={`${draft.customerCode} · ${draft.currency}`}
              hint={ctx.based && !ro ? 'Set by the sales order the lines come from.' : undefined}
            />
          ) : (
            <FormField label="Customer" required error={errors.customerId}>
              {(p) => (
                <Combobox
                  {...p}
                  placeholder="Search customers"
                  options={m.customers
                    .filter((c) => c.status !== 'Inactive' || c.id === draft.customerId)
                    .map((c) => ({ value: c.id, label: c.name, subLabel: c.code, subLabelPlacement: 'top' as const, text: `${c.code} ${c.name}` }))}
                  value={draft.customerId || null}
                  onValueChange={onPickCustomer}
                />
              )}
            </FormField>
          )}
        </div>
        <FormField label="Currency" error={errors.currency} className="md:col-span-2">
          {(p) => (
            <Select
              {...p}
              disabled={ro || ctx.based}
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
