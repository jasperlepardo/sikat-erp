import { FieldStack, ReadOnly, Section, bind, type Errors } from '../../../components/form/fields';
import { formatDate } from '../../../services/dates';

interface ReturnFields {
  postingDate: string;
  dueDate: string;
  documentDate: string;
  closeDate: string;
}

interface Props {
  draft: ReturnFields;
  update: (patch: Partial<ReturnFields>) => void;
  readOnly: boolean;
  errors: Errors;
  postingHint?: string;
  dueHint?: string;
}

export function ReturnDatesCard({ draft, update, readOnly, errors, postingHint, dueHint }: Props) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={readOnly} className="contents">
      <Section icon="calendar_today" title="Dates">
        <FieldStack>
          {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: postingHint })}
          {h.date('dueDate', 'Due date', { hint: dueHint })}
          {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
          <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
        </FieldStack>
      </Section>
    </fieldset>
  );
}
