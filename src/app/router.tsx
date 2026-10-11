import { lazy, type ComponentType } from 'react';
import { createHashRouter, Navigate } from 'react-router';
import { AppShell } from './AppShell';
import { Home } from '../pages/Home';
import { ROLE_CONFIG, scopeConfig, type PartnerScope } from '../pages/partners/roles';

/**
 * A page loaded on first visit: each route is its own chunk, so the first screen doesn't download
 * every page (and the seeds and history replays they pull in). AppShell's Suspense shows meanwhile.
 */
function page<M extends Record<K, ComponentType<any>>, K extends keyof M & string>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

const InventoryDashboard = page(() => import('../pages/inventory/InventoryDashboard'), 'InventoryDashboard');
const ItemList = page(() => import('../pages/inventory/items/ItemList'), 'ItemList');
const ItemDetail = page(() => import('../pages/inventory/items/detail/ItemDetail'), 'ItemDetail');
const Placeholder = page(() => import('../pages/Placeholder'), 'Placeholder');
const AccountingTaxPage = page(() => import('../pages/settings/accounting-tax/AccountingTaxPage'), 'AccountingTaxPage');
const InventorySettingsPage = page(() => import('../pages/settings/inventory/InventorySettingsPage'), 'InventorySettingsPage');
const BankingSettingsPage = page(() => import('../pages/settings/MasterSettingsPages'), 'BankingSettingsPage');
const CompanySettingsPage = page(() => import('../pages/settings/MasterSettingsPages'), 'CompanySettingsPage');
const SalesCrmSettingsPage = page(() => import('../pages/settings/MasterSettingsPages'), 'SalesCrmSettingsPage');
const PurchasingSettingsPage = page(() => import('../pages/settings/purchasing/PurchasingSettingsPage'), 'PurchasingSettingsPage');
const DocumentNumberingPage = page(() => import('../pages/settings/document-numbering/DocumentNumberingPage'), 'DocumentNumberingPage');
const WarehousesPage = page(() => import('../pages/inventory/WarehousesPage'), 'WarehousesPage');
const StockOnHandPage = page(() => import('../pages/inventory/StockOnHandPage'), 'StockOnHandPage');
const InventoryTransferList = page(() => import('../pages/inventory/transfers/InventoryTransferList'), 'InventoryTransferList');
const InventoryTransferDetail = page(() => import('../pages/inventory/transfers/InventoryTransferDetail'), 'InventoryTransferDetail');
const PriceListsPage = page(() => import('../pages/inventory/pricing/PriceListsPage'), 'PriceListsPage');
const InventoryPostingList = page(() => import('../pages/inventory/counts/StockCountList'), 'InventoryPostingList');
const StockCountList = page(() => import('../pages/inventory/counts/StockCountList'), 'StockCountList');
const InventoryPostingDetail = page(() => import('../pages/inventory/counts/InventoryPostingDetail'), 'InventoryPostingDetail');
const StockCountDetail = page(() => import('../pages/inventory/counts/StockCountDetail'), 'StockCountDetail');
const PurchaseDashboard = page(() => import('../pages/purchasing/PurchaseDashboard'), 'PurchaseDashboard');
const PurchaseRequestList = page(() => import('../pages/purchasing/requests/PurchaseRequestList'), 'PurchaseRequestList');
const PurchaseRequestDetail = page(() => import('../pages/purchasing/requests/detail/PurchaseRequestDetail'), 'PurchaseRequestDetail');
const PurchaseOrderList = page(() => import('../pages/purchasing/orders/PurchaseOrderList'), 'PurchaseOrderList');
const SalesOrderList = page(() => import('../pages/sales/orders/SalesOrderList'), 'SalesOrderList');
const SalesOrderDetail = page(() => import('../pages/sales/orders/detail/SalesOrderDetail'), 'SalesOrderDetail');
const DeliveryList = page(() => import('../pages/sales/deliveries/DeliveryList'), 'DeliveryList');
const DeliveryDetail = page(() => import('../pages/sales/deliveries/detail/DeliveryDetail'), 'DeliveryDetail');
const QuotationList = page(() => import('../pages/sales/quotations/QuotationList'), 'QuotationList');
const QuotationDetail = page(() => import('../pages/sales/quotations/QuotationDetail'), 'QuotationDetail');
const ArInvoiceList = page(() => import('../pages/sales/invoices/ArInvoiceList'), 'ArInvoiceList');
const ArInvoiceDetail = page(() => import('../pages/sales/invoices/detail/ArInvoiceDetail'), 'ArInvoiceDetail');
const IncomingPaymentList = page(() => import('../pages/sales/payments/IncomingPaymentList'), 'IncomingPaymentList');
const IncomingPaymentDetail = page(() => import('../pages/sales/payments/detail/IncomingPaymentDetail'), 'IncomingPaymentDetail');
const ArCreditMemoDetail = page(() => import('../pages/sales/returns/ArCreditMemoDetail'), 'ArCreditMemoDetail');
const SalesReturnsList = page(() => import('../pages/sales/returns/SalesReturnsList'), 'SalesReturnsList');
const SalesReturnDetail = page(() => import('../pages/sales/returns/SalesReturnDetail'), 'SalesReturnDetail');
const RfqList = page(() => import('../pages/purchasing/rfqs/RfqList'), 'RfqList');
const RfqDetail = page(() => import('../pages/purchasing/rfqs/detail/RfqDetail'), 'RfqDetail');
const PurchaseOrderDetail = page(() => import('../pages/purchasing/orders/detail/PurchaseOrderDetail'), 'PurchaseOrderDetail');
const GoodsReceiptList = page(() => import('../pages/purchasing/receipts/GoodsReceiptList'), 'GoodsReceiptList');
const GoodsReceiptDetail = page(() => import('../pages/purchasing/receipts/detail/GoodsReceiptDetail'), 'GoodsReceiptDetail');
const ApInvoiceList = page(() => import('../pages/purchasing/invoices/ApInvoiceList'), 'ApInvoiceList');
const ApInvoiceDetail = page(() => import('../pages/purchasing/invoices/detail/ApInvoiceDetail'), 'ApInvoiceDetail');
const DprList = page(() => import('../pages/purchasing/down-payments/DprList'), 'DprList');
const DprDetail = page(() => import('../pages/purchasing/down-payments/DprDetail'), 'DprDetail');
const PaymentList = page(() => import('../pages/purchasing/payments/PaymentList'), 'PaymentList');
const PaymentDetail = page(() => import('../pages/purchasing/payments/detail/PaymentDetail'), 'PaymentDetail');
const ReturnsList = page(() => import('../pages/purchasing/returns/ReturnsList'), 'ReturnsList');
const GoodsReturnDetail = page(() => import('../pages/purchasing/returns/GoodsReturnDetail'), 'GoodsReturnDetail');
const CreditMemoDetail = page(() => import('../pages/purchasing/returns/CreditMemoDetail'), 'CreditMemoDetail');
const AccountingDashboard = page(() => import('../pages/accounting/AccountingDashboard'), 'AccountingDashboard');
const ChartOfAccountsPage = page(() => import('../pages/accounting/ChartOfAccountsPage'), 'ChartOfAccountsPage');
const JournalEntryList = page(() => import('../pages/accounting/journal/JournalEntryList'), 'JournalEntryList');
const JournalEntryDetail = page(() => import('../pages/accounting/journal/JournalEntryDetail'), 'JournalEntryDetail');
const ExchangeRateDifferencesPage = page(() => import('../pages/accounting/fx/ExchangeRateDifferencesPage'), 'ExchangeRateDifferencesPage');
const JournalVoucherList = page(() => import('../pages/accounting/vouchers/JournalVoucherList'), 'JournalVoucherList');
const JournalVoucherDetail = page(() => import('../pages/accounting/vouchers/JournalVoucherDetail'), 'JournalVoucherDetail');
const VoucherEntryDetail = page(() => import('../pages/accounting/vouchers/VoucherEntryDetail'), 'VoucherEntryDetail');
const SalesDashboard = page(() => import('../pages/sales/SalesDashboard'), 'SalesDashboard');
const BlanketAgreementList = page(() => import('../pages/sales/agreements/BlanketAgreementList'), 'BlanketAgreementList');
const BlanketAgreementDetail = page(() => import('../pages/sales/agreements/detail/BlanketAgreementDetail'), 'BlanketAgreementDetail');
const PurchaseBlanketAgreementList = page(() => import('../pages/purchasing/agreements/PurchaseBlanketAgreementList'), 'PurchaseBlanketAgreementList');
const PurchaseBlanketAgreementDetail = page(() => import('../pages/purchasing/agreements/detail/PurchaseBlanketAgreementDetail'), 'PurchaseBlanketAgreementDetail');
const ApprovalsPage = page(() => import('../pages/approvals/ApprovalsPage'), 'ApprovalsPage');
const PartnerList = page(() => import('../pages/partners/PartnerList'), 'PartnerList');
const PartnerDetail = page(() => import('../pages/partners/detail/PartnerDetail'), 'PartnerDetail');
const ActivityList = page(() => import('../pages/crm/ActivityList'), 'ActivityList');

