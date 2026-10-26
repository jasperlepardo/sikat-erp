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
  // The screens sweep fires ~220 cold chunk loads at one dev server; under full parallelism a few
  // occasionally time out on a slow chunk. Retry so transient contention doesn't fail the run — a
  // real page error reproduces on every retry, so this never hides a genuine bug.
  retries: 2,
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
