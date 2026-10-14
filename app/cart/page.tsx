"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/providers/cart-provider";

function formatMMK(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} MMK`;
}

function isCloudinaryUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

export default function CartPage() {
  const { items, subtotal, updateQuantity, removeItem } = useCart();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">Your cart</h1>

        {items.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
            <p className="text-slate-600">Your cart is empty.</p>
            <Link href="/store" className="mt-4 inline-block">
              <Button>Continue shopping</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-8 space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex items-center gap-4">
                    {isCloudinaryUrl(item.image_url) ? (
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
                        <Image src={item.image_url} alt={item.name} fill sizes="64px" className="object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">
                        No image
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-sm text-slate-500">{formatMMK(item.price)} each</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="h-7 w-7 text-lg"
                      >
                        −
                      </button>
                      <span className="min-w-6 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="h-7 w-7 text-lg"
                      >
                        +
                      </button>
                    </div>

                    <p className="w-20 text-right font-semibold text-slate-900">
                      {formatMMK(item.price * item.quantity)}
                    </p>

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex items-center justify-between rounded-xl bg-slate-50 p-4">
              <span className="text-lg font-semibold text-slate-900">Subtotal</span>
              <span className="text-lg font-bold text-slate-900">{formatMMK(subtotal)}</span>
            </div>

            <div className="mt-8 flex gap-3">
              <Link href="/store" className="flex-1">
                <Button variant="outline" className="w-full">
                  Continue shopping
                </Button>
              </Link>
              <Link href="/checkout" className="flex-1">
                <Button className="w-full">Checkout</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
