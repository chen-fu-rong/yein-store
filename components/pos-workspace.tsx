"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase/client";
import { playOrderNotificationChime } from "@/lib/order-notifications";
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Check,
  Clock3,
  FileBox,
  Plus,
  Printer,
  Sparkles,
  Search,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";

type OrderStatus = "Queued" | "Printing" | "Completed";

type Order = {
  id: string;
  orderNumber: string;
  customer: string;
  fileName: string;
  price: number;
  status: OrderStatus;
};

type Spool = {
  id: number;
  name: string;
  weightGrams: number;
  priceMMK: number;
  colorHex: string;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
};

type CartLine = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  kind: "custom" | "product";
  productId?: string;
  image_url?: string | null;
};

type InventoryState = "loading" | "live" | "fallback";

const MATERIALS_API_URL = "/api/bambuddy/materials";
const POS_PRINT_QUEUE_STORAGE_KEY = "yein-pos-print-queue";
const MOCK_MATERIALS: Spool[] = [
  { id: 1, name: "Bambu PLA Black", weightGrams: 1000, priceMMK: 76000, colorHex: "#000000" },
];
const ELECTRICITY_PER_HOUR = 45;
const MACHINE_WEAR_PER_HOUR = 300;
const SETUP_FEE = 1000;
const FAIL_RATE = 1.1;
const PROFIT_MARGIN = 2;

const statusStyles: Record<OrderStatus, { dot: string; badge: string }> = {
  Queued: {
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  Printing: {
    dot: "bg-sky-500",
    badge: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  Completed: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
};

function formatMMK(amount: number, maximumFractionDigits = 0) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(amount)} MMK`;
}

function getOrderWorkflowError(error: unknown, fallback: string) {
  const message =
    typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : error instanceof Error
        ? error.message
        : fallback;
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "";

  if (
    code === "PGRST202" ||
    /function .*?create_pos_order.*?(not found|schema cache)/i.test(message)
  ) {
    return "Run supabase/migrations/202610140002_store_checkout_receipts.sql in Supabase to enable persistent POS orders.";
  }
  if (message.includes("INSUFFICIENT_STOCK")) {
    return "One or more products no longer have enough stock. Refresh inventory and review the cart.";
  }
  return message;
}

function isStoredPrintOrder(value: unknown): value is Order {
  if (typeof value !== "object" || value === null) return false;
  const order = value as Record<string, unknown>;
  return (
    typeof order.id === "string" &&
    typeof order.orderNumber === "string" &&
    typeof order.customer === "string" &&
    typeof order.fileName === "string" &&
    typeof order.price === "number" &&
    Number.isFinite(order.price) &&
    (order.status === "Queued" || order.status === "Printing" || order.status === "Completed")
  );
}

function isMaterial(value: unknown): value is Spool {
  if (!value || typeof value !== "object") return false;

  const material = value as Record<string, unknown>;

  return (
    typeof material.id === "number" &&
    Number.isFinite(material.id) &&
    typeof material.name === "string" &&
    material.name.trim().length > 0 &&
    typeof material.weightGrams === "number" &&
    Number.isFinite(material.weightGrams) &&
    material.weightGrams > 0 &&
    typeof material.priceMMK === "number" &&
    Number.isFinite(material.priceMMK) &&
    material.priceMMK >= 0 &&
    typeof material.colorHex === "string" &&
    /^#?[0-9a-fA-F]{6}$/.test(material.colorHex)
  );
}

function getSpoolColor(colorHex: string) {
  return colorHex.startsWith("#") ? colorHex : `#${colorHex}`;
}

