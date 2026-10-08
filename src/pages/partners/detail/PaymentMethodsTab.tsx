import { useState } from 'react';
import { Icon, Link, List, Text } from '@jasperlepardo/sikat-design-system';
import { RowMenu } from '../../../components/form/RowMenu';
import { PAYMENT_METHODS } from '../../../mocks/masters';
import type { PaymentAccount, PaymentMethodSetting } from '../../../mocks/partners';
import { accountKind } from './PaymentAccounts';
import { EditPanel } from './EditPanel';
import { DefaultFlags, Fields, Section, bind, type DefaultPicks, type DefaultRole, type Draft, type Errors } from './fields';

const METHOD_ICON: Record<string, string> = {
  CASH: 'payments',
  CHECK: 'receipt_long',
  PDC: 'event',
  BANK: 'account_balance',
  GCASH: 'account_balance_wallet',
  MAYA: 'account_balance_wallet',
  CARD: 'credit_card',
};

export const methodTitle = (code: string) => PAYMENT_METHODS.find((m) => m.code === code)?.description ?? code;
const methodIcon = (code: string) => METHOD_ICON[code] ?? 'payments';
const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The partner's payment methods: the ones marked `include`. */
export const includedMethods = (draft: Draft) => draft.paymentMethods.filter((m) => m.include);

/** Updates one method, adding it if the partner never had it. */
export function setMethod(list: PaymentMethodSetting[], code: string, patch: Partial<PaymentMethodSetting>): PaymentMethodSetting[] {
  return list.some((m) => m.code === code)
    ? list.map((m) => (m.code === code ? { ...m, ...patch } : m))
    : [...list, { code, include: false, ...patch }];
}

/**
 * One card in the Payment methods list: an account under a method (a bank account, an
 * e-wallet, a card), or a method on its own (cash, checks, or a method with no account yet).
 */
export interface PaymentEntry {
  code: string;
  account?: PaymentAccount;
}

const entryKey = (e: PaymentEntry) => e.account?.id ?? e.code;

/** The partner's payment methods as cards: one per account, or one for a method without any. */
export const paymentEntries = (draft: Draft): PaymentEntry[] =>
  includedMethods(draft).flatMap((m) =>
    accountKind(m.code) && m.accounts?.length ? m.accounts.map((account) => ({ code: m.code, account })) : [{ code: m.code }],
  );

/** A method's accounts and its default account. */
export const accountsOf = (draft: Draft, code: string) => {
  const m = draft.paymentMethods.find((x) => x.code === code);
  return { accounts: m?.accounts ?? [], defaultAccountId: m?.defaultAccountId ?? '' };
};

/** For "New": the first method not yet on the partner, else the first that holds accounts. */
export const nextEntry = (draft: Draft): PaymentEntry => ({
  code:
    PAYMENT_METHODS.find((m) => !includedMethods(draft).some((x) => x.code === m.code))?.code ??
    PAYMENT_METHODS.find((m) => accountKind(m.code))?.code ??
    '',
});

/**
 * Takes an entry off the partner. Removing a method's last account turns the method off; the
 * method's default account and the partner's default method move to what's left.
 */
export function removeEntry(draft: Draft, entry: PaymentEntry): Pick<Draft, 'paymentMethods' | 'defaultPaymentMethod'> {
  let list = draft.paymentMethods;
  if (entry.account) {
    const { accounts, defaultAccountId } = accountsOf(draft, entry.code);
    const rest = accounts.filter((a) => a.id !== entry.account!.id);
    list = setMethod(list, entry.code, {
      include: rest.length > 0,
      accounts: rest,
      defaultAccountId: defaultAccountId === entry.account.id ? (rest[0]?.id ?? '') : defaultAccountId,
    });
  } else {
    list = setMethod(list, entry.code, { include: false });
  }
  const stillThere = list.some((m) => m.code === draft.defaultPaymentMethod && m.include);
  return {
    paymentMethods: list,
    defaultPaymentMethod: stillThere ? draft.defaultPaymentMethod : (list.find((m) => m.include)?.code ?? ''),
  };
}

