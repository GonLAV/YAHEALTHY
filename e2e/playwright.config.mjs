import { defineConfig, devices } from '@playwright/test';

// Chromium comes preinstalled in /opt/pw-browsers on the dev/CI images; point
// PLAYWRIGHT_BROWSERS_PATH elsewhere if yours lives somewhere else.
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.mjs',
  // One backend with an in-memory store and per-IP rate limits: run serially.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './test-results/artifacts',
  use: {
    ...devices['Desktop Chrome'],
    // baseURL is supplied per test from E2E_BASE_URL (see tests/fixtures.mjs),
    // because the port is only known once globalSetup has started Vite.
    timezoneId: 'Asia/Jerusalem',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
