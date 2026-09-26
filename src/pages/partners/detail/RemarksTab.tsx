import type { TabProps } from './GeneralTab';
import { Section, bind } from './fields';

export function RemarksTab({ draft, update }: TabProps) {
  const f = bind(draft, update);
  return (
    <Section icon="notes" title="Remarks">
      {f.area('remarks', 'Internal notes', { rows: 8, hint: 'Not printed on documents sent to the partner.' })}
    </Section>
  );
}
