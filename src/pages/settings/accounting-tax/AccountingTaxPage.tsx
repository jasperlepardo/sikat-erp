import { useState } from 'react';
import { Panel, PanelHeader, Tabs } from '@jasperlepardo/sikat-design-system';
import { CurrenciesTab } from './CurrenciesTab';
import { ExchangeRatesTab } from './ExchangeRatesTab';
import { ExciseTab } from './ExciseTab';
import { TaxCodesTab } from './TaxCodesTab';
import { TaxGroupsTab } from './TaxGroupsTab';
import { WithholdingTab } from './WithholdingTab';

const TABS = [
  { value: 'tax-codes', label: 'Tax codes', Component: TaxCodesTab },
  { value: 'tax-groups', label: 'Tax groups', Component: TaxGroupsTab },
  { value: 'withholding', label: 'Withholding tax', Component: WithholdingTab },
  { value: 'excise', label: 'Excise tax', Component: ExciseTab },
  { value: 'currencies', label: 'Currencies', Component: CurrenciesTab },
  { value: 'exchange-rates', label: 'Exchange rates', Component: ExchangeRatesTab },
] as const;

/** Settings › Accounting & Tax: Philippine tax set-up, currencies and exchange rates. */
export function AccountingTaxPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('tax-codes');
  const Active = TABS.find((t) => t.value === tab)!.Component;
  return (
    <Panel className="flex-1">
      <PanelHeader
        icon="account_balance"
        title="Accounting & Tax"
        subcopy="Philippine VAT, percentage, withholding and excise taxes; currencies and BSP exchange rates."
        tabs={
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as typeof tab)}
            items={TABS.map((t) => ({ value: t.value, label: t.label }))}
          />
        }
      />
      <Panel.Body className="flex flex-col gap-2">
        <Active />
      </Panel.Body>
    </Panel>
  );
}