function isCloudinaryImage(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
  min = "0",
  step = "1",
  icon,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  step?: string;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-100">
        <span className="text-slate-400">{icon}</span>
        <input
          id={id}
          type="number"
          min={min}
          step={step}
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
        />
        <span className="text-xs font-medium text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

function PricingCalculator({
  spools,
  selectedSpoolId,
  inventoryState,
  inventoryMessage,
  weight,
  hours,
  minutes,
  materialCost,
  electricityCost,
  machineWearCost,
  finalPrice,
  onSpoolChange,
  onWeightChange,
  onHoursChange,
  onMinutesChange,
}: {
  spools: Spool[];
  selectedSpoolId: number;
  inventoryState: InventoryState;
  inventoryMessage: string;
  weight: string;
  hours: string;
  minutes: string;
  materialCost: number;
  electricityCost: number;
  machineWearCost: number;
  finalPrice: number;
  onSpoolChange: (id: number) => void;
  onWeightChange: (value: string) => void;
  onHoursChange: (value: string) => void;
  onMinutesChange: (value: string) => void;
}) {
  const selectedSpool = spools.find((spool) => spool.id === selectedSpoolId);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionHeading
          eyebrow="Bambuddy materials"
          title="Print price calculator"
          description="Choose a filament and enter the print requirements."
        />
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
          <Sparkles size={18} />
        </div>
      </div>

      <div className="mt-6">
        <label htmlFor="filament-spool" className="mb-2 block text-sm font-medium text-slate-700">
          Filament material
        </label>
        {inventoryState === "loading" ? (
          <select
            id="filament-spool"
            disabled
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-400"
          >
            <option>Loading Bambuddy materials…</option>
          </select>
        ) : spools.length > 0 ? (
          <div className="relative">
            <select
              id="filament-spool"
              value={selectedSpoolId}
              onChange={(event) => onSpoolChange(Number(event.target.value))}
              className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-20 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              {spools.map((spool) => (
                <option key={spool.id} value={spool.id}>
                  {spool.name} · {formatMMK(spool.priceMMK / spool.weightGrams, 2)} / g
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
              <span
                aria-hidden="true"
                className="size-3.5 rounded-full border border-slate-300"
                style={{
                  backgroundColor: getSpoolColor(selectedSpool?.colorHex ?? "CBD5E1"),
                }}
              />
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs text-slate-400">
              {formatMMK(
                selectedSpool
                  ? selectedSpool.priceMMK / selectedSpool.weightGrams
                  : 0,
                2,
              )}
              /g
            </span>
          </div>
        ) : (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
            No filament materials are available. Check the Bambuddy API response.
          </p>
        )}
        <p
          role={inventoryState === "fallback" ? "status" : undefined}
          className={`mt-2 text-xs ${inventoryState === "fallback" ? "text-amber-700" : "text-slate-400"}`}
        >
          {inventoryState === "loading" ? "Loading Bambuddy materials…" : inventoryMessage}
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <NumberField
          id="filament-weight"
          label="Weight"
          unit="grams"
          value={weight}
          onChange={onWeightChange}
          step="0.1"
          icon={<Boxes size={17} />}
        />
        <NumberField
          id="print-hours"
          label="Print time (hours)"
          unit="hours"
          value={hours}
          onChange={onHoursChange}
          icon={<Clock3 size={17} />}
        />
        <NumberField
          id="print-minutes"
          label="Print time (minutes)"
          unit="minutes"
          value={minutes}
          onChange={onMinutesChange}
          min="0"
          step="1"
          icon={<Clock3 size={17} />}
        />
      </div>

      <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cost breakdown</p>
        <dl className="mt-3 space-y-2.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Material cost</dt>
            <dd className="font-medium text-slate-800">{formatMMK(materialCost, 2)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Electricity</dt>
            <dd className="font-medium text-slate-800">{formatMMK(electricityCost, 2)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Machine wear</dt>
            <dd className="font-medium text-slate-800">{formatMMK(machineWearCost, 2)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Setup fee</dt>
            <dd className="font-medium text-slate-800">{formatMMK(SETUP_FEE)}</dd>
          </div>
          <div className="border-t border-slate-200 pt-2.5 text-xs text-slate-400">
            Includes 10% failure buffer and 2× markup
          </div>
        </dl>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4 rounded-xl bg-slate-950 p-4 text-white sm:p-5">
        <div>
          <p className="text-xs font-medium text-slate-400">Final Estimated Price (MMK)</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{formatMMK(finalPrice)}</p>
        </div>
        <div className="mb-1 grid size-9 place-items-center rounded-lg bg-white/10 text-emerald-300">
          <Wallet size={17} />
        </div>
      </div>

    </section>
  );
}

function NewOrderForm({
  price,
  disabled,
  onAddCustomPrint,
}: {
  price: number;
  disabled: boolean;
  onAddCustomPrint: (fileName: string) => void;
}) {
  const [fileName, setFileName] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAddCustomPrint(fileName.trim());
    setFileName("");
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionHeading
          eyebrow="Custom print"
          title="Add a quoted print"
          description="Add the current calculator quote to this order."
        />
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
          <Plus size={19} />
        </div>
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={handleSubmit}
      >
        <div>
          <label htmlFor="custom-print-name" className="mb-2 block text-sm font-medium text-slate-700">
            Print or model name
          </label>
          <div className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-100">
            <FileBox size={17} className="shrink-0 text-slate-400" />
            <input
              id="custom-print-name"
              type="text"
              required
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              placeholder="e.g. custom-part.stl"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-500">Order estimate</span>
          <span className="text-sm font-semibold text-slate-900">{formatMMK(price)}</span>
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={17} />
          {disabled ? "Loading inventory…" : "Add custom print to cart"}
        </button>
      </form>
    </section>
  );
}

function OrderCard({
  order,
  onAdvanceStatus,
  onArchive,
}: {
  order: Order;
  onAdvanceStatus: (orderId: string) => void;
  onArchive: (orderId: string) => void;
}) {
  const style = statusStyles[order.status];

  return (
    <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[11px] font-medium text-slate-400">{order.orderNumber}</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${style.badge}`}>
          <span className={`size-1.5 rounded-full ${style.dot}`} />
          {order.status}
        </span>
      </div>
      <div className="mt-4">
        <h3 className="truncate text-sm font-semibold text-slate-900">{order.customer}</h3>
        <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
          <FileBox size={13} className="shrink-0 text-slate-400" />
          <span className="truncate">{order.fileName}</span>
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-400">Total</span>
        <span className="text-sm font-semibold text-slate-900">{formatMMK(order.price)}</span>
      </div>
      {order.status !== "Completed" ? (
        <button
          type="button"
          onClick={() => onAdvanceStatus(order.id)}
          className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
        >
          {order.status === "Queued" ? "Start Printing" : "Mark Completed"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onArchive(order.id)}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Archive / Remove
        </button>
      )}
    </article>
  );
}

function OrderBoard({
  orders,
  onAdvanceStatus,
  onArchive,
  loading,
}: {
  orders: Order[];
  onAdvanceStatus: (orderId: string) => void;
  onArchive: (orderId: string) => void;
  loading: boolean;
}) {
  const columns: { title: OrderStatus; icon: React.ReactNode }[] = [
    { title: "Queued", icon: <ArrowDownRight size={15} /> },
    { title: "Printing", icon: <Printer size={15} /> },
    { title: "Completed", icon: <Check size={15} /> },
  ];

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <SectionHeading
          eyebrow="Live workflow"
          title="Order board"
          description="Keep track of every print, from queue to pickup."
        />
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          {orders.filter((order) => order.status !== "Completed").length} active orders
          <ArrowUpRight size={13} className="text-slate-400" />
        </span>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-3">
        {columns.map(({ title, icon }) => {
          const columnOrders = orders.filter((order) => order.status === title);
          const status = statusStyles[title];

          return (
            <section
              key={title}
              aria-label={`${title} orders`}
              className="min-w-0 rounded-2xl border border-slate-200/80 bg-slate-100/70 p-3.5 sm:p-4"
            >
              <header className="mb-3 flex items-center justify-between px-0.5">
                <div className="flex items-center gap-2">
                  <span className={`grid size-7 place-items-center rounded-lg bg-white shadow-sm ${status.badge.split(" ")[1]}`}>
                    {icon}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
                </div>
                <span className="grid size-6 place-items-center rounded-full bg-white text-xs font-semibold text-slate-500 shadow-sm">
                  {columnOrders.length}
                </span>
              </header>
              <div className="space-y-3">
                {loading ? (
                  <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                    Loading orders…
                  </p>
                ) : columnOrders.length > 0 ? (
                  columnOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onAdvanceStatus={onAdvanceStatus}
                      onArchive={onArchive}
                    />
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                    No {title.toLowerCase()} orders
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== "object") return false;
  const product = value as Record<string, unknown>;
  return (
    typeof product.id === "string" &&
    typeof product.name === "string" &&
    (typeof product.description === "string" || product.description === null) &&
    typeof product.price === "number" &&
    Number.isFinite(product.price) &&
    typeof product.stock === "number" &&
    Number.isInteger(product.stock) &&
    (typeof product.image_url === "string" || product.image_url === null)
  );
}

async function readApiResponse(response: Response): Promise<unknown> {
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok) {
    const message =
      result &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : `The request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return result;
}

export function POSWorkspace() {
  const [spools, setSpools] = useState<Spool[]>([]);
  const [selectedSpoolId, setSelectedSpoolId] = useState<number>(MOCK_MATERIALS[0].id);
  const [inventoryState, setInventoryState] = useState<InventoryState>("loading");
  const [inventoryMessage, setInventoryMessage] = useState("Connecting to Bambuddy.");
  const [weight, setWeight] = useState("120");
  const [hours, setHours] = useState("6");
  const [minutes, setMinutes] = useState("0");
  const [activeView, setActiveView] = useState<"pos" | "inventory">("pos");
  const [addTab, setAddTab] = useState<"custom" | "products">("custom");
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productSearch, setProductSearch] = useState("");
  const [productsError, setProductsError] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountInput, setDiscountInput] = useState("0");
  const [documentType, setDocumentType] = useState<"QUOTATION" | "RECEIPT">("RECEIPT");
  const [orderError, setOrderError] = useState("");
  const [orderComplete, setOrderComplete] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [receiptDate, setReceiptDate] = useState("");
  const [inventoryMessageText, setInventoryMessageText] = useState("");
  const [productBusy, setProductBusy] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: "",
    stock: "",
    image_url: "",
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersStorageReady, setOrdersStorageReady] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [newOrderNotice, setNewOrderNotice] = useState("");
  const noticeTimeout = useRef<number | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const storedOrders = window.localStorage.getItem(POS_PRINT_QUEUE_STORAGE_KEY);
        if (storedOrders) {
          const parsed: unknown = JSON.parse(storedOrders);
          if (!Array.isArray(parsed) || !parsed.every(isStoredPrintOrder)) {
            throw new Error("Saved print jobs are in an unexpected format.");
          }
          setOrders(parsed);
        }
        setOrdersStorageReady(true);
      } catch (storageError) {
        setOrdersError(
          storageError instanceof Error
            ? `Saved print jobs could not be loaded: ${storageError.message}`
            : "Saved print jobs could not be loaded.",
        );
      } finally {
        setOrdersLoaded(true);
        setOrdersLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!ordersLoaded || !ordersStorageReady) return;
    try {
      window.localStorage.setItem(POS_PRINT_QUEUE_STORAGE_KEY, JSON.stringify(orders));
    } catch (storageError) {
      void Promise.resolve().then(() =>
        setOrdersError(
          storageError instanceof Error
            ? `Print jobs could not be saved on this device: ${storageError.message}`
            : "Print jobs could not be saved on this device.",
        ),
      );
    }
  }, [orders, ordersLoaded, ordersStorageReady]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const channel = client
      .channel("pos-new-store-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const newOrder = payload.new;
        if (newOrder.payment_method !== "bank_transfer") return;

        const customerName =
          typeof newOrder.customer_name === "string" && newOrder.customer_name.trim()
            ? newOrder.customer_name.trim()
            : "a customer";
        setNewOrderNotice(`🔔 New store order received from ${customerName}!`);
        playOrderNotificationChime();
        if (noticeTimeout.current !== null) window.clearTimeout(noticeTimeout.current);
        noticeTimeout.current = window.setTimeout(() => setNewOrderNotice(""), 8_000);
      })
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setOrdersError(error?.message || "Live store order notifications are unavailable.");
        }
      });

    return () => {
      if (noticeTimeout.current !== null) window.clearTimeout(noticeTimeout.current);
      void client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSpools() {
      try {
        const response = await fetch(MATERIALS_API_URL, { signal: controller.signal });
        if (!response.ok) {
          const errorBody = await response.text();
          let errorPayload: unknown;
          try {
            errorPayload = errorBody ? JSON.parse(errorBody) : null;
          } catch {
            throw new Error(
              `Bambuddy responded with HTTP ${response.status} and an invalid error response.`,
            );
          }

          const errorMessage =
            errorPayload &&
            typeof errorPayload === "object" &&
            "error" in errorPayload &&
            typeof errorPayload.error === "string" &&
            errorPayload.error.trim()
              ? errorPayload.error
              : `Bambuddy responded with HTTP ${response.status}.`;
          throw new Error(errorMessage);
        }

        const result: unknown = await response.json();
        if (!result || typeof result !== "object" || !("ok" in result)) {
          throw new Error("The Bambuddy proxy returned an unexpected response.");
        }
        if (result.ok === false) {
          throw new Error(
            "error" in result && typeof result.error === "string"
              ? result.error
              : "The Bambuddy proxy could not retrieve materials.",
          );
        }
        if (result.ok !== true || !("materials" in result)) {
          throw new Error("The Bambuddy proxy returned an unexpected response.");
        }

        const payload: unknown = result.materials;
        if (!Array.isArray(payload) || !payload.every(isMaterial)) {
          throw new Error("Bambuddy returned data in an unexpected format.");
        }
        if (payload.length === 0) {
          throw new Error("Bambuddy returned no filament materials.");
        }

        const loadedSpools = payload;
        if (controller.signal.aborted) return;

        setSpools(loadedSpools);
        setSelectedSpoolId(loadedSpools[0].id);
        setInventoryState("live");
        setInventoryMessage("Live filament materials from Bambuddy.");
      } catch (error) {
        if (controller.signal.aborted) return;

        const reason = error instanceof Error ? error.message : "Unknown request error.";
        setSpools(MOCK_MATERIALS);
        setSelectedSpoolId(MOCK_MATERIALS[0].id);
        setInventoryState("fallback");
        setInventoryMessage(`Bambuddy unavailable: ${reason} Showing mock filament data.`);
      }
    }

    void loadSpools();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      setProductsLoading(true);
      setProductsError("");
      try {
        const response = await fetch("/api/admin/products", { cache: "no-store" });
        const result = await readApiResponse(response);
        if (
          !result ||
          typeof result !== "object" ||
          !("products" in result) ||
          !Array.isArray(result.products) ||
          !result.products.every(isProduct)
        ) {
          throw new Error("The inventory endpoint returned data in an unexpected format.");
        }
        if (active) setProducts(result.products);
      } catch (error) {
        if (active) {
          setProductsError(error instanceof Error ? error.message : "Unable to load products.");
        }
      } finally {
        if (active) setProductsLoading(false);
      }
    }

    void loadProducts();
    return () => {
      active = false;
    };
  }, []);

  const selectedSpool = spools.find((spool) => spool.id === selectedSpoolId);
  const numericWeight = Number(weight);
  const numericHours = Number(hours);
  const numericMinutes = Number(minutes);
  const parsedWeight = Number.isFinite(numericWeight) ? Math.max(0, numericWeight) : 0;
  const parsedHours = Number.isFinite(numericHours) ? Math.max(0, numericHours) : 0;
  const parsedMinutes = Number.isFinite(numericMinutes) ? Math.max(0, numericMinutes) : 0;
  const totalTimeInHours = parsedHours + parsedMinutes / 60;
  const costPerGram = selectedSpool
    ? selectedSpool.priceMMK / selectedSpool.weightGrams
    : 0;
  const materialCost = parsedWeight * costPerGram;
  const electricityCost = totalTimeInHours * ELECTRICITY_PER_HOUR;
  const machineWearCost = totalTimeInHours * MACHINE_WEAR_PER_HOUR;
  const timeCost = electricityCost + machineWearCost;
  const baseCost = materialCost + timeCost + SETUP_FEE;
  const trueCost = baseCost * FAIL_RATE;
  const unroundedFinalPrice = trueCost * PROFIT_MARGIN;
  const finalPrice = Math.ceil(unroundedFinalPrice / 500) * 500;

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const requestedDiscount = Number(discountInput);
  const discount = Number.isFinite(requestedDiscount) ? Math.max(0, requestedDiscount) : 0;
  const appliedDiscount = Math.min(discount, cartTotal);
  const netTotal = cartTotal - appliedDiscount;
  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(productSearch.trim().toLowerCase()),
  );

  function addCustomPrint(fileName: string) {
    setCart((current) => [
      ...current,
      {
        id: `custom-${Date.now()}-${current.length}`,
        name: fileName,
        price: finalPrice,
        quantity: 1,
        kind: "custom",
      },
    ]);
    setOrderComplete(false);
    setOrderError("");
  }

  function addProduct(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if ((existing?.quantity ?? 0) >= product.stock) return current;
      if (existing) {
        return current.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...current,
        {
          id: `product-${product.id}`,
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: 1,
          kind: "product",
          image_url: product.image_url,
        },
      ];
    });
    setOrderComplete(false);
    setOrderError("");
  }

  function updateQuantity(line: CartLine, quantity: number) {
    setCart((current) => {
      if (quantity < 1) return current.filter((item) => item.id !== line.id);
      if (line.productId) {
        const product = products.find((item) => item.id === line.productId);
        if (!product || quantity > product.stock) return current;
      }
      return current.map((item) => (item.id === line.id ? { ...item, quantity } : item));
    });
    setOrderComplete(false);
    setOrderError("");
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProductBusy(true);
    setInventoryMessageText("");
    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...productForm,
          price: Number(productForm.price),
          stock: Number(productForm.stock),
        }),
      });
      const result = await readApiResponse(response);
      const addedProduct =
        result && typeof result === "object" && "product" in result ? result.product : null;
      if (!isProduct(addedProduct)) {
        throw new Error("The inventory endpoint returned an unexpected product.");
      }
      setProducts((current) => [...current, addedProduct].sort((a, b) => a.name.localeCompare(b.name)));
      setProductForm({ name: "", description: "", price: "", stock: "", image_url: "" });
      setInventoryMessageText("Product added to inventory.");
    } catch (error) {
      setInventoryMessageText(error instanceof Error ? error.message : "Unable to add the product.");
    } finally {
      setProductBusy(false);
    }
  }

  async function changeStock(product: Product, stock: number) {
    setBusyProductId(product.id);
    setInventoryMessageText("");
    try {
      const response = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id, stock }),
      });
      const result = await readApiResponse(response);
      const updatedProduct =
        result && typeof result === "object" && "product" in result ? result.product : null;
      if (!isProduct(updatedProduct)) {
        throw new Error("The inventory endpoint returned an unexpected product.");
      }
      setProducts((current) => current.map((item) => (item.id === product.id ? updatedProduct : item)));
    } catch (error) {
      setInventoryMessageText(error instanceof Error ? error.message : "Unable to update stock.");
    } finally {
      setBusyProductId(null);
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Delete "${product.name}" from inventory?`)) return;
    setBusyProductId(product.id);
    setInventoryMessageText("");
    try {
      const response = await fetch("/api/admin/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id }),
      });
      await readApiResponse(response);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setCart((current) => current.filter((item) => item.productId !== product.id));
      setInventoryMessageText("Product deleted.");
    } catch (error) {
      setInventoryMessageText(error instanceof Error ? error.message : "Unable to delete the product.");
    } finally {
      setBusyProductId(null);
    }
  }

  async function completeOrder() {
    if (!cart.length || !customerName.trim()) {
      setOrderError("Add at least one item and enter the customer name before completing the order.");
      return;
    }
    if (!supabase) {
      setOrderError("Supabase is not configured. The order cannot be saved.");
      return;
    }
    setOrderBusy(true);
    setOrderError("");
    try {
      const { data, error } = await supabase.rpc("create_pos_order", {
        p_customer_name: customerName.trim(),
        p_customer_phone: customerPhone.trim() || null,
        p_subtotal: cartTotal,
        p_discount: appliedDiscount,
        p_items: cart.map((item) => ({
          product_id: item.productId ?? null,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
        })),
      });
      if (error) throw error;
      if (
        typeof data !== "object" ||
        data === null ||
        !("id" in data) ||
        typeof data.id !== "string" ||
        !("order_number" in data) ||
        typeof data.order_number !== "string"
      ) {
        throw new Error("The order was saved but Supabase returned an invalid order record.");
      }

      const readyMadeItems = cart
        .filter((item): item is CartLine & { productId: string } => Boolean(item.productId))
        .map((item) => ({ id: item.productId, quantity: item.quantity }));
      setProducts((current) =>
        current.map((product) => {
          const purchased = readyMadeItems
            .filter((item) => item.id === product.id)
            .reduce((total, item) => total + item.quantity, 0);
          return purchased ? { ...product, stock: product.stock - purchased } : product;
        }),
      );
      const printJobs = cart
        .filter((item) => item.kind === "custom")
        .map((item, index) => ({
          id: `${data.id}:print:${index}`,
          orderNumber: `${data.order_number}-${String(index + 1).padStart(2, "0")}`,
          customer: customerName.trim(),
          fileName: `${item.name}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`,
          price: item.price * item.quantity,
          status: "Queued" as const,
        }));
      if (printJobs.length > 0) setOrders((current) => [...printJobs, ...current]);
      setReceiptDate(new Date().toLocaleString());
      setOrderComplete(true);
      window.requestAnimationFrame(() => window.print());
    } catch (error) {
      setOrderError(getOrderWorkflowError(error, "Unable to save this order."));
    } finally {
      setOrderBusy(false);
    }
  }

  function startNewOrder() {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setDiscountInput("0");
    setOrderError("");
    setOrderComplete(false);
    setReceiptDate("");
  }

  function advanceOrderStatus(orderId: string) {
    const order = orders.find((item) => item.id === orderId);
    if (!order || order.status === "Completed") return;
    const nextStatus: OrderStatus = order.status === "Queued" ? "Printing" : "Completed";
    setOrders((current) =>
      current.map((item) => (item.id === orderId ? { ...item, status: nextStatus } : item)),
    );
  }

  function archiveOrder(orderId: string) {
    setOrders((current) => current.filter((item) => item.id !== orderId));
  }

  return (
    <main className="min-h-screen bg-[#f6f7f5] px-4 py-6 text-slate-900 sm:px-6 sm:py-8 lg:px-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-7xl">
        {newOrderNotice ? (
          <div role="status" aria-live="polite" className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-base font-semibold text-emerald-900 shadow-sm print:hidden">
            {newOrderNotice}
          </div>
        ) : null}
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <Link href="/" className="group inline-flex items-center gap-3" aria-label="Yein Studio home">
            <span className="grid size-10 place-items-center rounded-xl bg-slate-900 text-white shadow-sm transition group-hover:bg-slate-800">
              <Printer size={19} />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-tight text-slate-900">YEIN STUDIO</span>
              <span className="block text-xs text-slate-500">Production workspace</span>
            </span>
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 shadow-sm">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-slate-600">Studio online</span>
          </div>
        </header>

        <div className="mb-7 print:hidden">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Point of sale</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Production desk<span className="text-violet-500">.</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Quote custom prints, sell ready-made stock, and manage your catalog.
          </p>
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm print:hidden">
          <button
            type="button"
            onClick={() => setActiveView("pos")}
            aria-pressed={activeView === "pos"}
            className={`shrink-0 rounded-xl px-4 py-3 text-sm font-semibold ${activeView === "pos" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            POS &amp; Quoting
          </button>
          <button
            type="button"
            onClick={() => setActiveView("inventory")}
            aria-pressed={activeView === "inventory"}
            className={`shrink-0 rounded-xl px-4 py-3 text-sm font-semibold ${activeView === "inventory" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Inventory Management
          </button>
        </div>

        {activeView === "pos" ? (
          <>
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] print:hidden">
              <section className="min-w-0">
                <div className="mb-4 flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setAddTab("custom")}
                    aria-pressed={addTab === "custom"}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${addTab === "custom" ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    Custom 3D Print
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddTab("products")}
                    aria-pressed={addTab === "products"}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${addTab === "products" ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    Ready-made Stock
                  </button>
                </div>

                {addTab === "custom" ? (
                  <div className="space-y-4">
                    <PricingCalculator
                      spools={spools}
                      selectedSpoolId={selectedSpoolId}
                      inventoryState={inventoryState}
                      inventoryMessage={inventoryMessage}
                      weight={weight}
                      hours={hours}
                      minutes={minutes}
                      materialCost={materialCost}
                      electricityCost={electricityCost}
                      machineWearCost={machineWearCost}
                      finalPrice={finalPrice}
                      onSpoolChange={setSelectedSpoolId}
                      onWeightChange={setWeight}
                      onHoursChange={setHours}
                      onMinutesChange={setMinutes}
                    />
                    <NewOrderForm
                      price={finalPrice}
                      disabled={inventoryState === "loading" || spools.length === 0 || orderComplete}
                      onAddCustomPrint={addCustomPrint}
                    />
                  </div>
                ) : (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-4">
                      <SectionHeading
                        eyebrow="Ready-made catalog"
                        title="Add an in-stock item"
                        description="Search live inventory and add available items to the order."
                      />
                    </div>
                    <label className="mb-4 flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-slate-400">
                      <Search size={17} />
                      <input
                        value={productSearch}
                        onChange={(event) => setProductSearch(event.target.value)}
                        placeholder="Search products"
                        className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
                      />
                    </label>
                    {productsError ? (
                      <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{productsError}</p>
                    ) : productsLoading ? (
                      <p className="py-8 text-center text-sm text-slate-500">Loading inventory…</p>
                    ) : filteredProducts.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-500">No matching products found.</p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {filteredProducts.map((product) => {
                          const cartLine = cart.find((item) => item.productId === product.id);
                          const inCart = cartLine?.quantity ?? 0;
                          return (
                            <article key={product.id} className="overflow-hidden rounded-xl border border-slate-200">
                              <div className="relative aspect-[4/3] bg-slate-100">
                                {isCloudinaryImage(product.image_url) ? (
                                  <Image src={product.image_url} alt={product.name} fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover" />
                                ) : (
                                  <div className="grid h-full place-items-center text-xs text-slate-500">No image</div>
                                )}
                              </div>
                              <div className="space-y-2 p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <h3 className="text-sm font-semibold text-slate-900">{product.name}</h3>
                                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${product.stock > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                                    Stock: {product.stock}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-slate-700">{formatMMK(product.price)}</p>
                                  <div className="flex items-center gap-2" role="group" aria-label={`${product.name} quantity`}>
                                    <button
                                      type="button"
                                      aria-label={`Decrease ${product.name} quantity`}
                                      disabled={inCart === 0 || orderComplete}
                                      onClick={() => {
                                        if (cartLine) updateQuantity(cartLine, inCart - 1);
                                      }}
                                      className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      −
                                    </button>
                                    <span className="min-w-14 text-center text-xs font-semibold text-slate-700">
                                      {inCart} in cart
                                    </span>
                                    <button
                                      type="button"
                                      aria-label={`Add ${product.name} to cart`}
                                      disabled={product.stock === 0 || inCart >= product.stock || orderComplete}
                                      onClick={() => addProduct(product)}
                                      className="grid size-8 place-items-center rounded-lg bg-slate-900 text-lg font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                                {product.stock === 0 && (
                                  <p className="text-xs font-medium text-rose-600">Out of stock</p>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <SectionHeading eyebrow="Checkout" title="Order cart" description="Review items and prepare the customer receipt." />
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{cart.reduce((count, item) => count + item.quantity, 0)} items</span>
                </div>

                <div className="mt-5 space-y-3">
                  {cart.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-500">Your order cart is empty.</p>
                  ) : cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatMMK(item.price)} · {item.kind === "custom" ? "Custom print" : "Ready-made"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={orderComplete} onClick={() => updateQuantity(item, item.quantity - 1)} className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-700 disabled:opacity-50">−</button>
                        <span className="w-5 text-center text-sm font-semibold">{item.quantity}</span>
                        <button type="button" aria-label={`Increase ${item.name} quantity`} disabled={orderComplete || (item.productId ? (products.find((p) => p.id === item.productId)?.stock ?? 0) <= item.quantity : false)} onClick={() => updateQuantity(item, item.quantity + 1)} className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-700 disabled:opacity-50">+</button>
                      </div>
                      <button type="button" aria-label={`Remove ${item.name}`} disabled={orderComplete} onClick={() => updateQuantity(item, 0)} className="grid size-8 place-items-center rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Customer name
                    <span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3">
                      <UserRound size={16} className="text-slate-400" />
                      <input required value={customerName} disabled={orderComplete} onChange={(event) => setCustomerName(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Full name" />
                    </span>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Customer phone
                    <input type="tel" value={customerPhone} disabled={orderComplete} onChange={(event) => setCustomerPhone(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" placeholder="+95…" />
                  </label>
                </div>
                <label className="mt-4 block text-sm font-medium text-slate-700">
                  Document type
                  <select value={documentType} disabled={orderComplete} onChange={(event) => setDocumentType(event.target.value as "QUOTATION" | "RECEIPT")} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    <option value="QUOTATION">QUOTATION</option>
                    <option value="RECEIPT">RECEIPT</option>
                  </select>
                </label>

                <label className="mt-4 block text-sm font-medium text-slate-700">
                  Discount (MMK)
                  <input
                    type="number"
                    min="0"
                    max={cartTotal}
                    step="1"
                    inputMode="numeric"
                    value={discountInput}
                    disabled={orderComplete}
                    onChange={(event) => setDiscountInput(event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50"
                  />
                </label>

                <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Subtotal</span>
                    <span>{formatMMK(cartTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Discount</span>
                    <span>−{formatMMK(appliedDiscount)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 font-semibold text-slate-950">
                    <span>Net total</span>
                    <span className="text-lg">{formatMMK(netTotal)}</span>
                  </div>
                </div>
                {orderError ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{orderError}</p> : null}
                <div className="mt-4 grid gap-2">
                  <button type="button" onClick={completeOrder} disabled={orderBusy || orderComplete || cart.length === 0} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                    <Printer size={17} />{orderBusy ? "Updating stock…" : orderComplete ? "Order completed" : "Complete Order & Print"}
                  </button>
                  {orderComplete ? <button type="button" onClick={startNewOrder} className="h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Start a new order</button> : null}
                </div>
              </section>
            </div>
            {ordersError ? (
              <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
                Order board: {ordersError}
              </p>
            ) : null}
            <OrderBoard
              orders={orders}
              onAdvanceStatus={advanceOrderStatus}
              onArchive={archiveOrder}
              loading={ordersLoading}
            />
          </>
        ) : (
          <section className="grid items-start gap-5 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)] print:hidden">
            <form onSubmit={handleCreateProduct} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionHeading eyebrow="No-code catalog" title="Add new product" description="Publish a ready-made item without changing application code." />
              <label className="block text-sm font-medium text-slate-700">Item name
                <input required maxLength={120} value={productForm.name} onChange={(event) => setProductForm((form) => ({ ...form, name: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Description
                <textarea required rows={4} value={productForm.description} onChange={(event) => setProductForm((form) => ({ ...form, description: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">Price (MMK)
                  <input required type="number" min="0" step="1" value={productForm.price} onChange={(event) => setProductForm((form) => ({ ...form, price: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
                </label>
                <label className="block text-sm font-medium text-slate-700">Initial stock
                  <input required type="number" min="0" step="1" value={productForm.stock} onChange={(event) => setProductForm((form) => ({ ...form, stock: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">Cloudinary image URL
                <input required type="url" pattern="https://res\.cloudinary\.com/.+" value={productForm.image_url} onChange={(event) => setProductForm((form) => ({ ...form, image_url: event.target.value }))} placeholder="https://res.cloudinary.com/…" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
              </label>
              {inventoryMessageText ? <p role="status" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{inventoryMessageText}</p> : null}
              <button type="submit" disabled={productBusy} className="h-12 w-full rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">{productBusy ? "Saving…" : "Add product"}</button>
            </form>

            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <SectionHeading eyebrow="Live stock" title="Current inventory" description="Update quantity or remove an item from the storefront." />
                <span className="text-sm text-slate-500">{products.length} products</span>
              </div>
              {productsError ? <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{productsError}</p> : null}
              {productsLoading ? <p className="py-8 text-center text-sm text-slate-500">Loading inventory…</p> : products.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No products in inventory yet.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <tr><th className="pb-3 pr-3">Product</th><th className="pb-3 pr-3">Description</th><th className="pb-3 pr-3">Price</th><th className="pb-3 pr-3">Stock</th><th className="pb-3">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {products.map((product) => (
                        <tr key={product.id}>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-3">
                              <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                                {isCloudinaryImage(product.image_url) ? <Image src={product.image_url} alt="" fill sizes="48px" className="object-cover" /> : null}
                              </div>
                              <span className="max-w-36 font-semibold text-slate-800">{product.name}</span>
                            </div>
                          </td>
                          <td className="max-w-48 truncate py-3 pr-3 text-slate-500">{product.description}</td>
                          <td className="whitespace-nowrap py-3 pr-3 font-medium">{formatMMK(product.price)}</td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              <button type="button" aria-label={`Decrease ${product.name} stock`} disabled={product.stock === 0 || busyProductId === product.id} onClick={() => void changeStock(product, product.stock - 1)} className="grid size-8 place-items-center rounded-lg border border-slate-200 disabled:opacity-40">−</button>
                              <span className="w-8 text-center font-semibold">{product.stock}</span>
                              <button type="button" aria-label={`Increase ${product.name} stock`} disabled={busyProductId === product.id} onClick={() => void changeStock(product, product.stock + 1)} className="grid size-8 place-items-center rounded-lg border border-slate-200">+</button>
                            </div>
                          </td>
                          <td className="py-3">
                            <button type="button" disabled={busyProductId === product.id} onClick={() => void deleteProduct(product)} className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {inventoryMessageText ? <p role="status" className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{inventoryMessageText}</p> : null}
            </section>
          </section>
        )}

        <section className="hidden print:block">
          <div className="mx-auto max-w-2xl p-8 text-black">
            <header className="border-b-2 border-black pb-4 text-center">
              <h1 className="text-2xl font-bold">YEIN STORE</h1>
              <p className="mt-2 text-lg font-semibold">{documentType}</p>
            </header>
            <div className="my-5 grid grid-cols-2 gap-2 text-sm">
              <p><strong>Customer:</strong> {customerName}</p>
              <p><strong>Phone:</strong> {customerPhone || "—"}</p>
              <p><strong>Date:</strong> {receiptDate || "—"}</p>
            </div>
            <table className="w-full border-collapse text-sm">
              <thead><tr className="border-y border-black"><th className="py-2 text-left">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit price</th><th className="py-2 text-right">Total</th></tr></thead>
              <tbody>{cart.map((item) => <tr key={item.id} className="border-b border-slate-300"><td className="py-2">{item.name}</td><td className="py-2 text-right">{item.quantity}</td><td className="py-2 text-right">{formatMMK(item.price)}</td><td className="py-2 text-right">{formatMMK(item.price * item.quantity)}</td></tr>)}</tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-3 text-right">Subtotal</td>
                  <td className="pt-3 text-right">{formatMMK(cartTotal)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="py-1 text-right">Discount</td>
                  <td className="py-1 text-right">−{formatMMK(appliedDiscount)}</td>
                </tr>
                <tr className="border-t border-black">
                  <td colSpan={3} className="py-3 text-right font-bold">NET TOTAL</td>
                  <td className="py-3 text-right font-bold">{formatMMK(netTotal)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-8 text-center text-xs">Thank you for choosing Yein Store.</p>
          </div>
        </section>

        <footer className="mt-8 flex items-center justify-center gap-1.5 pb-2 text-xs text-slate-400 print:hidden">
          <Printer size={13} />
          <span>Made for makers</span>
        </footer>
      </div>
    </main>
  );
}