/**
 * Saves an entry from the panel. `from` is the entry as it was (when editing): moving an account
 * to another method takes it off the old one. `makeDefaultAccount` is the panel's "Default …"
 * account tick (ignored for methods without accounts).
 */
export function saveEntry(draft: Draft, entry: PaymentEntry, makeDefaultAccount: boolean, from?: PaymentEntry): PaymentMethodSetting[] {
  let list = draft.paymentMethods;
  if (from && from.code !== entry.code) list = removeEntry(draft, from).paymentMethods;
  const account = entry.account;
  if (!account) return setMethod(list, entry.code, { include: true });
  const cur = list.find((m) => m.code === entry.code);
  const accounts = cur?.accounts ?? [];
  const curDefault = cur?.defaultAccountId ?? '';
  return setMethod(list, entry.code, {
    include: true,
    accounts: accounts.some((a) => a.id === account.id) ? accounts.map((a) => (a.id === account.id ? account : a)) : [...accounts, account],
    defaultAccountId: makeDefaultAccount ? account.id : curDefault === account.id ? '' : curDefault,
  });
}

/** Payment methods and their accounts as cards in the side column; adding and editing happen in `PaymentEntryPanel`. */
export function PaymentMethodsCards({
  draft,
  update,
  onOpen,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onOpen: (entry: PaymentEntry, isNew: boolean) => void;
}) {
  const entries = paymentEntries(draft);

  return (
    <Section
      icon="payments"
      title={`Payment methods${entries.length ? ` (${entries.length})` : ''}`}
      actions={
        <Link aria-label="New payment method" leadingIcon={<Icon size={20}>add</Icon>} onClick={() => onOpen(nextEntry(draft), true)}>
          New
        </Link>
      }
    >
      {entries.length ? (
        <List.Group>
          {entries.map((e) => {
            const kind = accountKind(e.code);
            const isDefaultMethod = e.code === draft.defaultPaymentMethod;
            const isDefaultAccount = !!e.account && accountsOf(draft, e.code).defaultAccountId === e.account.id;
            // The star marks what new documents start with: the default method (and its default account).
            const starred = isDefaultMethod && (!e.account || isDefaultAccount);
            const defaults = [isDefaultMethod && 'Payment method', isDefaultAccount && kind && capitalize(kind.noun)].filter(Boolean).join(' · ');
            const title = e.account && kind ? kind.title(e.account) : methodTitle(e.code);
            return (
              <List.Card
                key={entryKey(e)}
                title={title}
                icon={<Icon size={16}>{e.account && kind ? kind.icon : methodIcon(e.code)}</Icon>}
                badge={starred ? <Icon size={12}>star</Icon> : undefined}
                fields={[
                  { label: 'Method', value: e.account ? methodTitle(e.code) : '' },
                  ...(e.account && kind ? kind.details(e.account) : []),
                  { label: 'Account', value: kind && !e.account ? 'None yet' : '' },
                  { label: 'Default', value: defaults },
                  { label: 'Status', value: e.account && !e.account.active ? 'Inactive' : '' },
                ].filter((x): x is { label: string; value: string } => !!x.value)}
                actions={
                  <RowMenu
                    label={`Actions for ${title}`}
                    items={[
                      { label: 'Edit', icon: 'edit', onSelect: () => onOpen(e, false) },
                      {
                        label: 'Set as default',
                        icon: 'star',
                        disabled: starred,
                        onSelect: () =>
                          update({
                            defaultPaymentMethod: e.code,
                            ...(e.account ? { paymentMethods: setMethod(draft.paymentMethods, e.code, { defaultAccountId: e.account.id }) } : {}),
                          }),
                      },
                      { label: 'Remove', icon: 'delete', onSelect: () => update(removeEntry(draft, e)) },
                    ]}
                  />
                }
              />
            );
          })}
        </List.Group>
      ) : (
        <Text variant="small" tone="muted">
          No payment methods yet.
        </Text>
      )}
    </Section>
  );
}

/**
 * Add or edit one payment method entry in a side panel: pick the method, and the fields its
 * accounts need appear (bank details, e-wallet number, card) — none for cash or checks.
 */
