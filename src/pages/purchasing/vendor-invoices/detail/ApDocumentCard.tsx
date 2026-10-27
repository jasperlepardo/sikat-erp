import { Select } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { StatusField } from '../../../../components/form/StatusField';
import { AP_SERIES, AP_STATUSES, type ApStatus } from '../../../../mocks/apInvoices';
import { formatDate } from '../../../../services/dates';
import { apNumber } from '../../../../services/apInvoices';
import { paymentTermName } from '../../../../services/purchaseOrders';
import { type ApSectionProps } from './types';
import { AP_STATUS_INTENT } from '../../paths';

interface ApDocumentCardProps extends ApSectionProps {
  statusMoves: Partial<Record<ApStatus, () => void>>;
}

export function ApDocumentCard({ draft, update, errors, ctx, statusMoves }: ApDocumentCardProps) {
  const h = bind(draft, update);

  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="tag" title="Document">
        <FieldStack>
          {!ctx.readOnly && (
            <CtxFormField label="No." tooltip="Assigned from the series when the invoice is added.">
              {() => (
                <div className="flex gap-1">
                  <Select aria-label="Series" className="w-40" options={AP_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId })} />
                  <span className="flex-1 self-center text-sm">{draft.docNum ? apNumber(draft) : <span className="text-placeholder">Next number</span>}</span>
                </div>
              )}
            </CtxFormField>
          )}
          {!ctx.readOnly && (
            <StatusField statuses={AP_STATUSES} intents={AP_STATUS_INTENT} value={draft.status} moves={statusMoves} hint="Open once added; Closed when paid in full; Cancelled when reversed." error={errors.status} />
          )}
          {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate, hint: 'Sets the period, tax rates and the exchange rate the bill is booked at.' })}
          {h.date('dueDate', 'Due date', { required: true, error: errors.dueDate, hint: `Posting date + the payment terms${draft.paymentTermId ? ` (${paymentTermName(draft.paymentTermId)})` : ''}. Change it to override.` })}
          {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate, hint: "The date on the vendor's invoice — the date BIR uses for input VAT." })}
          <ReadOnly label="Close date" value={draft.closeDate ? formatDate(draft.closeDate) : '—'} hint="Set when the invoice is paid in full or cancelled." />
        </FieldStack>
      </Section>
    </fieldset>
  );
}
