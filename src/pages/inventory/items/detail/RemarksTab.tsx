import { Fields, Section, bind } from '../../../../components/form/fields';
import type { TabProps } from './types';

export function RemarksTab({ draft, update }: TabProps) {
  const f = bind(draft, update);
  return (
    <Section icon="notes" title="Remarks">
      <Fields cols={1}>
        {f.area('remarks', 'Remarks', {
          rows: 6,
          hint: 'Storage, handling and supplier notes. Not printed on documents.',
        })}
        {f.area('foreignRemarks', 'Foreign-language remarks', { rows: 4 })}
      </Fields>
    </Section>
  );
}
