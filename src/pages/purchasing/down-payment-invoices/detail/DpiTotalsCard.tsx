import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { salesEmployeeDef } from '../../../settings/masterDefs';
import type { DpiSectionProps } from './types';

export function DpiTotalsCard({ draft, update }: DpiSectionProps) {
  const h = bind(draft, update);
  return (
    <Section icon="assignment_ind" title="Assignment">
      <FieldStack>
        {h.num('dpmPct', 'DPM %', { required: true, suffix: '%', hint: 'Share of the order billed as advance.' })}
        {h.master('ownerId', 'Owner', salesEmployeeDef)}
        {h.area('remarks', 'Remarks', { rows: 2 })}
      </FieldStack>
    </Section>
  );
}
