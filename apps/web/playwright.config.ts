import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

const COMMON_API_ENV = [
  'E2E_MAIL_MOCK=1',
  'E2E_CALENDAR_MOCK=1',
  'GCP_PROJECT_ID=demo-calendar-hub-e2e',
  'FIRESTORE_EMULATOR_HOST=127.0.0.1:8080',
  'FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099',
  'PORT=8088',
  'TOKEN_ENCRYPTION_KEY=e2e-test-key-not-used-because-mock',
  'GOOGLE_CLIENT_ID=e2e-mock',
  'GOOGLE_CLIENT_SECRET=e2e-mock',
].join(' ');

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: isCI ? [['github'], ['list']] : 'list',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3010',
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `${COMMON_API_ENV} pnpm --filter @calendar-hub/api exec tsx src/index.ts`,
      url: 'http://localhost:8088/health',
      reuseExistingServer: !isCI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command:
        'NEXT_PUBLIC_API_URL=http://localhost:8088 pnpm --filter @calendar-hub/web exec next dev --port 3010',
      url: 'http://localhost:3010',
      reuseExistingServer: !isCI,
      timeout: 240_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
