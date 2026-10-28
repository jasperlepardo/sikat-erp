import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'build', 'release', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    // The two classic hooks rules only: the plugin's React Compiler rules don't apply, as the app
    // doesn't use the compiler.
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // tsc's noUnusedLocals / noUnusedParameters already report these; `_name` rest-destructuring drops a field.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      // Page and side-panel headers go through PageHeader, which fixes the house look (docs/page-header-plan.md).
      'no-restricted-imports': ['error', {
        paths: [{ name: '@jasperlepardo/sikat-design-system', importNames: ['PanelHeader'], message: 'Use PageHeader from components/form/PageHeader.' }],
      }],
    },
  },
]);
