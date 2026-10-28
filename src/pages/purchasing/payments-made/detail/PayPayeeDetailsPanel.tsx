import { useNavigate } from 'react-router';
import { FormField, Icon, IconButton, Panel, Select, SidePanel } from '@jasperlepardo/sikat-design-system';
import { PageHeader } from '../../../../components/form/PageHeader';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatAddress } from '../../../../mocks/address';
import { ALL_CURRENCIES } from '../../purchase-orders/detail/types';
import { contactName, type Partner } from '../../../../mocks/partners';
import { activeOptions } from '../../../../services/inventoryMasters';
import { openRows, type PayMasters, type PaymentDraft } from './types';

interface PayPayeeDetailsPanelProps {
  draft: PaymentDraft;
  update: (patch: Partial<PaymentDraft>) => void;
  vendor: Partner | undefined;
  m: PayMasters;
  readOnly: boolean;
  open: boolean;
  onClose: () => void;
}

/** The payee side panel on an outgoing payment: pay-to address, contact person and currency. */
export function PayPayeeDetailsPanel({ draft, update, vendor, m, readOnly, open, onClose }: PayPayeeDetailsPanelProps) {
  const navigate = useNavigate();
  const h = bind(draft, update);
  const code = draft.currency;

  if (!open || !vendor) return null;

  const payToOptions = (vendor.addresses ?? []).map((a) => ({ value: formatAddress(a, vendor.name), label: `${a.label || 'Address'} · ${a.city || a.countryCode}` }));

  return (
    <SidePanel overlay onOverlayClick={onClose}>
      <PageHeader
        variant="plain"
        icon="storefront"
        title={vendor.name}
        actions={
          <>
            <IconButton type="button" intent="default" variant="link" label={`Open vendor ${vendor.code}`} onClick={() => navigate(`/purchasing/vendors/${vendor.id}`)}>
              <Icon size={20}>open_in_new</Icon>
            </IconButton>
            <IconButton type="button" intent="default" variant="link" label="Close" onClick={onClose}>
              <Icon size={20}>close</Icon>
            </IconButton>
          </>
        }
      />
      <Panel.Body>
        <fieldset disabled={readOnly} className="contents">
          <Section icon="contacts" title="Payee details">
            <Fields cols={1}>
              {h.lookup('payTo', 'Pay to', payToOptions.length ? payToOptions : [{ value: draft.payTo, label: draft.payTo || '—' }], { hint: "The vendor's address the payment goes to." })}
              {h.lookup(
                'contactId',
                'Contact person',
                (vendor.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) })),
                { clearable: true },
              )}
              {vendor.currency === ALL_CURRENCIES ? (
                <FormField label="Currency" tooltip="This vendor takes all currencies — open invoices in the currency picked are listed.">
                  {(p) => (
                    <Select
                      {...p}
                      options={activeOptions(m.currencies, (c) => c.code, (c) => `${c.code} — ${c.name}`, draft.currency)}
                      value={draft.currency}
                      onValueChange={(currency) => update({ currency, rows: openRows(m, draft.vendorId, currency) })}
                    />
                  )}
                </FormField>
              ) : (
                <ReadOnly label="Currency" value={code} hint="The vendor's currency." />
              )}
            </Fields>
          </Section>
        </fieldset>
      </Panel.Body>
    </SidePanel>
  );
}
