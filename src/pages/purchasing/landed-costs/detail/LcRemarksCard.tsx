import { FieldStack, Section, bind } from '../../../../components/form/fields';
import type { LcSectionProps } from './types';

export function LcRemarksCard({ draft, update, readOnly }: LcSectionProps) {
  const h = bind(draft, update);

  return (
    <Section icon="notes" title="Remarks">
      <FieldStack>
        {h.area('remarks', 'Remarks', { rows: 3, disabled: readOnly })}
      </FieldStack>
    </Section>
  );
}
