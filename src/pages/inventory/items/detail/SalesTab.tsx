import { unitPrice } from '../../../../mocks/items';
import { formatAmount } from '../../../../services/format';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { activeOptions } from '../../../../services/inventoryMasters';
import { shippingTypeDef, warrantyTemplateDef } from '../../../settings/masterDefs';
import { groupTaxNote, taxCodeOptions, taxGroupOptions, taxResolution, unitOptions, type TabProps } from './types';

export function SalesTab({ draft, update, errors, tax, inv }: TabProps) {
  const f = bind(draft, update);

  return (
    <>
      <Section icon="sell" title="Selling unit & price">
        <Fields>
          {f.choose('salesUom', 'Default sales UoM', unitOptions(draft, 'sales'), {
            error: errors.salesUom,
            hint: 'Pre-fills sales documents. Add units and their conversions on the Units of measure tab.',
          })}
          {f.num('basePrice', `Base price per ${draft.inventoryUom}`, {
            prefix: 'PHP',
            hint:
              'Retail SRP, VAT inclusive (default price list). Other units cost their qty × this, unless the unit sets its own price.' +
              (draft.salesUom !== draft.inventoryUom ? ` Default sales unit: ${formatAmount(unitPrice(draft, draft.salesUom))} per ${draft.salesUom}.` : ''),
          })}
          {f.text('sellingItemNo', 'Selling item no.', { hint: 'Printed on sales documents instead of the Item No.' })}
        </Fields>
      </Section>

      <Section icon="percent" title="Tax & commission">
        <Fields>
          {f.lookup('salesTaxGroup', 'Tax group', taxGroupOptions(tax, 'Sales', draft.salesTaxGroup), {
            required: draft.salesItem,
            error: errors.salesTaxGroup,
            hint: draft.taxLiable
              ? taxResolution(tax, draft.salesTaxGroup, draft.salesTaxCode) + groupTaxNote(inv, draft, 'salesTaxGroup')
              : 'Not tax liable (General tab): no tax is charged on sales.',
          })}
          {f.lookup('salesTaxCode', 'Fixed sales tax code', taxCodeOptions(tax, 'Sales', draft.salesTaxCode), {
            hint: 'Overrides the tax group on every sale.',
          })}
          {f.lookup(
            'commissionGroup',
            'Commission group',
            activeOptions(inv.commissions, (c) => c.id, (c) => `${c.name} (${c.pct}%)`, draft.commissionGroup, '— None —'),
            { hint: 'Picking a group sets its commission %.' },
          )}
          {f.num('commissionPct', 'Commission', { suffix: '%', hint: 'Per item; overrides the salesperson rate.' })}
        </Fields>
      </Section>

      <Section icon="local_shipping" title="Fulfillment">
        <Fields>
          {f.num('salesLeadTimeDays', 'Lead time', { suffix: 'days', hint: 'Sets the promised delivery date on orders.' })}
          {f.master('shippingType', 'Shipping type', shippingTypeDef, { clearable: true })}
          {f.master('warrantyTemplate', 'Warranty template', warrantyTemplateDef, {
            clearable: true,
            hint: draft.manageBy === 'Serial Numbers' ? 'Assigned to each serial number sold.' : 'Used with serial-numbered items.',
          })}
        </Fields>
      </Section>
    </>
  );
}
