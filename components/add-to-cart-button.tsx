"use client";

import { Button } from "@/components/ui/button";
import { useCart, type CartItem } from "@/components/providers/cart-provider";

type AddToCartButtonProps = {
  product: {
    id: string;
    name: string;
    price: number;
    image_url?: string | null;
    category?: string | null;
    slug?: string;
  };
};

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const { addItem } = useCart();

  const item: Omit<CartItem, "quantity"> = {
    id: product.id,
    name: product.name,
    price: Number(product.price),
    image_url: product.image_url,
    category: product.category,
    slug: product.slug,
  };

  return (
    <Button variant="outline" onClick={() => addItem(item, 1)}>
      Add to cart
    </Button>
  );
}
