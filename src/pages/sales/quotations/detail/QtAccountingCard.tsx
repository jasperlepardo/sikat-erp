import { Section, bind } from '../../../../components/form/fields';
import { paymentTermDef } from '../../../settings/masterDefs';
import type { QtTabProps } from './types';

export function QtAccountingCard({ draft, update, ctx }: QtTabProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="receipt_long" title="Terms">
        {h.master('paymentTermId', 'Payment terms', paymentTermDef)}
      </Section>
    </fieldset>
  );
}
