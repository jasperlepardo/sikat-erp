import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Product base path for the dev server: the app is served at localhost:PORT/sikat/ .
// Change this one string to rename the path.
const APP_BASE = '/sikat/';

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // Build stays relative so the static bundle works from ANY subpath (e.g. GitHub Pages).
  // Dev server serves under the product base path, so URLs read localhost:PORT/sikat/#/… .
  base: command === 'build' ? './' : APP_BASE,
}));
