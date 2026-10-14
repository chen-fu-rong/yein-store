"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { playOrderNotificationChime } from "@/lib/order-notifications";

type OrderItem = {
  id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
};

type Order = {
  id: string;
  order_number: string;
  status: "pending" | "packed" | "shipped" | "cancelled" | "completed";
  payment_status: "pending" | "verified" | "rejected";
  payment_method: string;
  total: number;
  payment_slip_url: string | null;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  order_items: OrderItem[] | null;
};

function formatMMK(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} MMK`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

export function OrdersManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [updatingPaymentOrderId, setUpdatingPaymentOrderId] = useState<string | null>(null);
  const [newOrderNotice, setNewOrderNotice] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const noticeTimeout = useRef<number | null>(null);

  const fetchOrders = useCallback(async (showLoading = true) => {
    try {
      if (!supabase) {
        if (showLoading) setLoading(false);
        setError("Supabase is not configured yet. Add your environment variables to load orders.");
        return;
      }

      if (showLoading) setLoading(true);
      const { data, error: queryError } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("payment_method", "bank_transfer")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      setOrders(
        ((data ?? []) as Order[]).filter(
          (order) => {
            const items = order.order_items ?? [];
            return items.length > 0 && items.every((item) => item.product_id !== null);
          },
        ),
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load orders"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchOrders());
  }, [fetchOrders]);

  useEffect(() => {
    const orderId = window.location.hash.slice("#order-".length);
    if (orderId && orderId !== window.location.hash) {
      void Promise.resolve().then(() => setExpandedOrderId(decodeURIComponent(orderId)));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setNotificationPermission(
        "Notification" in window ? window.Notification.permission : "unsupported",
      );
    });
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const channel = client
      .channel("admin-new-store-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const newOrder = payload.new;
        if (newOrder.payment_method !== "bank_transfer") return;

        const customerName =
          typeof newOrder.customer_name === "string" && newOrder.customer_name.trim()
            ? newOrder.customer_name.trim()
            : "a customer";
        setNewOrderNotice(`🔔 New order received from ${customerName}!`);
        playOrderNotificationChime();
        if ("Notification" in window && window.Notification.permission === "granted") {
          try {
            new window.Notification("New Yein Store order", {
              body: `New order received from ${customerName}!`,
            });
          } catch (notificationError) {
            console.warn("Unable to show browser order notification:", notificationError);
          }
        }
        if (noticeTimeout.current !== null) window.clearTimeout(noticeTimeout.current);
        noticeTimeout.current = window.setTimeout(() => setNewOrderNotice(""), 8_000);
        void fetchOrders(false);
      })
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setError(error?.message || "Live order notifications are unavailable.");
        }
      });

    return () => {
      if (noticeTimeout.current !== null) window.clearTimeout(noticeTimeout.current);
      void client.removeChannel(channel);
    };
  }, [fetchOrders]);

  async function enableBrowserNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    try {
      const permission = await window.Notification.requestPermission();
      setNotificationPermission(permission);
    } catch (permissionError) {
      setError(getErrorMessage(permissionError, "Unable to enable browser notifications."));
    }
  }

  const updateOrderStatus = async (orderId: string, status: Order["status"]) => {
    try {
      if (!supabase) {
        setError("Supabase is not configured yet. Add your environment variables to update orders.");
        return;
      }

      const { error: updateError } = await supabase.rpc("set_admin_order_status", {
        p_order_id: orderId,
        p_status: status,
      });

      if (updateError) throw updateError;

      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status } : order,
        ),
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update order status"));
    }
  };

  const updatePaymentStatus = async (orderId: string, paymentStatus: Order["payment_status"]) => {
    try {
      const client = supabase;
      if (!client) {
        setError("Supabase is not configured yet. Add your environment variables to update payment status.");
        return;
      }

      const order = orders.find((item) => item.id === orderId);
      if (!order) throw new Error("Order not found in the current list.");
      setUpdatingPaymentOrderId(orderId);
      setError("");

      const updatePaymentStatusDirectly = async () => {
        const { data: updatedOrder, error: updateError } = await client
          .from("orders")
          .update({ payment_status: paymentStatus })
          .eq("id", orderId)
          .select("id")
          .maybeSingle();
        if (updateError) throw updateError;
        if (!updatedOrder) throw new Error("The order was not updated. Check admin access and try again.");
      };

      if (paymentStatus === "verified" && order.payment_status !== "verified") {
        const productItems = (order.order_items ?? [])
          .filter(
            (item): item is OrderItem & { product_id: string } => Boolean(item.product_id),
          )
          .map((item) => ({ id: item.product_id, quantity: item.quantity }));

        if (productItems.length === 0) {
          throw new Error("This ready-made order has no stock items to verify.");
        }
        const response = await fetch("/api/admin/products/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, items: productItems }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(result.error || "Unable to verify payment and deduct stock.");
        }
      } else {
        await updatePaymentStatusDirectly();
      }

      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? { ...order, payment_status: paymentStatus as Order["payment_status"] }
            : order,
        ),
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update payment status"));
    } finally {
      setUpdatingPaymentOrderId(null);
    }
  };

  function openVoucher(order: Order, channel: "telegram" | "viber") {
    const receiptUrl = `${window.location.origin}/receipt/${encodeURIComponent(order.id)}`;
    const message = `မင်္ဂလာပါ ${order.customer_name || "လူကြီးမင်း"}၊ လူကြီးမင်း၏ အော်ဒါ (${order.order_number}) အတွက် ငွေလက်ခံရရှိပါသည်။ E-Voucher ကို ဤလင့်ခ်တွင် ကြည့်ရှုနိုင်ပါသည် - ${receiptUrl}`;
    const encodedMessage = encodeURIComponent(message);

    if (channel === "telegram") {
      window.open(`https://t.me/applingg?text=${encodedMessage}`, "_blank", "noopener,noreferrer");
      return;
    }

    const digits = (order.customer_phone ?? "").replace(/\D/g, "");
    const internationalPhone = digits.startsWith("0") ? `+95${digits.slice(1)}` : `+${digits}`;
    const viberUrl = `viber://chat?number=${encodeURIComponent(internationalPhone)}&draft=${encodedMessage}`;
    window.location.assign(viberUrl);
  }

  if (loading) {
    return <p className="text-slate-600">Loading orders...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="font-semibold text-slate-900">Live order alerts</h2>
          <p className="mt-1 text-xs text-slate-500">Realtime updates and an in-browser chime are active while this page is open.</p>
        </div>
        <button
          type="button"
          onClick={enableBrowserNotifications}
          disabled={
            notificationPermission === "granted" ||
            notificationPermission === "denied" ||
            notificationPermission === "unsupported"
          }
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {notificationPermission === "granted"
            ? "Browser Notifications Enabled"
            : notificationPermission === "denied"
              ? "Notifications Blocked in Browser"
            : notificationPermission === "unsupported"
              ? "Notifications Unsupported"
              : "Enable Browser Notifications"}
        </button>
      </div>
      {newOrderNotice ? (
        <div role="status" aria-live="polite" className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-base font-semibold text-emerald-900 shadow-sm">
          {newOrderNotice}
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-600">No orders found yet.</p>
        </div>
      ) : (
        orders.map((order) => (
          <article id={`order-${order.id}`} key={order.id} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <button
                type="button"
                aria-expanded={expandedOrderId === order.id}
                onClick={() => setExpandedOrderId((current) => current === order.id ? null : order.id)}
                className="text-left"
              >
                <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Order {order.order_number}
                </span>
                <span className="mt-2 block text-sm font-medium text-slate-900">
                  {order.customer_name || "Customer"} · {formatMMK(Number(order.total))}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {expandedOrderId === order.id ? "Click to hide order details" : "Click to review order and payment"}
                </span>
              </button>
              <div className="flex flex-wrap gap-3">
                <span className={`rounded-full px-3 py-2 text-xs font-semibold ${
                  order.payment_status === "verified"
                    ? "bg-emerald-50 text-emerald-700"
                    : order.payment_status === "rejected"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-amber-50 text-amber-800"
                }`}>
                  {order.payment_status === "verified" ? "Payment verified" : order.payment_status === "rejected" ? "Payment rejected" : "Payment pending"}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-1 border-t border-slate-100 pt-4 text-sm text-slate-700 sm:grid-cols-2">
              <p><span className="font-medium">Customer:</span> {order.customer_name || "—"}</p>
              <p><span className="font-medium">Phone:</span> {order.customer_phone || "—"}</p>
              <p className="whitespace-pre-wrap sm:col-span-2">
                <span className="font-medium">Address / notes:</span> {order.customer_address || "—"}
              </p>
            </div>

            {expandedOrderId === order.id ? (
            <>
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
              <span className="mr-auto text-xs text-slate-500">
                Placed {new Date(order.created_at).toLocaleString()}
              </span>
              <select
                aria-label={`Update fulfillment status for ${order.order_number}`}
                value={order.status}
                onChange={(e) => updateOrderStatus(order.id, e.target.value as Order["status"])}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
              >
                <option value="pending">Pending</option>
                <option value="packed">Packed / Ready</option>
                <option value="shipped">Shipped</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <h3 className="mb-3 text-lg font-semibold text-slate-900">Items</h3>
                <div className="space-y-3">
                  {(order.order_items ?? []).map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                      <div>
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="text-sm text-slate-500">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-semibold text-slate-900">{formatMMK(Number(item.unit_price) * item.quantity)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-lg font-semibold text-slate-900">Payment</h3>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Total</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{formatMMK(Number(order.total))}</p>

                  {order.payment_slip_url ? (
                    <a
                      href={order.payment_slip_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-block rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                    >
                      View payment slip
                    </a>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">No payment slip uploaded.</p>
                  )}
                  {order.payment_status !== "verified" ? (
                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={updatingPaymentOrderId === order.id}
                        onClick={() => updatePaymentStatus(order.id, "verified")}
                        className="rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
                      >
                        {updatingPaymentOrderId === order.id ? "Saving…" : "Accept payment"}
                      </button>
                      <button
                        type="button"
                        disabled={updatingPaymentOrderId === order.id}
                        onClick={() => updatePaymentStatus(order.id, "rejected")}
                        className="rounded-lg bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
                      >
                        {updatingPaymentOrderId === order.id ? "Saving…" : "Decline payment"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-200 pt-5">
              <a
                href={`/receipt/${encodeURIComponent(order.id)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
              >
                View Voucher
              </a>
              <button
                type="button"
                onClick={() => openVoucher(order, "viber")}
                className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
              >
                Send via Viber
              </button>
              <button
                type="button"
                onClick={() => openVoucher(order, "telegram")}
                className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
              >
                Send via Telegram
              </button>
            </div>
            </>
            ) : null}
          </article>
        ))
      )}
    </div>
  );
}
