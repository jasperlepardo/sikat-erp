import { Fields, Section, bind } from '../../../../components/form/fields';
import {
  COMMISSION_GROUPS,
  SHIPPING_TYPES,
  UOMS,
  WARRANTY_TEMPLATES,
} from '../../../../mocks/itemMasters';
import { taxCodeOptions, taxGroupOptions, taxResolution, type TabProps } from './types';

export function SalesTab({ draft, update, errors, tax }: TabProps) {
  const f = bind(draft, update);
  const converts = draft.salesUom !== draft.inventoryUom;

  return (
    <>
      <Section icon="sell" title="Selling unit & price">
        <Fields>
          {f.pick('salesUom', 'Sales UoM', UOMS)}
          {f.num('itemsPerSalesUnit', `${draft.inventoryUom} per ${draft.salesUom}`, {
            required: converts,
            error: errors.itemsPerSalesUnit,
            disabled: !converts,
            hint: converts
              ? `Selling 2 ${draft.salesUom} takes ${2 * (draft.itemsPerSalesUnit || 0)} ${draft.inventoryUom} out of stock.`
              : 'Same as the inventory unit.',
          })}
          {f.num('basePrice', `Base price per ${draft.salesUom}`, {
            prefix: 'PHP',
            hint: 'Default price list. Customer price lists live in Inventory › Pricing.',
          })}
          {f.text('sellingItemNo', 'Selling item no.', { hint: 'Printed on sales documents instead of the Item No.' })}
        </Fields>
      </Section>

      <Section icon="percent" title="Tax & commission">
        <Fields>
          {f.choose('salesTaxGroup', 'Tax group', taxGroupOptions(tax, 'Sales', draft.salesTaxGroup), {
            required: draft.salesItem,
            error: errors.salesTaxGroup,
            hint: draft.taxLiable
              ? taxResolution(tax, draft.salesTaxGroup, draft.salesTaxCode)
              : 'Not tax liable (General tab): no tax is charged on sales.',
          })}
          {f.choose('salesTaxCode', 'Fixed sales tax code', taxCodeOptions(tax, 'Sales', draft.salesTaxCode), {
            hint: 'Overrides the tax group on every sale.',
          })}
          {f.pick('commissionGroup', 'Commission group', COMMISSION_GROUPS)}
          {f.num('commissionPct', 'Commission', { suffix: '%', hint: 'Per item; overrides the salesperson rate.' })}
        </Fields>
      </Section>

      <Section icon="local_shipping" title="Fulfillment">
        <Fields>
          {f.num('salesLeadTimeDays', 'Lead time', { suffix: 'days', hint: 'Sets the promised delivery date on orders.' })}
          {f.pick('shippingType', 'Shipping type', SHIPPING_TYPES)}
          {f.pick('warrantyTemplate', 'Warranty template', WARRANTY_TEMPLATES, {
            hint: draft.manageBy === 'Serial Numbers' ? 'Assigned to each serial number sold.' : 'Used with serial-numbered items.',
          })}
        </Fields>
      </Section>
    </>
  );
}
