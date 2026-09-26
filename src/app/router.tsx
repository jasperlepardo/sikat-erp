import { createHashRouter } from 'react-router';
import { AppShell } from './AppShell';
import { Home } from '../pages/Home';
import { ItemList } from '../pages/inventory/items/ItemList';
import { ItemDetail } from '../pages/inventory/items/ItemDetail';
import { Placeholder } from '../pages/Placeholder';

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
      { path: '*', element: <Placeholder /> },
    ],
  },
]);
