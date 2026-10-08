import { Fields, Section, bind } from '../../../../components/form/fields';
import { PurchaseHistory } from './PurchaseHistory';
import { groupTaxNote, taxCodeOptions, taxGroupOptions, taxResolution, unitOptions, withholdingGroupOptions, type TabProps } from './types';

export function PurchasingTab({ draft, update, errors, tax, inv }: TabProps) {
  const f = bind(draft, update);

  return (
    <>
      <Section icon="inventory" title="Purchasing unit">
        <Fields>
          {f.choose('purchasingUom', 'Default purchasing UoM', unitOptions(draft, 'purchase'), {
            error: errors.purchasingUom,
            hint: 'Pre-fills purchase orders. Add units, their conversions and sizes on the Units of measure tab.',
          })}
        </Fields>
      </Section>

      <Section icon="receipt_long" title="Import & tax">
        <Fields>
          {f.num('dutyPct', 'Duty', { suffix: '%', hint: 'Used in landed cost.' })}
          {f.lookup('purchaseTaxGroup', 'Tax group', taxGroupOptions(tax, 'Purchase', draft.purchaseTaxGroup), {
            required: draft.purchaseItem,
            error: errors.purchaseTaxGroup,
            hint: taxResolution(tax, draft.purchaseTaxGroup, draft.purchaseTaxCode) + groupTaxNote(inv, draft, 'purchaseTaxGroup'),
          })}
          {f.lookup('purchaseTaxCode', 'Fixed purchasing tax code', taxCodeOptions(tax, 'Purchase', draft.purchaseTaxCode), {
            hint: 'Overrides the tax group on every purchase.',
          })}
          {f.lookup('withholdingGroup', 'Withholding group', withholdingGroupOptions(tax, draft.withholdingGroup), {
            hint: (() => {
              const g = tax.withholdingGroups.find((x) => x.code === draft.withholdingGroup);
              if (!g) return 'Pick a withholding group.';
              if (!g.atcIndividual && !g.atcCorporate) return 'Not subject to withholding.';
              if (g.requiresTopWA) return `Top withholding agents withhold when paying for this (${g.atcCorporate ?? g.atcIndividual}).`;
              return `Withholding applies: ${g.atcIndividual ?? '—'} (individual) / ${g.atcCorporate ?? '—'} (corporate).`;
            })() + groupTaxNote(inv, draft, 'withholdingGroup'),
          })}
        </Fields>
      </Section>

      <PurchaseHistory draft={draft} />
    </>
  );
}
