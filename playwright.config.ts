import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No automatic retries: a flaky test is a bug to fix, not to hide.
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure',
  },
  projects: [
    // Main target: Chrome on an Android phone. Also covered: Chrome on a laptop.
    { name: 'hp-android', use: { ...devices['Pixel 7'] } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'] } },
  ],
  // Tests run against the production build so the service worker is real.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
