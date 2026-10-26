import { Button, CardField, Icon, Panel, PanelHeader, SidePanel } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind, type Errors } from '../../../../components/form/fields';
import type { Account } from '../../../../mocks/chartOfAccounts';
import { contactName, type Partner } from '../../../../mocks/partners';
import type { IncomingInput } from '../../../../services/incomingPayments';
import { activeOptions } from '../../../../services/inventoryMasters';

interface Props {
  customer: Partner | undefined;
  draft: IncomingInput;
  update: (patch: Partial<IncomingInput>) => void;
  errors: Errors;
  accounts: Account[];
  readOnly: boolean;
  open: boolean;
  onClose: () => void;
}

/** The payer's details on this payment: name, contact, bill-to, and the control account for anything on account. */
export function IncomingCustomerPanel({ customer, draft, update, errors, accounts, readOnly, open, onClose }: Props) {
  if (!open || !customer) return null;
  const h = bind(draft, update);
  return (
    <SidePanel overlay onOverlayClick={onClose}>
      <PanelHeader
        type="details"
        icon="person"
        title={customer.name}
        actions={
          <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={onClose}>
            Done
          </Button>
        }
      />
      <Panel.Body>
        <fieldset disabled={readOnly} className="contents">
          <Section icon="person" title="Contact">
            <Fields cols={1}>
              {h.text('customerName', 'Name', { hint: 'As printed on the receipt.' })}
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
              {h.area('billTo', 'Bill to', { rows: 3 })}
            </Fields>
          </Section>
          <Section icon="account_balance" title="Accounting">
            <Fields cols={1}>
              {h.choose('controlAccount', 'Control account', activeOptions(accounts.filter((a) => a.control && a.drawer === 'Assets'), (a) => a.code, (a) => `${a.code} ${a.name}`, draft.controlAccount), { required: true, error: errors.controlAccount, hint: 'For the part not tied to an invoice (on account).' })}
            </Fields>
          </Section>
        </fieldset>
      </Panel.Body>
    </SidePanel>
  );
}
