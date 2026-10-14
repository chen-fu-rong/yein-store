import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Product = {
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

function orderMessage(product: Product) {
  return `မင်္ဂလာပါ၊ ${product.name} ကို မှာယူချင်ပါတယ်။ ဈေးနှုန်း: ${formatMMK(product.price)}၊ အရေအတွက်: 1 ခု။`;
}

export default async function StorePage() {
  const supabase = await createClient();
  let products: Product[] = [];
  let unavailable = !supabase;

  if (supabase) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, description, price, stock, image_url")
      .order("name", { ascending: true });

    if (error) {
      console.warn("Unable to load store inventory:", error.message);
      unavailable = true;
    } else {
      products = (data ?? []) as Product[];
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
              Yein Store
            </Link>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Ready-made 3D Prints
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Browse in-stock prints made in our studio. Stock and prices are loaded from our live catalog.
            </p>
          </div>
          <Link
            href="/custom-print"
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Request a custom print
          </Link>
        </header>

        {unavailable ? (
          <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            The store catalog is temporarily unavailable. Please try again shortly.
          </p>
        ) : products.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">
            No ready-made items are available yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => {
              const message = encodeURIComponent(orderMessage(product));
              const inStock = product.stock > 0;

              return (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
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
                          inStock
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {inStock ? `In Stock: ${product.stock} left` : "Out of Stock"}
                      </span>
                    </div>
                    <p className="min-h-12 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {product.description || "A handcrafted 3D printed item."}
                    </p>
                    <p className="text-lg font-bold text-slate-950">{formatMMK(product.price)}</p>

                    <div className="grid grid-cols-2 gap-3">
                      <a
                        href={inStock ? `https://t.me/applingg?text=${message}` : undefined}
                        aria-disabled={!inStock}
                        tabIndex={inStock ? undefined : -1}
                        className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold text-white ${
                          inStock
                            ? "bg-sky-600 hover:bg-sky-700"
                            : "pointer-events-none bg-slate-300"
                        }`}
                      >
                        Buy via Telegram
                      </a>
                      <a
                        href={inStock ? `viber://chat?number=%2B9595104519&draft=${message}` : undefined}
                        aria-disabled={!inStock}
                        tabIndex={inStock ? undefined : -1}
                        className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold text-white ${
                          inStock
                            ? "bg-violet-600 hover:bg-violet-700"
                            : "pointer-events-none bg-slate-300"
                        }`}
                      >
                        Buy via Viber
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
