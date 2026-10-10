import { createHashRouter, Navigate } from 'react-router';
import { AppShell } from './AppShell';
import { Home } from '../pages/Home';
import { InventoryDashboard } from '../pages/inventory/InventoryDashboard';
import { ItemList } from '../pages/inventory/items/ItemList';
import { ItemDetail } from '../pages/inventory/items/detail/ItemDetail';
import { Placeholder } from '../pages/Placeholder';
import { AccountingTaxPage } from '../pages/settings/accounting-tax/AccountingTaxPage';
import { InventorySettingsPage } from '../pages/settings/inventory/InventorySettingsPage';
import { BankingSettingsPage, CompanySettingsPage, SalesCrmSettingsPage } from '../pages/settings/MasterSettingsPages';
import { PurchasingSettingsPage } from '../pages/settings/purchasing/PurchasingSettingsPage';
import { DocumentNumberingPage } from '../pages/settings/document-numbering/DocumentNumberingPage';
import { WarehousesPage } from '../pages/inventory/WarehousesPage';
import { StockOnHandPage } from '../pages/inventory/StockOnHandPage';
import { InventoryTransferList } from '../pages/inventory/transfers/InventoryTransferList';
import { InventoryTransferDetail } from '../pages/inventory/transfers/InventoryTransferDetail';
import { PriceListsPage } from '../pages/inventory/pricing/PriceListsPage';
import { InventoryPostingList, StockCountList } from '../pages/inventory/counts/StockCountList';
import { InventoryPostingDetail } from '../pages/inventory/counts/InventoryPostingDetail';
import { StockCountDetail } from '../pages/inventory/counts/StockCountDetail';
import { PurchaseDashboard } from '../pages/purchasing/PurchaseDashboard';
import { PurchaseOrderList } from '../pages/purchasing/orders/PurchaseOrderList';
import { SalesOrderList } from '../pages/sales/orders/SalesOrderList';
import { SalesOrderDetail } from '../pages/sales/orders/detail/SalesOrderDetail';
import { DeliveryList } from '../pages/sales/deliveries/DeliveryList';
import { DeliveryDetail } from '../pages/sales/deliveries/detail/DeliveryDetail';
import { ArInvoiceList } from '../pages/sales/invoices/ArInvoiceList';
import { ArInvoiceDetail } from '../pages/sales/invoices/detail/ArInvoiceDetail';
import { IncomingPaymentList } from '../pages/sales/payments/IncomingPaymentList';
import { IncomingPaymentDetail } from '../pages/sales/payments/detail/IncomingPaymentDetail';
import { ArCreditMemoDetail } from '../pages/sales/returns/ArCreditMemoDetail';
import { SalesReturnsList } from '../pages/sales/returns/SalesReturnsList';
import { SalesReturnDetail } from '../pages/sales/returns/SalesReturnDetail';
import { PurchaseOrderDetail } from '../pages/purchasing/orders/detail/PurchaseOrderDetail';
import { GoodsReceiptList } from '../pages/purchasing/receipts/GoodsReceiptList';
import { GoodsReceiptDetail } from '../pages/purchasing/receipts/detail/GoodsReceiptDetail';
import { ApInvoiceList } from '../pages/purchasing/invoices/ApInvoiceList';
import { ApInvoiceDetail } from '../pages/purchasing/invoices/detail/ApInvoiceDetail';
import { DprList } from '../pages/purchasing/down-payments/DprList';
import { DprDetail } from '../pages/purchasing/down-payments/DprDetail';
import { PaymentList } from '../pages/purchasing/payments/PaymentList';
import { PaymentDetail } from '../pages/purchasing/payments/detail/PaymentDetail';
import { ReturnsList } from '../pages/purchasing/returns/ReturnsList';
import { GoodsReturnDetail } from '../pages/purchasing/returns/GoodsReturnDetail';
import { CreditMemoDetail } from '../pages/purchasing/returns/CreditMemoDetail';
import { AccountingDashboard } from '../pages/accounting/AccountingDashboard';
import { ChartOfAccountsPage } from '../pages/accounting/ChartOfAccountsPage';
import { JournalEntryList } from '../pages/accounting/journal/JournalEntryList';
import { JournalEntryDetail } from '../pages/accounting/journal/JournalEntryDetail';
import { ExchangeRateDifferencesPage } from '../pages/accounting/fx/ExchangeRateDifferencesPage';
import { JournalVoucherList } from '../pages/accounting/vouchers/JournalVoucherList';
import { JournalVoucherDetail } from '../pages/accounting/vouchers/JournalVoucherDetail';
import { VoucherEntryDetail } from '../pages/accounting/vouchers/VoucherEntryDetail';
import { SalesDashboard } from '../pages/sales/SalesDashboard';
import { PartnerList } from '../pages/partners/PartnerList';
import { PartnerDetail } from '../pages/partners/detail/PartnerDetail';
import { ROLE_CONFIG, scopeConfig, type PartnerScope } from '../pages/partners/roles';

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
      { path: 'purchasing/dashboard', element: <PurchaseDashboard /> },
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
