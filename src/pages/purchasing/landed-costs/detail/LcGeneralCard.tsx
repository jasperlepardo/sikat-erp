import { ReadOnly, Section, SideFields, bind } from '../../../../components/form/fields';
import type { LcSectionProps } from './types';

export function LcGeneralCard({ draft, update, readOnly }: LcSectionProps) {
  const h = bind(draft, update);

  return (
    <Section icon="info" title="General">
      <SideFields>
        {h.text('journalRemark', 'Journal remark', { disabled: readOnly })}
        {draft.transactionId ? (
          <ReadOnly label="Transaction no." value={draft.transactionId} />
        ) : null}
      </SideFields>
    </Section>
  );
}
