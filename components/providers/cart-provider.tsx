"use client";

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string | null;
  category?: string | null;
  slug?: string;
};

type CartContextType = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
};

const CART_STORAGE_KEY = "yein-store-cart";
const EMPTY_ITEMS: CartItem[] = [];
let cachedStorageValue: string | null | undefined;
let cachedItems = EMPTY_ITEMS;
const cartListeners = new Set<() => void>();
const CartContext = createContext<CartContextType | undefined>(undefined);

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    item.price >= 0 &&
    typeof item.quantity === "number" &&
    Number.isInteger(item.quantity) &&
    item.quantity > 0 &&
    item.quantity <= 99 &&
    (item.image_url === undefined || item.image_url === null || typeof item.image_url === "string") &&
    (item.category === undefined || item.category === null || typeof item.category === "string") &&
    (item.slug === undefined || typeof item.slug === "string")
  );
}

function getCartSnapshot() {
  if (typeof window === "undefined") return EMPTY_ITEMS;

  const storedValue = window.localStorage.getItem(CART_STORAGE_KEY);
  if (storedValue === cachedStorageValue) return cachedItems;

  cachedStorageValue = storedValue;
  if (!storedValue) {
    cachedItems = EMPTY_ITEMS;
    return cachedItems;
  }

  try {
    const parsed: unknown = JSON.parse(storedValue);
    cachedItems = Array.isArray(parsed) && parsed.every(isCartItem) ? parsed : EMPTY_ITEMS;
  } catch {
    cachedItems = EMPTY_ITEMS;
  }
  return cachedItems;
}

function subscribeToCart(listener: () => void) {
  cartListeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === CART_STORAGE_KEY || event.key === null) {
      cachedStorageValue = undefined;
      for (const subscriber of cartListeners) subscriber();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    cartListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function updateCart(updater: (current: CartItem[]) => CartItem[]) {
  const nextItems = updater(getCartSnapshot());
  const serialized = JSON.stringify(nextItems);
  if (serialized === undefined) throw new Error("Unable to save the shopping cart.");
  window.localStorage.setItem(CART_STORAGE_KEY, serialized);
  cachedItems = nextItems;
  cachedStorageValue = serialized;
  for (const listener of cartListeners) listener();
}

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribeToCart, getCartSnapshot, () => EMPTY_ITEMS);
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);

  const addItem = (item: Omit<CartItem, "quantity">, quantity = 1) => {
    updateCart((current) => {
      const existing = current.find((entry) => entry.id === item.id);

      if (existing) {
        return current.map((entry) =>
          entry.id === item.id
            ? { ...entry, quantity: Math.min(entry.quantity + quantity, 99) }
            : entry,
        );
      }

      return [...current, { ...item, quantity }];
    });
  };

  const removeItem = (id: string) =>
    updateCart((current) => current.filter((item) => item.id !== id));

  const updateQuantity = (id: string, quantity: number) => {
    updateCart((current) =>
      quantity <= 0
        ? current.filter((item) => item.id !== id)
        : current.map((item) =>
            item.id === id ? { ...item, quantity: Math.min(quantity, 99) } : item,
          ),
    );
  };

  const clearCart = () => updateCart(() => EMPTY_ITEMS);

  return (
    <CartContext.Provider
      value={{ items, itemCount, subtotal, addItem, removeItem, updateQuantity, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return context;
}
