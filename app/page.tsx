import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Gallery } from "@/components/gallery";
import { PrintQuoteCalculator } from "@/components/print-quote-calculator";
import { createClient } from "@/lib/supabase/server";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
};

const formatPrice = (value: number) =>
  `${new Intl.NumberFormat("en-US").format(value)} MMK`;

function isCloudinaryUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

export default async function Home() {
  const supabase = await createClient();
  let productList: Product[] = [];
  let catalogUnavailable = !supabase;

  if (supabase) {
    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, description, price, stock, image_url")
      .order("name", { ascending: true });

    if (error) {
      console.warn("Unable to fetch storefront products:", error.message);
      catalogUnavailable = true;
    }

    productList = (products ?? []) as Product[];
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              3D printing studio
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Ready-made prints, custom-made possibilities.
            </h1>
          </div>

          <Link href="#quote-calculator-title">
            <Button>Request a custom print</Button>
          </Link>
        </div>

        <PrintQuoteCalculator />

        <div className="mb-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Products</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{productList.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Multi-color FDM</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">4K</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Custom prints</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">24h</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Verified orders</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">100%</p>
          </div>
        </div>

        <Gallery />

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Featured catalog</h2>
        </div>

        {productList.length === 0 ? (
          <div
            role={catalogUnavailable ? "status" : undefined}
            className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"
          >
            {catalogUnavailable ? (
              <>
                <p className="font-medium text-slate-800">The product catalog is temporarily unavailable.</p>
                <p className="mt-2 text-sm text-slate-500">
                  We could not connect to the storefront database. Please try again in a little while.
                </p>
              </>
            ) : (
              <p className="text-slate-600">
                No products are available yet. Add rows in Supabase to populate this storefront.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {productList.map((product) => (
              <article
                key={product.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className="relative h-64 overflow-hidden bg-slate-100">
                  {isCloudinaryUrl(product.image_url) ? (
                    <Image
                      src={product.image_url}
                      alt={product.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      No image
                    </div>
                  )}
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${product.stock > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      {product.stock > 0 ? `In Stock: ${product.stock} left` : "Out of Stock"}
                    </span>
                    <p className="text-lg font-bold text-slate-900">{formatPrice(product.price)}</p>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">{product.name}</h3>
                    <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                      {product.description ?? "A handcrafted 3D printed item made for everyday use."}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Link href="/store" className="flex-1">
                      <Button className="w-full">Order options</Button>
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}