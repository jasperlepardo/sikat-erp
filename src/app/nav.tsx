import { Icon, type NavbarMenuItem, type SideNavItem, type SideNavSection } from '@jasperlepardo/sikat-design-system';

/**
 * Sidebar, from the Sikat ERP navigation architecture (SAP B1's 590 menu entries
 * consolidated into hubs). A leaf's `id` doubles as its route: `/${id}`.
 * Leaves without a dedicated page fall through to the placeholder screen.
 *
 * Each module is an app: the Navbar's app selector picks one, and the sidebar shows
 * that app's pages. Each app's first page is its Dashboard.
 *
 * Global services (⌘K command bar, Print / Email / Export, Recurring, profile, Inbox) live
 * in the Navbar and on each record, not in the sidebar.
 */

const icon = (name: string) => <Icon size={20}>{name}</Icon>;

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/\W+/g, '-')
    .replace(/^-|-$/g, '');

/** A hub: a module row whose pages open as its submenu. Each page is [label, icon glyph]. */
const hub = (label: string, glyph: string, pages: [string, string][]): SideNavItem => {
  const id = slug(label);
  return {
    id,
    label,
    icon: icon(glyph),
    items: pages.map(([page, pageGlyph]) => ({ id: `${id}/${slug(page)}`, label: page, icon: icon(pageGlyph) })),
  };
};

/** The apps, in the app selector's order; each hub's pages are that app's sidebar. */
const APP_MODULES: SideNavItem[] = [
  hub('CRM', 'handshake', [
    ['Dashboard', 'dashboard'],
    ['Business Partners', 'groups'],
    ['Leads', 'person_search'],
    ['Pipeline', 'filter_list'],
    ['Activities', 'event'],
    ['Campaigns', 'campaign'],
    ['Insights', 'insights'],
  ]),
  hub('Sales', 'sell', [
    ['Dashboard', 'dashboard'],
    ['Customers', 'storefront'],
    ['Quotations', 'request_quote'],
    ['Sales Orders', 'shopping_bag'],
    ['Deliveries', 'local_shipping'],
    ['Invoices', 'receipt'],
    ['Returns & Credits', 'assignment_return'],
    ['Payments Received', 'savings'],
    ['Collections', 'account_balance_wallet'],
    ['Agreements', 'description'],
    ['Insights', 'insights'],
  ]),
  hub('Purchasing', 'shopping_cart', [
    ['Dashboard', 'dashboard'],
    ['Vendors', 'local_shipping'],
    ['Requests', 'inbox'],
    ['Quotations (RFQ)', 'description'],
    ['Purchase Orders', 'receipt_long'],
    ['Goods Receipts', 'inventory'],
    ['Bills', 'request_quote'],
    ['Returns & Debits', 'assignment_return'],
    ['Payments Made', 'payments'],
    ['Landed Costs', 'calculate'],
    ['Agreements', 'description'],
    ['Insights', 'insights'],
  ]),
  hub('Inventory', 'inventory_2', [
    ['Dashboard', 'dashboard'],
    ['Items', 'inventory_2'],
    ['Stock on Hand', 'inventory'],
    ['Stock Movements', 'move_down'],
    ['Stock Counts', 'inventory'],
    ['Pick & Pack', 'inventory_2'],
    ['Price Lists', 'price_change'],
    ['Warehouses & Bins', 'location_on'],
    ['Insights', 'insights'],
  ]),
  hub('Manufacturing', 'precision_manufacturing', [
    ['Dashboard', 'dashboard'],
    ['Bills of Materials', 'account_tree'],
    ['Production Orders', 'precision_manufacturing'],
    ['Planning (MRP)', 'event_note'],
    ['Resources', 'build_circle'],
    ['Costing', 'calculate'],
  ]),
  hub('Projects', 'assignment', [
    ['Dashboard', 'dashboard'],
    ['Projects', 'folder'],
    ['Timesheets', 'timer'],
    ['Insights', 'insights'],
  ]),
  hub('Service', 'build', [
    ['Dashboard', 'dashboard'],
    ['Service Calls', 'support_agent'],
    ['Contracts', 'description'],
    ['Equipment', 'construction'],
    ['Insights', 'insights'],
  ]),
  hub('Banking', 'account_balance', [
    ['Dashboard', 'dashboard'],
    ['Accounts', 'account_balance'],
    ['Reconciliation', 'check_box'],
    ['Deposits', 'savings'],
    ['Checks', 'receipt'],
    ['Cards', 'credit_card'],
    ['Payment Orders', 'send'],
    ['Insights', 'insights'],
  ]),
  hub('Accounting', 'account_tree', [
    ['Dashboard', 'dashboard'],
    ['Statements', 'summarize'],
    ['Journal Entries', 'menu_book'],
    ['Journal Vouchers', 'folder_open'],
    ['Exchange Rate Differences', 'currency_exchange'],
    ['Chart of Accounts', 'account_tree'],
    ['Reconciliations', 'check_box'],
    ['Period Close', 'lock_clock'],
    ['Budgets', 'pie_chart'],
    ['Cost Accounting', 'calculate'],
    ['Fixed Assets', 'real_estate_agent'],
    ['Tax', 'percent'],
    ['Insights', 'insights'],
  ]),
  hub('People', 'group', [
    ['Dashboard', 'dashboard'],
    ['Employees', 'badge'],
    ['Absences', 'event_busy'],
  ]),
  hub('Reports', 'bar_chart', [
    ['Dashboard', 'dashboard'],
    ['Library', 'library_books'],
    ['Dashboards', 'dashboard_customize'],
    ['Builder', 'construction'],
  ]),
];

/** Every entry, for route lookups. */
export const NAV: SideNavSection[] = [{ id: 'apps', items: APP_MODULES }];

export const APPS: NavbarMenuItem[] = APP_MODULES.map((m) => ({ id: m.id, label: m.label }));

const appModule = (appId: string) => APP_MODULES.find((m) => m.id === appId) ?? APP_MODULES[0];

/** The sidebar for an app: the app's pages. */
export function appNav(appId: string): SideNavSection[] {
  const app = appModule(appId);
  return [{ id: app.id, items: app.items ?? [] }];
}

const LEAVES = NAV.flatMap((s) => s.items.flatMap((i) => (i.items?.length ? i.items : [i])));

export const pathOf = (id: string) => `/${id}`;

/** Where switching to an app lands: its Dashboard. */
export const firstPageOf = (appId: string) => pathOf(appModule(appId).items?.[0]?.id ?? appId);

/** The module (hub) a leaf belongs to, e.g. 'inventory' for 'inventory/items'. */
export function moduleOf(leafId: string | undefined): string | null {
  if (!leafId) return null;
  for (const section of NAV) for (const item of section.items) if (item.items?.some((l) => l.id === leafId)) return item.id;
  return null;
}

/** The nav leaf for a URL — the longest leaf path that prefixes it (so `/inventory/items/42` → Items). */
export function leafForPath(pathname: string): SideNavItem | undefined {
  return LEAVES.filter(
    (l) => pathname === pathOf(l.id) || pathname.startsWith(`${pathOf(l.id)}/`),
  ).sort((a, b) => b.id.length - a.id.length)[0];
}
