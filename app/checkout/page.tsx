"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/providers/cart-provider";
import { supabase } from "@/lib/supabase/client";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart } = useCart();
  const shipping = items.length > 0 ? 12 : 0;
  const total = subtotal + shipping;

  const [paymentSlip, setPaymentSlip] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSlipUpload() {
    if (!paymentSlip) {
      setError("Please select a payment slip image first.");
      return;
    }

    try {
      setUploading(true);
      setError("");

      const fileName = `${Date.now()}-${paymentSlip.name.replace(/\s+/g, "-")}`;
      const { data, error: uploadError } = await supabase.storage
        .from("public-assets")
        .upload(fileName, paymentSlip, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("public-assets")
        .getPublicUrl(data?.path ?? fileName);

      setUploadedUrl(urlData.publicUrl);
    } catch (err: any) {
      setError(err.message || "Payment slip upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handlePlaceOrder() {
    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    if (!uploadedUrl) {
      setError("Please upload a payment slip before placing your order.");
      return;
    }

    try {
      setPlacingOrder(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Please log in before placing an order.");
        return;
      }

      const orderNumber = `YEIN-${Date.now()}`;
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          order_number: orderNumber,
          status: "pending",
          payment_method: "bank_transfer",
          payment_status: "pending",
          subtotal,
          shipping_fee: shipping,
          total,
          payment_slip_url: uploadedUrl,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = items.map((item) => ({
        order_id: orderData.id,
        product_id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      clearCart();
      setSuccess("Order placed successfully. Admin will verify your payment slip.");
      setTimeout(() => router.push("/"), 2000);
    } catch (err: any) {
      setError(err.message || "Order placement failed");
    } finally {
      setPlacingOrder(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">Checkout</h1>

          <div className="mt-8 space-y-4">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                <div>
                  <p className="font-medium text-slate-900">{item.name}</p>
                  <p className="text-sm text-slate-500">Qty: {item.quantity}</p>
                </div>
                <p className="font-semibold text-slate-900">${(item.price * item.quantity).toFixed(2)}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-xl bg-slate-50 p-5">
            <h2 className="text-lg font-semibold text-slate-900">Bank transfer details</h2>
            <p className="mt-2 text-sm text-slate-600">Bank: Maybank</p>
            <p className="text-sm text-slate-600">Account: 1234 5678 9012</p>
            <p className="text-sm text-slate-600">Name: Yein Store</p>
          </div>

          <div className="mt-8">
            <label className="mb-2 block text-sm font-medium text-slate-700">Upload payment slip</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPaymentSlip(e.target.files?.[0] ?? null)}
              className="block w-full rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm"
            />

            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            {success ? <p className="mt-3 text-sm text-emerald-600">{success}</p> : null}
            {uploadedUrl ? (
              <p className="mt-3 text-sm text-emerald-600">Slip uploaded successfully.</p>
            ) : null}

            <div className="mt-5 flex gap-3">
              <Button onClick={handleSlipUpload} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload Slip"}
              </Button>
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Order summary</h2>

          <div className="mt-6 space-y-3 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping</span>
              <span>${shipping.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          <Button className="mt-8 w-full" onClick={handlePlaceOrder} disabled={placingOrder || !uploadedUrl}>
            {placingOrder ? "Placing order..." : "Place order"}
          </Button>
        </aside>
      </div>
    </main>
  );
}
