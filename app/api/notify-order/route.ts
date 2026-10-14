import { createClient } from "@/lib/supabase/server";

type NotificationItem = {
  name: string;
  quantity: number;
  unitPrice: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function parseNotificationItems(value: unknown): NotificationItem[] | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 100 ||
    !value.every(
      (item) =>
        isRecord(item) &&
        typeof item.name === "string" &&
        item.name.trim().length > 0 &&
        item.name.length <= 200 &&
        typeof item.quantity === "number" &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        typeof item.unitPrice === "number" &&
        Number.isFinite(item.unitPrice) &&
        item.unitPrice >= 0,
    )
  ) {
    return null;
  }

  return value as NotificationItem[];
}

function formatMMK(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} MMK`;
}

function isReceiptOrder(value: unknown): value is {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  payment_status: string;
  payment_method: string;
  payment_slip_url: string;
  total: number;
  order_items: { name: string; quantity: number; unit_price: number }[];
} {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.order_number === "string" &&
    typeof value.customer_name === "string" &&
    typeof value.customer_phone === "string" &&
    typeof value.customer_address === "string" &&
    typeof value.payment_status === "string" &&
    typeof value.payment_method === "string" &&
    typeof value.payment_slip_url === "string" &&
    typeof value.total === "number" &&
    Number.isFinite(value.total) &&
    Array.isArray(value.order_items) &&
    value.order_items.every(
      (item) =>
        isRecord(item) &&
        typeof item.name === "string" &&
        typeof item.quantity === "number" &&
        Number.isInteger(item.quantity) &&
        typeof item.unit_price === "number" &&
        Number.isFinite(item.unit_price),
    )
  );
}

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !adminChatId) {
    return Response.json({ ok: false });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isRecord(body) || !isUuid(body.orderId) || typeof body.orderNumber !== "string") {
    return Response.json({ ok: false, error: "A valid order ID and order number are required." }, { status: 400 });
  }

  const requestedItems = parseNotificationItems(body.items);
  if (
    !requestedItems ||
    typeof body.customerName !== "string" ||
    typeof body.customerPhone !== "string" ||
    typeof body.customerAddress !== "string" ||
    typeof body.total !== "number" ||
    !Number.isFinite(body.total) ||
    typeof body.paymentSlipUrl !== "string"
  ) {
    return Response.json({ ok: false, error: "Notification details are invalid." }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "Order notification verification is unavailable." }, { status: 503 });
  }

  const { data: receipt, error: receiptError } = await supabase.rpc("get_store_receipt", {
    p_order_id: body.orderId,
  });
  if (receiptError) {
    console.error("Unable to verify order for Telegram notification:", receiptError.message);
    return Response.json({ ok: false, error: "Unable to verify the order." }, { status: 503 });
  }
  if (
    !isReceiptOrder(receipt) ||
    receipt.id !== body.orderId ||
    receipt.order_number !== body.orderNumber ||
    receipt.payment_method !== "bank_transfer"
  ) {
    return Response.json({ ok: false, error: "Store order was not found." }, { status: 404 });
  }
  const requestedItemLines = requestedItems
    .map((item) => `${item.name}\u0000${item.quantity}\u0000${item.unitPrice}`)
    .sort();
  const storedItemLines = receipt.order_items
    .map((item) => `${item.name}\u0000${item.quantity}\u0000${item.unit_price}`)
    .sort();
  if (
    body.customerName !== receipt.customer_name ||
    body.customerPhone !== receipt.customer_phone ||
    body.customerAddress !== receipt.customer_address ||
    body.total !== receipt.total ||
    body.paymentSlipUrl !== receipt.payment_slip_url ||
    JSON.stringify(requestedItemLines) !== JSON.stringify(storedItemLines)
  ) {
    return Response.json({ ok: false, error: "Notification details do not match the saved order." }, { status: 409 });
  }
  let paymentSlipUrl: URL;
  try {
    paymentSlipUrl = new URL(receipt.payment_slip_url);
  } catch {
    return Response.json({ ok: false, error: "The saved payment slip URL is invalid." }, { status: 422 });
  }
  if (paymentSlipUrl.protocol !== "https:" && paymentSlipUrl.protocol !== "http:") {
    return Response.json({ ok: false, error: "The saved payment slip URL is invalid." }, { status: 422 });
  }

  const origin = new URL(request.url).origin;
  const itemLines: string[] = [];
  let itemLinesLength = 0;
  for (const item of receipt.order_items) {
    const line =
      `• ${escapeHtml(item.name.slice(0, 120))} × ${item.quantity} — ${formatMMK(item.unit_price * item.quantity)}`;
    if (itemLinesLength + line.length > 2600) break;
    itemLines.push(line);
    itemLinesLength += line.length + 1;
  }
  if (itemLines.length < receipt.order_items.length) {
    itemLines.push(`• ${receipt.order_items.length - itemLines.length} additional item(s) omitted`);
  }
  const messageLines = [
    `<b>🔔 အော်ဒါအသစ် ဝင်လာပါသည်! (${escapeHtml(receipt.order_number)})</b>`,
    "",
    `<b>Customer:</b> ${escapeHtml(receipt.customer_name.slice(0, 150))}`,
    `<b>Phone:</b> ${escapeHtml(receipt.customer_phone.slice(0, 80))}`,
    `<b>Address:</b> ${escapeHtml(receipt.customer_address.slice(0, 500))}`,
    "",
    "<b>Items:</b>",
    itemLines.join("\n"),
    "",
    `<b>Total Amount:</b> ${formatMMK(receipt.total)}`,
    "",
    `<a href="${escapeHtml(paymentSlipUrl.toString())}">View Payment Slip</a>`,
    `<a href="${new URL(`/receipt/${encodeURIComponent(receipt.id)}`, origin).toString()}">Digital Receipt</a>`,
    `<a href="${new URL("/admin", origin).toString()}">Admin Dashboard</a>`,
  ];
  let message = messageLines.join("\n");
  while (message.length > 4000 && itemLines.length > 1) {
    itemLines.pop();
    itemLines[itemLines.length - 1] += " (more omitted)";
    messageLines[7] = itemLines.join("\n");
    message = messageLines.join("\n");
  }

  let telegramResponse: Response;
  try {
    telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("Telegram order notification request failed:", error);
    return Response.json({ ok: false, error: "Telegram notification could not be sent." }, { status: 502 });
  }

  let telegramResult: unknown;
  try {
    telegramResult = await telegramResponse.json();
  } catch (error) {
    console.error("Telegram returned an invalid order notification response:", error);
    return Response.json({ ok: false, error: "Telegram notification could not be sent." }, { status: 502 });
  }
  if (!telegramResponse.ok || !isRecord(telegramResult) || telegramResult.ok !== true) {
    const errorDetails =
      isRecord(telegramResult) && typeof telegramResult.description === "string"
        ? telegramResult.description
        : `HTTP ${telegramResponse.status}`;
    console.error("Telegram rejected order notification:", errorDetails);
    return Response.json({ ok: false, error: "Telegram notification could not be sent." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
