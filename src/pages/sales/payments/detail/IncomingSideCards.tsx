import { FormField, Radio, Select, Text, TextField } from '@jasperlepardo/sikat-design-system';
import { Fields, ReadOnly, Section, bind, type Errors } from '../../../../components/form/fields';
import { INCOMING_SERIES, type IncomingType } from '../../../../mocks/incomingPayments';
import { BLANKET_AGREEMENTS } from '../../../../mocks/purchaseOrders';
import { incomingNumber, incomingSeriesOf, type IncomingInput } from '../../../../services/incomingPayments';
import { projectDef } from '../../../settings/masterDefs';

interface CardProps {
  draft: IncomingInput;
  update: (patch: Partial<IncomingInput>) => void;
  errors: Errors;
  readOnly: boolean;
}

/** Series (and the receipt no. on the Manual series), transaction no. and dates. */
export function IncomingDocumentCard({ draft, update, errors, readOnly }: CardProps) {
  const h = bind(draft, update);
  const series = incomingSeriesOf(draft.seriesId);
  return (
    <fieldset disabled={readOnly} className="contents">
      <Section icon="calendar_today" title="Document">
        <div className="flex flex-col gap-2">
          {readOnly ? null : (
            <FormField label="Series" hint={series.manual ? undefined : 'Numbered when added.'}>
              {(p) => <Select {...p} options={INCOMING_SERIES.map((s) => ({ value: s.id, label: s.name }))} value={draft.seriesId} onValueChange={(seriesId) => update({ seriesId, docNum: 0 })} />}
            </FormField>
          )}
          {series.manual && !readOnly ? (
            <FormField label="Receipt no." required error={errors.docNum}>
              {(p) => <TextField {...p} type="number" placeholder="Receipt no. from the notebook" value={draft.docNum ? String(draft.docNum) : ''} onChange={(e) => update({ docNum: Number(e.currentTarget.value) || 0 })} />}
            </FormField>
          ) : null}
          <ReadOnly label="Transaction no." value={draft.transNo ? String(draft.transNo) : '—'} hint={draft.docNum ? `Journal entry of ${incomingNumber(draft)}.` : 'The journal entry’s number, once added.'} />
          {h.date('postingDate', 'Posting date', { required: true, error: errors.postingDate })}
          {h.date('documentDate', 'Document date', { required: true, error: errors.documentDate })}
          {h.date('dueDate', 'Due date', { hint: 'The BP row’s due date; follows the payment means (weighted average).' })}
        </div>
      </Section>
    </fieldset>
  );
}

/** Customer or account payment, and the references it carries. */
export function IncomingSettingsCard({ draft, update, readOnly, onType }: Omit<CardProps, 'errors'> & { onType: (type: IncomingType) => void }) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={readOnly} className="contents">
      <Section icon="settings" title="Settings">
        <div className="flex flex-col gap-1" role="radiogroup" aria-label="Payment type">
          <Text variant="small" tone="muted">Received from</Text>
          {(['Customer', 'Account'] as IncomingType[]).map((t) => (
            <Radio key={t} name="incoming-type" checked={draft.type === t} disabled={readOnly} onChange={() => onType(t)}>
              {t === 'Customer' ? 'A customer' : 'An account (no business partner)'}
            </Radio>
          ))}
          <Text variant="small" tone="muted">Vendor refunds (against A/P credit memos) aren&apos;t built yet.</Text>
        </div>
        <Fields cols={1}>
          {h.master('projectId', 'Project', projectDef, { clearable: true })}
          {h.choose('blanketAgreement', 'Blanket agreement', [{ value: '', label: '— None —' }, ...BLANKET_AGREEMENTS.map((b) => ({ value: b.no, label: `${b.no} · ${b.description}` }))])}
          {h.text('reference', 'Reference', { hint: draft.type === 'Customer' ? "The customer's reference for this payment." : undefined })}
          <ReadOnly label="Created by Payment Wizard" value="No" />
        </Fields>
      </Section>
    </fieldset>
  );
}

/** Remarks stay editable after the payment is added; the journal remark doesn't. */
export function IncomingRemarksCard({ draft, update, readOnly }: Omit<CardProps, 'errors'>) {
  const h = bind(draft, update);
  return (
    <Section icon="notes" title="Remarks">
      <Fields cols={1}>
        {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the payment is added.' })}
        <fieldset disabled={readOnly} className="contents">
          {h.text('journalRemark', 'Journal remarks', { hint: draft.type === 'Customer' ? 'Default: Incoming - customer code.' : 'Default: Incoming – the (last) account code.' })}
        </fieldset>
      </Fields>
    </Section>
  );
}
