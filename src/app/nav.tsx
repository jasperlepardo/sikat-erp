import { Icon, type NavbarMenuItem, type SideNavItem, type SideNavSection } from '@jasperlepardo/sikat-design-system';

/**
 * Sidebar, from the Sikat ERP navigation architecture (SAP B1's 590 menu entries
 * consolidated into hubs). A leaf's `id` doubles as its route: `/${id}` (Home is `/`).
 * Leaves without a dedicated page fall through to the placeholder screen.
 *
 * Each module is an app: the Navbar's app selector picks one, and the sidebar shows
 * the cross-app entries (Home, Inbox, Business Partners) over that app's pages.
 *
 * Global services (⌘K command bar, Print / Email / Export, Recurring, profile) live
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

/** A hub: a module row whose pages open as its submenu. */
const hub = (label: string, glyph: string, pages: string[]): SideNavItem => {
  const id = slug(label);
  return { id, label, icon: icon(glyph), items: pages.map((page) => ({ id: `${id}/${slug(page)}`, label: page })) };
};

/** Pinned above every app's pages. */
const GLOBAL_ITEMS: SideNavItem[] = [
  { id: 'home', label: 'Home', icon: icon('home') },
  hub('Inbox', 'inbox', ['Approvals', 'Tasks', 'Drafts']),
  // Master data: every partner. Leads, Customers and Vendors are role views of it.
  { id: 'business-partners', label: 'Business Partners', icon: icon('groups') },
];

/** The apps, in the app selector's order; each hub's pages are that app's sidebar. */
const APP_MODULES: SideNavItem[] = [
  hub('CRM', 'handshake', ['Leads', 'Pipeline', 'Activities', 'Campaigns', 'Insights']),
  hub('Sales', 'sell', [
    'Customers',
    'Quotations',
    'Sales Orders',
    'Deliveries',
    'Invoices',
    'Returns & Credits',
    'Payments Received',
    'Collections',
    'Agreements',
    'Insights',
  ]),
  hub('Purchasing', 'shopping_cart', [
    'Vendors',
    'Requests',
    'Quotations (RFQ)',
    'Purchase Orders',
    'Goods Receipts',
    'Bills',
    'Returns & Debits',
    'Payments Made',
    'Landed Costs',
    'Agreements',
    'Insights',
  ]),
  hub('Inventory', 'inventory_2', [
    'Items',
    'Stock on Hand',
    'Stock Movements',
    'Stock Counts',
    'Pick & Pack',
    'Price Lists',
    'Warehouses & Bins',
    'Insights',
  ]),
  hub('Manufacturing', 'precision_manufacturing', [
    'Bills of Materials',
    'Production Orders',
    'Planning (MRP)',
    'Resources',
    'Costing',
  ]),
  hub('Projects', 'assignment', ['Projects', 'Timesheets', 'Insights']),
  hub('Service', 'build', ['Service Calls', 'Contracts', 'Equipment', 'Insights']),
  hub('Banking', 'account_balance', [
    'Accounts',
    'Reconciliation',
    'Deposits',
    'Checks',
    'Cards',
    'Payment Orders',
    'Insights',
  ]),
  hub('Accounting', 'account_tree', [
    'Statements',
    'Journal Entries',
    'Journal Vouchers',
    'Exchange Rate Differences',
    'Chart of Accounts',
    'Reconciliations',
    'Period Close',
    'Budgets',
    'Cost Accounting',
    'Fixed Assets',
    'Tax',
    'Insights',
  ]),
  hub('People', 'group', ['Employees', 'Absences']),
  hub('Reports', 'bar_chart', ['Library', 'Dashboards', 'Builder']),
];

/** Every entry, for route lookups. */
export const NAV: SideNavSection[] = [
  { id: 'global', items: GLOBAL_ITEMS },
  { id: 'apps', items: APP_MODULES },
];

export const APPS: NavbarMenuItem[] = APP_MODULES.map((m) => ({ id: m.id, label: m.label }));

const appModule = (appId: string) => APP_MODULES.find((m) => m.id === appId) ?? APP_MODULES[0];

/** The sidebar for an app: the pinned entries, then the app's pages. */
export function appNav(appId: string): SideNavSection[] {
  const app = appModule(appId);
  return [
    { id: 'global', items: GLOBAL_ITEMS },
    { id: app.id, title: app.label, items: app.items ?? [] },
  ];
}

const LEAVES = NAV.flatMap((s) => s.items.flatMap((i) => (i.items?.length ? i.items : [i])));

export const pathOf = (id: string) => (id === 'home' ? '/' : `/${id}`);

/** Where switching to an app lands: its first page. */
export const firstPageOf = (appId: string) => pathOf(appModule(appId).items?.[0]?.id ?? appId);

/** The module (hub) a leaf belongs to, e.g. 'inventory' for 'inventory/items'. */
export function moduleOf(leafId: string | undefined): string | null {
  if (!leafId) return null;
  for (const section of NAV) for (const item of section.items) if (item.items?.some((l) => l.id === leafId)) return item.id;
  return null;
}

/** The nav leaf for a URL — the longest leaf path that prefixes it (so `/inventory/items/42` → Items). */
export function leafForPath(pathname: string): SideNavItem | undefined {
  if (pathname === '/') return LEAVES.find((l) => l.id === 'home');
  return LEAVES.filter(
    (l) => l.id !== 'home' && (pathname === pathOf(l.id) || pathname.startsWith(`${pathOf(l.id)}/`)),
  ).sort((a, b) => b.id.length - a.id.length)[0];
}
