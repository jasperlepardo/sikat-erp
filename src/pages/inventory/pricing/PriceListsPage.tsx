import { MasterDefList } from '../../../components/form/MasterLookup';
import type { ListRoute } from '../../../components/form/MasterList';
import { TabbedPage } from '../../../components/form/TabbedPage';
import { priceListDef } from '../../settings/masterDefs';
import { DiscountGroupsTab } from './DiscountGroupsTab';
import { PeriodVolumeDiscountsTab } from './PeriodVolumeDiscountsTab';
import { SpecialPricesTab } from './SpecialPricesTab';

const TABS = [
  { value: 'price-lists', label: 'Price lists', Component: (route: ListRoute) => <MasterDefList def={priceListDef} {...route} /> },
  { value: 'special-prices', label: 'Special prices', Component: SpecialPricesTab },
  { value: 'period-and-volume-discounts', label: 'Period & volume discounts', Component: PeriodVolumeDiscountsTab },
  { value: 'discount-groups', label: 'Discount groups', Component: DiscountGroupsTab },
];

/**
 * Inventory › Price Lists. A document line takes the first rule that matches — special price,
 * period/volume discount, discount group — else the price list price. No journal entry until a
 * document posts.
 */
export function PriceListsPage() {
  return (
    <TabbedPage
      base="/inventory/price-lists"
      icon="sell"
      title="Price Lists"
      subcopy="Price tiers assigned to partners, and the rules on top of them. A document line takes the first match: special price, then period or volume discount, then discount group."
      tabs={TABS}
    />
  );
}
