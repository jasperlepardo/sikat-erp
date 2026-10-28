import { Combobox } from '@jasperlepardo/sikat-design-system';
import { AccountField } from '../../../../components/form/AccountField';
import { CtxFormField, Flags, ReadOnly, Section, SideFields, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { INDICATORS } from '../../../../mocks/purchaseOrders';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import type { CmSectionProps } from './types';

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

interface CmAccountingCardProps extends CmSectionProps {
  readOnly: boolean;
}

export function CmAccountingCard({ draft, update, errors, m, ctx, readOnly }: CmAccountingCardProps) {
  const h = bind(draft, update);
  const { vendor } = ctx;

  return (
    <Section icon="account_balance" title="Accounting">
      <SideFields>
        {h.text('journalRemark', 'Journal remark', { hint: 'Defaults to "A/P Credit Memo – vendor code".' })}
        <AccountField label="Control account" role="payable" value={draft.controlAccount} onChange={(controlAccount) => update({ controlAccount })} accounts={m.accounts} required error={errors.controlAccount} disabled={readOnly} hint="The vendor's payable account by default." />
        {h.master('paymentTermId', 'Payment terms', paymentTermDef)}
        {h.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })))}
        <ReadOnly label="Installments" value={String(draft.installments)} />
        {h.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days' })}
        {h.master('projectId', 'BP project', projectDef, { clearable: true })}
        {h.choose('indicator', 'Indicator', asOptions(INDICATORS), { clearable: true })}
        <ReadOnly label="Federal tax ID" value={vendor?.tin || '—'} hint="The vendor's TIN." />
        <ReadOnly label="Order number" value={draft.orderNumber || '—'} />
        <CtxFormField label="Consolidating BP">
          {(p) => (
            <Combobox {...p} placeholder="None" options={m.vendors.filter((v) => v.id !== draft.vendorId).map((v) => ({ value: v.id, label: v.name, subLabel: v.code, subLabelPlacement: 'top' as const, text: `${v.code} ${v.name}` }))} value={draft.consolidatingBpId || null} onValueChange={(consolidatingBpId) => update({ consolidatingBpId: consolidatingBpId ?? '' })} />
          )}
        </CtxFormField>
      </SideFields>
      <Flags>{h.check('maxCashDiscount', 'Max. cash discount')}</Flags>
    </Section>
  );
}
