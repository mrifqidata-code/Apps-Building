import { createContext, useContext } from 'react';
import { cartItemCount, type Cart, type CartAction, type CatalogIndex } from '../../db/cart';
import type { PricedCart } from '../../db/checkout';

export interface CartContextValue {
  cart: Cart;
  dispatch: (action: CartAction) => void;
  index: CatalogIndex | undefined;
  priced: PricedCart | null;
  /** Set when a line no longer matches the catalog (e.g. product deactivated). */
  pricingError: string | null;
}

export const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart dipakai di luar CartProvider');
  return value;
}

export function useCartCount(): number {
  return cartItemCount(useCart().cart);
}
