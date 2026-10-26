import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the pure business logic in src/services (and a few component helpers).
 * Node environment with a localStorage shim and a frozen clock — see src/test/setup.ts.
 * Vitest (not tsx) because src/services/locations.ts uses import.meta.glob.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/mocks/**', 'src/components/filter/**'],
      reporter: ['text', 'html'],
    },
  },
});