/** Business Partners (all) plus Leads, Customers and Vendors: one list + form pair each. */
const partnerRoutes = (['all', ...Object.keys(ROLE_CONFIG)] as PartnerScope[]).flatMap((scope) => {
  const path = scopeConfig(scope).basePath.slice(1);
  return [
    { path, element: <PartnerList key={scope} scope={scope} /> },
    { path: `${path}/:id`, element: <PartnerDetail key={scope} scope={scope} /> },
  ];
});

/**
 * Hash routing (`/#/items`) so the static build works on any host — GitHub Pages,
 * Netlify, a file share — with no server-side rewrite rules.
 */
export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'approvals/pending-approvals', element: <ApprovalsPage /> },
      { path: 'crm/activities', element: <ActivityList /> },
      { path: 'inventory/dashboard', element: <InventoryDashboard /> },
      { path: 'inventory/items', element: <ItemList /> },
      { path: 'inventory/items/:id', element: <ItemDetail /> },
      { path: 'inventory/stock-on-hand', element: <StockOnHandPage /> },
      { path: 'inventory/stock-movements', element: <InventoryTransferList /> },
      { path: 'inventory/stock-movements/:id', element: <InventoryTransferDetail /> },
      { path: 'inventory/stock-counts', element: <StockCountList /> },
      { path: 'inventory/stock-counts/postings', element: <InventoryPostingList /> },
      { path: 'inventory/stock-counts/postings/:id', element: <InventoryPostingDetail /> },
      { path: 'inventory/stock-counts/:id', element: <StockCountDetail /> },
      ...partnerRoutes,
      { path: 'sales/dashboard', element: <SalesDashboard /> },
      { path: 'sales/quotations', element: <QuotationList /> },
      { path: 'sales/quotations/:id', element: <QuotationDetail /> },
      { path: 'sales/sales-orders', element: <SalesOrderList /> },
      { path: 'sales/sales-orders/:id', element: <SalesOrderDetail /> },
      { path: 'sales/deliveries', element: <DeliveryList /> },
      { path: 'sales/deliveries/:id', element: <DeliveryDetail /> },
      { path: 'sales/invoices', element: <ArInvoiceList /> },
      { path: 'sales/invoices/:id', element: <ArInvoiceDetail /> },
      { path: 'sales/payments-received', element: <IncomingPaymentList /> },
      { path: 'sales/payments-received/:id', element: <IncomingPaymentDetail /> },
      { path: 'sales/returns-and-credits', element: <SalesReturnsList kind="returns" /> },
      { path: 'sales/returns-and-credits/returns', element: <SalesReturnsList kind="returns" /> },
      { path: 'sales/returns-and-credits/returns/:id', element: <SalesReturnDetail /> },
      { path: 'sales/returns-and-credits/credit-memos', element: <SalesReturnsList kind="memos" /> },
      { path: 'sales/returns-and-credits/credit-memos/:id', element: <ArCreditMemoDetail /> },
      { path: 'sales/agreements', element: <BlanketAgreementList /> },
      { path: 'sales/agreements/:id', element: <BlanketAgreementDetail /> },
      { path: 'purchasing/dashboard', element: <PurchaseDashboard /> },
      { path: 'purchasing/requests', element: <PurchaseRequestList /> },
      { path: 'purchasing/requests/:id', element: <PurchaseRequestDetail /> },
      { path: 'purchasing/quotations', element: <RfqList /> },
      { path: 'purchasing/quotations/:id', element: <RfqDetail /> },
      { path: 'purchasing/purchase-orders', element: <PurchaseOrderList /> },
      { path: 'purchasing/purchase-orders/:id', element: <PurchaseOrderDetail /> },
      { path: 'purchasing/goods-receipts', element: <GoodsReceiptList /> },
      { path: 'purchasing/goods-receipts/:id', element: <GoodsReceiptDetail /> },
      { path: 'purchasing/bills', element: <ApInvoiceList /> },
      { path: 'purchasing/bills/down-payment-requests', element: <DprList /> },
      { path: 'purchasing/bills/down-payment-requests/:id', element: <DprDetail /> },
      { path: 'purchasing/bills/:id', element: <ApInvoiceDetail /> },
      { path: 'purchasing/payments-made', element: <PaymentList /> },
      { path: 'purchasing/payments-made/:id', element: <PaymentDetail /> },
      { path: 'purchasing/returns-and-debits', element: <ReturnsList key="returns" kind="returns" /> },
      { path: 'purchasing/returns-and-debits/returns', element: <ReturnsList key="returns" kind="returns" /> },
      { path: 'purchasing/returns-and-debits/returns/:id', element: <GoodsReturnDetail /> },
      { path: 'purchasing/returns-and-debits/credit-memos', element: <ReturnsList key="memos" kind="memos" /> },
      { path: 'purchasing/returns-and-debits/credit-memos/:id', element: <CreditMemoDetail /> },
      { path: 'purchasing/agreements', element: <PurchaseBlanketAgreementList /> },
      { path: 'purchasing/agreements/:id', element: <PurchaseBlanketAgreementDetail /> },
      // Settings shell: redirect bare /settings to the first settings module.
      { path: 'settings', element: <Navigate to="/settings/company" replace /> },
      // Settings pages keep the tab and an opened record in the URL.
      { path: 'settings/accounting-and-tax/:tab?/:recordId?', element: <AccountingTaxPage /> },
      { path: 'settings/inventory/:tab?/:recordId?', element: <InventorySettingsPage /> },
      { path: 'settings/document-numbering/:tab?/:recordId?', element: <DocumentNumberingPage /> },
      { path: 'settings/purchasing/:tab?/:recordId?', element: <PurchasingSettingsPage /> },
      { path: 'settings/sales-and-crm/:tab?/:recordId?', element: <SalesCrmSettingsPage /> },
      { path: 'settings/banking/:tab?/:recordId?', element: <BankingSettingsPage /> },
      { path: 'settings/company/:tab?/:recordId?', element: <CompanySettingsPage /> },
      { path: 'inventory/warehouses-and-bins/:tab?/:recordId?', element: <WarehousesPage /> },
      { path: 'inventory/price-lists/:tab?/:recordId?', element: <PriceListsPage /> },
      { path: 'accounting/dashboard', element: <AccountingDashboard /> },
      { path: 'accounting/chart-of-accounts/:recordId?', element: <ChartOfAccountsPage /> },
      { path: 'accounting/journal-entries', element: <JournalEntryList /> },
      { path: 'accounting/journal-entries/:id', element: <JournalEntryDetail /> },
      { path: 'accounting/exchange-rate-differences', element: <ExchangeRateDifferencesPage /> },
      { path: 'accounting/journal-vouchers', element: <JournalVoucherList /> },
      { path: 'accounting/journal-vouchers/:id', element: <JournalVoucherDetail /> },
      { path: 'accounting/journal-vouchers/:id/entries/:entryId', element: <VoucherEntryDetail /> },
      { path: '*', element: <Placeholder /> },
    ],
  },
]);
