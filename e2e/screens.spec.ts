import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { open, rawIds, watchErrors } from './helpers';

/**
 * Every screen the id migration touched loads without errors and shows names, never raw ids.
 * One test per route so a failure names the screen.
 *
 * The list is partly generated from the router and the settings nav (below BASE_ROUTES), so a new
 * route can't slip past the sweep: a new `/new` form, a new settings tab, or a new tabbed detail
 * page is picked up the moment it's wired into `src/app/router.tsx` or `src/app/settingsNav.tsx`.
 */

/** Lists, dashboards, and one sample record per detail page — the routes that aren't derivable. */
const BASE_ROUTES = [
  '',
  // Dashboards.
  'inventory/dashboard',
  'sales/dashboard',
  'purchasing/dashboard',
  'accounting/dashboard',
  // Partners: payment terms, price lists, groups, named lists, employees, properties, bank accounts.
  'crm/business-partners',
  'crm/business-partners/bp-001',
  'sales/customers',
  'purchasing/vendors',
  'sales/customers/bp-003',
  'purchasing/vendors/bp-016',
  'crm/leads',
  // A seed lead (business partner with the `lead` role), opened in the CRM Leads scope.
  'crm/leads/bp-011',
  'crm/activities',
  // Purchasing documents.
  'purchasing/purchase-requests',
  'purchasing/purchase-requests/prq-001',
  'purchasing/purchase-quotations',
  'purchasing/purchase-quotations/RFQ-2026-0001',
  'purchasing/purchase-orders',
  'purchasing/purchase-orders/po-001',
  'purchasing/goods-receipts',
  'purchasing/goods-receipts/gr-001',
  'purchasing/goods-returns',
  'purchasing/goods-returns/rt-001',
  'purchasing/vendor-invoices',
  'purchasing/vendor-invoices/ap-001',
  'purchasing/reserve-invoices',
  'purchasing/reserve-invoices/apri-001',
  'purchasing/down-payment-requests',
  'purchasing/down-payment-requests/dp-001',
  'purchasing/outgoing-payments',
  'purchasing/outgoing-payments/op-001',
  'purchasing/debit-memos',
  'purchasing/debit-memos/cm-001',
  'purchasing/landed-costs',
  'purchasing/landed-costs/lc-001',
  'purchasing/agreements',
  'purchasing/agreements/pba-001',
  // Sales documents.
  'sales/quotations',
  'sales/quotations/qt-001',
  'sales/sales-orders',
  'sales/sales-orders/so-001',
  'sales/deliveries',
  'sales/deliveries/dn-001',
  'sales/customer-invoices',
  'sales/customer-invoices/ar-004',
  'sales/reserve-invoices',
  'sales/reserve-invoices/ri-001',
  'sales/incoming-payments',
  'sales/incoming-payments/rc-001',
  'sales/sales-returns',
  'sales/sales-returns/sr-001',
  'sales/credit-memos',
  'sales/credit-memos/acm-001',
  'sales/agreements',
  'sales/agreements/ba-001',
  // Inventory: item groups, UoMs, variant attributes, warehouses, bins, counts, transfers, pricing.
  'inventory/items',
  'inventory/items/apl-fam-001',
  // A variant item (its own record carries `parentItemId`; global fields come from the family).
  'inventory/items/apl-0001',
  'inventory/stock-on-hand',
  'inventory/inventory-transfers',
  'inventory/inventory-transfers/it-001',
  'inventory/transfer-requests',
  'inventory/transfer-requests/itr-001',
  'inventory/transfer-requests/itr-002',
  'inventory/stock-counts',
  'inventory/stock-counts/ic-003',
  'inventory/stock-counts/postings',
  'inventory/stock-counts/postings/ip-001',
  'inventory/warehouses-and-bins',
  'inventory/price-lists',
  // Accounting.
  'accounting/chart-of-accounts',
  'accounting/journal-entries',
  'accounting/journal-entries/je-001',
  'accounting/exchange-rate-differences',
  'accounting/journal-vouchers',
  'accounting/journal-vouchers/jv-001',
  'accounting/journal-vouchers/jv-001/entries/jve-001-1',
  // People: employees and the lists they pick from.
  'people/employees',
  'people/employees/hem-002',
  'people/employees/hem-003',
  'approvals/pending-approvals',
  // Settings pages that aren't a `:tab?` hub (so not generated below).
  'settings/preferences',
  'settings/inventory/variant-attributes',
  'settings/inventory/variant-attributes/va-001',
];

/**
 * Every `/new` form reachable from a list page. Each opens the detail page with `id === 'new'` so
 * the create flow renders a blank draft. Derived from the `:id`/`:id/:tab?` detail routes in the
 * router, minus the few whose detail page is read-only (opened from an existing record, never new):
 * journal vouchers, blanket agreements (both sales and purchasing), and inventory transfers/counts.
 */
