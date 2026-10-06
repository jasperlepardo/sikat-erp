import { TabbedPage, type PageTab } from '../../../components/form/TabbedPage';
import { CompensationTaxTab } from './CompensationTaxTab';
import { CurrenciesTab } from './CurrenciesTab';
import { DeMinimisTab } from './DeMinimisTab';
import { ExchangeRatesTab } from './ExchangeRatesTab';
import { ExciseTab } from './ExciseTab';
import { ExclusionsTab } from './ExclusionsTab';
import { TaxCodesTab } from './TaxCodesTab';
import { TaxGroupsTab } from './TaxGroupsTab';
import { WithholdingFormsTab } from './WithholdingFormsTab';
import { WithholdingGroupsTab } from './WithholdingGroupsTab';
import { WithholdingTab } from './WithholdingTab';

const TABS: PageTab[] = [
  { value: 'tax-codes', label: 'Tax codes', Component: TaxCodesTab },
  { value: 'tax-groups', label: 'Tax groups', Component: TaxGroupsTab },
  { value: 'withholding', label: 'Withholding tax', Component: WithholdingTab },
  { value: 'withholding-groups', label: 'Withholding groups', Component: WithholdingGroupsTab },
  { value: 'compensation', label: 'Compensation tax', Component: CompensationTaxTab },
  { value: 'tax-free-compensation', label: 'Tax-free compensation', Component: ExclusionsTab },
  { value: 'de-minimis', label: 'De minimis benefits', Component: DeMinimisTab },
  { value: 'withholding-forms', label: 'Withholding forms', Component: WithholdingFormsTab },
  { value: 'excise', label: 'Excise tax', Component: ExciseTab },
  { value: 'currencies', label: 'Currencies', Component: CurrenciesTab },
  { value: 'exchange-rates', label: 'Exchange rates', Component: ExchangeRatesTab },
];

/** Settings › Accounting & Tax: Philippine tax set-up, currencies and exchange rates. */
export function AccountingTaxPage() {
  return (
    <TabbedPage
      base="/settings/accounting-and-tax"
      icon="account_balance"
      title="Accounting & Tax"
      subcopy="Philippine VAT, percentage, withholding, compensation and excise taxes; currencies and BSP exchange rates."
      tabs={TABS}
    />
  );
}
