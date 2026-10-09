import { afterEach, describe, expect, it } from 'vitest';
import {
  EMPTY_CART,
  buildCatalogIndex,
  cartItemCount,
  cartReducer,
  resolveLine,
  variantSelectionError,
  type Cart,
} from './cart';
import { demoDatabase } from '../test/db';

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe('cartReducer', () => {
  it('adds a product and increases quantity when tapped again', () => {
    let cart = cartReducer(EMPTY_CART, { type: 'add', productId: 'p1' });
    cart = cartReducer(cart, { type: 'add', productId: 'p1' });
    cart = cartReducer(cart, { type: 'add', productId: 'p2' });
    expect(cart.lines.map((l) => [l.productId, l.qty])).toEqual([
      ['p1', 2],
      ['p2', 1],
    ]);
    expect(cartItemCount(cart)).toBe(3);
  });

  it('keeps different variant choices on separate lines', () => {
    let cart = cartReducer(EMPTY_CART, { type: 'add', productId: 'p1', variantIds: ['a', 'b'] });
    cart = cartReducer(cart, { type: 'add', productId: 'p1', variantIds: ['b', 'a'] });
    cart = cartReducer(cart, { type: 'add', productId: 'p1', variantIds: ['a'] });
    expect(cart.lines.map((l) => l.qty)).toEqual([2, 1]);
  });

  it('starts a new line instead of merging into a line with a note', () => {
    let cart = cartReducer(EMPTY_CART, { type: 'add', productId: 'p1' });
    cart = cartReducer(cart, { type: 'setNote', key: cart.lines[0]!.key, note: ' kurang manis ' });
    cart = cartReducer(cart, { type: 'add', productId: 'p1' });
    expect(cart.lines).toHaveLength(2);
    expect(cart.lines[0]!.note).toBe('kurang manis');
  });

  it('removes a line when its quantity goes to zero and clears the discount with the last line', () => {
    let cart: Cart = cartReducer(EMPTY_CART, { type: 'add', productId: 'p1' });
    cart = cartReducer(cart, { type: 'setDiscount', discount: { type: 'amount', value: 1_000 } });
    cart = cartReducer(cart, { type: 'setQty', key: cart.lines[0]!.key, qty: 0 });
    expect(cart).toEqual(EMPTY_CART);
  });

  it('rejects fractional quantities', () => {
    const cart = cartReducer(EMPTY_CART, { type: 'add', productId: 'p1' });
    expect(() => cartReducer(cart, { type: 'setQty', key: cart.lines[0]!.key, qty: 1.5 })).toThrow(
      RangeError,
    );
  });
});

describe('resolving variants against the catalog', () => {
  async function index() {
    const demo = await demoDatabase();
    cleanup = () => demo.database.delete();
    const { database } = demo;
    const catalog = buildCatalogIndex(
      await database.products.toArray(),
      await database.productVariants.toArray(),
      await database.variantGroups.toArray(),
    );
    return { ...demo, catalog };
  }

  it('prices a product with its chosen variants', async () => {
    const { catalog, product, variantsOf } = await index();
    const latte = product('Kopi Susu Gula Aren');
    const v = await variantsOf('Kopi Susu Gula Aren');
    const resolved = resolveLine(
      {
        key: 'x',
        productId: latte.id,
        variantIds: [v('Extra Shot'), v('Large')],
        qty: 1,
        note: null,
        discount: null,
      },
      catalog,
    );
    expect(resolved.unitPrice).toBe(22_000 + 5_000 + 5_000);
    expect(resolved.unitCost).toBe(8_000 + 2_000 + 2_000);
    // Ordered by group (Ukuran before Tambahan), not by tap order.
    expect(resolved.variants.map((x) => x.name)).toEqual(['Large', 'Extra Shot']);
  });

  it('requires a choice for required groups and only one for single-choice groups', async () => {
    const { catalog, product, variantsOf } = await index();
    const latte = product('Kopi Susu Gula Aren');
    const v = await variantsOf('Kopi Susu Gula Aren');
    expect(variantSelectionError(latte.id, [], catalog)).toBe('Pilih Ukuran dulu.');
    expect(variantSelectionError(latte.id, [v('Reguler'), v('Large')], catalog)).toBe(
      'Pilih satu Ukuran.',
    );
    expect(
      variantSelectionError(latte.id, [v('Reguler'), v('Extra Shot'), v('Oat Milk')], catalog),
    ).toBeNull();
  });

  it('refuses variants of another product', async () => {
    const { catalog, product, variantsOf } = await index();
    const v = await variantsOf('Kopi Susu Gula Aren');
    expect(variantSelectionError(product('Matcha Latte').id, [v('Large')], catalog)).toBe(
      'Pilihan varian sudah tidak tersedia.',
    );
  });
});
