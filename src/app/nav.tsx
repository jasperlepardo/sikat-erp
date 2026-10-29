import { Icon, type NavbarMenuItem, type SideNavItem, type SideNavSection } from '@jasperlepardo/sikat-design-system';
import { cap } from '../components/form/noun';
import { JE_NOUN, JV_NOUN } from '../pages/accounting/paths';
import { COUNT_NOUN, ITEM_NOUN, POSTING_NOUN, TRANSFER_NOUN, TRANSFER_REQUEST_NOUN } from '../pages/inventory/paths';
import { EMPLOYEE_NOUN } from '../pages/people/paths';
import { AP_NOUN, APRI_NOUN, DPI_NOUN, DPR_NOUN, GR_NOUN, GRR_NOUN, LC_NOUN, MEMO_NOUN, PAYMENT_NOUN, PBA_NOUN, PO_NOUN, PR_NOUN, RETURN_NOUN, RFQ_NOUN } from '../pages/purchasing/paths';
import { AR_NOUN, ARCM_NOUN, BA_NOUN, DN_NOUN, QT_NOUN, RC_NOUN, RI_NOUN, SO_NOUN, SR_NOUN } from '../pages/sales/paths';

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

/** A hub: a module row whose pages open as its submenu. Each page is [label, icon glyph, optional route id]. */
const hub = (label: string, glyph: string, pages: [string, string, string?][]): SideNavItem => {
  const id = slug(label);
  return {
    id,
    label,
    icon: icon(glyph),
    items: pages.map(([page, pageGlyph, pageId]) => ({ id: pageId ?? `${id}/${slug(page)}`, label: page, icon: icon(pageGlyph) })),
  };
};

