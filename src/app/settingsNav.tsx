import { Icon, type SideNavItem, type SideNavSection } from '@jasperlepardo/sikat-design-system';
import { pathOf } from './nav';

const icon = (name: string) => <Icon size={20}>{name}</Icon>;

export const SETTINGS_NAV: SideNavSection[] = [
  {
    id: 'settings-back',
    items: [{ id: 'home', label: 'Main app', icon: icon('arrow_back') }],
  },
  {
    id: 'settings-modules',
    items: [
      {
        id: 'settings/company',
        label: 'Company',
        icon: icon('domain'),
        items: [
          { id: 'settings/company/companies', label: 'Companies' },
          { id: 'settings/company/projects', label: 'Projects' },
          { id: 'settings/company/technicians', label: 'Technicians' },
          { id: 'settings/company/planning-groups', label: 'Planning groups' },
          { id: 'settings/company/countries', label: 'Countries' },
        ],
      },
      {
        id: 'settings/accounting-and-tax',
        label: 'Accounting & Tax',
        icon: icon('account_balance'),
        items: [
          { id: 'settings/accounting-and-tax/tax-codes', label: 'Tax codes' },
          { id: 'settings/accounting-and-tax/tax-groups', label: 'Tax groups' },
          { id: 'settings/accounting-and-tax/withholding', label: 'Withholding tax' },
          { id: 'settings/accounting-and-tax/compensation', label: 'Compensation tax' },
          { id: 'settings/accounting-and-tax/tax-free-compensation', label: 'Tax-free compensation' },
          { id: 'settings/accounting-and-tax/de-minimis', label: 'De minimis benefits' },
          { id: 'settings/accounting-and-tax/withholding-forms', label: 'Withholding forms' },
          { id: 'settings/accounting-and-tax/excise', label: 'Excise tax' },
          { id: 'settings/accounting-and-tax/currencies', label: 'Currencies' },
          { id: 'settings/accounting-and-tax/exchange-rates', label: 'Exchange rates' },
        ],
      },
      {
        id: 'settings/sales-and-crm',
        label: 'Sales & CRM',
        icon: icon('handshake'),
        items: [
          { id: 'settings/sales-and-crm/partner-groups', label: 'Business partner groups' },
          { id: 'settings/sales-and-crm/industries', label: 'Industries' },
          { id: 'settings/sales-and-crm/sales-employees', label: 'Sales employees & buyers' },
          { id: 'settings/sales-and-crm/territories', label: 'Territories' },
          { id: 'settings/sales-and-crm/channels', label: 'Channels' },
          { id: 'settings/sales-and-crm/lead-sources', label: 'Lead sources' },
          { id: 'settings/sales-and-crm/email-groups', label: 'E-mail groups' },
          { id: 'settings/sales-and-crm/partner-properties', label: 'Partner properties' },
        ],
      },
      {
        id: 'settings/document-numbering',
        label: 'Document Numbering',
        icon: icon('tag'),
        items: [
          { id: 'settings/document-numbering/purchase-orders', label: 'Purchase Orders' },
          { id: 'settings/document-numbering/goods-receipts', label: 'Goods Receipts' },
          { id: 'settings/document-numbering/ap-invoices', label: 'AP Invoices' },
          { id: 'settings/document-numbering/ap-credit-memos', label: 'AP Credit Memos' },
          { id: 'settings/document-numbering/down-payment-requests', label: 'Down Payment Requests' },
          { id: 'settings/document-numbering/outgoing-payments', label: 'Outgoing Payments' },
          { id: 'settings/document-numbering/goods-returns', label: 'Goods Returns' },
          { id: 'settings/document-numbering/sales-orders', label: 'Sales Orders' },
          { id: 'settings/document-numbering/deliveries', label: 'Deliveries' },
          { id: 'settings/document-numbering/ar-invoices', label: 'AR Invoices' },
          { id: 'settings/document-numbering/incoming-payments', label: 'Incoming Payments' },
          { id: 'settings/document-numbering/inventory-transfers', label: 'Inventory Transfers' },
          { id: 'settings/document-numbering/stock-counts', label: 'Stock Counts' },
          { id: 'settings/document-numbering/inventory-postings', label: 'Inventory Postings' },
          { id: 'settings/document-numbering/journal-entries', label: 'Journal Entries' },
        ],
      },
      {
        id: 'settings/purchasing',
        label: 'Purchasing',
        icon: icon('shopping_cart'),
        items: [
          { id: 'settings/purchasing/document-series', label: 'Document series' },
          { id: 'settings/purchasing/settings', label: 'Purchasing settings' },
        ],
      },
      {
        id: 'settings/inventory',
        label: 'Inventory',
        icon: icon('inventory_2'),
        items: [
          { id: 'settings/inventory/item-groups', label: 'Item groups' },
          { id: 'settings/inventory/uoms', label: 'Units of measure' },
          { id: 'settings/inventory/uom-groups', label: 'UoM groups' },
          { id: 'settings/inventory/manufacturers', label: 'Manufacturers' },
          { id: 'settings/inventory/customs', label: 'Customs groups' },
          { id: 'settings/inventory/commission', label: 'Commission groups' },
          { id: 'settings/inventory/shipping', label: 'Shipping types' },
          { id: 'settings/inventory/warranty', label: 'Warranty templates' },
          { id: 'settings/inventory/properties', label: 'Item properties' },
          { id: 'settings/inventory/settings', label: 'Inventory settings' },
        ],
      },
      {
        id: 'settings/banking',
        label: 'Banking',
        icon: icon('savings'),
        items: [
          { id: 'settings/banking/payment-terms', label: 'Payment terms' },
          { id: 'settings/banking/dunning-terms', label: 'Dunning terms' },
          { id: 'settings/banking/holidays', label: 'Holiday calendars' },
          { id: 'settings/banking/banks', label: 'Banks' },
          { id: 'settings/banking/bank-charges', label: 'Bank charge allocation' },
          { id: 'settings/banking/card-brands', label: 'Card brands' },
          { id: 'settings/banking/factoring', label: 'Factoring companies' },
        ],
      },
    ],
  },
  {
    id: 'settings-admin',
    items: [
      { id: 'settings/setup-guide', label: 'Setup guide', icon: icon('checklist') },
      { id: 'settings/users-and-access', label: 'Users & access', icon: icon('manage_accounts') },
      { id: 'settings/documents-and-templates', label: 'Documents & templates', icon: icon('description') },
      { id: 'settings/automation', label: 'Automation', icon: icon('smart_toy') },
      { id: 'settings/data', label: 'Data', icon: icon('database') },
      { id: 'settings/customization', label: 'Customization', icon: icon('palette') },
      { id: 'settings/apps-and-integrations', label: 'Apps & integrations', icon: icon('extension') },
      { id: 'settings/subscription', label: 'Subscription', icon: icon('subscriptions') },
    ],
  },
];

/** All navigable leaf items in the settings nav (excludes hubs). */
export const SETTINGS_LEAVES: SideNavItem[] = SETTINGS_NAV.flatMap((s) =>
  s.items.flatMap((i) => (i.items?.length ? i.items : [i])),
);

/** The settings leaf whose route path best matches the given pathname. */
export function settingsLeafForPath(pathname: string): SideNavItem | undefined {
  return SETTINGS_LEAVES.filter(
    (l) =>
      l.id !== 'home' &&
      (pathname === pathOf(l.id) || pathname.startsWith(`${pathOf(l.id)}/`)),
  ).sort((a, b) => b.id.length - a.id.length)[0];
}

/** The settings hub ID a leaf belongs to (e.g. 'settings/accounting-and-tax'). */
export function settingsModuleOf(leafId: string | undefined): string | null {
  if (!leafId) return null;
  for (const section of SETTINGS_NAV)
    for (const item of section.items)
      if (item.items?.some((l) => l.id === leafId)) return item.id;
  return null;
}
