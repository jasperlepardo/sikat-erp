import { CardField, FormField, Select } from '@jasperlepardo/sikat-design-system';
import { vendorOptions, stampedVendorOption } from '../../shared/vendorOptions';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { contactName } from '../../../../mocks/partners';
import type { GrSectionProps } from './types';

interface GrVendorCardProps extends GrSectionProps {
  pickVendor: (id: string | null) => void;
  locked: boolean;
}

export function GrVendorCard({ draft, update, errors, m, ctx, pickVendor, locked }: GrVendorCardProps) {
  const h = bind(draft, update);
  const { vendor } = ctx;
  const code = draft.currency;

  // Posted, or based on another document: the vendor is fixed.
  const vendorLocked = !!vendor && (locked || ctx.based);
  return (
    <Section icon="storefront" title="Vendor">
      <Fields>
        <div className="md:col-span-2">
          <CardField
            label="Vendor"
            required
            placeholder="Search vendors"
            tooltip="The vendor the goods go back to."
            options={vendorLocked ? [stampedVendorOption(draft, vendor, code)] : vendorOptions(m.vendors, draft.vendorId)}
            value={draft.vendorId}
            onValueChange={(id) => pickVendor(id || null)}
            readOnly={vendorLocked}
            error={errors.vendorId}
          />
        </div>
        {h.lookup('contactId', 'Contact person', [{ value: '', label: '— None —' }, ...(vendor?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))], { disabled: !vendor })}
        {h.text('vendorRef', 'Vendor ref. no.', { hint: "The vendor's return authorization (RMA) no." })}
        <FormField label="Currency" required error={errors.currency} className="md:col-span-2" tooltip={ctx.based ? 'Locked to the currency of the documents the lines came from.' : `Defaults to the vendor's currency.`}>
          {(p) => <Select {...p} disabled={locked || ctx.based} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={code} onValueChange={(currency) => update({ currency })} />}
        </FormField>
      </Fields>
    </Section>
  );
}
