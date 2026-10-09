import { expect, test } from '@playwright/test';
import { open, rawIds, watchErrors } from './helpers';

/**
 * Every screen the id migration touched loads without errors and shows names, never raw ids.
 * One test per route so a failure names the screen.
 */
const ROUTES = [
  '',
  // Partners: payment terms, price lists, groups, named lists, employees, properties, bank accounts.
  'crm/business-partners',
  'sales/customers',
  'purchasing/vendors',
  'sales/customers/bp-003',
  'purchasing/vendors/bp-016',
  'crm/leads',
  // Documents.
  'purchasing/purchase-orders',
  'purchasing/purchase-orders/po-001',
  'purchasing/goods-receipts',
  'purchasing/bills',
  'purchasing/payments-made',
  'sales/sales-orders',
  'sales/sales-orders/so-001',
  'sales/deliveries',
  'sales/invoices',
  'sales/payments-received',
  // Inventory: item groups, UoMs, warehouses, bins, counts, transfers, pricing.
  'inventory/items',
  'inventory/stock-on-hand',
  'inventory/stock-movements',
  'inventory/stock-counts',
  'inventory/stock-counts/ic-003',
  'inventory/stock-counts/postings',
  'inventory/warehouses-and-bins',
  'inventory/price-lists',
  // Accounting.
  'accounting/chart-of-accounts',
  'accounting/journal-entries',
  // Settings lists.
  'settings/sales-and-crm',
  'settings/banking',
  'settings/banking/payment-terms',
  'settings/banking/house-bank-accounts',
  'settings/company',
  'settings/company/projects',
  'settings/company/countries',
  'settings/inventory/item-groups',
  'settings/inventory/uoms',
  'settings/inventory/manufacturers',
  'settings/accounting-and-tax/tax-codes',
  'settings/accounting-and-tax/withholding-groups',
];

for (const route of ROUTES) {
  test(`/${route} loads and shows no raw ids`, async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, route);
    expect(await rawIds(page), 'ids visible on screen').toEqual([]);
    expect(errors, 'page or console errors').toEqual([]);
  });
}
