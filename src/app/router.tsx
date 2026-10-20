import { lazy, type ComponentType } from 'react';
import { createHashRouter, Navigate } from 'react-router';
import { AppShell } from './AppShell';
import { PageError } from './PageError';
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
const PreferencesPage = page(() => import('../pages/settings/PreferencesPage'), 'PreferencesPage');
const InventorySettingsPage = page(() => import('../pages/settings/inventory/InventorySettingsPage'), 'InventorySettingsPage');
const BankingSettingsPage = page(() => import('../pages/settings/MasterSettingsPages'), 'BankingSettingsPage');
const CompanySettingsPage = page(() => import('../pages/settings/MasterSettingsPages'), 'CompanySettingsPage');
const SalesCrmSettingsPage = page(() => import('../pages/settings/MasterSettingsPages'), 'SalesCrmSettingsPage');
const PeopleSettingsPage = page(() => import('../pages/settings/MasterSettingsPages'), 'PeopleSettingsPage');
const EmployeeList = page(() => import('../pages/people/EmployeeList'), 'EmployeeList');
const EmployeeDetail = page(() => import('../pages/people/detail/EmployeeDetail'), 'EmployeeDetail');
const PurchasingSettingsPage = page(() => import('../pages/settings/purchasing/PurchasingSettingsPage'), 'PurchasingSettingsPage');
const DocumentNumberingPage = page(() => import('../pages/settings/document-numbering/DocumentNumberingPage'), 'DocumentNumberingPage');
const JournalPatternsPage = page(() => import('../pages/settings/journal-patterns/JournalPatternsPage'), 'JournalPatternsPage');
const WarehousesPage = page(() => import('../pages/inventory/WarehousesPage'), 'WarehousesPage');
const StockOnHandPage = page(() => import('../pages/inventory/StockOnHandPage'), 'StockOnHandPage');
const InventoryTransferList = page(() => import('../pages/inventory/transfers/InventoryTransferList'), 'InventoryTransferList');
const InventoryTransferDetail = page(() => import('../pages/inventory/transfers/InventoryTransferDetail'), 'InventoryTransferDetail');
const TransferRequestList = page(() => import('../pages/inventory/transfer-requests/TransferRequestList'), 'TransferRequestList');
const TransferRequestDetail = page(() => import('../pages/inventory/transfer-requests/detail/TransferRequestDetail'), 'TransferRequestDetail');
const PriceListsPage = page(() => import('../pages/inventory/pricing/PriceListsPage'), 'PriceListsPage');
const InventoryPostingList = page(() => import('../pages/inventory/counts/StockCountList'), 'InventoryPostingList');
const StockCountList = page(() => import('../pages/inventory/counts/StockCountList'), 'StockCountList');
const InventoryPostingDetail = page(() => import('../pages/inventory/counts/InventoryPostingDetail'), 'InventoryPostingDetail');
const StockCountDetail = page(() => import('../pages/inventory/counts/StockCountDetail'), 'StockCountDetail');
const PurchaseDashboard = page(() => import('../pages/purchasing/PurchaseDashboard'), 'PurchaseDashboard');
const PurchaseRequestList = page(() => import('../pages/purchasing/purchase-requests/PurchaseRequestList'), 'PurchaseRequestList');
const PurchaseRequestDetail = page(() => import('../pages/purchasing/purchase-requests/detail/PurchaseRequestDetail'), 'PurchaseRequestDetail');
const PurchaseOrderList = page(() => import('../pages/purchasing/purchase-orders/PurchaseOrderList'), 'PurchaseOrderList');
const SalesOrderList = page(() => import('../pages/sales/sales-orders/SalesOrderList'), 'SalesOrderList');
const SalesOrderDetail = page(() => import('../pages/sales/sales-orders/detail/SalesOrderDetail'), 'SalesOrderDetail');
const DeliveryList = page(() => import('../pages/sales/deliveries/DeliveryList'), 'DeliveryList');
const DeliveryDetail = page(() => import('../pages/sales/deliveries/detail/DeliveryDetail'), 'DeliveryDetail');
const QuotationList = page(() => import('../pages/sales/quotations/QuotationList'), 'QuotationList');
const QuotationDetail = page(() => import('../pages/sales/quotations/detail/QuotationDetail'), 'QuotationDetail');
const ArInvoiceList = page(() => import('../pages/sales/invoices/ArInvoiceList'), 'ArInvoiceList');
const ArInvoiceDetail = page(() => import('../pages/sales/invoices/detail/ArInvoiceDetail'), 'ArInvoiceDetail');
const IncomingPaymentList = page(() => import('../pages/sales/payments-received/IncomingPaymentList'), 'IncomingPaymentList');
const IncomingPaymentDetail = page(() => import('../pages/sales/payments-received/detail/IncomingPaymentDetail'), 'IncomingPaymentDetail');
const ArCreditMemoDetail = page(() => import('../pages/sales/returns-and-credits/credit-memos/detail/ArCreditMemoDetail'), 'ArCreditMemoDetail');
const SalesReturnsList = page(() => import('../pages/sales/returns-and-credits/SalesReturnsList'), 'SalesReturnsList');
const SalesReturnDetail = page(() => import('../pages/sales/returns-and-credits/returns/detail/SalesReturnDetail'), 'SalesReturnDetail');
const RfqList = page(() => import('../pages/purchasing/purchase-quotations/RfqList'), 'RfqList');
const RfqDetail = page(() => import('../pages/purchasing/purchase-quotations/detail/PurchaseQuotationDetail'), 'RfqDetail');
const PurchaseOrderDetail = page(() => import('../pages/purchasing/purchase-orders/detail/PurchaseOrderDetail'), 'PurchaseOrderDetail');
const GoodsReceiptList = page(() => import('../pages/purchasing/goods-receipts/GoodsReceiptList'), 'GoodsReceiptList');
const GoodsReceiptDetail = page(() => import('../pages/purchasing/goods-receipts/detail/GoodsReceiptDetail'), 'GoodsReceiptDetail');
const ApInvoiceList = page(() => import('../pages/purchasing/vendor-invoices/ApInvoiceList'), 'ApInvoiceList');
const ApInvoiceDetail = page(() => import('../pages/purchasing/vendor-invoices/detail/ApInvoiceDetail'), 'ApInvoiceDetail');
const ApReserveInvoiceList = page(() => import('../pages/purchasing/reserve-invoices/ApReserveInvoiceList'), 'ApReserveInvoiceList');
const ApReserveInvoiceDetail = page(() => import('../pages/purchasing/reserve-invoices/detail/ApReserveInvoiceDetail'), 'ApReserveInvoiceDetail');
const DprList = page(() => import('../pages/purchasing/down-payment-requests/DprList'), 'DprList');
const DprDetail = page(() => import('../pages/purchasing/down-payment-requests/detail/DprDetail'), 'DprDetail');
const PaymentList = page(() => import('../pages/purchasing/payments-made/PaymentList'), 'PaymentList');
const PaymentDetail = page(() => import('../pages/purchasing/payments-made/detail/PaymentDetail'), 'PaymentDetail');
const GoodsReturnsList = page(() => import('../pages/purchasing/goods-returns/GoodsReturnsList'), 'GoodsReturnsList');
const DebitMemosList = page(() => import('../pages/purchasing/debit-memos/DebitMemosList'), 'DebitMemosList');
const GoodsReturnDetail = page(() => import('../pages/purchasing/goods-returns/GoodsReturnDetail'), 'GoodsReturnDetail');
const CreditMemoDetail = page(() => import('../pages/purchasing/debit-memos/CreditMemoDetail'), 'CreditMemoDetail');
const LandedCostsList = page(() => import('../pages/purchasing/landed-costs/LandedCostsList'), 'LandedCostsList');
const LandedCostDetail = page(() => import('../pages/purchasing/landed-costs/detail/LandedCostDetail'), 'LandedCostDetail');
const ReserveInvoiceList = page(() => import('../pages/sales/reserve-invoices/ReserveInvoiceList'), 'ReserveInvoiceList');
const ReserveInvoiceDetail = page(() => import('../pages/sales/reserve-invoices/detail/ReserveInvoiceDetail'), 'ReserveInvoiceDetail');
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
const PurchaseBlanketAgreementList = page(() => import('../pages/purchasing/purchase-agreements/PurchaseBlanketAgreementList'), 'PurchaseBlanketAgreementList');
const PurchaseBlanketAgreementDetail = page(() => import('../pages/purchasing/purchase-agreements/detail/PurchaseBlanketAgreementDetail'), 'PurchaseBlanketAgreementDetail');
const ApprovalsPage = page(() => import('../pages/approvals/ApprovalsPage'), 'ApprovalsPage');
const PartnerList = page(() => import('../pages/partners/PartnerList'), 'PartnerList');
const PartnerDetail = page(() => import('../pages/partners/detail/PartnerDetail'), 'PartnerDetail');
const ActivityList = page(() => import('../pages/crm/ActivityList'), 'ActivityList');

