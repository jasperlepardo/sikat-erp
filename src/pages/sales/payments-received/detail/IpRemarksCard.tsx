import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { type IncomingInput } from '../../../../services/incomingPayments';

interface Props {
  draft: IncomingInput;
  update: (patch: Partial<IncomingInput>) => void;
  readOnly: boolean;
}

export function IncomingRemarksCard({ draft, update, readOnly }: Props) {
  const h = bind(draft, update);
  return (
    <Section icon="notes" title="Remarks">
      <FieldStack>
        {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the payment is added.' })}
        <fieldset disabled={readOnly} className="contents">
          {h.text('journalRemark', 'Journal remarks', { hint: draft.type === 'Customer' ? 'Default: Incoming - customer code.' : 'Default: Incoming — the (last) account code.' })}
        </fieldset>
      </FieldStack>
    </Section>
  );
}
