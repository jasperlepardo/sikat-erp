/** Settings › Sales & CRM, Banking, Company and People: the lists the business partner and employee forms pick from. */
import { MasterDefList, type MasterDef, type MasterRow } from '../../components/form/MasterLookup';
import type { ListRoute } from '../../components/form/MasterList';
import { TabbedPage, type PageTab } from '../../components/form/TabbedPage';
import { CompaniesTab } from './company/CompanyTab';
import { SalesDocSeriesTab } from './sales/SalesDocSeriesTab';
import { SalesSettingsTab } from './sales/SalesSettingsTab';
import * as d from './masterDefs';

const tab = <T extends MasterRow>(value: string, def: MasterDef<T>): PageTab => ({
  value,
  label: def.title,
  description: typeof def.description === 'string' ? def.description : undefined,
  Component: (route: ListRoute) => <MasterDefList def={def} {...route} />,
});

const SALES_TABS = [
  { value: 'document-series', label: 'Document series', Component: SalesDocSeriesTab },
  { value: 'settings', label: 'Sales settings', Component: SalesSettingsTab },
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
  tab('house-bank-accounts', d.houseBankAccountDef),
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
  tab('branches', d.branchDef),
  tab('cost-centers', d.costCenterDef),
  tab('distribution-rules', d.distributionRuleDef),
  tab('users', d.userDef),
];

const PEOPLE_TABS = [
  tab('positions', d.positionDef),
  tab('departments', d.departmentDef),
  tab('employee-roles', d.employeeRoleDef),
  tab('teams', d.teamDef),
  tab('employee-statuses', d.employeeStatusDef),
  tab('termination-reasons', d.terminationReasonDef),
];

export function SalesCrmSettingsPage() {
  return (
    <TabbedPage
      base="/settings/sales-and-crm"
      icon="handshake"
      title="Sales & CRM"
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
      tabs={COMPANY_TABS}
    />
  );
}

export function PeopleSettingsPage() {
  return (
    <TabbedPage
      base="/settings/people"
      icon="group"
      title="People"
      tabs={PEOPLE_TABS}
    />
  );
}
