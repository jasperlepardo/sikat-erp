import { FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatDate } from '../../../../services/dates';
import type { GrrStatus } from '../../../../mocks/goodsReturnRequests';
import { StatusField } from '../../../../components/form/StatusField';
import { GRR_STATUS_INTENT } from '../../paths';
import type { GrrSectionProps } from './types';

interface GrrDocumentCardProps extends GrrSectionProps {
  transitions: Partial<Record<GrrStatus, () => void>>;
}

const GRR_STATUSES = ['Open', 'Closed'] as const;

export function GrrDocumentCard({ draft, update, errors, transitions }: GrrDocumentCardProps) {
  const h = bind(draft, update);
  return (
    <Section icon="tag" title="Document">
      <FieldStack>
        <StatusField statuses={GRR_STATUSES} intents={GRR_STATUS_INTENT} value={draft.status} moves={transitions} />
        {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'Defaults to today.' })}
        {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
        {h.date('requiredDate', 'Required date', { hint: 'When the goods should be ready to send back.' })}
        <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
      </FieldStack>
    </Section>
  );
}
