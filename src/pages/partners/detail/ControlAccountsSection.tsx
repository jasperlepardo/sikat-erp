import { Text } from '@jasperlepardo/sikat-design-system';
import { AccountField, useAccounts } from '../../../components/form/AccountField';
import { Fields, Section, type TabProps } from './fields';

export function ControlAccountsSection({ draft, update, errors }: TabProps) {
  const isCustomer = draft.roles.includes('customer');
  const isVendor = draft.roles.includes('vendor');
  const chart = useAccounts();

  return (
    <Section icon="account_tree" title="Control accounts">
      <Fields>
        {isCustomer ? (
          <AccountField
            label="Accounts receivable"
            role="receivable"
            accounts={chart}
            required
            error={errors.receivableAccount}
            hint="Every invoice to this partner posts here."
            value={draft.receivableAccount}
            onChange={(receivableAccount) => update({ receivableAccount })}
          />
        ) : null}
        {isVendor ? (
          <AccountField
            label="Accounts payable"
            role="payable"
            accounts={chart}
            required
            error={errors.payableAccount}
            hint="Every bill from this partner posts here."
            value={draft.payableAccount}
            onChange={(payableAccount) => update({ payableAccount })}
          />
        ) : null}
        <AccountField
          label="Down payment clearing account"
          role="downPaymentClearing"
          accounts={chart}
          allowNone
          error={errors.downPaymentClearingAccount}
          value={draft.downPaymentClearingAccount}
          onChange={(downPaymentClearingAccount) => update({ downPaymentClearingAccount })}
        />
        <AccountField
          label="Down payment interim account"
          role="downPaymentInterim"
          accounts={chart}
          allowNone
          error={errors.downPaymentInterimAccount}
          value={draft.downPaymentInterimAccount}
          onChange={(downPaymentInterimAccount) => update({ downPaymentInterimAccount })}
        />
      </Fields>
      {!isCustomer && !isVendor ? (
        <Text variant="small" tone="muted">
          Control accounts apply once this partner is a customer or vendor.
        </Text>
      ) : null}
    </Section>
  );
}
