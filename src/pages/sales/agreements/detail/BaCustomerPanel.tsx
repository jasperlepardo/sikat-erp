import { useNavigate } from 'react-router';
import { CardField, Icon, IconButton, Panel, PanelHeader, SidePanel } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { contactName, type Partner } from '../../../../mocks/partners';
import type { BaDraft } from './types';

interface Props {
  customer: Partner;
  draft: BaDraft;
  update: (patch: Partial<BaDraft>) => void;
  readOnly: boolean;
  open: boolean;
  onClose: () => void;
}

export function BaCustomerPanel({ customer, draft, update, readOnly, open, onClose }: Props) {
  const navigate = useNavigate();
  if (!open) return null;

  const h = bind(draft, update);

  return (
    <SidePanel overlay onOverlayClick={onClose}>
      <PanelHeader
        type="details"
        icon="person"
        iconIntent="default"
        iconShape="rounded"
        iconSize={32}
        iconVariant="outline"
        title={customer.name}
        actions={
          <>
            <IconButton type="button" intent="default" variant="link" label={`Open customer ${customer.code}`} onClick={() => navigate(`/sales/customers/${customer.id}`)}>
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
          <Section icon="person" title="Contact">
            <Fields cols={1}>
              <CardField
                label="Contact person"
                options={(customer.contacts ?? [])
                  .filter((c) => c.active || c.id === draft.contactId)
                  .map((c) => ({
                    value: c.id,
                    label: contactName(c),
                    icon: <Icon size={16}>person</Icon>,
                    fields: [
                      ...(c.position ? [{ label: 'Position', value: c.position }] : []),
                      ...(c.mobile || c.tel1 ? [{ label: 'Phone', value: c.mobile || c.tel1 }] : []),
                      ...(c.email ? [{ label: 'Email', value: c.email }] : []),
                    ],
                  }))}
                value={draft.contactId}
                onValueChange={(contactId) => update({ contactId: contactId ?? '' })}
                placeholder="Select a contact person"
                readOnly={readOnly}
              />
              {h.text('customerRef', 'Customer ref. no.', { hint: "The customer's own reference for this agreement." })}
            </Fields>
          </Section>
          <Section icon="info" title="Details">
            <Fields cols={1}>
              <ReadOnly label="BP currency" value={draft.currency} hint="Set by the customer." />
              <ReadOnly label="Telephone no." value={draft.phone || '—'} hint="From the customer record." />
              <ReadOnly label="E-mail" value={draft.email || '—'} hint="From the customer record." />
            </Fields>
          </Section>
        </fieldset>
      </Panel.Body>
    </SidePanel>
  );
}
