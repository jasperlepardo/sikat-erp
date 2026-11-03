import { Icon, type NavbarMenuItem, type SideNavItem, type SideNavSection } from '@jasperlepardo/sikat-design-system';
import { isValidElement, type ReactNode } from 'react';
import { cap } from '../components/form/noun';
import { JE_NOUN, JV_NOUN } from '../pages/accounting/paths';
import { COUNT_NOUN, ITEM_NOUN, POSTING_NOUN, TRANSFER_NOUN, TRANSFER_LIST_PATH, TRANSFER_REQUEST_NOUN } from '../pages/inventory/paths';
import { EMPLOYEE_NOUN } from '../pages/people/paths';
import { AP_NOUN, AP_LIST_PATH, APRI_NOUN, APRI_LIST_PATH, DPI_NOUN, DPI_LIST_PATH, DPR_NOUN, DPR_LIST_PATH, GR_NOUN, GR_LIST_PATH, GRR_NOUN, GRR_LIST_PATH, LC_NOUN, LC_LIST_PATH, MEMO_NOUN, MEMO_LIST_PATH, PAYMENT_NOUN, PAYMENT_LIST_PATH, PBA_NOUN, PBA_LIST_PATH, PO_NOUN, PO_LIST_PATH, PR_NOUN, RETURN_NOUN, RETURN_LIST_PATH, RFQ_NOUN, RFQ_LIST_PATH } from '../pages/purchasing/paths';
import { AR_NOUN, AR_LIST_PATH, ARCM_NOUN, AR_CM_LIST_PATH, BA_NOUN, BA_LIST_PATH, DI_NOUN, DI_LIST_PATH, DN_NOUN, DN_LIST_PATH, QT_NOUN, QT_LIST_PATH, RC_NOUN, RC_LIST_PATH, RI_NOUN, RI_LIST_PATH, SO_NOUN, SO_LIST_PATH, SR_NOUN, SR_LIST_PATH } from '../pages/sales/paths';

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
    [cap(DI_NOUN.many), 'receipt_long', 'sales/down-payment-invoices'],
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
    ['Invoicing', ['customer-invoices', 'reserve-invoices', 'down-payment-invoices', 'credit-memos']],
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

/**
 * Pages that expand into sub-items in the sidebar (Settings-style nesting). The parent is a
 * non-route group whose first child carries the base list route — the default "All". `id` is a
 * synthetic group id (never a route): clicking it only toggles the submenu (compact rail redirects
 * to the first child). Keyed by app id; each child is [label, full route id, icon glyph].
 */
type NavGroup = { id: string; label: string; glyph: string; children: [label: string, id: string, glyph: string][] };
const navId = (listPath: string) => listPath.slice(1); // '/purchasing/purchase-orders' → 'purchasing/purchase-orders'
/** The common case: a document that splits into All + its own Drafts sub-tab. */
const draftGroup = (listPath: string, label: string, glyph: string): NavGroup => {
  const base = navId(listPath);
  return { id: `${base}-g`, label, glyph, children: [['All', base, glyph], ['Drafts', `${base}/drafts`, 'edit_note']] };
};
const APP_GROUPS: Record<string, NavGroup[]> = {
  sales: [
    draftGroup(QT_LIST_PATH, cap(QT_NOUN.many), 'request_quote'),
    draftGroup(SO_LIST_PATH, cap(SO_NOUN.many), 'shopping_bag'),
    draftGroup(DN_LIST_PATH, cap(DN_NOUN.many), 'local_shipping'),
    draftGroup(AR_LIST_PATH, cap(AR_NOUN.many), 'receipt'),
    draftGroup(RI_LIST_PATH, cap(RI_NOUN.many), 'receipt_long'),
    draftGroup(DI_LIST_PATH, cap(DI_NOUN.many), 'receipt_long'),
    draftGroup(SR_LIST_PATH, cap(SR_NOUN.many), 'assignment_return'),
    draftGroup(AR_CM_LIST_PATH, cap(ARCM_NOUN.many), 'undo'),
    draftGroup(RC_LIST_PATH, cap(RC_NOUN.many), 'savings'),
    draftGroup(BA_LIST_PATH, cap(BA_NOUN.many), 'description'),
  ],
  purchasing: [
    draftGroup(RFQ_LIST_PATH, cap(RFQ_NOUN.many), 'description'),
    draftGroup(PO_LIST_PATH, cap(PO_NOUN.many), 'receipt_long'),
    draftGroup(GR_LIST_PATH, cap(GR_NOUN.many), 'inventory'),
    draftGroup(AP_LIST_PATH, cap(AP_NOUN.many), 'request_quote'),
    draftGroup(APRI_LIST_PATH, cap(APRI_NOUN.many), 'receipt_long'),
    // Down payments: the invoice (All) + its request, plus the invoice's drafts.
    { id: `${navId(DPI_LIST_PATH)}-g`, label: 'Down payments', glyph: 'savings', children: [
      ['Invoice', navId(DPI_LIST_PATH), 'receipt_long'],
      ['Request', navId(DPR_LIST_PATH), 'savings'],
      ['Drafts', `${navId(DPI_LIST_PATH)}/drafts`, 'edit_note'],
    ] },
    { id: `${navId(RETURN_LIST_PATH)}-g`, label: cap(RETURN_NOUN.many), glyph: 'assignment_return', children: [
      ['All', navId(RETURN_LIST_PATH), 'assignment_return'],
      ['Request', navId(GRR_LIST_PATH), 'assignment'],
      ['Drafts', `${navId(RETURN_LIST_PATH)}/drafts`, 'edit_note'],
    ] },
    draftGroup(MEMO_LIST_PATH, cap(MEMO_NOUN.many), 'receipt'),
    draftGroup(PAYMENT_LIST_PATH, cap(PAYMENT_NOUN.many), 'payments'),
    draftGroup(PBA_LIST_PATH, cap(PBA_NOUN.many), 'description'),
    draftGroup(LC_LIST_PATH, cap(LC_NOUN.many), 'calculate'),
  ],
  inventory: [
    draftGroup(TRANSFER_LIST_PATH, cap(TRANSFER_NOUN.many), 'move_down'),
  ],
};

