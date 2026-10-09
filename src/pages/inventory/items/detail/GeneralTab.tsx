import { Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { AccountField } from '../../../../components/form/AccountField';
import { accountText } from '../../../../mocks/chartOfAccounts';
import { GL_BY, ISSUE_METHODS, VALUATION_METHODS } from '../../../../mocks/itemMasters';
import { countryDef } from '../../../settings/masterDefs';
import { activeOptions } from '../../../../services/inventoryMasters';
import { isValidToday } from '../../../../services/items';
import { LOCKED_HINT, groupTaxNote, type TabProps } from './types';

export function GeneralTab({ draft, update, errors, tax, inv }: TabProps) {
  const f = bind(draft, update);
  const service = draft.itemType !== 'Items';
  const group = inv.groups.find((g) => g.id === draft.itemGroupId);
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
            hint: valuationLocked ? LOCKED_HINT : `Defaults from the ${group?.name ?? draft.itemGroupId} group.`,
          })}
          {f.pick('glBy', 'Set G/L accounts by', GL_BY, {
            required: true,
            hint: 'Item Group is recommended. Changes don’t touch posted entries.',
          })}
          {draft.glBy === 'Item Level' ? (
            <>
              <AccountField
                label="Inventory account"
                role="inventory"
                accounts={inv.accounts}
                allowNone={!draft.inventoryItem}
                required={draft.inventoryItem}
                error={errors.inventoryAccount}
                value={draft.inventoryAccount}
                onChange={(inventoryAccount) => update({ inventoryAccount })}
              />
              <AccountField
                label="Cost of goods sold account"
                role="cogs"
                accounts={inv.accounts}
                required
                error={errors.cogsAccount}
                value={draft.cogsAccount}
                onChange={(cogsAccount) => update({ cogsAccount })}
              />
              <AccountField
                label="Revenue account"
                role="revenue"
                accounts={inv.accounts}
                required={draft.salesItem}
                error={errors.revenueAccount}
                value={draft.revenueAccount}
                onChange={(revenueAccount) => update({ revenueAccount })}
              />
            </>
          ) : draft.glBy === 'Item Group' ? (
            <>
              <ReadOnly label="Inventory account" value={accountText(group?.inventoryAccount ?? '', inv.accounts)} hint="From the item group." />
              <ReadOnly label="Cost of goods sold account" value={accountText(group?.cogsAccount ?? '', inv.accounts)} hint="From the item group." />
              <ReadOnly label="Revenue account" value={accountText(group?.revenueAccount ?? '', inv.accounts)} hint="From the item group." />
            </>
          ) : (
            <ReadOnly label="G/L accounts" value="Taken from each warehouse's account settings." />
          )}
        </Fields>
      </Section>

      <Section icon="public" title="Trade & tax">
        <Fields>
          {f.master('countryOfOriginCode', 'Country of origin', countryDef, { clearable: true })}
          {f.lookup(
            'customsGroup',
            'Customs group',
            activeOptions(
              inv.customs,
              (c) => c.id,
              (c) => `${c.name} (HS ${c.hsCode}) · ${c.duty}% duty`,
              draft.customsGroup,
              '— None —',
            ),
            { hint: 'Sets the default duty % on the Purchasing tab.' },
          )}
          {f.text('gtin', 'GTIN / UPC code', {
            hint: 'For items in several packaging units, add per-unit codes on the Barcodes tab.',
          })}
        </Fields>
        <Flags>
          {f.check('taxLiable', 'Tax liable (VAT applies on sales)')}
          {f.check('exciseTax', 'Excise tax (fuel, alcohol, tobacco, sweetened drinks…)')}
        </Flags>
        {draft.exciseTax ? (
          <Fields>
            {f.lookup(
              'exciseCategory',
              'Excise category',
              tax.excise
                .filter((x) => x.active || x.code === draft.exciseCategory)
                .map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` })),
              {
                required: true,
                error: errors.exciseCategory,
                placeholder: 'Pick a category',
                hint: (() => {
                  const x = tax.excise.find((e) => e.code === draft.exciseCategory);
                  return x ? `${x.basis}${x.rates.length ? '' : ' — rate not set, update it in Settings › Accounting & Tax'}` : 'Rates are kept in Settings › Accounting & Tax.';
                })() + groupTaxNote(inv, draft, 'exciseCategory'),
              },
            )}
          </Fields>
        ) : null}
      </Section>

      <Section icon="precision_manufacturing" title="Production">
        <Fields>
          {f.pick('issueMethod', 'Issue method', ISSUE_METHODS, {
            required: true,
            hint: 'Manual: staff post the issue. Backflush: issued automatically on the production receipt. Same setting as the Production data tab.',
          })}
        </Fields>
        <Flags>{f.check('phantom', 'Phantom item (never stocked; its BOM explodes into the parent)')}</Flags>
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
