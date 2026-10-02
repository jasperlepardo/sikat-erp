import { Button, Icon, Select, Text, TextField, DatePicker, type TableColumn } from '@jasperlepardo/sikat-design-system';
import { DataTable } from '../../../../components/form/DataTable';
import { Fields, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import { INDICATORS, REFERENCE_DOC_TYPES, type PoReference } from '../../../../mocks/purchaseOrders';
import { dueDateFor, termDays } from '../../../../services/purchaseOrders';
import type { PoTabProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export function AccountingTab({ draft, update, errors, m, ctx }: PoTabProps) {
  const f = bind(draft, update);
  const computedDue = dueDateFor(draft.postingDate, draft.paymentTerms);
  const refs = draft.references;
  const patchRef = (id: string, p: Partial<PoReference>) => update({ references: refs.map((r) => (r.id === id ? { ...r, ...p } : r)) });

  const refColumns: TableColumn<PoReference>[] = [
    {
      key: 'docType',
      header: 'Document type',
      cell: (r) => (
        <Select aria-label="Document type" options={asOptions(REFERENCE_DOC_TYPES)} value={r.docType} onValueChange={(docType) => patchRef(r.id, { docType })} />
      ),
    },
    {
      key: 'docNo',
      header: 'Document no.',
      cell: (r) => <TextField aria-label="Document no." value={r.docNo} onChange={(e) => patchRef(r.id, { docNo: e.currentTarget.value })} />,
    },
    {
      key: 'docDate',
      header: 'Date',
      cell: (r) => <DatePicker aria-label="Document date" value={r.docDate || null} onValueChange={(docDate) => patchRef(r.id, { docDate: docDate ?? '' })} />,
    },
    {
      key: 'remarks',
      header: 'Remarks',
      cell: (r) => <TextField aria-label="Reference remarks" value={r.remarks} onChange={(e) => patchRef(r.id, { remarks: e.currentTarget.value })} />,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <Section icon="account_balance" title="Journal & payment">
        <Fields>
          {f.text('journalRemark', 'Journal remark', { hint: 'Defaults to “Purchase Orders – vendor code”. With perpetual inventory, it’s the journal entry’s remark.' })}
          {f.master('project', 'BP project', projectDef, { clearable: true, hint: 'Defaults from the vendor.' })}
          {f.master('paymentTerms', 'Payment terms', paymentTermDef, { hint: 'Defaults from the vendor; sets the due date.' })}
          {f.lookup(
            'paymentMethod',
            'Payment method',
            PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })),
            { hint: 'Defaults from the vendor.' },
          )}
          {f.date('dueDate', 'Due date', {
            error: errors.dueDate,
            hint: (
              <>
                Posting date + {termDays(draft.paymentTerms)} days = {computedDue || '—'}.{' '}
                {draft.dueDate !== computedDue ? (
                  <Button type="button" size="small" variant="ghost" onClick={() => update({ dueDate: computedDue })}>
                    Recalculate due date
                  </Button>
                ) : null}
              </>
            ),
          })}
          {f.num('cashDiscountDays', 'Cash discount date offset', {
            suffix: 'days',
            hint: 'Days added to the posting date before the early-payment discount window starts.',
          })}
        </Fields>
      </Section>
      <Section icon="event" title="Dates & references">
        <Fields>
          {f.date('requiredDate', 'Required date', {
            error: errors.requiredDate,
            hint: 'When the goods must leave the vendor to arrive by the delivery date.',
          })}
          {f.date('cancellationDate', 'Cancellation date', {
            error: errors.cancellationDate,
            hint: 'After this date the PO is cancelled and you’re no longer committed.',
          })}
          {f.choose('indicator', 'Indicator', asOptions(INDICATORS))}
          <ReadOnly
            label="Federal tax ID"
            value={m.tax.company.tin || <span className="text-muted">Not set — Settings › Accounting & Tax › Company tax profile</span>}
            hint={`${m.tax.company.registeredName}’s TIN.`}
          />
          {f.text('orderNumber', 'Order number', { hint: 'Chain-store order number, for direct distribution to a chain’s stores.' })}
        </Fields>
      </Section>
      <DataTable
        icon="link"
        title="Referenced documents"
        description="Other documents this PO refers to, or that refer to it."
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
              aria-label="Add reference"
              leadingIcon={<Icon size={16}>add</Icon>}
              onClick={() =>
                update({
                  references: [...refs, { id: `ref-${crypto.randomUUID().slice(0, 8)}`, docType: 'Purchase request', docNo: '', docDate: '', remarks: '' }],
                })
              }
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
