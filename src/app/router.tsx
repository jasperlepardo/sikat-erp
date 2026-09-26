import { createHashRouter } from 'react-router';
import { AppShell } from './AppShell';
import { Home } from '../pages/Home';
import { ItemList } from '../pages/inventory/items/ItemList';
import { ItemDetail } from '../pages/inventory/items/ItemDetail';
import { Placeholder } from '../pages/Placeholder';
import { PartnerList } from '../pages/partners/PartnerList';
import { PartnerDetail } from '../pages/partners/detail/PartnerDetail';
import { ROLE_CONFIG } from '../pages/partners/roles';
import type { PartnerRole } from '../mocks/partners';

/** Leads, Customers and Vendors: one business partner screen pair per role. */
const partnerRoutes = (Object.keys(ROLE_CONFIG) as PartnerRole[]).flatMap((role) => {
  const path = ROLE_CONFIG[role].basePath.slice(1);
  return [
    { path, element: <PartnerList key={role} role={role} /> },
    { path: `${path}/:id`, element: <PartnerDetail key={role} role={role} /> },
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
      ...partnerRoutes,
      { path: '*', element: <Placeholder /> },
    ],
  },
]);
