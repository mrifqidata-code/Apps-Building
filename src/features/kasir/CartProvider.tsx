import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import {
  CartError,
  EMPTY_CART,
  buildCatalogIndex,
  cartReducer,
  type Cart,
  type CartAction,
} from '../../db/cart';
import { priceCart } from '../../db/checkout';
import { db } from '../../db/db';
import { useSession } from '../../app/session-context';
import { CartContext } from './cart-context';

/** Unpaid cart, kept on the device so a reload or a closed app does not lose it. */
const META_CART_DRAFT = 'cartDraft';

export function CartProvider({ children }: { children: ReactNode }) {
  const { store } = useSession();
  const [cart, rawDispatch] = useReducer(cartReducer, EMPTY_CART);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    db.meta.get(META_CART_DRAFT).then((draft) => {
      if (cancelled) return;
      if (draft && !loaded.current) rawDispatch({ type: 'replace', cart: draft.value as Cart });
      loaded.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dispatch = useCallback((action: CartAction) => {
    loaded.current = true;
    rawDispatch(action);
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    if (cart.lines.length === 0) db.meta.delete(META_CART_DRAFT);
    else db.meta.put({ key: META_CART_DRAFT, value: cart });
  }, [cart]);

  const index = useLiveQuery(async () => {
    const [products, variants, groups] = await Promise.all([
      db.products.where({ storeId: store.id }).toArray(),
      db.productVariants.where({ storeId: store.id }).toArray(),
      db.variantGroups.where({ storeId: store.id }).toArray(),
    ]);
    return buildCatalogIndex(products, variants, groups);
  }, [store.id]);

  const { priced, pricingError } = useMemo(() => {
    if (!index) return { priced: null, pricingError: null };
    try {
      return { priced: priceCart(cart, index, store), pricingError: null };
    } catch (error) {
      if (error instanceof CartError) return { priced: null, pricingError: error.message };
      throw error;
    }
  }, [cart, index, store]);

  const value = useMemo(
    () => ({ cart, dispatch, index, priced, pricingError }),
    [cart, dispatch, index, priced, pricingError],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
