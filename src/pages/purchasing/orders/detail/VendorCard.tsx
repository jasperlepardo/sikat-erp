import { CardField, FormField, Icon, Select, Text, type CardFieldOption } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { contactName } from '../../../../mocks/partners';
import { ALL_CURRENCIES, type PoSectionProps } from './types';

interface VendorCardProps extends PoSectionProps {
  pickVendor: (id: string | null) => void;
  onNewVendor: () => void;
}

export function VendorCard({ draft, update, errors, m, ctx, pickVendor, onNewVendor }: VendorCardProps) {
  const h = bind(draft, update);
  const { vendor } = ctx;
  const received = draft.lines.some((l) => l.receivedQty > 0);
  const currencyEditable = !ctx.readOnly && !received;

  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="storefront" title="Vendor">
        <Fields>
          <div className="md:col-span-2">
            <CardField
              label="Vendor"
              required
              placeholder="Search vendors"
              options={m.vendors
                .filter((v) => v.status !== 'Inactive' || v.id === draft.vendorId)
                .map((v): CardFieldOption => ({
                  value: v.id,
                  label: v.name,
                  icon: <Icon size={16}>storefront</Icon>,
                  fields: [
                    { label: 'Code', value: v.code },
                    ...(v.currency && v.currency !== ALL_CURRENCIES ? [{ label: 'Currency', value: v.currency }] : []),
                    ...(v.tin ? [{ label: 'TIN', value: v.tin }] : []),
                  ],
                  href: `/#/purchasing/vendors/${v.id}`,
                }))}
              value={draft.vendorId}
              onValueChange={(id) => pickVendor(id || null)}
              readOnly={!!(vendor && ctx.added)}
              footer={
                <button
                  type="button"
                  className="w-full cursor-pointer rounded-xl px-4 py-2 text-left text-sm font-medium hover:bg-primary-subtle"
                  style={{ color: 'var(--color-text-primary)' }}
                  onClick={onNewVendor}
                >
                  + Create new vendor
                </button>
              }
            />
            {errors.vendorId && <Text variant="small" tone="danger">{errors.vendorId}</Text>}
          </div>
          {h.lookup(
            'contactId',
            'Contact person',
            [{ value: '', label: '— None —' }, ...(vendor?.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) }))],
            { hint: !vendor ? 'Pick a vendor first.' : "Defaults to the vendor's default contact.", disabled: !vendor },
          )}
          {h.text('vendorRef', 'Vendor ref. no.', {
            error: errors.vendorRef,
            hint: "The vendor's own reference, e.g. their sales order no.",
          })}
          <FormField
            label="Currency"
            required
            error={errors.currency}
            tooltip={
              received
                ? 'Locked: goods were already received on this PO.'
                : vendor && vendor.currency !== ALL_CURRENCIES
                ? `Defaults to the vendor's currency. You can override it before receiving goods.`
                : 'Pick the document currency for this order.'
            }
          >
            {(p) => (
              <Select
                {...p}
                disabled={!currencyEditable}
                options={m.currencies
                  .filter((c) => c.active || c.code === draft.currency)
                  .map((c) => ({ value: c.code, label: c.code }))}
                value={draft.currency}
                onValueChange={(currency) => currency && update({ currency, currencyView: 'BP' })}
              />
            )}
          </FormField>
        </Fields>
      </Section>
    </fieldset>
  );
}
