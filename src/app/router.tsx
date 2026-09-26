import { createHashRouter } from 'react-router';
import { AppShell } from './AppShell';
import { Home } from '../pages/Home';
import { ItemList } from '../pages/items/ItemList';
import { ItemDetail } from '../pages/items/ItemDetail';
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
      { path: 'items', element: <ItemList /> },
      { path: 'items/:id', element: <ItemDetail /> },
      { path: '*', element: <Placeholder /> },
    ],
  },
]);
