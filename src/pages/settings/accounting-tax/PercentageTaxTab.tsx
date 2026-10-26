import type { ListRoute } from '../../../components/form/MasterList';
import { percentageAtcs } from '../../../services/masterData';
import { AtcCatalogTab } from './AtcCatalogTab';

/**
 * The BIR percentage tax ATCs (Form 2551Q), keyed by the nature of business / NIRC section: the
 * master list a percentage tax code's "BIR ATC" is picked from. Seeded from RMO 57-2022 Schedule 4.
 */
export function PercentageTaxTab(route: ListRoute) {
  return (
    <AtcCatalogTab
      route={route}
      collection={percentageAtcs}
      icon="percent"
      title="Percentage tax ATCs"
      noun="percentage tax ATC"
      placeholder="e.g. PT010"
      description="BIR percentage tax Alphanumeric Tax Codes (Form 2551Q), keyed by the nature of business / NIRC section, seeded from RMO 57-2022 Schedule 4. Percentage tax applies to non-VAT persons and specific businesses (carriers, franchises, amusement…). Percentage tax codes pick their ATC from this list; the company's code is set in Settings › Company."
    />
  );
}
