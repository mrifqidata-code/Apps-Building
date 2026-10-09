import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests with cloud sync on, against a local Supabase:
 *   npm run db:start          # once; needs Docker
 *   npm run test:e2e:cloud
 * The app is built into dist-cloud with the local Supabase URL and key.
 */
const PORT = 4174;
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// Fixed key of every local Supabase stack (not secret, never used in production).
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'cloud.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
  },
  webServer: {
    command: `npx vite build --outDir dist-cloud && npx vite preview --outDir dist-cloud --port ${PORT} --strictPort`,
    env: { VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
