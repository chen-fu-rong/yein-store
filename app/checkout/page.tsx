"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/providers/cart-provider";
import { supabase } from "@/lib/supabase/client";

const CUSTOMER_INFO_STORAGE_KEY = "yein-customer-info";

type CustomerInfo = {
  name: string;
  phone: string;
  address: string;
};

function formatMMK(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} MMK`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error !== "object" || error === null) return "Order placement failed.";

  const errorData = error as Record<string, unknown>;
  const message = typeof errorData.message === "string" ? errorData.message : "";
  const code = typeof errorData.code === "string" ? errorData.code : "";

  if (
    code === "PGRST202" ||
    /function .*create_store_order.*(not found|schema cache)/i.test(message)
  ) {
    return "Store checkout is not set up in Supabase yet. Run the migration supabase/migrations/202610140002_store_checkout_receipts.sql in the Supabase SQL Editor, then try again.";
  }

  if (message.includes("INSUFFICIENT_STOCK")) {
    return "There is not enough stock to complete this order. Return to the store, refresh the item, and try again.";
  }

  if (message) {
    const details = typeof errorData.details === "string" ? errorData.details : "";
    const hint = typeof errorData.hint === "string" ? errorData.hint : "";
    return [message, details, hint].filter(Boolean).join(" ");
  }

  return "Order placement failed.";
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart } = useCart();
  const shipping = 0;
  const total = subtotal + shipping;

  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    name: "",
    phone: "",
    address: "",
  });
  const customerInfoEdited = useRef(false);
  const [hasAutoFilledCustomerInfo, setHasAutoFilledCustomerInfo] = useState(false);
  const [customerInfoNotice, setCustomerInfoNotice] = useState("");
  const [paymentSlip, setPaymentSlip] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [error, setError] = useState("");

  const syncSignedInCustomerInfo = useCallback(async () => {
    if (!supabase) return;
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!data.user) return;

    const { error: profileError } = await supabase.rpc("save_customer_contact_info", {
      p_full_name: customerInfo.name.trim(),
      p_phone: customerInfo.phone.trim(),
      p_address: customerInfo.address.trim(),
    });
    if (profileError) throw profileError;
  }, [customerInfo]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(async () => {
      let savedInfo: CustomerInfo = { name: "", phone: "", address: "" };
      try {
        const stored = window.localStorage.getItem(CUSTOMER_INFO_STORAGE_KEY);
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "name" in parsed &&
            typeof parsed.name === "string" &&
            "phone" in parsed &&
            typeof parsed.phone === "string" &&
            "address" in parsed &&
            typeof parsed.address === "string"
          ) {
            savedInfo = {
              name: parsed.name,
              phone: parsed.phone,
              address: parsed.address,
            };
            setCustomerInfo(savedInfo);
            setHasAutoFilledCustomerInfo(Boolean(savedInfo.name || savedInfo.phone || savedInfo.address));
          } else {
            throw new Error("Saved customer details are in an unexpected format.");
          }
        }
      } catch (storageError) {
        setCustomerInfoNotice(
          storageError instanceof Error
            ? `Saved customer details could not be loaded: ${storageError.message}`
            : "Saved customer details could not be loaded.",
        );
      }

      if (!supabase) return;
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = data.user;
      if (!user || cancelled || customerInfoEdited.current) return;

      const metadata = user.user_metadata;
      const metadataName =
        metadata && typeof metadata.full_name === "string" ? metadata.full_name : "";
      const metadataPhone = metadata && typeof metadata.phone === "string" ? metadata.phone : "";
      const metadataAddress = metadata && typeof metadata.address === "string" ? metadata.address : "";
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, phone, address")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (cancelled || customerInfoEdited.current) return;

      const profileInfo = {
        name: profile?.full_name || metadataName,
        phone: profile?.phone || metadataPhone,
        address: profile?.address || metadataAddress,
      };
      setCustomerInfo((current) => {
        const merged = {
          name: current.name || profileInfo.name || savedInfo.name,
          phone: current.phone || profileInfo.phone || savedInfo.phone,
          address: current.address || profileInfo.address || savedInfo.address,
        };
        if (merged.name || merged.phone || merged.address) setHasAutoFilledCustomerInfo(true);
        return merged;
      });
    }).catch((profileError: unknown) => {
      if (!cancelled) {
        setCustomerInfoNotice(
          profileError instanceof Error
            ? `Your account details could not be synced: ${profileError.message}`
            : "Your account details could not be synced.",
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateCustomerInfo(nextInfo: CustomerInfo) {
    customerInfoEdited.current = true;
    setCustomerInfo(nextInfo);
    setHasAutoFilledCustomerInfo(false);
    setCustomerInfoNotice("");
    try {
      window.localStorage.setItem(CUSTOMER_INFO_STORAGE_KEY, JSON.stringify(nextInfo));
    } catch (storageError) {
      setCustomerInfoNotice(
        storageError instanceof Error
          ? `Your details could not be saved on this device: ${storageError.message}`
          : "Your details could not be saved on this device.",
      );
    }
  }

  useEffect(() => {
    if (
      !customerInfoEdited.current ||
      !customerInfo.name.trim() ||
      !customerInfo.phone.trim() ||
      !customerInfo.address.trim()
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void syncSignedInCustomerInfo().catch((profileError: unknown) => {
        setCustomerInfoNotice(
          profileError instanceof Error
            ? `Your account details could not be synced: ${profileError.message}`
            : "Your account details could not be synced.",
        );
      });
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [customerInfo, syncSignedInCustomerInfo]);

  async function uploadPaymentSlip(file: File) {
    if (!supabase) {
      throw new Error("Supabase is not configured yet. Add your environment variables to enable checkout.");
    }
    const allowedExtensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const extension = allowedExtensions[file.type];
    if (!extension) {
      throw new Error("Please select a JPEG, PNG, WebP, or GIF image for your payment slip.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Payment slip images must be 5 MB or smaller.");
    }

    const fileName = `payment-slips/${crypto.randomUUID()}.${extension}`;
    const { data, error: uploadError } = await supabase.storage
      .from("public-assets")
      .upload(fileName, file, { upsert: false, contentType: file.type });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from("public-assets")
      .getPublicUrl(data.path);
    return urlData.publicUrl;
  }

  async function handleSlipUpload() {
    if (!paymentSlip) {
      setError("Please select your KPay/WavePay payment slip.");
      return;
    }

    try {
      setUploading(true);
      setError("");
      const slipUrl = await uploadPaymentSlip(paymentSlip);
      setUploadedUrl(slipUrl);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function handlePlaceOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }
    if (!paymentSlip) {
      setError("Please select your KPay/WavePay payment slip.");
      return;
    }
    if (!customerInfo.name.trim() || !customerInfo.phone.trim() || !customerInfo.address.trim()) {
      setError("Enter your name, phone number, and delivery address before placing the order.");
      return;
    }
    if (!supabase) {
      setError("Supabase is not configured yet. Add your environment variables to enable checkout.");
      return;
    }

    try {
      setPlacingOrder(true);
      setError("");
      setCustomerInfoNotice("");
      try {
        window.localStorage.setItem(
          CUSTOMER_INFO_STORAGE_KEY,
          JSON.stringify({
            name: customerInfo.name.trim(),
            phone: customerInfo.phone.trim(),
            address: customerInfo.address.trim(),
          }),
        );
      } catch (storageError) {
        setCustomerInfoNotice(
          storageError instanceof Error
            ? `Your details could not be saved on this device: ${storageError.message}`
            : "Your details could not be saved on this device.",
        );
      }
      try {
        await syncSignedInCustomerInfo();
      } catch (profileError) {
        setCustomerInfoNotice(
          profileError instanceof Error
            ? `Order can proceed, but your account details could not be synced: ${profileError.message}`
            : "Order can proceed, but your account details could not be synced.",
        );
      }

      let slipUrl = uploadedUrl;
      if (!slipUrl) {
        setUploading(true);
        slipUrl = await uploadPaymentSlip(paymentSlip);
        setUploadedUrl(slipUrl);
      }

      const { data: orderData, error: orderError } = await supabase.rpc("create_store_order", {
        p_customer_name: customerInfo.name.trim(),
        p_customer_phone: customerInfo.phone.trim(),
        p_customer_address: customerInfo.address.trim(),
        p_payment_slip_url: slipUrl,
        p_items: items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unit_price: item.price,
        })),
      });

      if (orderError) throw orderError;
      if (
        typeof orderData !== "object" ||
        orderData === null ||
        !("id" in orderData) ||
        typeof orderData.id !== "string" ||
        !("order_number" in orderData) ||
        typeof orderData.order_number !== "string"
      ) {
        throw new Error("The order was created but its receipt ID was not returned.");
      }

      void fetch("/api/notify-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            orderId: orderData.id,
            orderNumber: orderData.order_number,
            customerName: customerInfo.name.trim(),
            customerPhone: customerInfo.phone.trim(),
            customerAddress: customerInfo.address.trim(),
            total,
            paymentSlipUrl: slipUrl,
            items: items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.price,
            })),
          }),
        })
        .then(async (notificationResponse) => {
          const notificationResult: unknown = await notificationResponse.json();
          if (
            !notificationResponse.ok ||
            typeof notificationResult !== "object" ||
            notificationResult === null ||
            !("ok" in notificationResult) ||
            notificationResult.ok !== true
          ) {
            console.warn("Order was placed, but the Telegram notification was not sent.");
          }
        })
        .catch((notificationError: unknown) => {
          console.warn("Order was placed, but the Telegram notification failed:", notificationError);
        });

      clearCart();
      router.replace(`/receipt/${encodeURIComponent(orderData.id)}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
      setPlacingOrder(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <form onSubmit={handlePlaceOrder} className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="space-y-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Checkout</h1>
            <p className="mt-2 text-sm text-slate-600">Guest checkout is available. Enter your delivery details below.</p>
          </div>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Customer and delivery details</h2>
            {hasAutoFilledCustomerInfo ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <span>✓ Saved details auto-filled</span>
                <button
                  type="button"
                  onClick={() => {
                    customerInfoEdited.current = true;
                    setCustomerInfo({ name: "", phone: "", address: "" });
                    setHasAutoFilledCustomerInfo(false);
                    setCustomerInfoNotice("");
                    try {
                      window.localStorage.removeItem(CUSTOMER_INFO_STORAGE_KEY);
                    } catch (storageError) {
                      setCustomerInfoNotice(
                        storageError instanceof Error
                          ? `Saved details could not be cleared: ${storageError.message}`
                          : "Saved details could not be cleared.",
                      );
                    }
                  }}
                  className="font-semibold underline underline-offset-2"
                >
                  Clear
                </button>
              </div>
            ) : null}
            <label className="block text-sm font-medium text-slate-700">
              Customer name
              <input
                required
                autoComplete="name"
                value={customerInfo.name}
                onChange={(event) => updateCustomerInfo({ ...customerInfo, name: event.target.value })}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Phone number
              <input
                required
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="09..."
                value={customerInfo.phone}
                onChange={(event) => updateCustomerInfo({ ...customerInfo, phone: event.target.value })}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Delivery address / notes
              <textarea
                required
                autoComplete="street-address"
                rows={3}
                value={customerInfo.address}
                onChange={(event) => updateCustomerInfo({ ...customerInfo, address: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              />
            </label>
          </section>
          {customerInfoNotice ? (
            <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {customerInfoNotice}
            </p>
          ) : null}

          <section>
            <h2 className="text-lg font-semibold text-slate-900">Items</h2>
            {items.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
                Your cart is empty. <Link href="/store" className="font-semibold underline">Continue shopping</Link>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                    <div>
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-sm text-slate-500">Qty: {item.quantity}</p>
                    </div>
                    <p className="shrink-0 font-semibold text-slate-900">{formatMMK(item.price * item.quantity)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl bg-slate-50 p-5">
            <h2 className="text-lg font-semibold text-slate-900">KPay / WavePay</h2>
            <p className="mt-3 text-sm text-slate-700">KBZPay / WavePay Number: <strong>095104519</strong></p>
            <p className="text-sm text-slate-700">Account Name: <strong>Yein Store</strong></p>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              ငွေလွှဲပြီးပါက KPay/WavePay Screenshot (စလစ်) အား အောက်တွင် တင်ပေးပါ။
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Payment slip image (max 5 MB)
              <input
                required
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => {
                  setPaymentSlip(event.target.files?.[0] ?? null);
                  setUploadedUrl("");
                  setError("");
                }}
                className="mt-2 block w-full rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm"
              />
            </label>
            {uploadedUrl && paymentSlip ? (
              <p className="mt-2 text-sm text-emerald-700">Payment slip uploaded and ready.</p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={handleSlipUpload}
              disabled={uploading || placingOrder || !paymentSlip || Boolean(uploadedUrl)}
              className="mt-3"
            >
              {uploading ? "Uploading slip..." : uploadedUrl ? "Slip uploaded" : "Upload Slip"}
            </Button>
          </section>

          {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        </section>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <h2 className="text-xl font-bold text-slate-900">Order summary</h2>
          <div className="mt-6 space-y-3 text-sm text-slate-600">
            <div className="flex justify-between gap-3">
              <span>Subtotal</span>
              <span>{formatMMK(subtotal)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Delivery</span>
              <span>{formatMMK(shipping)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900">
              <span>Total</span>
              <span>{formatMMK(total)}</span>
            </div>
          </div>

          <Button className="mt-8 w-full" type="submit" disabled={placingOrder || items.length === 0}>
            {placingOrder ? (uploading ? "Uploading slip..." : "Placing order...") : "Place Order"}
          </Button>
          <p className="mt-3 text-center text-xs text-slate-500">Any courier fee is paid separately on arrival.</p>
        </aside>
      </form>
    </main>
  );
}
