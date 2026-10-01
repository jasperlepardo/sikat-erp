import { Button, Text } from '@jasperlepardo/sikat-design-system';
import { Fields, Flags, ReadOnly, Section, bind } from '../../../../components/form/fields';
import { AccountField, useAccounts } from '../../../../components/form/AccountField';
import {
  GL_BY,
  ISSUE_METHODS,
  VALUATION_METHODS,
  volumeUnit,
} from '../../../../mocks/itemMasters';
import { COUNTRIES } from '../../../../mocks/masters';
import { activeOptions } from '../../../../services/inventoryMasters';
import {
  LOCKED_HINT,
  taxCodeOptions,
  taxGroupOptions,
  taxResolution,
  vendorOptions,
  withholdingGroupOptions,
  type TabProps,
} from './types';

export type ConfigurePanelTab = 'accounting' | 'tax' | 'purchasing' | 'sales';

export function ConfigureTab({ draft, update, errors, vendors, tax, inv, activeTab }: TabProps & { activeTab?: ConfigurePanelTab }) {
  const f = bind(draft, update);
  const allAccounts = useAccounts();
  const { lengthUnit, weightUnit } = inv.settings;
  const service = draft.itemType !== 'Items';
  const group = inv.groups.find((g) => g.name === draft.itemGroup);
  const valuationLocked = draft.hasTransactions && draft.inventoryItem;
  const convertsPurchase = draft.purchasingUom !== draft.inventoryUom;
  const convertsSales = draft.salesUom !== draft.inventoryUom;
  const volume = Math.round(draft.length * draft.width * draft.height * 100) / 100;

  const show = (t: ConfigurePanelTab) => !activeTab || activeTab === t;

  return (
    <>
      {/* ── Accounting tab: Usage + Accounting & valuation ── */}
      {show('accounting') && (
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
              <Text variant="small" tone="danger">{errors.usage}</Text>
            ) : service ? (
              <Text variant="small" tone="muted">{draft.itemType} items are never stocked, so Inventory item is off.</Text>
            ) : draft.fixedAsset ? (
              <Text variant="small" tone="muted">Purchases capitalize to Accounting › Fixed Assets instead of posting to expense.</Text>
            ) : null}
          </Section>

          <Section icon="calculate" title="Accounting & valuation">
            <Fields>
              {f.pick('valuationMethod', 'Valuation method', VALUATION_METHODS, {
                required: true,
                disabled: valuationLocked,
                hint: valuationLocked ? LOCKED_HINT : `Defaults from the ${draft.itemGroup} group.`,
              })}
              {f.pick('glBy', 'Set G/L accounts by', GL_BY, {
                required: true,
                hint: "Item Group is recommended. Changes don't touch posted entries.",
              })}
              {draft.glBy === 'Item Level' ? (
                <>
                  <AccountField label="Inventory account" role="inventory" value={draft.inventoryAccount} onChange={(v) => update({ inventoryAccount: v })} accounts={allAccounts} />
                  <AccountField label="Cost of goods sold account" role="cogs" value={draft.cogsAccount} onChange={(v) => update({ cogsAccount: v })} accounts={allAccounts} />
                  <AccountField label="Revenue account" role="revenue" value={draft.revenueAccount} onChange={(v) => update({ revenueAccount: v })} accounts={allAccounts} />
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
              {f.lookup('withholdingGroup', 'Withholding group', withholdingGroupOptions(tax, draft.withholdingGroup), {
                hint: (() => {
                  const g = tax.withholdingGroups.find((x) => x.code === draft.withholdingGroup);
                  if (!g) return 'Pick a withholding group.';
                  if (!g.atcIndividual && !g.atcCorporate) return 'Not subject to withholding.';
                  if (g.requiresTopWA) return `Top withholding agents withhold when paying for this (${g.atcCorporate ?? g.atcIndividual}).`;
                  return `Withholding applies: ${g.atcIndividual ?? '—'} (individual) / ${g.atcCorporate ?? '—'} (corporate).`;
                })(),
              })}
            </Fields>
          </Section>
        </>
      )}

      {/* ── Tax tab ── */}
      {show('tax') && (
        <Section icon="receipt_long" title="Tax">
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
                    return x
                      ? `${x.basis}: ${x.rate || 'rate not set — update it in Settings › Accounting & Tax'}`
                      : 'Rates are kept in Settings › Accounting & Tax.';
                  })(),
                },
              )}
            </Fields>
          ) : null}
          <Fields>
            {f.lookup('salesTaxGroup', 'Sales tax group', taxGroupOptions(tax, 'Sales', draft.salesTaxGroup), {
              required: draft.salesItem,
              error: errors.salesTaxGroup,
              hint: draft.taxLiable
                ? taxResolution(tax, draft.salesTaxGroup, draft.salesTaxCode)
                : 'Not tax liable: no VAT charged on sales.',
            })}
            {f.lookup('salesTaxCode', 'Fixed sales tax code', taxCodeOptions(tax, 'Sales', draft.salesTaxCode), {
              hint: 'Overrides the sales tax group on every sale.',
            })}
            {f.lookup('purchaseTaxGroup', 'Purchase tax group', taxGroupOptions(tax, 'Purchase', draft.purchaseTaxGroup), {
              required: draft.purchaseItem,
              error: errors.purchaseTaxGroup,
              hint: taxResolution(tax, draft.purchaseTaxGroup, draft.purchaseTaxCode),
            })}
            {f.lookup('purchaseTaxCode', 'Fixed purchase tax code', taxCodeOptions(tax, 'Purchase', draft.purchaseTaxCode), {
              hint: 'Overrides the purchase tax group on every purchase.',
            })}
          </Fields>
        </Section>
      )}

      {/* ── Purchasing tab: Purchasing setup + Dimensions ── */}
      {show('purchasing') && (
        <>
          <Section icon="storefront" title="Purchasing setup">
            <Fields>
              {f.lookup('defaultVendorId', 'Default vendor', vendorOptions(vendors), {
                hint: 'Pre-fills new purchase orders.',
              })}
              {f.lookup(
                'manufacturer',
                'Manufacturer',
                activeOptions(inv.manufacturers, (m) => m.code, (m) => `${m.code} · ${m.name}`, draft.manufacturer, '— None —'),
                { hint: 'Who makes it — not necessarily who you buy from.' },
              )}
              {f.text('vendorItemNo', 'Purchasing item no.', { hint: "The vendor's part number, for matching their invoices." })}
              {f.lookup('purchasingUom', 'Purchasing UoM', activeOptions(inv.uoms, (u) => u.code, (u) => `${u.code} · ${u.name}`, draft.purchasingUom))}
              {f.num('itemsPerPurchaseUnit', `${draft.inventoryUom} per ${draft.purchasingUom}`, {
                required: convertsPurchase,
                error: errors.itemsPerPurchaseUnit,
                disabled: !convertsPurchase,
                hint: convertsPurchase
                  ? `Buying 5 ${draft.purchasingUom} adds ${5 * (draft.itemsPerPurchaseUnit || 0)} ${draft.inventoryUom} to stock.`
                  : 'Same as the inventory unit.',
              })}
              {f.choose('countryOfOrigin', 'Country of origin', [
                { value: '', label: '— None —' },
                ...COUNTRIES.map((c) => ({ value: c, label: c })),
              ])}
              {f.lookup(
                'customsGroup',
                'Customs group',
                activeOptions(inv.customs, (c) => c.id, (c) => `${c.name} (HS ${c.hsCode}) · ${c.duty}% duty`, draft.customsGroup, '— None —'),
                { hint: 'Sets the default duty % below.' },
              )}
              {f.num('dutyPct', 'Duty', { suffix: '%', hint: 'Used in landed cost.' })}
              {f.text('gtin', 'GTIN / UPC code', {
                hint: 'For items in several packaging units, add per-unit codes on the Barcodes tab.',
              })}
            </Fields>
          </Section>

          <Section
            icon="straighten"
            title={`Dimensions & packaging · per ${draft.purchasingUom} · ${lengthUnit} / ${weightUnit}`}
            actions={
              <Button type="button" size="small" variant="ghost" disabled={!volume} onClick={() => update({ volume })}>
                Calculate volume
              </Button>
            }
          >
            <Fields cols={3}>
              {f.num('length', 'Length', { suffix: lengthUnit })}
              {f.num('width', 'Width', { suffix: lengthUnit })}
              {f.num('height', 'Height', { suffix: lengthUnit })}
              {f.num('volume', 'Volume', { suffix: volumeUnit(lengthUnit) })}
              {f.num('netWeight', 'Net weight', { suffix: weightUnit, hint: 'Without packaging.' })}
              {f.num('grossWeight', 'Gross weight', { suffix: weightUnit, hint: 'With packaging.' })}
              {f.num('itemsPerPackage', 'Items per package')}
              {f.num('packagesPerPallet', 'Packages per pallet')}
            </Fields>
          </Section>
        </>
      )}

      {/* ── Sales tab: Sales setup + Production + Lifecycle ── */}
      {show('sales') && (
        <>
          <Section icon="sell" title="Sales setup">
            <Fields>
              {f.lookup('salesUom', 'Sales UoM', activeOptions(inv.uoms, (u) => u.code, (u) => `${u.code} · ${u.name}`, draft.salesUom))}
              {f.num('itemsPerSalesUnit', `${draft.inventoryUom} per ${draft.salesUom}`, {
                required: convertsSales,
                error: errors.itemsPerSalesUnit,
                disabled: !convertsSales,
                hint: convertsSales
                  ? `Selling 2 ${draft.salesUom} takes ${2 * (draft.itemsPerSalesUnit || 0)} ${draft.inventoryUom} out of stock.`
                  : 'Same as the inventory unit.',
              })}
              {f.text('sellingItemNo', 'Selling item no.', { hint: 'Printed on sales documents instead of the Item No.' })}
              {f.lookup('shippingType', 'Shipping type', activeOptions(inv.shipping, (x) => x.id, (x) => x.name, draft.shippingType, '— None —'))}
              {f.lookup('warrantyTemplate', 'Warranty template', activeOptions(inv.warranties, (w) => w.id, (w) => `${w.name} · ${w.coverage}`, draft.warrantyTemplate, '— None —'), {
                hint: draft.manageBy === 'Serial Numbers' ? 'Assigned to each serial number sold.' : 'Used with serial-numbered items.',
              })}
              {f.lookup(
                'commissionGroup',
                'Commission group',
                activeOptions(inv.commissions, (c) => c.id, (c) => `${c.name} (${c.pct}%)`, draft.commissionGroup, '— None —'),
                { hint: 'Picking a group sets its commission %.' },
              )}
              {f.num('commissionPct', 'Commission', { suffix: '%', hint: 'Per item; overrides the salesperson rate.' })}
              {f.num('salesLeadTimeDays', 'Lead time', { suffix: 'days', hint: 'Sets the promised delivery date on orders.' })}
            </Fields>
          </Section>

          <Section icon="precision_manufacturing" title="Production">
            <Fields>
              {f.pick('issueMethod', 'Issue method', ISSUE_METHODS, {
                required: true,
                hint:
                  (draft.issueMethod === 'Backflush'
                    ? 'Components issue automatically when the finished good is received.'
                    : 'Staff post an issue for production explicitly.') + ' Same setting as on the Production tab.',
              })}
            </Fields>
            <Flags>
              {f.check('phantom', 'Phantom item (never stocked; its BOM explodes into the parent)')}
            </Flags>
          </Section>

          <Section icon="event_available" title="Lifecycle">
            <Fields>
              {f.date('validFrom', 'Valid from', { hint: 'Blocks documents dated before this.' })}
              {f.date('validTo', 'Valid to', { error: errors.validTo, hint: 'Phases the item out without deleting it.' })}
            </Fields>
          </Section>
        </>
      )}
    </>
  );
}
