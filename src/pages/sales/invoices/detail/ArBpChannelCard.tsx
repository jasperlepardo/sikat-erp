import { Select } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, FieldStack, Section, bind } from '../../../../components/form/fields';
import { contactName } from '../../../../mocks/partners';
import type { ArSectionProps } from './types';

export function ArBpChannelCard({ draft, update, ctx }: ArSectionProps) {
  const h = bind(draft, update);
  const customer = ctx.customer;
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="storefront" title="BP channel">
        <FieldStack>
          {h.text('bpChannelName', 'BP channel name', { placeholder: 'e.g. Lazada, Shopee', hint: 'The marketplace or channel the order came through.' })}
          <CtxFormField label="BP channel contact" tooltip="A contact person on the customer for the channel.">
            {(p) => (
              <Select
                {...p}
                disabled={ctx.readOnly || !customer}
                options={[{ value: '', label: '— None —' }, ...(customer?.contacts ?? []).map((c) => ({ value: c.id, label: contactName(c) }))]}
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
