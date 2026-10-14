import { getAdminClient } from "@/lib/supabase/admin-auth";

type ProductInput = {
  name: string;
  description: string;
  price: number;
  stock: number;
  image_url: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

function parseProduct(value: unknown): ProductInput | null {
  if (!isRecord(value)) return null;
  const { name, description, price, stock, image_url } = value;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof description !== "string" ||
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price < 0 ||
    typeof stock !== "number" ||
    !Number.isInteger(stock) ||
    stock < 0 ||
    !validImageUrl(image_url)
  ) {
    return null;
  }
  return { name: name.trim(), description: description.trim(), price, stock, image_url };
}

export async function GET() {
  const { supabase, error } = await getAdminClient();
  if (error) return Response.json({ error: error.message }, { status: error.status });

  const { data, error: queryError } = await supabase
    .from("products")
    .select("id, name, description, price, stock, image_url")
    .order("name", { ascending: true });

  if (queryError) {
    return Response.json({ error: queryError.message }, { status: 500 });
  }

  return Response.json({ products: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { supabase, error } = await getAdminClient();
  if (error) return Response.json({ error: error.message }, { status: error.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const product = parseProduct(body);
  if (!product) {
    return Response.json(
      { error: "Provide a name, description, non-negative price and stock, and an HTTPS Cloudinary image URL." },
      { status: 400 },
    );
  }

  const { data, error: insertError } = await supabase
    .from("products")
    .insert(product)
    .select("id, name, description, price, stock, image_url")
    .single();

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  return Response.json({ product: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { supabase, error } = await getAdminClient();
  if (error) return Response.json({ error: error.message }, { status: error.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    typeof body.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id) ||
    typeof body.stock !== "number" ||
    !Number.isInteger(body.stock) ||
    body.stock < 0
  ) {
    return Response.json({ error: "Provide a valid product ID and non-negative whole-number stock." }, { status: 400 });
  }

  const { data, error: updateError } = await supabase
    .from("products")
    .update({ stock: body.stock })
    .eq("id", body.id)
    .select("id, name, description, price, stock, image_url")
    .maybeSingle();

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Product not found." }, { status: 404 });

  return Response.json({ product: data });
}

export async function DELETE(request: Request) {
  const { supabase, error } = await getAdminClient();
  if (error) return Response.json({ error: error.message }, { status: error.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    typeof body.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)
  ) {
    return Response.json({ error: "Provide a valid product ID." }, { status: 400 });
  }

  const { data, error: deleteError } = await supabase
    .from("products")
    .delete()
    .eq("id", body.id)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    return Response.json({ error: deleteError.message }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Product not found." }, { status: 404 });

  return Response.json({ success: true });
}
