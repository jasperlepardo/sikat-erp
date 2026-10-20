import { useState } from 'react';
import { Link } from '@jasperlepardo/sikat-design-system';
import { Section, bind } from '../../../../components/form/fields';
import type { OpSectionProps } from './types';

/** Remarks, with the journal remarks folded away (prefilled from the journal pattern). */
export function OpRemarksCard({ draft, update, ctx }: Pick<OpSectionProps, 'draft' | 'update' | 'ctx'>) {
  const [showJournal, setShowJournal] = useState(false);
  const f = bind(draft, update);
  return (
    <Section
      icon="notes"
      title="Remarks"
      actions={
        <Link intent="primary" onClick={() => setShowJournal(!showJournal)}>
          {showJournal ? 'Hide journal remarks' : 'Journal remarks'}
        </Link>
      }
    >
      {f.area('remarks', 'Remarks', { rows: 3, disabled: ctx.readOnly })}
      {showJournal ? f.text('journalRemark', 'Journal remarks', { disabled: ctx.readOnly, hint: 'Shown on the journal entry.' }) : null}
    </Section>
  );
}