export function PaymentEntryPanel({
  value,
  isNew,
  taken,
  defaultsFor,
  accountsFor,
  newAccount,
  onDone,
  onCancel,
}: {
  value: PaymentEntry;
  isNew: boolean;
  /** Methods without accounts the partner already has (other than this one), so they aren't added twice. */
  taken: string[];
  /** The "Default payment method" checkbox for whichever method is picked. */
  defaultsFor: (code: string) => DefaultRole[];
  /** The partner's accounts for a method and its default account. */
  accountsFor: (code: string) => { accounts: PaymentAccount[]; defaultAccountId: string };
  /** A blank account for a method, prefilled from the partner. */
  newAccount: (code: string) => PaymentAccount;
  /** `picks.defaultAccount` is the "Default … account" tick. */
  onDone: (entry: PaymentEntry, picks: DefaultPicks) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(value.code);
  // The account per method picked here, so switching back and forth keeps what was typed.
  const [accountByCode, setAccountByCode] = useState<Record<string, PaymentAccount>>(() => {
    const kind = accountKind(value.code);
    return kind ? { [value.code]: value.account ?? newAccount(value.code) } : {};
  });
  const [picksByCode, setPicksByCode] = useState<Record<string, DefaultPicks>>({});
  const [errors, setErrors] = useState<Errors>({});

  const kind = accountKind(code);
  const account = kind ? accountByCode[code] : undefined;
  const pickMethod = (next: string) => {
    setCode(next);
    setErrors({});
    if (accountKind(next) && !accountByCode[next]) setAccountByCode((all) => ({ ...all, [next]: newAccount(next) }));
  };
  const setAccount = (patch: Partial<PaymentAccount>) => {
    setAccountByCode((all) => ({ ...all, [code]: { ...all[code], ...patch } }));
    // Editing a field clears its error.
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))));
  };

  // Defaults: the partner's default method and, for methods with accounts, the method's default account.
  const roles: DefaultRole[] = [...defaultsFor(code)];
  if (kind && account) {
    const { accounts, defaultAccountId } = accountsFor(code);
    const isNewAccount = !accounts.some((a) => a.id === account.id);
    const holder = accounts.find((a) => a.id === defaultAccountId && a.id !== account.id);
    roles.push({
      key: 'defaultAccount',
      label: `Default ${kind.noun}`,
      checked: isNewAccount ? !defaultAccountId : defaultAccountId === account.id,
      holder: holder ? kind.title(holder) : undefined,
    });
  }
  const picks = picksByCode[code] ?? Object.fromEntries(roles.map((r) => [r.key, r.checked]));

  const methodField = bind({ code }, (p: { code?: string }) => p.code && pickMethod(p.code));
  const accountFields = account ? bind(account, setAccount) : undefined;
  const options = PAYMENT_METHODS.filter((m) => !taken.includes(m.code)).map((m) => ({ value: m.code, label: `${m.code} · ${m.description}` }));

  const done = () => {
    if (!code) return setErrors({ code: 'Pick a payment method.' });
    const found = kind && account ? kind.check(account) : {};
    setErrors(found);
    if (!Object.keys(found).length) onDone({ code, account }, picks);
  };

  const was = accountKind(value.code);
  const title = isNew ? 'New payment method' : value.account && was ? was.title(value.account) : methodTitle(value.code);

  return (
    <EditPanel icon={kind ? kind.icon : methodIcon(code)} title={title} onCancel={onCancel} onDone={done}>
      <Section icon="payments" title="Payment method">
        <Fields>
          {methodField.choose('code', 'Method', options, {
            required: true,
            error: errors.code,
            hint: 'Bank transfer, GCash, Maya and cards can have several accounts — add each one as its own entry.',
          })}
        </Fields>
      </Section>
      {kind && account && accountFields ? (
        <Section icon={kind.icon} title={capitalize(kind.noun)}>
          {kind.fields(accountFields, account, errors)}
          <Fields>{accountFields.status('active', 'Status')}</Fields>
        </Section>
      ) : null}
      <Section icon="star" title="Defaults">
        <DefaultFlags roles={roles} picks={picks} onChange={(next) => setPicksByCode((all) => ({ ...all, [code]: next }))} />
      </Section>
    </EditPanel>
  );
}
