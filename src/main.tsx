import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { initTheme } from '@jasperlepardo/sikat-design-system';
import { router } from './app/router';
import { isElectron } from './services/installApp';
// Component + token CSS. The package's JS doesn't import it on its own, so load it explicitly.
import '@jasperlepardo/sikat-design-system/styles';
import './index.css';

initTheme();

// Desktop app: a title bar in the navbar's colour, in place of the hidden native one (see index.css).
if (isElectron) {
  document.documentElement.dataset.shell = navigator.userAgent.includes('Macintosh') ? 'electron-mac' : 'electron';
  const titleBar = document.createElement('div');
  titleBar.className = 'electron-titlebar';
  titleBar.textContent = document.title;
  document.body.prepend(titleBar);
}

// Offline support for the web build. Electron loads from file://, where service workers can't run.
if (location.protocol.startsWith('http')) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
