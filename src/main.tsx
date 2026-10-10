import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { initTheme } from '@jasperlepardo/sikat-design-system';
import { router } from './app/router';
// Component + token CSS. The package's JS doesn't import it on its own, so load it explicitly.
import '@jasperlepardo/sikat-design-system/styles';
import './index.css';

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
