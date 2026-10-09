import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests (e2e/). `npm run test:e2e` starts the dev server on its own port; each test
 * gets a fresh browser context, so localStorage is empty and screens load the seed data.
 */
const PORT = 5199;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
