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
          { id: 'settings/company/companies', label: 'Companies', icon: icon('domain') },
          { id: 'settings/company/projects', label: 'Projects', icon: icon('folder_open') },
          { id: 'settings/company/technicians', label: 'Technicians', icon: icon('engineering') },
          { id: 'settings/company/planning-groups', label: 'Planning groups', icon: icon('insights') },
          { id: 'settings/company/countries', label: 'Countries', icon: icon('public') },
        ],
      },
      {
        id: 'settings/accounting-and-tax',
        label: 'Accounting & Tax',
        icon: icon('account_balance'),
        items: [
          { id: 'settings/accounting-and-tax/tax-codes', label: 'Tax codes', icon: icon('percent') },
          { id: 'settings/accounting-and-tax/tax-groups', label: 'Tax groups', icon: icon('account_tree') },
          { id: 'settings/accounting-and-tax/withholding', label: 'Withholding tax', icon: icon('request_quote') },
          { id: 'settings/accounting-and-tax/compensation', label: 'Compensation tax', icon: icon('payments') },
          { id: 'settings/accounting-and-tax/tax-free-compensation', label: 'Tax-free compensation', icon: icon('money_off') },
          { id: 'settings/accounting-and-tax/de-minimis', label: 'De minimis benefits', icon: icon('redeem') },
          { id: 'settings/accounting-and-tax/withholding-forms', label: 'Withholding forms', icon: icon('description') },
          { id: 'settings/accounting-and-tax/excise', label: 'Excise tax', icon: icon('local_bar') },
          { id: 'settings/accounting-and-tax/currencies', label: 'Currencies', icon: icon('currency_exchange') },
          { id: 'settings/accounting-and-tax/exchange-rates', label: 'Exchange rates', icon: icon('trending_up') },
        ],
      },
      {
        id: 'settings/sales-and-crm',
        label: 'Sales & CRM',
        icon: icon('handshake'),
        items: [
          { id: 'settings/sales-and-crm/document-series', label: 'Document series', icon: icon('tag') },
          { id: 'settings/sales-and-crm/partner-groups', label: 'Business partner groups', icon: icon('workspaces') },
          { id: 'settings/sales-and-crm/industries', label: 'Industries', icon: icon('factory') },
          { id: 'settings/sales-and-crm/sales-employees', label: 'Sales employees & buyers', icon: icon('badge') },
          { id: 'settings/sales-and-crm/territories', label: 'Territories', icon: icon('map') },
          { id: 'settings/sales-and-crm/channels', label: 'Channels', icon: icon('alt_route') },
          { id: 'settings/sales-and-crm/lead-sources', label: 'Lead sources', icon: icon('campaign') },
          { id: 'settings/sales-and-crm/email-groups', label: 'E-mail groups', icon: icon('forward_to_inbox') },
          { id: 'settings/sales-and-crm/partner-properties', label: 'Partner properties', icon: icon('label') },
        ],
      },
      {
        id: 'settings/document-numbering',
        label: 'Document Numbering',
        icon: icon('tag'),
        items: [
          { id: 'settings/document-numbering/purchase-orders', label: 'Purchase Orders', icon: icon('tag') },
          { id: 'settings/document-numbering/goods-receipts', label: 'Goods Receipts', icon: icon('tag') },
          { id: 'settings/document-numbering/ap-invoices', label: 'AP Invoices', icon: icon('tag') },
          { id: 'settings/document-numbering/ap-credit-memos', label: 'AP Credit Memos', icon: icon('tag') },
          { id: 'settings/document-numbering/down-payment-requests', label: 'Down Payment Requests', icon: icon('tag') },
          { id: 'settings/document-numbering/outgoing-payments', label: 'Outgoing Payments', icon: icon('tag') },
          { id: 'settings/document-numbering/goods-returns', label: 'Goods Returns', icon: icon('tag') },
          { id: 'settings/document-numbering/sales-orders', label: 'Sales Orders', icon: icon('tag') },
          { id: 'settings/document-numbering/deliveries', label: 'Deliveries', icon: icon('tag') },
          { id: 'settings/document-numbering/ar-invoices', label: 'AR Invoices', icon: icon('tag') },
          { id: 'settings/document-numbering/incoming-payments', label: 'Incoming Payments', icon: icon('tag') },
          { id: 'settings/document-numbering/inventory-transfers', label: 'Inventory Transfers', icon: icon('tag') },
          { id: 'settings/document-numbering/stock-counts', label: 'Stock Counts', icon: icon('tag') },
          { id: 'settings/document-numbering/inventory-postings', label: 'Inventory Postings', icon: icon('tag') },
          { id: 'settings/document-numbering/journal-entries', label: 'Journal Entries', icon: icon('tag') },
        ],
      },
      {
        id: 'settings/purchasing',
        label: 'Purchasing',
        icon: icon('shopping_cart'),
        items: [
          { id: 'settings/purchasing/document-series', label: 'Document series', icon: icon('tag') },
          { id: 'settings/purchasing/settings', label: 'Purchasing settings', icon: icon('tune') },
        ],
      },
      {
        id: 'settings/inventory',
        label: 'Inventory',
        icon: icon('inventory_2'),
        items: [
          { id: 'settings/inventory/item-groups', label: 'Item groups', icon: icon('category') },
          { id: 'settings/inventory/uoms', label: 'Units of measure', icon: icon('straighten') },
          { id: 'settings/inventory/uom-groups', label: 'UoM groups', icon: icon('scale') },
          { id: 'settings/inventory/manufacturers', label: 'Manufacturers', icon: icon('factory') },
          { id: 'settings/inventory/customs', label: 'Customs groups', icon: icon('gavel') },
          { id: 'settings/inventory/commission', label: 'Commission groups', icon: icon('paid') },
          { id: 'settings/inventory/shipping', label: 'Shipping types', icon: icon('local_shipping') },
          { id: 'settings/inventory/warranty', label: 'Warranty templates', icon: icon('verified_user') },
          { id: 'settings/inventory/properties', label: 'Item properties', icon: icon('label') },
          { id: 'settings/inventory/settings', label: 'Inventory settings', icon: icon('tune') },
        ],
      },
      {
        id: 'settings/banking',
        label: 'Banking',
        icon: icon('savings'),
        items: [
          { id: 'settings/banking/payment-terms', label: 'Payment terms', icon: icon('event_available') },
          { id: 'settings/banking/dunning-terms', label: 'Dunning terms', icon: icon('mark_email_unread') },
          { id: 'settings/banking/holidays', label: 'Holiday calendars', icon: icon('calendar_month') },
          { id: 'settings/banking/banks', label: 'Banks', icon: icon('account_balance') },
          { id: 'settings/banking/bank-charges', label: 'Bank charge allocation', icon: icon('payments') },
          { id: 'settings/banking/card-brands', label: 'Card brands', icon: icon('credit_card') },
          { id: 'settings/banking/factoring', label: 'Factoring companies', icon: icon('handshake') },
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
