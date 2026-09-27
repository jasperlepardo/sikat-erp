import { Button } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { volumeUnit } from '../../../../mocks/itemMasters';
import { activeOptions } from '../../../../services/inventoryMasters';
import { WITHHOLDING_CATEGORIES } from '../../../../mocks/taxes';
import { taxCodeOptions, taxGroupOptions, taxResolution, vendorOptions, type TabProps } from './types';

export function PurchasingTab({ draft, update, errors, vendors, tax, inv }: TabProps) {
  const { lengthUnit, weightUnit } = inv.settings;
  const uomCodes = activeOptions(inv.uoms, (u) => u.code, (u) => `${u.code} · ${u.name}`, draft.purchasingUom);
  const f = bind(draft, update);
  const converts = draft.purchasingUom !== draft.inventoryUom;
  const volume = Math.round(draft.length * draft.width * draft.height * 100) / 100;

  return (
    <>
      <Section icon="storefront" title="Sourcing">
        <Fields>
          {f.choose('defaultVendorId', 'Default vendor', vendorOptions(vendors), {
            hint: 'Pre-fills new purchase orders.',
          })}
          {f.choose(
            'manufacturer',
            'Manufacturer',
            activeOptions(inv.manufacturers, (m) => m.code, (m) => `${m.code} · ${m.name}`, draft.manufacturer, '— None —'),
            { hint: 'Who makes it — not necessarily who you buy from. Also the main row on the Manufacturers tab.' },
          )}
          {f.text('vendorItemNo', 'Purchasing item no.', { hint: "The vendor's part number, for matching their invoices." })}
        </Fields>
      </Section>

      <Section icon="inventory" title="Purchasing unit">
        <Fields>
          {f.choose('purchasingUom', 'Purchasing UoM', uomCodes)}
          {f.num('itemsPerPurchaseUnit', `${draft.inventoryUom} per ${draft.purchasingUom}`, {
            required: converts,
            error: errors.itemsPerPurchaseUnit,
            disabled: !converts,
            hint: converts
              ? `Buying 5 ${draft.purchasingUom} adds ${5 * (draft.itemsPerPurchaseUnit || 0)} ${draft.inventoryUom} to stock.`
              : 'Same as the inventory unit.',
          })}
        </Fields>
      </Section>

      <Section icon="receipt_long" title="Import & tax">
        <Fields>
          {f.num('dutyPct', 'Duty', { suffix: '%', hint: 'Used in landed cost.' })}
          {f.choose('purchaseTaxGroup', 'Tax group', taxGroupOptions(tax, 'Purchase', draft.purchaseTaxGroup), {
            required: draft.purchaseItem,
            error: errors.purchaseTaxGroup,
            hint: taxResolution(tax, draft.purchaseTaxGroup, draft.purchaseTaxCode),
          })}
          {f.choose('purchaseTaxCode', 'Fixed purchasing tax code', taxCodeOptions(tax, 'Purchase', draft.purchaseTaxCode), {
            hint: 'Overrides the tax group on every purchase.',
          })}
          {f.pick('withholdingCategory', 'Withholding category', WITHHOLDING_CATEGORIES, {
            hint:
              draft.withholdingCategory === 'Goods' || draft.withholdingCategory === 'Services'
                ? `Top withholding agents withhold ${draft.withholdingCategory === 'Goods' ? '1% (W?158)' : '2% (W?160)'} when paying for this.`
                : draft.withholdingCategory === 'None'
                  ? 'Never withheld.'
                  : `Withheld as ${draft.withholdingCategory.toLowerCase()} whatever the company status.`,
          })}
        </Fields>
      </Section>

      <Section
        icon="straighten"
        title={`Dimensions & packaging · per ${draft.purchasingUom} · ${lengthUnit} / ${weightUnit}`}
        actions={
          <Button
            type="button"
            size="small"
            variant="ghost"
            disabled={!volume}
            onClick={() => update({ volume })}
          >
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
  );
}
