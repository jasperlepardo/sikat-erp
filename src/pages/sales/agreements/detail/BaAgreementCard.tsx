import { FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatDate } from '../../../../services/dates';
import { baNumber } from '../../../../services/blanketAgreements';
import { type BlanketAgreement } from '../../../../mocks/blanketAgreements';
import { projectDef } from '../../../settings/masterDefs';
import type { BaDraft, BaMasters } from './types';

interface Props {
  draft: BaDraft;
  update: (patch: Partial<BaDraft>) => void;
  m: BaMasters;
  added: boolean;
}

export function BaAgreementCard({ draft, update, m, added }: Props) {
  const f = bind(draft, update);
  return (
    <Section icon="event_note" title="Agreement">
      <FieldStack>
        {f.lookup(
          'seriesId',
          'No. (series)',
          m.baSeries
            .filter((s) => s.active || s.id === draft.seriesId)
            .map((s) => ({ value: s.id, label: s.name })),
          { required: true, readOnly: added },
        )}
        <ReadOnly label="Document no." value={draft.docNum ? baNumber(draft as BlanketAgreement) : 'Assigned on Add'} />
        {f.choose(
          'agreementMethod',
          'Agreement method',
          [
            { value: 'Items', label: 'Items method' },
            { value: 'Money', label: 'Money method' },
          ],
          { required: true, readOnly: added, hint: 'Items method tracks quantities per line; Money method tracks a total value.' },
        )}
        {f.date('startDate', 'Start date', { required: true })}
        {f.date('endDate', 'End date')}
        {f.master('projectId', 'Business partner project', projectDef, { clearable: true })}
        <ReadOnly
          label="Termination date"
          value={draft.terminationDate ? formatDate(draft.terminationDate) : '—'}
          hint="Set automatically when the agreement is terminated."
        />
        {f.date('signingDate', 'Signing date')}
        {f.text('description', 'Description', { hint: 'Free-text description of the agreement.' })}
      </FieldStack>
    </Section>
  );
}
