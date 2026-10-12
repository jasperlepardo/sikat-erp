import { Button, Panel, PanelHeader, SidePanel } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { contactName } from '../../../../mocks/partners';
import type { QtTabProps } from './types';

interface QtCustomerDetailsPanelProps extends QtTabProps {
  open: boolean;
  onClose: () => void;
}

export function QtCustomerDetailsPanel({ draft, update, ctx, open, onClose }: QtCustomerDetailsPanelProps) {
  if (!open || !ctx.customer) return null;

  const customer = ctx.customer;
  const h = bind(draft, update);

  return (
    <SidePanel overlay onOverlayClick={onClose}>
      <PanelHeader
        type="details"
        icon="storefront"
        title={customer.name}
        actions={
          <Button type="button" intent="white" variant="solid" size="medium" shape="pill" onClick={onClose}>
            Done
          </Button>
        }
      />
      <Panel.Body>
        <fieldset disabled={ctx.readOnly} className="contents">
          <Section icon="person" title="Contact">
            <Fields cols={1}>
              {h.lookup('contactId', 'Contact person', [
                { value: '', label: '— None —' },
                ...(customer.contacts ?? []).filter((c) => c.active || c.id === draft.contactId).map((c) => ({ value: c.id, label: contactName(c) })),
              ], { disabled: !customer })}
              {h.text('customerRef', 'Customer ref. no.')}
            </Fields>
          </Section>
        </fieldset>
      </Panel.Body>
    </SidePanel>
  );
}
