import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { Category, Product } from '../../db/schema';

export interface Catalog {
  categories: Category[];
  products: Product[];
  /** Product ids that have at least one variant group. */
  productsWithVariants: Set<string>;
}

/** Active, non-deleted catalog of a store, kept live as IndexedDB changes. */
export function useCatalog(storeId: string): Catalog | undefined {
  return useLiveQuery(async () => {
    const [categories, products, groups] = await Promise.all([
      db.categories.where({ storeId }).toArray(),
      db.products.where({ storeId }).toArray(),
      db.variantGroups.where({ storeId }).toArray(),
    ]);
    const visible = <T extends { active: boolean; deletedAt: string | null }>(row: T) =>
      row.active && row.deletedAt === null;
    const visibleCategories = categories.filter(visible).sort((a, b) => a.sortOrder - b.sortOrder);
    // Products follow their category's order, so "Semua" lists Kopi first, then Non-Kopi, ...
    const categoryRank = new Map(visibleCategories.map((c, index) => [c.id, index]));
    const rank = (p: Product) => categoryRank.get(p.categoryId ?? '') ?? visibleCategories.length;
    return {
      categories: visibleCategories,
      products: products
        .filter(visible)
        .sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder),
      productsWithVariants: new Set(
        groups.filter((g) => g.deletedAt === null).map((g) => g.productId),
      ),
    };
  }, [storeId]);
}