/** The apps, in the app selector's order; each hub's pages are that app's sidebar. */
const APP_MODULES: SideNavItem[] = [
  hub('Approvals', 'verified', [
    ['Pending approvals', 'pending_actions'],
  ]),
  hub('CRM', 'handshake', [
    ['Dashboard', 'dashboard'],
    ['Business partners', 'groups'],
    ['Leads', 'person_search'],
    ['Pipeline', 'filter_list'],
    ['Activities', 'event'],
    ['Campaigns', 'campaign'],
    ['Insights', 'insights'],
  ]),
  hub('Sales', 'sell', [
    ['Dashboard', 'dashboard'],
    ['Customers', 'storefront'],
    [cap(QT_NOUN.many), 'request_quote'],
    [cap(SO_NOUN.many), 'shopping_bag'],
    [cap(DN_NOUN.many), 'local_shipping'],
    [cap(AR_NOUN.many), 'receipt', 'sales/customer-invoices'],
    [cap(RI_NOUN.many), 'receipt_long', 'sales/reserve-invoices'],
    [cap(SR_NOUN.many), 'assignment_return'],
    [cap(ARCM_NOUN.many), 'undo', 'sales/credit-memos'],
    [cap(RC_NOUN.many), 'savings'],
    ['Collections', 'account_balance_wallet'],
    [cap(BA_NOUN.many), 'description', 'sales/agreements'],
    ['Insights', 'insights'],
  ]),
  hub('Purchasing', 'shopping_cart', [
    ['Dashboard', 'dashboard'],
    ['Vendors', 'local_shipping'],
    [cap(PR_NOUN.many), 'inbox'],
    [cap(RFQ_NOUN.many), 'description'],
    [cap(PO_NOUN.many), 'receipt_long'],
    [cap(GR_NOUN.many), 'inventory'],
    [cap(AP_NOUN.many), 'request_quote', 'purchasing/vendor-invoices'],
    [cap(APRI_NOUN.many), 'receipt_long', 'purchasing/reserve-invoices'],
    [cap(DPR_NOUN.many), 'savings', 'purchasing/down-payment-requests'],
    [cap(DPI_NOUN.many), 'receipt_long', 'purchasing/down-payment-invoices'],
    [cap(GRR_NOUN.many), 'assignment_return'],
    [cap(RETURN_NOUN.many), 'assignment_return'],
    [cap(MEMO_NOUN.many), 'receipt', 'purchasing/debit-memos'],
    [cap(PAYMENT_NOUN.many), 'payments'],
    [cap(LC_NOUN.many), 'calculate'],
    [cap(PBA_NOUN.many), 'description', 'purchasing/agreements'],
    ['Insights', 'insights'],
  ]),
  hub('Inventory', 'inventory_2', [
    ['Dashboard', 'dashboard'],
    [cap(ITEM_NOUN.many), 'inventory_2'],
    ['Stock on hand', 'inventory'],
    [cap(TRANSFER_REQUEST_NOUN.many), 'move_up'],
    [cap(TRANSFER_NOUN.many), 'move_down'],
    [cap(COUNT_NOUN.many), 'inventory'],
    [cap(POSTING_NOUN.many), 'fact_check', 'inventory/stock-counts/postings'],
    ['Pick & pack', 'inventory_2'],
    ['Price lists', 'price_change'],
    ['Warehouses & bins', 'location_on'],
    ['Insights', 'insights'],
  ]),
  hub('Manufacturing', 'precision_manufacturing', [
    ['Dashboard', 'dashboard'],
    ['Bills of materials', 'account_tree'],
    ['Production orders', 'precision_manufacturing'],
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
    ['Service calls', 'support_agent'],
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
    ['Payment orders', 'send'],
    ['Insights', 'insights'],
  ]),
  hub('Accounting', 'account_tree', [
    ['Dashboard', 'dashboard'],
    ['Statements', 'summarize'],
    [cap(JE_NOUN.many), 'menu_book'],
    [cap(JV_NOUN.many), 'folder_open'],
    ['Exchange rate differences', 'currency_exchange'],
    ['Chart of accounts', 'account_tree'],
    ['Reconciliations', 'check_box'],
    ['Period close', 'lock_clock'],
    ['Budgets', 'pie_chart'],
    ['Cost accounting', 'calculate'],
    ['Fixed assets', 'real_estate_agent'],
    ['Tax', 'percent'],
    ['Insights', 'insights'],
  ]),
  hub('People', 'group', [
    ['Dashboard', 'dashboard'],
    [cap(EMPLOYEE_NOUN.many), 'badge'],
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
const NAV: SideNavSection[] = [{ id: 'apps', items: APP_MODULES }];

export const APPS: NavbarMenuItem[] = APP_MODULES.map((m) => ({ id: m.id, label: m.label }));

const appModule = (appId: string) => APP_MODULES.find((m) => m.id === appId) ?? APP_MODULES[0];

/**
 * Section headers for an app's sidebar, grouping its pages by lifecycle stage.
 * Each group is [title, page ids under the app]; '' title renders as a header-less block.
 * Apps absent here keep a single flat, header-less section. Every hub page should be in a
 * group, or it doesn't show — the leaf ids stay flat on the hub, so route lookups
 * (`moduleOf`, `leafForPath`, …) are unaffected; this only reshapes rendering.
 */
const APP_SECTIONS: Record<string, [string, string[]][]> = {
  sales: [
    ['', ['dashboard', 'customers', 'agreements']],
    ['Selling', ['quotations', 'sales-orders']],
    ['Delivery', ['deliveries', 'sales-returns']],
    ['Invoicing', ['customer-invoices', 'reserve-invoices', 'credit-memos']],
    ['Payments', ['incoming-payments', 'collections']],
    ['', ['insights']],
  ],
  purchasing: [
    ['', ['dashboard', 'vendors', 'agreements']],
    ['Procurement', ['purchase-requests', 'purchase-quotations', 'purchase-orders']],
    ['Receiving', ['goods-receipts', 'goods-return-requests', 'goods-returns', 'landed-costs']],
    ['Invoicing', ['vendor-invoices', 'reserve-invoices', 'down-payment-requests', 'down-payment-invoices', 'debit-memos']],
    ['Payments', ['outgoing-payments']],
    ['', ['insights']],
  ],
};

/** The sidebar for an app: the app's pages, split into titled sections when grouped. */
export function appNav(appId: string): SideNavSection[] {
  const app = appModule(appId);
  const items = app.items ?? [];
  const groups = APP_SECTIONS[appId];
  if (!groups) return [{ id: app.id, items }];
  const byId = new Map(items.map((i) => [i.id, i]));
  return groups.map(([title, ids], n) => ({
    id: `${app.id}-${n}`,
    ...(title ? { title } : {}),
    items: ids.map((id) => byId.get(`${app.id}/${id}`)).filter(Boolean) as SideNavItem[],
  }));
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