const NO_NEW = new Set([
  'accounting/journal-vouchers',
  'sales/agreements',
  'purchasing/agreements',
  'inventory/inventory-transfers',
  'inventory/stock-counts',
  'inventory/stock-counts/postings',
]);

/** One representative tab per tabbed detail page: list path → [sample record id, tab slug]. */
const DETAIL_TABS: Record<string, [string, string]> = {
  'inventory/items': ['apl-fam-001', 'inventory'],
  'crm/business-partners': ['bp-001', 'transactions'],
  'sales/customers': ['bp-003', 'transactions'],
  'purchasing/vendors': ['bp-016', 'transactions'],
  'people/employees': ['hem-002', 'activity'],
  'sales/quotations': ['qt-001', 'transactions'],
  'sales/sales-orders': ['so-001', 'transactions'],
  'sales/deliveries': ['dn-001', 'transactions'],
  'sales/customer-invoices': ['ar-004', 'transactions'],
  'sales/reserve-invoices': ['ri-001', 'transactions'],
  'sales/incoming-payments': ['rc-001', 'transactions'],
  'sales/sales-returns': ['sr-001', 'transactions'],
  'sales/credit-memos': ['acm-001', 'transactions'],
  'purchasing/purchase-requests': ['prq-001', 'transactions'],
  'purchasing/purchase-quotations': ['RFQ-2026-0001', 'transactions'],
  'purchasing/purchase-orders': ['po-001', 'transactions'],
  'purchasing/goods-receipts': ['gr-001', 'transactions'],
  'purchasing/goods-returns': ['rt-001', 'transactions'],
  'purchasing/vendor-invoices': ['ap-001', 'transactions'],
  'purchasing/reserve-invoices': ['apri-001', 'transactions'],
  'purchasing/down-payment-requests': ['dp-001', 'transactions'],
  'purchasing/outgoing-payments': ['op-001', 'transactions'],
  'purchasing/debit-memos': ['cm-001', 'transactions'],
  'purchasing/landed-costs': ['lc-001', 'transactions'],
  'accounting/journal-entries': ['je-001', 'attachments'],
};

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** The `path:` strings declared in the router, in file order. */
const routerPaths = [...read('../src/app/router.tsx').matchAll(/path: '([^']*)'/g)].map((m) => m[1]);

/** Detail routes: a list `base` with an `:id` child, whether or not it carries a `:tab?`. */
const detailBases = routerPaths
  .map((p) => p.match(/^(.+)\/:id(\/:tab\?)?$/))
  .filter((m): m is RegExpMatchArray => Boolean(m))
  .map((m) => m[1]);

/** `/new` for every detail page that supports creation. */
const newRoutes = detailBases.filter((base) => !NO_NEW.has(base)).map((base) => `${base}/new`);

/** `base/:id/tab` for one sample record per tabbed detail page. */
const tabRoutes = Object.entries(DETAIL_TABS).map(([base, [id, tab]]) => `${base}/${id}/${tab}`);

/**
 * Every settings tab, generated from the settings nav. Only the hubs that have a real page are
 * swept — the admin leaves (setup-guide, users-and-access, …) fall through to the placeholder.
 */
const SETTINGS_HUBS = new Set([
  'settings/accounting-and-tax', 'settings/inventory', 'settings/document-numbering',
  'settings/journal-patterns', 'settings/purchasing', 'settings/sales-and-crm',
  'settings/banking', 'settings/company', 'settings/people',
]);
const settingsRoutes = [...read('../src/app/settingsNav.tsx').matchAll(/id: '(settings\/[^']+\/[^']+)'/g)]
  .map((m) => m[1])
  .filter((id) => SETTINGS_HUBS.has(id.split('/').slice(0, 2).join('/')));

const ROUTES = [
  ...BASE_ROUTES,
  ...newRoutes,
  ...tabRoutes,
  ...settingsRoutes,
  // The bare /settings redirect lands on the first settings module.
  'settings',
  // An unknown route falls through to the "Coming soon" placeholder. `open()` asserts the
  // placeholder is absent, so this one route is checked on its own below.
];

for (const route of [...new Set(ROUTES)]) {
  test(`/${route} loads and shows no raw ids`, async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, route);
    expect(await rawIds(page), 'ids visible on screen').toEqual([]);
    expect(errors, 'page or console errors').toEqual([]);
  });
}

/** A route the router doesn't know shows the placeholder, which must load cleanly with no errors. */
test('an unknown route shows the placeholder without errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/this/route/does/not/exist');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Coming soon')).toBeVisible();
  expect(errors, 'page or console errors').toEqual([]);
});
