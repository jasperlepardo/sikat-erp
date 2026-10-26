import type { ListRoute } from '../../../components/form/MasterList';
import { vatAtcs } from '../../../services/masterData';
import { AtcCatalogTab } from './AtcCatalogTab';

/**
 * The BIR output and import VAT ATCs (eFPS / 2550Q), keyed by nature of sale and industry: the
 * master list a tax code's "BIR ATC" is picked from (Tax codes tab). Seeded from RMO 57-2022.
 */
export function VatAtcsTab(route: ListRoute) {
  return (
    <AtcCatalogTab
      route={route}
      collection={vatAtcs}
      icon="receipt"
      title="Value-added tax ATCs"
      noun="VAT ATC"
      placeholder="e.g. VT010"
      description="BIR output and import VAT Alphanumeric Tax Codes, keyed by the nature of sale / industry (PSIC), seeded from RMO 57-2022 Schedule 3. Tax codes pick their ATC from this list, and documents file under it on the 2550Q and SLSP. Output VAT uses the code for the business's activity (this reseller: VT010 wholesale & retail). Withholding VAT (WV codes) is on the Withholding tax tab."
    />
  );
}
