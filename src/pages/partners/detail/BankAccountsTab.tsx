import { useState } from 'react';
import { Button, Icon, List, Text } from '@jasperlepardo/sikat-design-system';
import { RowMenu } from '../../../components/form/RowMenu';
import { BANKS, COUNTRIES } from '../../../mocks/masters';
import { newBankAccount, type PartnerBankAccount } from '../../../mocks/partners';
import { EditPanel } from './EditPanel';
import { Fields, Flags, Section, bind, type Draft, type Errors } from './fields';

export const bankAccountTitle = (b: PartnerBankAccount) => [b.bank, b.accountNo].filter(Boolean).join(' · ') || 'New bank account';

/** The partner's bank accounts as cards in the side column; adding and editing happen in `BankAccountPanel`. */
export function BankAccountsCards({
  draft,
  update,
  onOpen,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onOpen: (account: PartnerBankAccount, isNew: boolean) => void;
}) {
  const remove = (id: string) => {
    const bankAccounts = draft.bankAccounts.filter((b) => b.id !== id);
    update({
      bankAccounts,
      defaultBankAccountId: draft.defaultBankAccountId === id ? (bankAccounts[0]?.id ?? '') : draft.defaultBankAccountId,
    });
  };

  return (
    <Section
      icon="account_balance"
      title={`Bank accounts${draft.bankAccounts.length ? ` · ${draft.bankAccounts.length}` : ''}`}
      actions={
        <Button
          type="button"
          size="small"
          variant="ghost"
          aria-label="New bank account"
          leadingIcon={<Icon size={16}>add</Icon>}
          onClick={() =>
            onOpen(newBankAccount({ accountName: draft.name, currency: draft.currency === 'All currencies' ? 'PHP' : draft.currency }), true)
          }
        >
          New
        </Button>
      }
    >
      {draft.bankAccounts.length ? (
        <List.Group>
          {draft.bankAccounts.map((b) => {
            const isDefault = b.id === draft.defaultBankAccountId;
            return (
              <List.Card
                key={b.id}
                title={bankAccountTitle(b)}
                icon={<Icon size={16}>account_balance</Icon>}
                badge={isDefault ? <Icon size={12}>star</Icon> : undefined}
                fields={[
                  { label: 'Account name', value: b.accountName },
                  { label: 'Branch', value: b.branch },
                  { label: 'Currency', value: b.currency },
                  { label: 'BIC/SWIFT', value: b.swift },
                  { label: 'Status', value: isDefault ? 'Default account' : b.active ? '' : 'Inactive' },
                ].filter((x) => x.value)}
                actions={
                  <RowMenu
                    label={`Actions for ${bankAccountTitle(b)}`}
                    items={[
                      { label: 'Edit', icon: 'edit', onSelect: () => onOpen(b, false) },
                      { label: 'Set as default', icon: 'star', disabled: isDefault, onSelect: () => update({ defaultBankAccountId: b.id }) },
                      { label: 'Remove', icon: 'delete', onSelect: () => remove(b.id) },
                    ]}
                  />
                }
              />
            );
          })}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">
          No bank accounts yet.
        </Text>
      )}
    </Section>
  );
}

/** Add or edit one bank account in a side panel. Done needs the bank and account number. */
export function BankAccountPanel({
  value,
  isNew,
  currencies,
  onDone,
  onCancel,
}: {
  value: PartnerBankAccount;
  isNew: boolean;
  /** Currency codes to pick from (the partner form's active currencies). */
  currencies: string[];
  onDone: (account: PartnerBankAccount) => void;
  onCancel: () => void;
}) {
  const [account, setAccount] = useState(value);
  const [errors, setErrors] = useState<Errors>({});
  const f = bind(account, (p: Partial<PartnerBankAccount>) => {
    setAccount((b) => ({ ...b, ...p }));
    // Editing a field clears its error.
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in p))));
  });
  const done = () => {
    const found: Errors = {};
    if (!account.bank) found.bank = 'Pick the bank.';
    if (!account.accountNo.trim()) found.accountNo = 'Enter the account number.';
    setErrors(found);
    if (!Object.keys(found).length) onDone(account);
  };

  return (
    <EditPanel icon="account_balance" title={isNew ? 'New bank account' : bankAccountTitle(value)} onCancel={onCancel} onDone={done}>
      <Section icon="account_balance" title="Bank account">
        <Fields>
          {f.pick('country', 'Bank country/region', COUNTRIES)}
          {f.pick('bank', 'Bank name', BANKS, { required: true, error: errors.bank, placeholder: 'Select a bank' })}
          {f.text('branch', 'Branch')}
          {f.text('accountNo', 'Account no.', { required: true, error: errors.accountNo })}
          {f.text('accountName', 'Account name', { hint: 'As registered with the bank.' })}
          {f.text('swift', 'BIC/SWIFT code', { hint: 'Needed for foreign transfers.' })}
          {f.pick('currency', 'Currency', [...new Set([...currencies, account.currency].filter(Boolean))])}
        </Fields>
        <Flags>{f.check('active', 'Active')}</Flags>
      </Section>
    </EditPanel>
  );
}
