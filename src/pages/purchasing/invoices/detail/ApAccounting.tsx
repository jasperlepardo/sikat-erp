import { Combobox, FormField } from '@jasperlepardo/sikat-design-system';
import { AccountField } from '../../../../components/form/AccountField';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import { ReferencesTable } from '../../orders/detail/AccountingTab';
import type { ApSectionProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export function ApAccounting({ draft, update, errors, m, ctx }: ApSectionProps) {
  const f = bind(draft, update);
  return (
    <div className="flex flex-col gap-2">
      <Section icon="account_balance" title="Accounting">
        <Fields>
          {f.text('journalRemark', 'Journal remark', { hint: 'Defaults to “A/P Invoices – vendor code”. It’s the remark on the journal entry.' })}
          <AccountField
            label="Control account"
            role="payable"
            value={draft.controlAccount}
            onChange={(controlAccount) => update({ controlAccount })}
            accounts={m.accounts}
            required
            error={errors.controlAccount}
            disabled={ctx.readOnly}
            hint="The vendor's payable account. Change it to post this invoice to another one, e.g. A/P – Import."
          />
          {f.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Defaults from the vendor or the base document; sets the due date.' })}
          {f.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })), { hint: 'Defaults from the vendor.' })}
          <ReadOnly label="Installments" value={String(draft.installments)} hint="Split into installments once payments are built." />
          {f.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days', hint: 'Days added to the posting date before the early-payment discount window starts.' })}
          <FormField label="Consolidating BP" tooltip="Pay this invoice through another partner, e.g. the vendor's parent company.">
            {(p) => (
              <Combobox
                {...p}
                placeholder="— None —"
                options={m.vendors.filter((v) => v.id !== draft.vendorId && (v.status !== 'Inactive' || v.id === draft.consolidatingBpId)).map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }))}
                value={draft.consolidatingBpId || null}
                onValueChange={(consolidatingBpId) => update({ consolidatingBpId: consolidatingBpId ?? '' })}
              />
            )}
          </FormField>
          {f.master('project', 'BP project', projectDef, { clearable: true, hint: 'Defaults from the vendor or the base document.' })}
          {f.choose('indicator', 'Indicator', asOptions(INDICATORS))}
          <ReadOnly
            label="Federal tax ID"
            value={ctx.vendor?.tin || <span className="text-muted">{ctx.vendor ? 'Not on the vendor record' : '—'}</span>}
            hint="The vendor’s TIN, from its business partner record. BIR needs it on the 2307 and the purchases relief."
          />
          <ReadOnly label="Order number" value={draft.orderNumber || '—'} hint="The PO(s) behind the lines, directly or through their receipts." />
        </Fields>
        <Flags>{f.check('maxCashDiscount', 'Max. cash discount (take the largest early-payment discount the terms allow)')}</Flags>
      </Section>
      <ReferencesTable
        refs={draft.references}
        onChange={(references) => update({ references })}
        readOnly={ctx.readOnly}
        description="Other documents this invoice refers to, e.g. the vendor's official receipt or statement of account."
      />
    </div>
  );
}
