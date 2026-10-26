import { FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { formatDate } from '../../../../services/dates';
import type { DpiStatus } from '../../../../mocks/apDownPaymentInvoices';
import { StatusField } from '../../../../components/form/StatusField';
import { DPI_STATUS_INTENT } from '../../paths';
import type { DpiSectionProps } from './types';

const DPI_STATUSES: DpiStatus[] = ['Draft', 'Not Confirmed', 'Open', 'Closed', 'Cancelled'];

interface DpiDocumentCardProps extends DpiSectionProps {
  statusMoves: Partial<Record<DpiStatus, () => void>>;
}

export function DpiDocumentCard({ draft, update, errors, statusMoves }: DpiDocumentCardProps) {
  const h = bind(draft, update);
  return (
    <Section icon="tag" title="Document">
      <FieldStack>
        <StatusField statuses={DPI_STATUSES} intents={DPI_STATUS_INTENT} value={draft.status} moves={statusMoves} />
        {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate })}
        {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
        {h.date('dueDate', 'Due date', { required: true, error: errors.dueDate })}
        <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} />
      </FieldStack>
    </Section>
  );
}
