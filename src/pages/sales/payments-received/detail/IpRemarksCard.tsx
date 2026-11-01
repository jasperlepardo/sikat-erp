import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { type IncomingInput } from '../../../../services/incomingPayments';

interface Props {
  draft: IncomingInput;
  update: (patch: Partial<IncomingInput>) => void;
}

export function IncomingRemarksCard({ draft, update }: Props) {
  const h = bind(draft, update);
  return (
    <Section icon="notes" title="Remarks">
      <FieldStack>
        {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the payment is added.' })}
      </FieldStack>
    </Section>
  );
}
