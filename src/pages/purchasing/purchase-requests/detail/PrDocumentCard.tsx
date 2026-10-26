import { FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatDate } from '../../../../services/dates';
import { type PrStatus } from '../../../../mocks/purchaseRequests';
import type { PrSectionProps } from './types';


interface PrDocumentCardProps extends PrSectionProps {
  transitions: Partial<Record<PrStatus, () => void>>;
}

export function PrDocumentCard({ draft, update, errors }: PrDocumentCardProps) {
  const h = bind(draft, update);

  return (
    <Section icon="tag" title="Document">
      <FieldStack>
        {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'Defaults to today.' })}
        {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate, hint: 'The date for records. Defaults to today.' })}
        {h.date('requiredDate', 'Required date', { hint: 'When the items or services are needed. Cascades to new lines.' })}
        {h.date('validUntil', 'Valid until', { hint: 'Date the request lapses if unfulfilled.' })}
        <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} hint="Set when the request is closed." />
      </FieldStack>
    </Section>
  );
}
