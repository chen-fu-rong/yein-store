import { createClient } from "@/lib/supabase/server";
import StoreProductCard from "@/components/store-product-card";

export const dynamic = "force-dynamic";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
};

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
            {products.map((product) => (
              <StoreProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
