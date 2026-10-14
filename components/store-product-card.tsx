"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/providers/cart-provider";

type StoreProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
};

function formatMMK(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} MMK`;
}

function isCloudinaryUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

export default function StoreProductCard({ product }: { product: StoreProduct }) {
  const router = useRouter();
  const { items, addItem } = useCart();
  const inStock = product.stock > 0;
  const [quantity, setQuantity] = useState(inStock ? 1 : 0);
  const cartQuantity = items.find((item) => item.id === product.id)?.quantity ?? 0;
  const canAdd = inStock && cartQuantity + quantity <= product.stock && cartQuantity + quantity <= 99;

  function addProductToCart() {
    addItem(
      {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        image_url: product.image_url,
      },
      quantity,
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[4/3] bg-slate-100">
        {isCloudinaryUrl(product.image_url) ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-slate-500">
            Image unavailable
          </div>
        )}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{product.name}</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              inStock ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            }`}
          >
            {inStock ? `In Stock: ${product.stock} left` : "Out of Stock"}
          </span>
        </div>
        <p className="min-h-12 whitespace-pre-wrap text-sm leading-6 text-slate-600">
          {product.description || "A handcrafted 3D printed item."}
        </p>
        <p className="text-lg font-bold text-slate-950">{formatMMK(product.price)}</p>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-700">Quantity</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={`Decrease ${product.name} quantity`}
              disabled={!inStock || quantity <= 1}
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              className="grid size-9 place-items-center rounded-lg border border-slate-200 bg-white text-lg font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <output aria-live="polite" className="min-w-6 text-center text-sm font-semibold text-slate-900">
              {quantity}
            </output>
            <button
              type="button"
              aria-label={`Increase ${product.name} quantity`}
              disabled={!inStock || quantity >= Math.min(product.stock, 99)}
              onClick={() => setQuantity((current) => Math.min(product.stock, current + 1))}
              className="grid size-9 place-items-center rounded-lg border border-slate-200 bg-white text-lg font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            disabled={!canAdd}
            onClick={addProductToCart}
            className="h-auto min-h-11 whitespace-normal rounded-xl px-3 py-2.5 text-sm"
          >
            Add to Cart
          </Button>
          <Button
            disabled={!canAdd}
            onClick={() => {
              addProductToCart();
              router.push("/checkout");
            }}
            className="h-auto min-h-11 whitespace-normal rounded-xl px-3 py-2.5 text-sm"
          >
            Buy Now
          </Button>
        </div>
      </div>
    </article>
  );
}
