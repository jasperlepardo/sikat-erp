import { DatesCard } from '../../../components/form/DatesCard';
import { DOC_DATE, dateRow } from '../../../components/form/documentDates';
import { type Errors } from '../../../components/form/fields';

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
  return (
    <DatesCard
      draft={draft}
      update={update}
      closeDate={draft.closeDate}
      dates={[
        dateRow(DOC_DATE.effective, { error: errors.postingDate, readOnly, hint: postingHint }),
        dateRow(DOC_DATE.due, { readOnly, hint: dueHint, optional: true }),
        dateRow(DOC_DATE.document, { error: errors.documentDate, readOnly }),
      ]}
    />
  );
}
