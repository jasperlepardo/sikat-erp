import { PAYMENT_METHODS } from '../../../mocks/masters';
import { contactName } from '../../../mocks/partners';
import { bankAccountTitle } from './BankAccountsTab';
import { Fields, Section, bind, type Draft } from './fields';

/** What a Defaults dropdown can create when the partner has nothing to pick yet. */
export type DefaultsCreate = 'contact' | 'address' | 'bank' | 'paymentMethods';

const NONE = { value: '', label: '— None —' };
/** Picking this option opens the create panel instead of setting a value. */
const CREATE = '__create__';

const CREATES: Partial<Record<keyof Draft, DefaultsCreate>> = {
  defaultContactId: 'contact',
  defaultBillToId: 'address',
  defaultShipToId: 'address',
  defaultBankAccountId: 'bank',
  defaultPaymentMethod: 'paymentMethods',
};

/**
 * What documents start with for this partner. Each pick comes from the partner's own records;
 * when there are none yet, the dropdown offers to create one (it then becomes the default).
 */
export function DefaultsCard({
  draft,
  update,
  onCreate,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onCreate: (what: DefaultsCreate) => void;
}) {
  const f = bind(draft, (patch) => {
    const [key, value] = Object.entries(patch)[0] as [keyof Draft, unknown];
    if (value === CREATE) onCreate(CREATES[key]!);
    else update(patch);
  });
  // Only the payment methods ticked on the Payment run tab (plus the current default, if it was unticked since).
  const methods = PAYMENT_METHODS.filter(
    (m) => draft.paymentMethods.some((x) => x.code === m.code && x.include) || m.code === draft.defaultPaymentMethod,
  );
  const options = (items: { value: string; label: string }[], create: string) =>
    items.length ? [NONE, ...items] : [NONE, { value: CREATE, label: create }];
  const addresses = draft.addresses.map((a) => ({ value: a.id, label: a.label || 'Untitled address' }));

  return (
    <Section icon="star" title="Defaults">
      <Fields cols={1}>
        {f.choose('defaultContactId', 'Contact person', options(draft.contacts.map((c) => ({ value: c.id, label: contactName(c) })), '+ New contact'))}
        {f.choose('defaultBillToId', 'Bill to', options(addresses, '+ New address'))}
        {f.choose('defaultShipToId', 'Ship to', options(addresses, '+ New address'))}
        {f.choose(
          'defaultBankAccountId',
          'Bank account',
          options(draft.bankAccounts.map((b) => ({ value: b.id, label: bankAccountTitle(b) })), '+ New bank account'),
        )}
        {f.choose(
          'defaultPaymentMethod',
          'Payment method',
          options(methods.map((m) => ({ value: m.code, label: `${m.code} · ${m.description}` })), '+ Choose payment methods'),
          { hint: 'From the methods included on the Payment run tab.' },
        )}
      </Fields>
    </Section>
  );
}
