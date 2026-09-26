import { Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import {
  COGS_ACCOUNTS,
  COUNTRIES_OF_ORIGIN,
  CUSTOMS_GROUPS,
  GL_BY,
  INVENTORY_ACCOUNTS,
  ITEM_GROUPS,
  REVENUE_ACCOUNTS,
  VALUATION_METHODS,
} from '../../../../mocks/itemMasters';
import { isValidToday } from '../../../../services/items';
import { LOCKED_HINT, type TabProps } from './types';

export function GeneralTab({ draft, update, errors }: TabProps) {
  const f = bind(draft, update);
  const service = draft.itemType !== 'Items';
  const group = ITEM_GROUPS.find((g) => g.name === draft.itemGroup);
  const valuationLocked = draft.hasTransactions && draft.inventoryItem;

  return (
    <>
      <Section icon="tune" title="Usage">
        <Text variant="small" tone="muted">
          Where the item can be used. Tick at least one of purchase, sales or inventory.
        </Text>
        <Flags>
          {f.check('purchaseItem', 'Purchase item')}
          {f.check('salesItem', 'Sales item')}
          {f.check('inventoryItem', 'Inventory item', { disabled: service })}
          {f.check('fixedAsset', 'Fixed asset item')}
        </Flags>
        {errors.usage ? (
          <Text variant="small" tone="danger">
            {errors.usage}
          </Text>
        ) : service ? (
          <Text variant="small" tone="muted">
            {draft.itemType} items are never stocked, so Inventory item is off.
          </Text>
        ) : draft.fixedAsset ? (
          <Text variant="small" tone="muted">
            Purchases capitalize to Accounting › Fixed Assets instead of posting to expense.
          </Text>
        ) : null}
      </Section>

      <Section icon="calculate" title="Valuation & G/L accounts">
        <Fields>
          {f.pick('valuationMethod', 'Valuation method', VALUATION_METHODS, {
            required: true,
            disabled: valuationLocked,
            hint: valuationLocked ? LOCKED_HINT : `Defaults from the ${draft.itemGroup} group.`,
          })}
          {f.pick('glBy', 'Set G/L accounts by', GL_BY, {
            required: true,
            hint: 'Item Group is recommended. Changes don’t touch posted entries.',
          })}
          {draft.glBy === 'Item Level' ? (
            <>
              {f.pick('inventoryAccount', 'Inventory account', INVENTORY_ACCOUNTS)}
              {f.pick('cogsAccount', 'Cost of goods sold account', COGS_ACCOUNTS)}
              {f.pick('revenueAccount', 'Revenue account', REVENUE_ACCOUNTS)}
            </>
          ) : draft.glBy === 'Item Group' ? (
            <>
              <ReadOnly label="Inventory account" value={group?.inventoryAccount ?? '—'} hint="From the item group." />
              <ReadOnly label="Cost of goods sold account" value={group?.cogsAccount ?? '—'} hint="From the item group." />
              <ReadOnly label="Revenue account" value={group?.revenueAccount ?? '—'} hint="From the item group." />
            </>
          ) : (
            <ReadOnly label="G/L accounts" value="Taken from each warehouse's account settings." />
          )}
        </Fields>
      </Section>

      <Section icon="public" title="Trade & tax">
        <Fields>
          {f.pick('countryOfOrigin', 'Country of origin', COUNTRIES_OF_ORIGIN)}
          {f.choose(
            'customsGroup',
            'Customs group',
            CUSTOMS_GROUPS.map((c) => ({ value: c.name, label: c.duty ? `${c.name} · ${c.duty}% duty` : c.name })),
            { hint: 'Sets the default duty % on the Purchasing tab.' },
          )}
          {f.text('gtin', 'GTIN / UPC code', {
            hint: 'For items in several packaging units, add per-unit codes on the Barcodes tab.',
          })}
        </Fields>
        <Flags>
          {f.check('taxLiable', 'Tax liable (VAT applies on sales)')}
          {f.check('exciseTax', 'Excise tax (fuel, alcohol, tobacco, sweetened drinks)')}
        </Flags>
      </Section>

      <Section icon="event_available" title="Validity">
        <Fields>
          {f.date('validFrom', 'Valid from', { hint: 'Blocks documents dated before this.' })}
          {f.date('validTo', 'Valid to', { error: errors.validTo, hint: 'Phases the item out without deleting it.' })}
          {f.area('generalRemarks', 'Remarks', {
            rows: 2,
            className: 'md:col-span-2',
            hint: 'Shown to everyone who opens the item. Not printed.',
          })}
        </Fields>
        {!isValidToday(draft) ? (
          <Text variant="small" tone="danger">
            This item can’t be used on documents dated today.
          </Text>
        ) : null}
      </Section>
    </>
  );
}
