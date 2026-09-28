import { PAYMENT_METHODS } from '../../../mocks/masters';
import { contactName } from '../../../mocks/partners';
import { bankAccountTitle } from './BankAccountsTab';
import { Fields, Section, bind, type Draft } from './fields';

const NONE = { value: '', label: '— None —' };

/** What documents start with for this partner. Each pick comes from the partner's own records. */
export function DefaultsCard({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const f = bind(draft, update);
  // Only the payment methods ticked on the Payment run tab (plus the current default, if it was unticked since).
  const methods = PAYMENT_METHODS.filter(
    (m) => draft.paymentMethods.some((x) => x.code === m.code && x.include) || m.code === draft.defaultPaymentMethod,
  );
  const addresses = draft.addresses.map((a) => ({ value: a.id, label: a.label || 'Untitled address' }));

  return (
    <Section icon="star" title="Defaults">
      <Fields cols={1}>
        {f.choose('defaultContactId', 'Contact person', [NONE, ...draft.contacts.map((c) => ({ value: c.id, label: contactName(c) }))], {
          disabled: !draft.contacts.length,
        })}
        {f.choose('defaultBillToId', 'Bill to', [NONE, ...addresses], { disabled: !addresses.length })}
        {f.choose('defaultShipToId', 'Ship to', [NONE, ...addresses], { disabled: !addresses.length })}
        {f.choose('defaultBankAccountId', 'Bank account', [NONE, ...draft.bankAccounts.map((b) => ({ value: b.id, label: bankAccountTitle(b) }))], {
          disabled: !draft.bankAccounts.length,
        })}
        {f.choose('defaultPaymentMethod', 'Payment method', [NONE, ...methods.map((m) => ({ value: m.code, label: `${m.code} · ${m.description}` }))], {
          hint: 'From the methods included on the Payment run tab.',
        })}
      </Fields>
    </Section>
  );
}
