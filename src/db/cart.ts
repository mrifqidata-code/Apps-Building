import { uuidv7 } from '../domain/id';
import type { Rupiah } from '../domain/money';
import { assertQty, type Discount } from '../domain/pricing';
import type { Product, ProductVariant, VariantGroup, VariantSnapshot } from './schema';

/**
 * The cart only stores ids and choices. Prices are always read from the
 * catalog, so a price edited mid-sale is picked up and the sale snapshots
 * whatever the catalog says at checkout.
 */
export interface CartLine {
  key: string;
  productId: string;
  variantIds: string[];
  qty: number;
  note: string | null;
  discount: Discount | null;
}

export interface Cart {
  lines: CartLine[];
  discount: Discount | null;
}

export const EMPTY_CART: Cart = { lines: [], discount: null };

export type CartAction =
  | { type: 'add'; productId: string; variantIds?: string[] }
  | { type: 'setQty'; key: string; qty: number }
  | { type: 'remove'; key: string }
  | { type: 'setNote'; key: string; note: string }
  | { type: 'setLineDiscount'; key: string; discount: Discount | null }
  | { type: 'setDiscount'; discount: Discount | null }
  | { type: 'clear' }
  | { type: 'replace'; cart: Cart };

function sameVariants(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort();
  return [...a].sort().every((id, i) => id === sortedB[i]);
}

export function cartReducer(cart: Cart, action: CartAction): Cart {
  const update = (key: string, change: (line: CartLine) => CartLine): Cart => ({
    ...cart,
    lines: cart.lines.map((line) => (line.key === key ? change(line) : line)),
  });

  switch (action.type) {
    case 'add': {
      const variantIds = action.variantIds ?? [];
      // Tapping the same item again adds to its quantity, unless that line
      // was customised with a note or discount.
      const existing = cart.lines.find(
        (line) =>
          line.productId === action.productId &&
          sameVariants(line.variantIds, variantIds) &&
          !line.note &&
          !line.discount,
      );
      if (existing) return update(existing.key, (line) => ({ ...line, qty: line.qty + 1 }));
      return {
        ...cart,
        lines: [
          ...cart.lines,
          {
            key: uuidv7(),
            productId: action.productId,
            variantIds,
            qty: 1,
            note: null,
            discount: null,
          },
        ],
      };
    }
    case 'setQty':
      if (action.qty <= 0) return cartReducer(cart, { type: 'remove', key: action.key });
      assertQty(action.qty);
      return update(action.key, (line) => ({ ...line, qty: action.qty }));
    case 'remove': {
      const lines = cart.lines.filter((line) => line.key !== action.key);
      return { lines, discount: lines.length ? cart.discount : null };
    }
    case 'setNote':
      return update(action.key, (line) => ({ ...line, note: action.note.trim() || null }));
    case 'setLineDiscount':
      return update(action.key, (line) => ({ ...line, discount: action.discount }));
    case 'setDiscount':
      return { ...cart, discount: action.discount };
    case 'clear':
      return EMPTY_CART;
    case 'replace':
      return action.cart;
  }
}

export function cartItemCount(cart: Cart): number {
  return cart.lines.reduce((sum, line) => sum + line.qty, 0);
}

/* ---- Resolving a cart against the catalog ---- */

export interface CatalogIndex {
  products: Map<string, Product>;
  variants: Map<string, ProductVariant>;
  groups: Map<string, VariantGroup>;
}

export function buildCatalogIndex(
  products: Product[],
  variants: ProductVariant[],
  groups: VariantGroup[],
): CatalogIndex {
  return {
    products: new Map(products.map((p) => [p.id, p])),
    variants: new Map(variants.map((v) => [v.id, v])),
    groups: new Map(groups.map((g) => [g.id, g])),
  };
}

export class CartError extends Error {}

export interface ResolvedLine {
  line: CartLine;
  product: Product;
  variants: VariantSnapshot[];
  unitPrice: Rupiah;
  unitCost: Rupiah;
}

/** Live (not deleted) groups of a product with their active options, in display order. */
export function variantGroupsOf(
  productId: string,
  index: CatalogIndex,
): { group: VariantGroup; options: ProductVariant[] }[] {
  const bySort = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;
  return [...index.groups.values()]
    .filter((g) => g.productId === productId && g.deletedAt === null)
    .sort(bySort)
    .map((group) => ({
      group,
      options: [...index.variants.values()]
        .filter((v) => v.groupId === group.id && v.active && v.deletedAt === null)
        .sort(bySort),
    }))
    .filter(({ options }) => options.length > 0);
}

/** Returns an Indonesian error message, or null when the choice is valid. */
export function variantSelectionError(
  productId: string,
  variantIds: string[],
  index: CatalogIndex,
): string | null {
  const groups = variantGroupsOf(productId, index);
  for (const id of variantIds) {
    const variant = index.variants.get(id);
    if (!variant || variant.productId !== productId || !variant.active || variant.deletedAt) {
      return 'Pilihan varian sudah tidak tersedia.';
    }
  }
  for (const { group, options } of groups) {
    const chosen = options.filter((o) => variantIds.includes(o.id)).length;
    if (group.mode === 'single' && chosen > 1) return `Pilih satu ${group.name}.`;
    if (group.required && chosen === 0) return `Pilih ${group.name} dulu.`;
  }
  return null;
}

export function resolveLine(line: CartLine, index: CatalogIndex): ResolvedLine {
  const product = index.products.get(line.productId);
  if (!product || !product.active || product.deletedAt) {
    throw new CartError('Produk di keranjang sudah tidak dijual.');
  }
  const error = variantSelectionError(product.id, line.variantIds, index);
  if (error) throw new CartError(`${product.name}: ${error}`);

  // Show variants in the same order as the product's groups and options.
  const ordered = variantGroupsOf(product.id, index).flatMap(({ group, options }) =>
    options.filter((o) => line.variantIds.includes(o.id)).map((o) => ({ group, option: o })),
  );
  const variants: VariantSnapshot[] = ordered.map(({ group, option }) => ({
    groupName: group.name,
    name: option.name,
    priceDelta: option.priceDelta,
    costDelta: option.costDelta,
  }));
  return {
    line,
    product,
    variants,
    unitPrice: product.price + variants.reduce((sum, v) => sum + v.priceDelta, 0),
    unitCost: product.cost + variants.reduce((sum, v) => sum + v.costDelta, 0),
  };
}
