"use client";

import { useState } from "react";
import Image from "next/image";

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
  const inStock = product.stock > 0;
  const [quantity, setQuantity] = useState(inStock ? 1 : 0);
  const orderMessage = encodeURIComponent(
    `မင်္ဂလာပါ၊ ${product.name} ကို မှာယူချင်ပါတယ်။ ဈေးနှုန်း: ${formatMMK(product.price)}၊ အရေအတွက်: ${quantity} ခု။`,
  );

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
              disabled={!inStock || quantity >= product.stock}
              onClick={() => setQuantity((current) => Math.min(product.stock, current + 1))}
              className="grid size-9 place-items-center rounded-lg border border-slate-200 bg-white text-lg font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <a
            href={inStock ? `https://t.me/applingg?text=${orderMessage}` : undefined}
            aria-disabled={!inStock}
            tabIndex={inStock ? undefined : -1}
            className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold text-white ${
              inStock ? "bg-sky-600 hover:bg-sky-700" : "pointer-events-none bg-slate-300"
            }`}
          >
            Buy via Telegram
          </a>
          <a
            href={inStock ? `viber://chat?number=%2B9595104519&draft=${orderMessage}` : undefined}
            aria-disabled={!inStock}
            tabIndex={inStock ? undefined : -1}
            className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold text-white ${
              inStock ? "bg-violet-600 hover:bg-violet-700" : "pointer-events-none bg-slate-300"
            }`}
          >
            Buy via Viber
          </a>
        </div>
      </div>
    </article>
  );
}
