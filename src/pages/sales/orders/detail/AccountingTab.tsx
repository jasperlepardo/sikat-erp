import { Button, DatePicker, Icon, Select, Text, TextField, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { INDICATORS, REFERENCE_DOC_TYPES, type PoReference } from '../../../../mocks/purchaseOrders';
import { termDays } from '../../../../services/purchaseOrders';
import { soDueDate } from '../../../../services/salesOrders';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import type { SoTabProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));
const DOC_TYPES = ['Sales quotation', ...REFERENCE_DOC_TYPES.filter((t) => t !== 'Sales order')];

export function AccountingTab({ draft, update, errors, ctx }: SoTabProps) {
  const f = bind(draft, update);
  const computedDue = soDueDate(draft.postingDate, termDays(draft.paymentTermId), draft.dueMonths, draft.dueDays);
  const manual = Boolean(draft.dueMonths || draft.dueDays);
  const refs = draft.references;
  const patchRef = (id: string, p: Partial<PoReference>) => update({ references: refs.map((r) => (r.id === id ? { ...r, ...p } : r)) });

  // Months/days move the due date with them.
  const setRecalc = (patch: Partial<Pick<typeof draft, 'dueMonths' | 'dueDays'>>) => {
    const next = { ...draft, ...patch };
    update({ ...patch, dueDate: soDueDate(draft.postingDate, termDays(draft.paymentTermId), next.dueMonths, next.dueDays) });
  };

  const refColumns: TableColumn<PoReference>[] = [
    { key: 'docType', header: 'Document type', cell: (r) => <Select aria-label="Document type" options={asOptions(DOC_TYPES)} value={r.docType} onValueChange={(docType) => patchRef(r.id, { docType })} /> },
    { key: 'docNo', header: 'Document no.', cell: (r) => <TextField aria-label="Document no." value={r.docNo} onChange={(e) => patchRef(r.id, { docNo: e.currentTarget.value })} /> },
    { key: 'docDate', header: 'Date', cell: (r) => <DatePicker aria-label="Document date" value={r.docDate || null} onValueChange={(docDate) => patchRef(r.id, { docDate: docDate ?? '' })} /> },
    { key: 'remarks', header: 'Remarks', cell: (r) => <TextField aria-label="Reference remarks" value={r.remarks} onChange={(e) => patchRef(r.id, { remarks: e.currentTarget.value })} /> },
  ];

  return (
    <div className="flex flex-col gap-2">
      <Section icon="account_balance" title="Journal & payment">
        <Fields>
          {f.text('journalRemark', 'Journal remark', { hint: 'Defaults to “Sales Orders – customer code”.' })}
          {f.master('project', 'BP project', projectDef, { clearable: true, hint: 'Defaults from the customer.' })}
          {f.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Defaults from the customer; sets the due date.' })}
          {f.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
          {f.date('dueDate', 'Due date', {
            error: errors.dueDate,
            hint: (
              <>
                {manual ? `Posting date + ${draft.dueMonths} months ${draft.dueDays} days` : `Posting date + ${termDays(draft.paymentTermId)} days`} = {computedDue || '—'}.{' '}
                {draft.dueDate !== computedDue ? (
                  <Button type="button" size="small" variant="ghost" onClick={() => update({ dueDate: computedDue })}>
                    Recalculate due date
                  </Button>
                ) : null}
              </>
            ),
          })}
          <div className="grid grid-cols-2 gap-2">
            <TextField aria-label="Recalculate due date: months" type="number" min={0} suffix="months" value={String(draft.dueMonths)} onChange={(e) => setRecalc({ dueMonths: Number(e.currentTarget.value) || 0 })} />
            <TextField aria-label="Recalculate due date: days" type="number" min={0} suffix="days" value={String(draft.dueDays)} onChange={(e) => setRecalc({ dueDays: Number(e.currentTarget.value) || 0 })} />
            <Text variant="small" tone="muted" className="col-span-2">
              Manually recalculate due date: months and days from the posting date instead of the payment terms. 0 and 0 uses the terms.
            </Text>
          </div>
          {f.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days', hint: 'Days added before the early-payment discount window starts.' })}
        </Fields>
      </Section>
      <Section icon="event" title="Dates & references">
        <Fields>
          {f.date('requiredDate', 'Required date', { error: errors.requiredDate, hint: 'When the customer needs it — for planning; separate from the delivery date.' })}
          {f.date('cancellationDate', 'Cancellation date', { error: errors.cancellationDate, hint: 'Set when the order is cancelled, or the date it lapses.' })}
          {f.choose('indicator', 'Indicator', asOptions(INDICATORS))}
          <ReadOnly label="Federal tax ID" value={draft.federalTaxId || <span className="text-muted">Customer has no TIN on file</span>} hint="The customer’s TIN, from the customer record." />
          {f.text('orderNumber', 'Order number', { hint: 'Internal or chain-store order reference.' })}
        </Fields>
      </Section>
      <DataTable
        icon="link"
        title="Referenced documents"
        description="Quotations, contracts or e-mails this order refers to."
        rows={refs}
        getRowId={(r) => r.id}
        columns={refColumns}
        unsortable={['docNo', 'remarks']}
        onRemove={ctx.readOnly ? undefined : (picked) => update({ references: refs.filter((r) => !picked.includes(r)) })}
        actions={
          ctx.readOnly ? null : (
            <Button
              type="button"
              size="small"
              intent="primary"
              variant="solid"
              leadingIcon={<Icon size={16}>add</Icon>}
              onClick={() => update({ references: [...refs, { id: `ref-${crypto.randomUUID().slice(0, 8)}`, docType: 'Sales quotation', docNo: '', docDate: '', remarks: '' }] })}
            >
              Add
            </Button>
          )
        }
        empty={
          <Text variant="small" tone="muted">
            No referenced documents.
          </Text>
        }
      />
    </div>
  );
}
