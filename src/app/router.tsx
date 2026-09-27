import { createHashRouter } from 'react-router';
import { AppShell } from './AppShell';
import { Home } from '../pages/Home';
import { ItemList } from '../pages/inventory/items/ItemList';
import { ItemDetail } from '../pages/inventory/items/detail/ItemDetail';
import { ItemListNew } from '../pages/inventory/items-new/ItemListNew';
import { ItemDetailNew } from '../pages/inventory/items-new/ItemDetailNew';
import { Placeholder } from '../pages/Placeholder';
import { AccountingTaxPage } from '../pages/settings/accounting-tax/AccountingTaxPage';
import { InventorySettingsPage } from '../pages/settings/inventory/InventorySettingsPage';
import { WarehousesPage } from '../pages/inventory/WarehousesPage';
import { PurchaseOrderList } from '../pages/purchasing/orders/PurchaseOrderList';
import { PurchaseOrderDetail } from '../pages/purchasing/orders/detail/PurchaseOrderDetail';
import { ChartOfAccountsPage } from '../pages/accounting/ChartOfAccountsPage';
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
      { path: 'inventory/items', element: <ItemList /> },
      { path: 'inventory/items/:id', element: <ItemDetail /> },
      { path: 'inventory/items-new', element: <ItemListNew /> },
      { path: 'inventory/items-new/:id', element: <ItemDetailNew /> },
      ...partnerRoutes,
      { path: 'purchasing/purchase-orders', element: <PurchaseOrderList /> },
      { path: 'purchasing/purchase-orders/:id', element: <PurchaseOrderDetail /> },
      // Settings pages keep the tab and an opened record in the URL.
      { path: 'settings/accounting-and-tax/:tab?/:recordId?', element: <AccountingTaxPage /> },
      { path: 'settings/inventory/:tab?/:recordId?', element: <InventorySettingsPage /> },
      { path: 'inventory/warehouses-and-bins/:recordId?', element: <WarehousesPage /> },
      { path: 'accounting/chart-of-accounts/:recordId?', element: <ChartOfAccountsPage /> },
      { path: '*', element: <Placeholder /> },
    ],
  },
]);
