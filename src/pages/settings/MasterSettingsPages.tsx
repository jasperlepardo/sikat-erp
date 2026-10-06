/** Settings › Sales & CRM, Banking and Company: the lists the business partner form picks from. */
import { MasterDefList, type MasterDef, type MasterRow } from '../../components/form/MasterLookup';
import type { ListRoute } from '../../components/form/MasterList';
import { TabbedPage, type PageTab } from '../../components/form/TabbedPage';
import { CompaniesTab } from './company/CompanyTab';
import * as d from './masterDefs';

const tab = <T extends MasterRow>(value: string, def: MasterDef<T>): PageTab => ({
  value,
  label: def.title,
  description: typeof def.description === 'string' ? def.description : undefined,
  Component: (route: ListRoute) => <MasterDefList def={def} {...route} />,
});

const SALES_TABS = [
  tab('partner-groups', d.bpGroupDef),
  tab('industries', d.industryDef),
  tab('sales-employees', d.salesEmployeeDef),
  tab('territories', d.territoryDef),
  tab('channels', d.channelDef),
  tab('lead-sources', d.leadSourceDef),
  tab('email-groups', d.emailGroupDef),
  tab('partner-properties', d.partnerPropertyDef),
];

const BANKING_TABS = [
  tab('payment-terms', d.paymentTermDef),
  tab('dunning-terms', d.dunningTermDef),
  tab('holidays', d.holidayCalendarDef),
  tab('banks', d.bankDef),
  tab('bank-charges', d.bankChargeCodeDef),
  tab('card-brands', d.cardBrandDef),
  tab('factoring', d.factoringCompanyDef),
];

const COMPANY_TABS = [
  { value: 'companies', label: 'Companies', Component: CompaniesTab },
  tab('projects', d.projectDef),
  tab('technicians', d.technicianDef),
  tab('planning-groups', d.planningGroupDef),
  tab('countries', d.countryDef),
];

export function SalesCrmSettingsPage() {
  return (
    <TabbedPage
      base="/settings/sales-and-crm"
      icon="handshake"
      title="Sales & CRM"
      subcopy="Partner groups, industries, sales employees, territories, channels, lead sources, e-mail groups and partner properties."
      tabs={SALES_TABS}
    />
  );
}

export function BankingSettingsPage() {
  return (
    <TabbedPage
      base="/settings/banking"
      icon="savings"
      title="Banking"
      subcopy="Payment terms, dunning terms, holiday calendars, banks, bank charges, card brands and factoring companies."
      tabs={BANKING_TABS}
    />
  );
}

export function CompanySettingsPage() {
  return (
    <TabbedPage
      base="/settings/company"
      icon="domain"
      title="Company"
      subcopy="Our companies and their addresses, projects, technicians, planning groups and countries."
      tabs={COMPANY_TABS}
    />
  );
}
