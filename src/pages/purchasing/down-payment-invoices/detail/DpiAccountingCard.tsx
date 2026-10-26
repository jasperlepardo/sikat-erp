import { FieldStack, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { AccountField } from '../../../../components/form/AccountField';
import type { DpiSectionProps } from './types';

export function DpiAccountingCard({ draft, update, errors, ctx, m }: DpiSectionProps & { ctx: { readOnly: boolean }; m: { accounts: import('../../../../mocks/chartOfAccounts').Account[] } }) {
  const h = bind(draft, update);
  return (
    <Section icon="account_balance" title="Accounting">
      <FieldStack>
        <AccountField label="Down payment account" role="downPaymentClearing" value={draft.downPaymentAccount} onChange={(downPaymentAccount) => update({ downPaymentAccount })} accounts={m.accounts} required error={errors.downPaymentAccount} disabled={ctx.readOnly} hint="Where the advance sits once paid." />
        {h.text('journalRemark', 'Journal remark', { disabled: ctx.readOnly })}
        <ReadOnly label="Order No." value={draft.orderNumber ?? '—'} />
      </FieldStack>
    </Section>
  );
}
