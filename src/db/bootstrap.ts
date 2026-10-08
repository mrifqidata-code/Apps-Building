import { db, type PosDatabase } from './db';
import { seedDemoData } from './seed';

/**
 * Runs once at startup: makes sure this device has a store to work with
 * and asks the browser not to evict our data when storage runs low.
 */
export async function bootstrap(database: PosDatabase = db): Promise<string> {
  const storeId = await seedDemoData(database);
  // Best effort: Chrome grants this to installed PWAs and frequently used sites.
  await navigator.storage?.persist?.().catch(() => false);
  return storeId;
}
