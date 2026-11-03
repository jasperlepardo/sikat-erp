import { FieldOrientationCtx, Form, Section, bind } from '../../../components/form/fields';
import { contactName, type Partner } from '../../../mocks/partners';
import { INDICATORS } from '../../../mocks/purchaseOrders';
import { projectDef } from '../../settings/masterDefs';

type Channel = { federalTaxId: string; projectId: string; bpChannelName: string; bpChannelContact: string; indicator: string; orderNumber: string };

/** Tax reference, business-partner project, the marketplace/channel a sales document came through (with its contact on the customer), and the order indicator and number. */
export function ReferencesCard({ draft, update, ctx, placeholder = 'e.g. Lazada, Shopee', orderNumberHint = 'Internal or chain-store order reference.', orderReadOnly }: {
  draft: Channel;
  update: (patch: Partial<Channel>) => void;
  ctx: { customer?: Partner; readOnly: boolean };
  placeholder?: string;
  orderNumberHint?: string;
  /** Lock just Indicator and Order number (e.g. a quotation locks these once added, but not its tax/channel refs). Defaults to the card's read-only. */
  orderReadOnly?: boolean;
}) {
  const h = bind(draft, update);
  const customer = ctx.customer;
  const orderLocked = orderReadOnly ?? ctx.readOnly;
  return (
    <Section icon="description" title="References">
      <FieldOrientationCtx.Provider value="stacked">
        <Form.Group orientation="stacked">
          {h.text('federalTaxId', 'Federal tax ID', { hint: "Defaults to the customer's TIN.", readOnly: ctx.readOnly })}
          {h.master('projectId', 'BP project', projectDef, { clearable: true, hint: 'Defaults from the customer.', readOnly: ctx.readOnly })}
          {h.text('bpChannelName', 'BP channel name', { placeholder, hint: 'The marketplace or channel the order came through.', readOnly: ctx.readOnly })}
          {h.choose(
            'bpChannelContact',
            'BP channel contact',
            (customer?.contacts ?? []).map((c) => ({ value: c.id, label: contactName(c) })),
            {
              clearable: true,
              placeholder: 'None',
              // Stage lock reads flat; the only precondition is that a customer is picked.
              readOnly: ctx.readOnly,
              disabled: !customer,
              hint: 'A contact person on the customer for the channel.',
            },
          )}
          {h.choose('indicator', 'Indicator', INDICATORS.map((v) => ({ value: v, label: v })), { clearable: true, readOnly: orderLocked })}
          {h.text('orderNumber', 'Order number', { hint: orderNumberHint, readOnly: orderLocked })}
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
