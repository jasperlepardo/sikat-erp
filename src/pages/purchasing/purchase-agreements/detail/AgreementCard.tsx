import { FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatDate } from '../../../../services/dates';
import { pbaNumber } from '../../../../services/purchaseBlanketAgreements';
import { type PurchaseBlanketAgreement } from '../../../../mocks/purchaseBlanketAgreements';
import { projectDef } from '../../../settings/masterDefs';
import type { PbaDraft, PbaMasters } from './types';

interface Props {
  draft: PbaDraft;
  update: (patch: Partial<PbaDraft>) => void;
  m: PbaMasters;
  added: boolean;
}

export function AgreementCard({ draft, update, m, added }: Props) {
  const f = bind(draft, update);
  return (
    <Section icon="event_note" title="Agreement">
      <FieldStack>
        {f.lookup(
          'seriesId',
          'No. (series)',
          m.pbaSeries
            .filter((s) => s.active || s.id === draft.seriesId)
            .map((s) => ({ value: s.id, label: s.name })),
          { required: true, readOnly: added },
        )}
        <ReadOnly label="Document no." value={draft.docNum ? pbaNumber(draft as PurchaseBlanketAgreement) : 'Assigned on Add'} />
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
        {f.date('signingDate', 'Signing date', { required: true })}
        {f.text('description', 'Description', { hint: 'Free-text description of the agreement.' })}
      </FieldStack>
    </Section>
  );
}
