import { defineConfig } from 'vitest/config';

/**
 * Tests against a real local Supabase (Postgres + Auth + Storage in Docker):
 *   npm run db:start   # once
 *   npm run test:cloud
 * They prove the RLS rules and the sync between two devices end to end.
 */
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
    include: ['src/**/*.cloud.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
