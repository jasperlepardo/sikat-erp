import { Icon, type SideNavItem, type SideNavSection } from '@jasperlepardo/sikat-design-system';

const icon = (name: string) => <Icon size={20}>{name}</Icon>;

const sub = (prefix: string, labels: string[]): SideNavItem[] =>
  labels.map((label) => ({ id: `${prefix}/${label.toLowerCase().replace(/\W+/g, '-')}`, label }));

/**
 * Sidebar modules. A leaf's `id` doubles as its route: `/${id}` (Home is `/`).
 * Leaves without a dedicated page fall through to the placeholder screen.
 */
export const NAV: SideNavSection[] = [
  {
    id: 'core',
    items: [
      { id: 'home', label: 'Home', icon: icon('home') },
      { id: 'item', label: 'Item', icon: icon('inventory_2'), items: [{ id: 'items', label: 'Items' }] },
      {
        id: 'sales',
        label: 'Sales',
        icon: icon('sell'),
        items: sub('sales', ['Customers', 'Quotations', 'Sales Order', 'Invoices', 'Sales Receipt', 'Returns']),
      },
      {
        id: 'procurement',
        label: 'Procurement',
        icon: icon('shopping_cart'),
        items: sub('procurement', [
          'Purchase Request',
          'RFQs',
          'Purchase Orders',
          'Receiving',
          'Vendor Invoices',
          'Payables',
          'Returns',
        ]),
      },
      {
        id: 'inventory',
        label: 'Inventory',
        icon: icon('widgets'),
        items: sub('inventory', ['Stock', 'Warehouse', 'Transfers', 'Counts', 'Adjustments', 'Issuance', 'Tracking']),
      },
      {
        id: 'accounting',
        label: 'Accounting',
        icon: icon('account_tree'),
        items: sub('accounting', [
          'General Ledger',
          'Accounts Receivable',
          'Accounts Payable',
          'Cash & Bank',
          'Inventory Accounting',
          'Fixed Assets',
          'Period Close',
        ]),
      },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    items: [
      { id: 'reporting', label: 'Reporting', icon: icon('import_contacts'), items: sub('reporting', ['Dashboards', 'Exports']) },
      {
        id: 'configurations',
        label: 'Configurations',
        icon: icon('settings'),
        items: sub('configurations', ['General', 'Users & Roles']),
      },
    ],
  },
];

const LEAVES = NAV.flatMap((s) => s.items.flatMap((i) => (i.items?.length ? i.items : [i])));

export const pathOf = (id: string) => (id === 'home' ? '/' : `/${id}`);

/** The nav leaf for a URL — the longest leaf path that prefixes it (so `/items/42` → Items). */
export function leafForPath(pathname: string): SideNavItem | undefined {
  if (pathname === '/') return LEAVES.find((l) => l.id === 'home');
  return LEAVES.filter((l) => l.id !== 'home' && (pathname === pathOf(l.id) || pathname.startsWith(`${pathOf(l.id)}/`))).sort(
    (a, b) => b.id.length - a.id.length,
  )[0];
}
