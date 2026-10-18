import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import type { RfqTabProps } from './types';

export function RfqJournalPaymentCard({ draft, update }: RfqTabProps) {
  const f = bind(draft, update);
  return (
    <Section icon="account_balance" title="Journal & payment">
      <FieldStack>
        {f.text('journalRemark', 'Journal remark', { hint: 'Defaults to "Purchase Quotations – vendor code".' })}
        {f.master('projectId', 'BP project', projectDef, { clearable: true, hint: 'Defaults from the vendor.' })}
        {f.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Defaults from the vendor.' })}
        {f.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })), { hint: 'Defaults from the vendor.' })}
        {f.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days', hint: 'Days added to the posting date before the early-payment discount window starts.' })}
      </FieldStack>
    </Section>
  );
}
