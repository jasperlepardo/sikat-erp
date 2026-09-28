import { contactName } from '../../../mocks/partners';
import { bankAccountTitle } from './BankAccountsTab';
import { Fields, ReadOnly, Section, type Draft } from './fields';

export function DefaultsCard({ draft }: { draft: Draft }) {
  const contact = draft.contacts.find((c) => c.id === draft.defaultContactId);
  const billTo = draft.addresses.find((a) => a.id === draft.defaultBillToId);
  const shipTo = draft.addresses.find((a) => a.id === draft.defaultShipToId);
  const bank = draft.bankAccounts.find((b) => b.id === draft.defaultBankAccountId);

  return (
    <Section icon="star" title="Defaults">
      <Fields cols={1}>
        <ReadOnly label="Contact person" value={contact ? contactName(contact) : '—'} />
        <ReadOnly label="Bill to" value={billTo?.label || '—'} />
        <ReadOnly label="Ship to" value={shipTo?.label || '—'} />
        <ReadOnly label="Bank account" value={bank ? bankAccountTitle(bank) : '—'} />
        <ReadOnly label="Payment" value={draft.defaultPaymentMethod || '—'} />
      </Fields>
    </Section>
  );
}
