import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { createClient } from "@/lib/supabase/server";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string | null;
  slug: string;
};

const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);

export default async function Home() {
  const supabase = await createClient();

  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching products:", error.message);
  }

  const productList = (products ?? []) as Product[];

  return (
    <main className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-slate-900">
            Yein Store
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/custom-print" className="text-sm text-slate-600 hover:text-slate-900">
              Custom print
            </Link>
            <Link href="/cart" className="text-sm text-slate-600 hover:text-slate-900">
              Cart
            </Link>
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">
              Login
            </Link>
            <Link href="/register" className="text-sm text-slate-600 hover:text-slate-900">
              Register
            </Link>
          </div>
        </div>
      </nav>

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

          <Link href="/custom-print">
            <Button>Request a custom print</Button>
          </Link>
        </div>

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

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Featured catalog</h2>
        </div>

        {productList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-slate-600">
              No products are available yet. Add rows in Supabase to populate this storefront.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {productList.map((product) => (
              <article
                key={product.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className="relative h-64 overflow-hidden bg-slate-100">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      No image
                    </div>
                  )}
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      {product.category ?? "Print"}
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
                    <Link href={`/product/${product.slug}`} className="flex-1">
                      <Button className="w-full">View details</Button>
                    </Link>
                    <AddToCartButton product={product} />
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