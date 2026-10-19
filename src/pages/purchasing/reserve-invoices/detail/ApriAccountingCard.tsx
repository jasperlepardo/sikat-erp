import { Combobox } from '@jasperlepardo/sikat-design-system';
import { AccountField } from '../../../../components/form/AccountField';
import { CtxFormField, FieldStack, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import type { ApriSectionProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export function ApriAccountingCard({ draft, update, errors, m, ctx }: ApriSectionProps) {
  const f = bind(draft, update);
  return (
    <Section icon="account_balance" title="Accounting">
      <FieldStack>
        {f.text('journalRemark', 'Journal remark', { hint: 'Appears on the journal entry when this invoice is posted.' })}
        <AccountField
          label="Control account"
          role="payable"
          value={draft.controlAccount}
          onChange={(controlAccount) => update({ controlAccount })}
          accounts={m.accounts}
          required
          error={errors.controlAccount}
          disabled={ctx.readOnly}
          hint="The vendor's payable account. Change it to post to a different one."
        />
        {f.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Defaults from the vendor or the base PO; sets the due date.' })}
        {f.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })), { hint: 'Defaults from the vendor.' })}
        <ReadOnly label="Installments" value={String(draft.installments)} hint="Split into installments once payments are built." />
        {f.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days', hint: 'Days added to the posting date before the early-payment discount window starts.' })}
        <CtxFormField label="Consolidating BP" tooltip="Pay this invoice through another partner, e.g. the vendor's parent company.">
          {(p) => (
            <Combobox
              {...p}
              placeholder="— None —"
              options={m.vendors.filter((v) => v.id !== draft.vendorId && (v.status !== 'Inactive' || v.id === draft.consolidatingBpId)).map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }))}
              value={draft.consolidatingBpId || null}
              onValueChange={(consolidatingBpId) => update({ consolidatingBpId: consolidatingBpId ?? '' })}
            />
          )}
        </CtxFormField>
        {f.master('projectId', 'BP project', projectDef, { clearable: true, hint: 'Defaults from the vendor or the base PO.' })}
        {f.choose('indicator', 'Indicator', [{ value: '', label: '— None —' }, ...asOptions(INDICATORS)])}
        <ReadOnly
          label="Federal tax ID"
          value={ctx.vendor?.tin || <span className="text-muted">{ctx.vendor ? 'Not on the vendor record' : '—'}</span>}
          hint="The vendor's TIN, from its business partner record."
        />
        <ReadOnly label="Order number" value={draft.orderNumber || '—'} hint="The PO(s) behind the lines." />
      </FieldStack>
      <Flags>{f.check('maxCashDiscount', 'Max. cash discount (take the largest early-payment discount the terms allow)')}</Flags>
    </Section>
  );
}
