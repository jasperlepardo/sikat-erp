import { Button } from '@jasperlepardo/sikat-design-system';
import { Fields, Section, bind } from '../../../../components/form/fields';
import { MANUFACTURERS, UOMS } from '../../../../mocks/itemMasters';
import { taxCodeOptions, taxGroupOptions, taxResolution, vendorOptions, type TabProps } from './types';

export function PurchasingTab({ draft, update, errors, vendors, tax }: TabProps) {
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
            MANUFACTURERS.map((m) => ({ value: m.code, label: m.name ? `${m.code} · ${m.name}` : m.code })),
            { hint: 'Who makes it — not necessarily who you buy from.' },
          )}
          {f.text('vendorItemNo', 'Purchasing item no.', { hint: "The vendor's part number, for matching their invoices." })}
        </Fields>
      </Section>

      <Section icon="inventory" title="Purchasing unit">
        <Fields>
          {f.pick('purchasingUom', 'Purchasing UoM', UOMS)}
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
        </Fields>
      </Section>

      <Section
        icon="straighten"
        title={`Dimensions & packaging · per ${draft.purchasingUom}`}
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
          {f.num('length', 'Length', { suffix: 'cm' })}
          {f.num('width', 'Width', { suffix: 'cm' })}
          {f.num('height', 'Height', { suffix: 'cm' })}
          {f.num('volume', 'Volume', { suffix: 'cm³' })}
          {f.num('netWeight', 'Net weight', { suffix: 'kg', hint: 'Without packaging.' })}
          {f.num('grossWeight', 'Gross weight', { suffix: 'kg', hint: 'With packaging.' })}
          {f.num('itemsPerPackage', 'Items per package')}
          {f.num('packagesPerPallet', 'Packages per pallet')}
        </Fields>
      </Section>
    </>
  );
}
