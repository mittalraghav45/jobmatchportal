import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: process.env.E2E_REAL_API ? './e2e-real' : './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome']
  },
  webServer: [ ...(process.env.E2E_REAL_API ? [{ command: 'node ../backend/test-support/e2eServer.js', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: false, timeout: 120_000 }] : []), {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }]
});
