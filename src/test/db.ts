import { PosDatabase } from '../db/db';
import { META_DEVICE_ID, seedDemoData } from '../db/seed';

/** A fresh, isolated database filled with the demo store. */
export async function demoDatabase() {
  const database = new PosDatabase(`test-${crypto.randomUUID()}`);
  const storeId = await seedDemoData(database, '2026-10-08T01:00:00.000Z');
  const deviceId = (await database.meta.get(META_DEVICE_ID))!.value as string;
  const users = await database.users.toArray();
  const owner = users.find((u) => u.role === 'owner')!;
  const cashier = users.find((u) => u.role === 'cashier')!;
  const products = await database.products.toArray();
  const product = (name: string) => {
    const found = products.find((p) => p.name === name);
    if (!found) throw new Error(`no demo product ${name}`);
    return found;
  };
  const variantsOf = async (productName: string) => {
    const variants = await database.productVariants
      .where({ productId: product(productName).id })
      .toArray();
    const byName = (name: string) => variants.find((v) => v.name === name)!.id;
    return byName;
  };
  return { database, storeId, deviceId, owner, cashier, product, variantsOf };
}
