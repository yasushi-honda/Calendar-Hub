import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Playwright E2E spec を vitest 対象から除外 (E2E は `pnpm e2e` で別途実行)
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.turbo/**', 'apps/web/e2e/**'],
  },
});
