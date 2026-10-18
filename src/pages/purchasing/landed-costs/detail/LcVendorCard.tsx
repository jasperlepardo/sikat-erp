import { Combobox, FormField, Select } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import type { LcSectionProps } from './types';

interface LcVendorCardProps extends LcSectionProps {
  pickVendor: (id: string | null) => void;
}

export function LcVendorCard({ draft, update, errors, m, readOnly, pickVendor }: LcVendorCardProps) {
  const h = bind(draft, update);
  const vendor = m.vendors.find((v) => v.id === draft.vendorId);
  const broker = m.vendors.find((v) => v.id === draft.brokerId);

  return (
    <Section icon="storefront" title="Vendor">
      <Fields>
        <div className="md:col-span-2">
          {vendor && readOnly ? (
            <ReadOnly label="Vendor" value={draft.vendorName} description={draft.vendorCode} />
          ) : (
            <FormField label="Vendor" required error={errors.vendorId}>
              {(p) => (
                <Combobox
                  {...p}
                  placeholder="Search vendors"
                  options={m.vendors
                    .filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId)
                    .map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }))}
                  value={draft.vendorId || null}
                  onValueChange={pickVendor}
                />
              )}
            </FormField>
          )}
        </div>
        <div className="md:col-span-2">
          {broker && readOnly ? (
            <ReadOnly label="Broker" value={draft.brokerName} description={draft.brokerCode} />
          ) : (
            <FormField label="Broker">
              {(p) => (
                <Combobox
                  {...p}
                  placeholder="Search brokers / forwarding agents"
                  options={[{ value: '', label: 'None', text: '' }, ...m.vendors
                    .filter((v) => v.status !== 'Inactive' || v.id === draft.brokerId)
                    .map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }))]}
                  value={draft.brokerId || null}
                  onValueChange={(id) => {
                    const b = m.vendors.find((v) => v.id === id);
                    update({ brokerId: id ?? '', brokerCode: b?.code ?? '', brokerName: b?.name ?? '' });
                  }}
                />
              )}
            </FormField>
          )}
        </div>
        <FormField label="Currency">
          {(p) => (
            <Select
              {...p}
              disabled={readOnly}
              options={[{ value: 'PHP', label: 'PHP — Philippine Peso' }]}
              value={draft.currency}
              onValueChange={(currency) => update({ currency })}
            />
          )}
        </FormField>
        {h.text('reference', 'Reference', { disabled: readOnly })}
        {h.text('fileNo', 'File no.', { disabled: readOnly })}
      </Fields>
    </Section>
  );
}
