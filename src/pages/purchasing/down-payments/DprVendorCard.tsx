import { Combobox, FormField, Select } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../components/form/fields';
import { contactName } from '../../../mocks/partners';
import type { DprSectionProps } from './types';

interface DprVendorCardProps extends DprSectionProps {
  pickVendor: (id: string | null) => void;
}

export function DprVendorCard({ draft, update, errors, m, ctx, pickVendor }: DprVendorCardProps) {
  const h = bind(draft, update);
  const { vendor } = ctx;

  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="storefront" title="Vendor">
        <Fields>
          <div className="md:col-span-2">
            {vendor && (ctx.readOnly || ctx.based) ? (
              <ReadOnly label="Vendor" value={draft.vendorName} description={`${draft.vendorCode} · ${draft.currency}`} />
            ) : (
              <FormField label="Vendor" required error={errors.vendorId}>
                {(p) => (
                  <Combobox {...p} placeholder="Search vendors" options={m.vendors.filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId).map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, description: v.currency, text: `${v.code} ${v.name}` }))} value={draft.vendorId || null} onValueChange={pickVendor} />
                )}
              </FormField>
            )}
          </div>
          {h.lookup('contactId', 'Contact person', [{ value: '', label: '— None —' }, ...(vendor?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))], { disabled: !vendor })}
          {h.text('vendorRef', 'Vendor ref. no.', { hint: "The vendor's proforma or billing no." })}
          <FormField label="Currency" required error={errors.currency} className="md:col-span-2">
            {(p) => <Select {...p} disabled={ctx.readOnly || ctx.based} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={draft.currency} onValueChange={(currency) => update({ currency })} />}
          </FormField>
        </Fields>
      </Section>
    </fieldset>
  );
}
