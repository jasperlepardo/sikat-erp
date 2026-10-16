import { Combobox, FormField, Select } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { contactName } from '../../../../mocks/partners';
import type { ApSectionProps } from './types';

interface ApVendorCardProps extends ApSectionProps {
  pickVendor: (id: string | null) => void;
}

const ALL_CURRENCIES = 'All currencies';

export function ApVendorCard({ draft, update, errors, m, ctx, pickVendor }: ApVendorCardProps) {
  const h = bind(draft, update);
  const { vendor } = ctx;
  const allCurrencies = vendor?.currency === ALL_CURRENCIES;

  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="storefront" title="Vendor">
        <Fields>
          <div className="md:col-span-2">
            {vendor && (ctx.readOnly || ctx.based) ? (
              <ReadOnly label="Vendor" value={draft.vendorName} description={`${draft.vendorCode} · ${draft.currency}`} hint={!ctx.readOnly ? 'Locked while lines copied from its documents are on the invoice.' : undefined} />
            ) : (
              <FormField label="Vendor" required error={errors.vendorId} tooltip="Only vendors are listed. Picking one fills the name, contact, currency, terms and control account.">
                {(p) => (
                  <Combobox
                    {...p}
                    placeholder="Search vendors"
                    options={m.vendors
                      .filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId)
                      .map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, description: v.currency, text: `${v.code} ${v.name}` }))}
                    value={draft.vendorId || null}
                    onValueChange={pickVendor}
                  />
                )}
              </FormField>
            )}
          </div>
          {h.lookup(
            'contactId',
            'Contact person',
            [{ value: '', label: '— None —' }, ...(vendor?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))],
            { hint: !vendor ? 'Pick a vendor first.' : "Defaults to the vendor's default contact.", disabled: !vendor },
          )}
          {h.text('vendorRef', 'Vendor ref. no.', { error: errors.vendorRef, hint: "The vendor's invoice no. — checked against their other bills so it isn't entered twice." })}
          <FormField
            label="Currency"
            required
            error={errors.currency}
            className="md:col-span-2"
            tooltip={ctx.based ? 'Locked to the currency of the documents the lines came from.' : allCurrencies ? 'This vendor takes all currencies — pick the document currency.' : `Defaults to the vendor's currency (${vendor?.currency ?? '—'}).`}
          >
            {(p) => (
              <Select {...p} disabled={ctx.readOnly || ctx.based} options={m.currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} value={draft.currency} onValueChange={(currency) => update({ currency })} />
            )}
          </FormField>
        </Fields>
      </Section>
    </fieldset>
  );
}