/** Business Partners (all) plus Leads, Customers and Vendors: one list + form pair each. */
const partnerRoutes = (['all', ...Object.keys(ROLE_CONFIG)] as PartnerScope[]).flatMap((scope) => {
  const path = scopeConfig(scope).basePath.slice(1);
  return [
    { path, element: <PartnerList key={scope} scope={scope} /> },
    { path: `${path}/:id/:tab?`, element: <PartnerDetail key={scope} scope={scope} /> },
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
      {
        // A page that fails to load or render shows its error inside the shell, not instead of it.
        errorElement: <PageError />,
        children: [
          { index: true, element: <Home /> },
          { path: 'approvals/pending-approvals', element: <ApprovalsPage /> },
          { path: 'crm/activities', element: <ActivityList /> },
          { path: 'inventory/dashboard', element: <InventoryDashboard /> },
          { path: 'inventory/items', element: <ItemList /> },
          { path: 'inventory/items/:id/:tab?', element: <ItemDetail /> },
          { path: 'inventory/stock-on-hand', element: <StockOnHandPage /> },
          { path: 'inventory/inventory-transfers', element: <InventoryTransferList /> },
          { path: 'inventory/inventory-transfers/:id', element: <InventoryTransferDetail /> },
          { path: 'inventory/transfer-requests', element: <TransferRequestList /> },
          { path: 'inventory/transfer-requests/:id', element: <TransferRequestDetail /> },
          { path: 'inventory/stock-counts', element: <StockCountList /> },
          { path: 'inventory/stock-counts/postings', element: <InventoryPostingList /> },
          { path: 'inventory/stock-counts/postings/:id', element: <InventoryPostingDetail /> },
          { path: 'inventory/stock-counts/:id', element: <StockCountDetail /> },
          ...partnerRoutes,
          { path: 'sales/dashboard', element: <SalesDashboard /> },
          { path: 'sales/quotations', element: <QuotationList /> },
          { path: 'sales/quotations/:id/:tab?', element: <QuotationDetail /> },
          { path: 'sales/sales-orders', element: <SalesOrderList /> },
          { path: 'sales/sales-orders/:id/:tab?', element: <SalesOrderDetail /> },
          { path: 'sales/deliveries', element: <DeliveryList /> },
          { path: 'sales/deliveries/:id/:tab?', element: <DeliveryDetail /> },
          { path: 'sales/customer-invoices', element: <ArInvoiceList /> },
          { path: 'sales/customer-invoices/:id/:tab?', element: <ArInvoiceDetail /> },
          { path: 'sales/reserve-invoices', element: <ReserveInvoiceList /> },
          { path: 'sales/reserve-invoices/:id/:tab?', element: <ReserveInvoiceDetail /> },
          { path: 'sales/incoming-payments', element: <IncomingPaymentList /> },
          { path: 'sales/incoming-payments/:id/:tab?', element: <IncomingPaymentDetail /> },
          { path: 'sales/sales-returns', element: <SalesReturnsList kind="returns" /> },
          { path: 'sales/sales-returns/:id/:tab?', element: <SalesReturnDetail /> },
          { path: 'sales/credit-memos', element: <SalesReturnsList kind="memos" /> },
          { path: 'sales/credit-memos/:id/:tab?', element: <ArCreditMemoDetail /> },
          { path: 'sales/agreements', element: <BlanketAgreementList /> },
          { path: 'sales/agreements/:id/:tab?', element: <BlanketAgreementDetail /> },
          { path: 'purchasing/dashboard', element: <PurchaseDashboard /> },
          { path: 'purchasing/purchase-requests', element: <PurchaseRequestList /> },
          { path: 'purchasing/purchase-requests/:id/:tab?', element: <PurchaseRequestDetail /> },
          { path: 'purchasing/purchase-quotations', element: <RfqList /> },
          { path: 'purchasing/purchase-quotations/:id/:tab?', element: <RfqDetail /> },
          { path: 'purchasing/purchase-orders', element: <PurchaseOrderList /> },
          { path: 'purchasing/purchase-orders/:id/:tab?', element: <PurchaseOrderDetail /> },
          { path: 'purchasing/goods-receipts', element: <GoodsReceiptList /> },
          { path: 'purchasing/goods-receipts/:id/:tab?', element: <GoodsReceiptDetail /> },



          { path: 'purchasing/vendor-invoices', element: <ApInvoiceList /> },
          { path: 'purchasing/vendor-invoices/:id/:tab?', element: <ApInvoiceDetail /> },
          { path: 'purchasing/reserve-invoices', element: <ApReserveInvoiceList /> },
          { path: 'purchasing/reserve-invoices/:id/:tab?', element: <ApReserveInvoiceDetail /> },
          { path: 'purchasing/down-payment-requests', element: <DprList /> },
          { path: 'purchasing/down-payment-requests/:id/:tab?', element: <DprDetail /> },
          { path: 'purchasing/outgoing-payments', element: <PaymentList /> },
          { path: 'purchasing/outgoing-payments/:id/:tab?', element: <PaymentDetail /> },




          { path: 'purchasing/goods-returns', element: <GoodsReturnsList /> },
          { path: 'purchasing/goods-returns/:id/:tab?', element: <GoodsReturnDetail /> },
          { path: 'purchasing/debit-memos', element: <DebitMemosList /> },
          { path: 'purchasing/debit-memos/:id/:tab?', element: <CreditMemoDetail /> },
          { path: 'purchasing/agreements', element: <PurchaseBlanketAgreementList /> },
          { path: 'purchasing/agreements/:id', element: <PurchaseBlanketAgreementDetail /> },
          { path: 'purchasing/landed-costs', element: <LandedCostsList /> },
          { path: 'purchasing/landed-costs/:id/:tab?', element: <LandedCostDetail /> },
          // Settings shell: redirect bare /settings to the first settings module.
          { path: 'settings', element: <Navigate to="/settings/company" replace /> },
          // Settings pages keep the tab and an opened record in the URL.
          { path: 'settings/accounting-and-tax/:tab?/:recordId?', element: <AccountingTaxPage /> },
          { path: 'settings/preferences', element: <PreferencesPage /> },
          { path: 'settings/inventory/:tab?/:recordId?', element: <InventorySettingsPage /> },
          { path: 'settings/document-numbering/:tab?/:recordId?', element: <DocumentNumberingPage /> },
          { path: 'settings/journal-patterns/:tab?/:recordId?', element: <JournalPatternsPage /> },
          { path: 'settings/purchasing/:tab?/:recordId?', element: <PurchasingSettingsPage /> },
          { path: 'settings/sales-and-crm/:tab?/:recordId?', element: <SalesCrmSettingsPage /> },
          { path: 'settings/banking/:tab?/:recordId?', element: <BankingSettingsPage /> },
          { path: 'settings/company/:tab?/:recordId?', element: <CompanySettingsPage /> },
          { path: 'settings/people/:tab?/:recordId?', element: <PeopleSettingsPage /> },
          { path: 'people/employees', element: <EmployeeList /> },
          { path: 'people/employees/:id', element: <EmployeeDetail /> },
          { path: 'inventory/warehouses-and-bins/:tab?/:recordId?', element: <WarehousesPage /> },
          { path: 'inventory/price-lists/:tab?/:recordId?', element: <PriceListsPage /> },
          { path: 'accounting/dashboard', element: <AccountingDashboard /> },
          { path: 'accounting/chart-of-accounts/:recordId?/:view?', element: <ChartOfAccountsPage /> },
          { path: 'accounting/journal-entries', element: <JournalEntryList /> },
          { path: 'accounting/journal-entries/:id/:tab?', element: <JournalEntryDetail /> },
          { path: 'accounting/exchange-rate-differences', element: <ExchangeRateDifferencesPage /> },
          { path: 'accounting/journal-vouchers', element: <JournalVoucherList /> },
          { path: 'accounting/journal-vouchers/:id', element: <JournalVoucherDetail /> },
          { path: 'accounting/journal-vouchers/:id/entries/:entryId', element: <VoucherEntryDetail /> },
          { path: '*', element: <Placeholder /> },
        ],
      },
    ],
  },
]);
