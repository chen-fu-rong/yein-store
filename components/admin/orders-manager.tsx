"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
};

type Order = {
  id: string;
  order_number: string;
  status: "pending" | "printing" | "shipped" | "cancelled" | "completed";
  payment_status: "pending" | "verified" | "rejected";
  total: number;
  payment_slip_url: string | null;
  created_at: string;
  order_items: OrderItem[];
};

export function OrdersManager() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      setOrders((data ?? []) as Order[]);
    } catch (err: any) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      const { error: updateError } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", orderId);

      if (updateError) throw updateError;

      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status: status as Order["status"] } : order,
        ),
      );
    } catch (err: any) {
      setError(err.message || "Failed to update order status");
    }
  };

  const updatePaymentStatus = async (orderId: string, paymentStatus: string) => {
    try {
      const { error: updateError } = await supabase
        .from("orders")
        .update({ payment_status: paymentStatus })
        .eq("id", orderId);

      if (updateError) throw updateError;

      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? { ...order, payment_status: paymentStatus as Order["payment_status"] }
            : order,
        ),
      );
    } catch (err: any) {
      setError(err.message || "Failed to update payment status");
    }
  };

  if (loading) {
    return <p className="text-slate-600">Loading orders...</p>;
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-600">No orders found yet.</p>
        </div>
      ) : (
        orders.map((order) => (
          <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Order {order.order_number}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Placed {new Date(order.created_at).toLocaleString()}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <select
                  value={order.status}
                  onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
                >
                  <option value="pending">Pending</option>
                  <option value="printing">Printing</option>
                  <option value="shipped">Shipped</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                </select>

                <select
                  value={order.payment_status}
                  onChange={(e) => updatePaymentStatus(order.id, e.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
                >
                  <option value="pending">Pending verification</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
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
                      <p className="font-semibold text-slate-900">${(item.unit_price * item.quantity).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-lg font-semibold text-slate-900">Payment</h3>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Total</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">${Number(order.total).toFixed(2)}</p>

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
                </div>
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
