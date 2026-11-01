import { FieldOrientationCtx, Form, Section, bind } from '../../../components/form/fields';
import { contactName, type Partner } from '../../../mocks/partners';
import { projectDef } from '../../settings/masterDefs';

type Channel = { federalTaxId: string; projectId: string; bpChannelName: string; bpChannelContact: string };

/** Tax reference, business-partner project, and the marketplace/channel a sales document came through, with its contact on the customer. */
export function ReferencesCard({ draft, update, ctx, placeholder = 'e.g. Lazada, Shopee' }: {
  draft: Channel;
  update: (patch: Partial<Channel>) => void;
  ctx: { customer?: Partner; readOnly: boolean };
  placeholder?: string;
}) {
  const h = bind(draft, update);
  const customer = ctx.customer;
  return (
    <Section icon="description" title="References">
      <FieldOrientationCtx.Provider value="inline">
        <Form.Group orientation="inline">
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
        </Form.Group>
      </FieldOrientationCtx.Provider>
    </Section>
  );
}
