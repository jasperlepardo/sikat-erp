import { Combobox, FormField } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import type { OpSectionProps } from './types';

/** Payment Details: the vendor and the three dates. Nothing else — the rest moved or was dropped. */
export function OpDetailsCard({ draft, update, errors, m, ctx, onPickVendor }: OpSectionProps & { onPickVendor: (vendorId: string) => void }) {
  const f = bind(draft, update);
  const vendors = m.vendors.filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId);

  return (
    <Section icon="receipt_long" title="Payment Details">
      <Fields cols={2}>
        {ctx.readOnly || ctx.vendorLocked ? (
          <ReadOnly label="Vendor" value={draft.payeeName || '—'} description={draft.vendorCode ? `${draft.vendorCode} · ${draft.currency}` : undefined} />
        ) : (
          <FormField label="Vendor" required error={errors.vendorId}>
            {(p) => (
              <Combobox
                {...p}
                placeholder="Search vendors"
                options={vendors.map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }))}
                value={draft.vendorId || null}
                onValueChange={(id) => onPickVendor(id ?? '')}
              />
            )}
          </FormField>
        )}
        {f.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, disabled: ctx.readOnly })}
        {f.date('documentDate', 'Document date', { error: errors.documentDate, disabled: ctx.readOnly })}
        {f.date('dueDate', 'Due date', { hint: 'Defaults to the posting date.', disabled: ctx.readOnly })}
      </Fields>
    </Section>
  );
}