const groupNode = (g: NavGroup): SideNavItem => ({
  id: g.id,
  label: g.label,
  icon: icon(g.glyph),
  items: g.children.map(([label, id, glyph]) => ({ id, label, icon: icon(glyph) })),
});

/** Replace grouped pages with their expandable parent, dropped in at the first child's position. */
const nestItems = (groups: NavGroup[] | undefined) => (items: SideNavItem[]): SideNavItem[] => {
  if (!groups?.length) return items;
  const firstChild = new Map(groups.map((g) => [g.children[0][1], g]));
  const childIds = new Set(groups.flatMap((g) => g.children.map(([, id]) => id)));
  const out: SideNavItem[] = [];
  for (const it of items) {
    const g = firstChild.get(it.id);
    if (g) out.push(groupNode(g));
    else if (!childIds.has(it.id)) out.push(it);
  }
  return out;
};

/** The sidebar for an app: the app's pages, split into titled sections and nested where grouped. */
export function appNav(appId: string): SideNavSection[] {
  const app = appModule(appId);
  const items = app.items ?? [];
  const nest = nestItems(APP_GROUPS[appId]);
  const groups = APP_SECTIONS[appId];
  if (!groups) return [{ id: app.id, items: nest(items) }];
  const byId = new Map(items.map((i) => [i.id, i]));
  return groups.map(([title, ids], n) => ({
    id: `${app.id}-${n}`,
    ...(title ? { title } : {}),
    items: nest(ids.map((id) => byId.get(`${app.id}/${id}`)).filter(Boolean) as SideNavItem[]),
  }));
}

/** Group children as nav leaves, so a URL like `/purchasing/purchase-orders/drafts` resolves. */
const GROUP_LEAVES: SideNavItem[] = Object.values(APP_GROUPS)
  .flat()
  .flatMap((g) => g.children.map(([label, id, glyph]) => ({ id, label, icon: icon(glyph) })));
const LEAVES = [...NAV.flatMap((s) => s.items.flatMap((i) => (i.items?.length ? i.items : [i]))), ...GROUP_LEAVES];

export const pathOf = (id: string) => `/${id}`;

/** The glyph inside a nav icon (`<Icon>receipt</Icon>` → 'receipt'). */
export const glyphOf = (node: ReactNode): string =>
  isValidElement<{ children?: unknown }>(node) && typeof node.props.children === 'string' ? node.props.children : 'article';

/** Every app page with its app's name, for global search. */
export const navPages = () =>
  APP_MODULES.flatMap((app) =>
    (app.items ?? []).map((page) => ({ id: page.id, label: page.label, glyph: glyphOf(page.icon), app: app.label })),
  );

/** Where switching to an app lands: its Dashboard. */
export const firstPageOf = (appId: string) => pathOf(appModule(appId).items?.[0]?.id ?? appId);

/** The first child route of a nav group — used to navigate when a parent is clicked to expand. */
export function firstChildOf(groupId: string): string | undefined {
  for (const groups of Object.values(APP_GROUPS))
    for (const g of groups)
      if (g.id === groupId) return g.children[0][1];
  return undefined;
}

/** The app a leaf belongs to, e.g. 'inventory' for 'inventory/items' (and 'purchasing/…/drafts'). */
export function moduleOf(leafId: string | undefined): string | null {
  if (!leafId) return null;
  const app = leafId.split('/')[0];
  return APP_MODULES.some((m) => m.id === app) ? app : null;
}

/** The expandable sidebar group a leaf sits under, so it opens when a child page is active. */
export function openGroupFor(leafId: string | undefined): string | null {
  if (!leafId) return null;
  for (const groups of Object.values(APP_GROUPS))
    for (const g of groups)
      if (g.children.some(([, id]) => id === leafId)) return g.id;
  return null;
}

/** The nav leaf for a URL — the longest leaf path that prefixes it (so `/inventory/items/42` → Items). */
export function leafForPath(pathname: string): SideNavItem | undefined {
  return LEAVES.filter(
    (l) => pathname === pathOf(l.id) || pathname.startsWith(`${pathOf(l.id)}/`),
  ).sort((a, b) => b.id.length - a.id.length)[0];
}
