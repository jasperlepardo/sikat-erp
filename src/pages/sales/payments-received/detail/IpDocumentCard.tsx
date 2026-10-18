import { Select, TextField } from '@jasperlepardo/sikat-design-system';
import { CtxFormField, FieldStack, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { INCOMING_SERIES } from '../../../../mocks/incomingPayments';
import { incomingNumber, incomingSeriesOf, type IncomingInput } from '../../../../services/incomingPayments';

interface Props {
  draft: IncomingInput;
  update: (patch: Partial<IncomingInput>) => void;
  errors: Errors;
  readOnly: boolean;
}

export function IncomingDocumentCard({ draft, update, errors, readOnly }: Props) {
  const h = bind(draft, update);
  const series = incomingSeriesOf(draft.seriesId);
  return (
    <fieldset disabled={readOnly} className="contents">
      <Section icon="calendar_today" title="Document">
        <FieldStack>
          {readOnly ? null : (
            <CtxFormField label="Series" hint={series.manual ? undefined : 'Numbered when added.'}>
              {(p) => <Select {...p} options={INCOMING_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId, docNum: 0 })} />}
            </CtxFormField>
          )}
          {series.manual && !readOnly ? (
            <CtxFormField label="Receipt no." required error={errors.docNum}>
              {(p) => <TextField {...p} type="number" placeholder="Receipt no. from the notebook" value={draft.docNum ? String(draft.docNum) : ''} onChange={(e) => update({ docNum: Number(e.currentTarget.value) || 0 })} />}
            </CtxFormField>
          ) : null}
          <ReadOnly label="Transaction no." value={draft.transNo ? String(draft.transNo) : '—'} hint={draft.docNum ? `Journal entry of ${incomingNumber(draft)}.` : "The journal entry's number, once added."} />
          {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate })}
          {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
          {h.date('dueDate', 'Due date', { hint: "The BP row's due date; follows the payment means (weighted average)." })}
        </FieldStack>
      </Section>
    </fieldset>
  );
}
