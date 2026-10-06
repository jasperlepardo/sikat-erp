import { Combobox } from '@jasperlepardo/sikat-design-system';
import type { ReactNode } from 'react';
import { CtxFormField as FormField } from './fields';
import { accountLabel, accountProblem, accountText, fitsRole, type Account, type AccountRole } from '../../mocks/chartOfAccounts';
import { accounts as accountsCollection } from '../../services/masterData';
import { useAsync } from '../../services/useAsync';

/** The chart of accounts, as saved (Accounting › Chart of Accounts). */
export const useAccounts = () => useAsync(accountsCollection.list, []);

/**
 * A G/L account picker over the saved chart of accounts. It offers active,
 * postable accounts of the right kind for `role` and stores the account code.
 * An account the record already uses stays listed (and is flagged) even if it
 * has since been deactivated or no longer fits.
 */
export function AccountField({
  label,
  role,
  value,
  onChange,
  accounts,
  required,
  allowNone,
  error,
  hint,
  disabled,
}: {
  label: string;
  role: AccountRole;
  value: string;
  onChange: (code: string) => void;
  accounts: Account[] | undefined;
  required?: boolean;
  allowNone?: boolean;
  error?: string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const all = accounts ?? [];
  const options = [
    ...all
      .filter((a) => !a.title && a.active && fitsRole(a, role, all))
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => ({ value: a.code, label: accountLabel(a) })),
  ];
  if (value && !options.some((o) => o.value === value)) options.push({ value, label: accountText(value, accounts) });

  // Flag a stale account as soon as the form opens, not only on save.
  const problem = accounts && value ? accountProblem(value, role, all) : undefined;

  return (
    <FormField label={label} required={required} error={error ?? problem} tooltip={hint}>
      {(p) => (
        <Combobox
          {...p}
          options={options}
          disabled={disabled || !accounts}
          placeholder={accounts ? (allowNone ? 'None' : 'Search accounts') : 'Loading accounts…'}
          clearable={allowNone}
          value={value}
          onValueChange={(v) => onChange(v ?? '')}
        />
      )}
    </FormField>
  );
}
