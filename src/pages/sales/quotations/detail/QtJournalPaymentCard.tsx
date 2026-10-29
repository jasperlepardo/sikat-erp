import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { PAYMENT_METHODS } from '../../../../mocks/masters';
import { paymentTermDef, projectDef } from '../../../settings/masterDefs';
import type { QtTabProps } from './types';

export function QtJournalPaymentCard({ draft, update, ctx }: QtTabProps) {
  const f = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="account_balance" title="Journal & payment">
        <FieldStack>
          {f.text('journalRemark', 'Journal remark', { hint: 'Defaults to "Sales Quotations – customer code".' })}
          {f.master('projectId', 'BP project', projectDef, { clearable: true, hint: 'Defaults from the customer.' })}
          {f.master('paymentTermId', 'Payment terms', paymentTermDef, { hint: 'Defaults from the customer.' })}
          {f.lookup('paymentMethod', 'Payment method', PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} · ${p.description}` })), { hint: 'Defaults from the customer.' })}
          {f.num('cashDiscountDays', 'Cash discount date offset', { suffix: 'days', hint: 'Days added to the quotation date before the early-payment discount window starts.' })}
        </FieldStack>
      </Section>
    </fieldset>
  );
}
