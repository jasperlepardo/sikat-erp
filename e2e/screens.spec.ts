import { expect, test } from '@playwright/test';
import { open, rawIds, watchErrors } from './helpers';

/**
 * Every screen the id migration touched loads without errors and shows names, never raw ids.
 * One test per route so a failure names the screen.
 */
const ROUTES = [
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
  'crm/activities',
  // Purchasing documents.
  'purchasing/requests',
  'purchasing/requests/prq-001',
  'purchasing/purchase-quotations',
  'purchasing/purchase-quotations/RFQ-2026-0001',
  'purchasing/purchase-orders',
  'purchasing/purchase-orders/po-001',
  'purchasing/goods-receipts',
  'purchasing/bills',
  'purchasing/bills/ap-001',
  'purchasing/bills/down-payment-requests',
  'purchasing/bills/down-payment-requests/dp-001',
  'purchasing/payments-made',
  'purchasing/payments-made/op-001',
  'purchasing/returns-and-debits',
  'purchasing/returns-and-debits/returns',
  'purchasing/returns-and-debits/returns/rt-001',
  'purchasing/returns-and-debits/credit-memos',
  'purchasing/returns-and-debits/credit-memos/cm-001',
  'purchasing/agreements',
  'purchasing/agreements/pba-001',
  // Sales documents.
  'sales/quotations',
  'sales/quotations/qt-001',
  'sales/sales-orders',
  'sales/sales-orders/so-001',
  'sales/deliveries',
  'sales/deliveries/dn-001',
  'sales/invoices',
  'sales/invoices/ar-004',
  'sales/payments-received',
  'sales/payments-received/rc-001',
  'sales/returns-and-credits',
  'sales/returns-and-credits/returns',
  'sales/returns-and-credits/returns/sr-001',
  'sales/returns-and-credits/credit-memos',
  'sales/returns-and-credits/credit-memos/acm-001',
  'sales/agreements',
  'sales/agreements/ba-001',
  // Inventory: item groups, UoMs, variant attributes, warehouses, bins, counts, transfers, pricing.
  'inventory/items',
  'inventory/items/apl-fam-001',
  'inventory/items/apl-0001',
  'inventory/stock-on-hand',
  'inventory/inventory-transfers',
  'inventory/inventory-transfers/it-001',
  'inventory/transfer-requests',
  'inventory/transfer-requests/itr-001',
  'inventory/transfer-requests/itr-002',
  'inventory/transfer-requests/new',
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
  'people/employees/new',
  // Settings lists.
  'settings/document-numbering',
  'settings/purchasing',
  'settings/sales-and-crm',
  'settings/banking',
  'settings/banking/payment-terms',
  'settings/banking/house-bank-accounts',
  'settings/company',
  'settings/company/projects',
  'settings/company/countries',
  'settings/company/branches',
  'settings/company/users',
  'settings/people',
  'settings/people/teams',
  'settings/inventory/item-groups',
  'settings/inventory/uoms',
  'settings/inventory/manufacturers',
  'settings/inventory/variant-attributes',
  'settings/inventory/variant-attributes/va-001',
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
