import { notFound } from "next/navigation";
import { ReceiptActions } from "@/components/receipt-actions";
import { createClient } from "@/lib/supabase/server";

type ReceiptItem = {
  name: string;
  quantity: number;
  unit_price: number;
};

type ReceiptOrder = {
  id: string;
  order_number: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  payment_status: string;
  status: string;
  total: number;
  order_items: ReceiptItem[];
};

function formatMMK(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} MMK`;
}

function isReceiptOrder(value: unknown): value is ReceiptOrder {
  if (typeof value !== "object" || value === null) return false;
  const order = value as Record<string, unknown>;
  return (
    typeof order.id === "string" &&
    typeof order.order_number === "string" &&
    typeof order.created_at === "string" &&
    typeof order.customer_name === "string" &&
    typeof order.customer_phone === "string" &&
    typeof order.customer_address === "string" &&
    typeof order.payment_status === "string" &&
    typeof order.status === "string" &&
    typeof order.total === "number" &&
    Number.isFinite(order.total) &&
    Array.isArray(order.order_items) &&
    order.order_items.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "name" in item &&
        typeof item.name === "string" &&
        "quantity" in item &&
        typeof item.quantity === "number" &&
        Number.isInteger(item.quantity) &&
        "unit_price" in item &&
        typeof item.unit_price === "number" &&
        Number.isFinite(item.unit_price),
    )
  );
}

export default async function ReceiptPage({ params }: PageProps<"/receipt/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const supabase = await createClient();
  if (!supabase) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-12">
        <p role="alert" className="mx-auto max-w-2xl rounded-xl bg-amber-50 p-5 text-amber-900">
          The receipt service is currently unavailable. Please try again later.
        </p>
      </main>
    );
  }

  const { data, error } = await supabase.rpc("get_store_receipt", { p_order_id: id });
  if (error) {
    console.error("Unable to load receipt:", error.message);
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-12">
        <p role="alert" className="mx-auto max-w-2xl rounded-xl bg-amber-50 p-5 text-amber-900">
          The receipt could not be loaded. Please try again later.
        </p>
      </main>
    );
  }

  if (!isReceiptOrder(data)) notFound();
  const order = data;
  const isVerified = order.payment_status === "verified";
  const fulfillmentStatus =
    order.status === "packed"
      ? "Packed / Ready"
      : order.status === "shipped"
        ? "Shipped"
        : order.status === "completed"
          ? "Completed"
          : order.status === "cancelled"
            ? "Cancelled"
            : "Pending";
  const placedDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(order.created_at));

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:py-12 print:min-h-0 print:bg-white print:p-0">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-col gap-4 border-b border-dashed border-slate-300 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Digital Voucher / E-Receipt</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">YEIN STUDIO</h1>
            <p className="mt-1 text-sm text-slate-600">Ready-made 3D-printed items</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${
                isVerified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {isVerified ? "Verified / Paid" : "Pending Verification"}
            </span>
            <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
              {fulfillmentStatus}
            </span>
          </div>
        </header>

        <section className="grid gap-5 border-b border-slate-200 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order Number</p>
            <p className="mt-1 font-bold text-slate-900">{order.order_number}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</p>
            <p className="mt-1 text-sm text-slate-800">{placedDate} UTC</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</p>
            <p className="mt-1 text-sm text-slate-800">{order.customer_name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</p>
            <p className="mt-1 text-sm text-slate-800">{order.customer_phone}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery Address / Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{order.customer_address}</p>
          </div>
        </section>

        <section className="py-6">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Order items</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-3">Item</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="px-3 py-3 text-right">Unit Price</th>
                  <th className="py-3 pl-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.order_items.map((item, index) => (
                  <tr key={`${item.name}-${index}`} className="border-b border-slate-100">
                    <td className="py-3 pr-3 font-medium text-slate-800">{item.name}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{item.quantity}</td>
                    <td className="px-3 py-3 text-right text-slate-700">{formatMMK(item.unit_price)}</td>
                    <td className="py-3 pl-3 text-right font-medium text-slate-900">
                      {formatMMK(item.unit_price * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ml-auto mt-5 flex max-w-sm justify-between border-t-2 border-slate-900 pt-4 text-lg font-bold text-slate-950">
            <span>Grand Total</span>
            <span>{formatMMK(order.total)}</span>
          </div>
        </section>

        <footer className="border-t border-dashed border-slate-300 pt-5 text-center text-xs text-slate-500">
          Thank you for choosing YEIN STUDIO.
        </footer>
        <ReceiptActions orderNumber={order.order_number} />
      </article>
    </main>
  );
}
