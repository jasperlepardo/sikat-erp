import { Select } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, FieldStack, Section, bind } from '../../../components/form/fields';
import { contactName, type Partner } from '../../../mocks/partners';

type Channel = { bpChannelName: string; bpChannelContact: string };

/** The marketplace or channel a sales document came through, and its contact on the customer. */
export function BpChannelCard({ draft, update, ctx, placeholder = 'e.g. Lazada, Shopee' }: {
  draft: Channel;
  update: (patch: Partial<Channel>) => void;
  ctx: { customer?: Partner; readOnly: boolean };
  placeholder?: string;
}) {
  const h = bind(draft, update);
  const customer = ctx.customer;
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="storefront" title="BP channel">
        <FieldStack>
          {h.text('bpChannelName', 'BP channel name', { placeholder, hint: 'The marketplace or channel the order came through.' })}
          <CtxFormField label="BP channel contact" tooltip="A contact person on the customer for the channel.">
            {(p) => (
              <Select clearable placeholder="None"
                {...p}
                disabled={ctx.readOnly || !customer}
                options={(customer?.contacts ?? []).map((c) => ({ value: c.id, label: contactName(c) }))}
                value={draft.bpChannelContact}
                onValueChange={(bpChannelContact) => update({ bpChannelContact })}
              />
            )}
          </CtxFormField>
        </FieldStack>
      </Section>
    </fieldset>
  );
}
