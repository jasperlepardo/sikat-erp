import { FieldStack, Section, bind } from '../../../../components/form/fields';
import { activeOptions } from '../../../../services/inventoryMasters';
import { paymentTermDef, salesEmployeeDef } from '../../../settings/masterDefs';
import type { QtTabProps } from './types';

/** Dates, terms, shipping, assignment and remarks; ship-to and bill-to are in the customer panel, as on the sales order. */
export function QtDetailsCard({ draft, update, errors, ctx, m }: QtTabProps) {
  const h = bind(draft, update);
  return (
    <fieldset disabled={ctx.readOnly} className="contents">
      <Section icon="info" title="Details">
        <FieldStack>
          {h.date('postingDate', 'Quotation date', {
            required: true,
            error: errors.postingDate,
            disabled: ctx.added,
          })}
          {h.date('validUntil', 'Valid until', {
            hint: 'After this date the quotation is expired.',
          })}
          {h.master('paymentTermId', 'Payment terms', paymentTermDef)}
          {h.lookup('shippingType', 'Shipping type', activeOptions(m.inv.shipping, (s) => s.id, (s) => s.name, draft.shippingType), { clearable: true })}
          {h.master('salesEmployeeId', 'Sales employee', salesEmployeeDef, { clearable: true })}
          {h.master('ownerId', 'Owner', salesEmployeeDef)}
          {h.area('remarks', 'Remarks', { rows: 3, hint: 'Can be changed after the quotation is added.' })}
        </FieldStack>
      </Section>
    </fieldset>
  );
}
