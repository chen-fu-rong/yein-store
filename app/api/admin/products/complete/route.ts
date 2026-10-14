import { getAdminClient } from "@/lib/supabase/admin-auth";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

  if (
    !isRecord(body) ||
    !Array.isArray(body.items) ||
    body.items.length === 0 ||
    body.items.length > 100 ||
    !body.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id) &&
        typeof item.quantity === "number" &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0,
    )
  ) {
    return Response.json({ error: "Provide at least one product with a valid ID and positive whole-number quantity." }, { status: 400 });
  }

  const { error: deductionError } = await supabase.rpc("deduct_product_stock", {
    p_items: body.items,
  });

  if (deductionError) {
    const unavailable = deductionError.message.includes("INSUFFICIENT_STOCK");
    return Response.json(
      { error: unavailable ? "One or more items no longer have enough stock. Refresh inventory and retry." : deductionError.message },
      { status: unavailable ? 409 : 500 },
    );
  }

  return Response.json({ success: true });
}
