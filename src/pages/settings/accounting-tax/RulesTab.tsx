import { Text } from '@jasperlepardo/sikat-design-system';
import { Section } from '../../../components/form/fields';

const SALES_RULES = [
  'Company is not VAT-registered → PT010 Percentage Tax on every sale',
  'Item is not tax liable → no tax',
  'Item has a fixed sales tax code → that code',
  'Customer: Government → 31 Output VAT (buyer withholds 5%) · Zero-rated exemption → 32 Zero-Rated Sales · Exempt entity → 33 Exempt Sales. An exemption counts only with a document attached and not expired.',
  'Item sales tax group → its default code',
  'Company default → 31 Output VAT',
];
const PURCHASE_RULES = [
  "Goods from a non-resident supplier → 46 Import VAT (49 Exempt Importations if the item isn't subject to VAT)",
  'Services or property lease from a non-resident → 45 Withholding VAT: you withhold the 12% and remit on 1600-VT (not for a digital service provider registered with BIR, which charges VAT itself)',
  'Supplier not VAT-registered, or a non-resident → 48 Non-VAT Purchases',
  'Item has a fixed purchasing tax code → that code',
  'Item purchase tax group → its default code (a zero-rated group only if the company is a registered export enterprise)',
  'Company default → 44 Input VAT',
];
const WITHHOLDING_RULES = [
  'Government payee → no withholding',
  "Income tier (EWT only): ATCs marked 'low tier' require the vendor's current-year sworn declaration with document attached; 'high tier' applies when none is on file. VAT-registered individuals always get the high tier.",
  'Non-resident services → Withholding VAT: WV050 lease / WV070 other services (WV040 / WV060 for a government company)',
  'Government company → WV010 / WV020 5% VAT on VAT-registered suppliers, WB080 3% on non-VAT suppliers',
  "Vendor override → that withholding tax (if the ATC has an income tier, the correct low/high sibling is selected based on the vendor's sworn declaration)",
  "Item withholding group → its ATC. Non-residents: final tax (none on goods), the group's own ATC or WC230 / WI330 at 25%, lowered to the treaty rate when the treaty income and Certificate of Residence are on file",
  'Goods and services groups (1% / 2%) apply only for top withholding agents and government companies, which use WI640 / WC640 and WI157 / WC157',
  "WI for individuals and sole proprietors, WC for everyone else (from the partner's type of business)",
];

/** Explains the tax determination rule order. */
export function RulesTab() {
  return (
    <Section icon="rule" title="How a tax code is chosen">
      <Text variant="small" tone="muted">
        For each document line the rules run top to bottom and the first match wins, so a special status on the
        company or partner beats the item's default.
      </Text>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Sales (output VAT)', SALES_RULES],
          ['Purchases (input VAT)', PURCHASE_RULES],
          ['Withholding on purchases', WITHHOLDING_RULES],
        ].map(([title, rules]) => (
          <div key={title as string}>
            <Text variant="small" weight="semibold" tone="heading" className="mb-2">{title}</Text>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-body">
              {(rules as string[]).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Section>
  );
}
