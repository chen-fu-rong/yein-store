"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
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
  UserRound,
  Wallet,
} from "lucide-react";

type OrderStatus = "Queued" | "Printing" | "Completed";

type Order = {
  id: string;
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

type InventoryState = "loading" | "live" | "fallback";

const MATERIALS_API_URL = "/api/bambuddy/materials";
const MOCK_MATERIALS: Spool[] = [
  { id: 1, name: "Bambu PLA Black", weightGrams: 1000, priceMMK: 76000, colorHex: "#000000" },
];
const ELECTRICITY_PER_HOUR = 45;
const MACHINE_WEAR_PER_HOUR = 300;
const SETUP_FEE = 1000;
const FAIL_RATE = 1.1;
const PROFIT_MARGIN = 2;

const initialOrders: Order[] = [
  { id: "YS-1048", customer: "Maya Lin", fileName: "Desk organizer.stl", price: 18_400, status: "Queued" },
  { id: "YS-1049", customer: "Ko Aung", fileName: "Camera mount v2.stl", price: 12_600, status: "Queued" },
  { id: "YS-1046", customer: "Thiri Win", fileName: "Planter set.stl", price: 26_800, status: "Printing" },
  { id: "YS-1047", customer: "Noah Chen", fileName: "Cable clips.stl", price: 8_200, status: "Printing" },
  { id: "YS-1044", customer: "Su Myat", fileName: "Miniature house.stl", price: 34_500, status: "Completed" },
  { id: "YS-1045", customer: "Ethan Oo", fileName: "Phone stand.stl", price: 9_600, status: "Completed" },
];

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
  timeCost,
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
  timeCost: number;
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
            <dt className="text-slate-500">Time &amp; Wear</dt>
            <dd className="font-medium text-slate-800">{formatMMK(timeCost, 2)}</dd>
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

      <button
        type="button"
        onClick={() => window.alert("Bambuddy upload and auto-slicing integration is coming soon.")}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200"
      >
        <Printer size={17} />
        Upload &amp; Auto Slice (via Bambuddy)
      </button>
    </section>
  );
}

function NewOrderForm({
  price,
  disabled,
  onCreateOrder,
}: {
  price: number;
  disabled: boolean;
  onCreateOrder: (customer: string, fileName: string) => void;
}) {
  const [customer, setCustomer] = useState("");
  const [fileName, setFileName] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreateOrder(customer.trim(), fileName.trim());
    setCustomer("");
    setFileName("");
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionHeading
          eyebrow="Start a job"
          title="New order"
          description="Add a customer and model to the print queue."
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
          <label htmlFor="customer-name" className="mb-2 block text-sm font-medium text-slate-700">
            Customer name
          </label>
          <div className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-100">
            <UserRound size={17} className="shrink-0 text-slate-400" />
            <input
              id="customer-name"
              type="text"
              autoComplete="name"
              required
              value={customer}
              onChange={(event) => setCustomer(event.target.value)}
              placeholder="e.g. Alex Morgan"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>
        <div>
          <label htmlFor="file-name" className="mb-2 block text-sm font-medium text-slate-700">
            File name
          </label>
          <div className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-100">
            <FileBox size={17} className="shrink-0 text-slate-400" />
            <input
              id="file-name"
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
          {disabled ? "Loading inventory…" : "Create order"}
        </button>
      </form>
    </section>
  );
}

function OrderCard({ order }: { order: Order }) {
  const style = statusStyles[order.status];

  return (
    <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[11px] font-medium text-slate-400">{order.id}</span>
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
    </article>
  );
}

function OrderBoard({ orders }: { orders: Order[] }) {
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
          {orders.length} active orders
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
                {columnOrders.length > 0 ? (
                  columnOrders.map((order) => <OrderCard key={order.id} order={order} />)
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                    No orders yet
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

export default function POSPage() {
  const [spools, setSpools] = useState<Spool[]>([]);
  const [selectedSpoolId, setSelectedSpoolId] = useState<number>(MOCK_MATERIALS[0].id);
  const [inventoryState, setInventoryState] = useState<InventoryState>("loading");
  const [inventoryMessage, setInventoryMessage] = useState("Connecting to Bambuddy.");
  const [weight, setWeight] = useState("120");
  const [hours, setHours] = useState("6");
  const [minutes, setMinutes] = useState("0");
  const [orders, setOrders] = useState(initialOrders);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSpools() {
      try {
        const response = await fetch(MATERIALS_API_URL, { signal: controller.signal });
        if (!response.ok) {
          const errorPayload: unknown = await response.json();
          const errorMessage =
            errorPayload &&
            typeof errorPayload === "object" &&
            "error" in errorPayload &&
            typeof errorPayload.error === "string"
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
  const timeCost = totalTimeInHours * (ELECTRICITY_PER_HOUR + MACHINE_WEAR_PER_HOUR);
  const baseCost = materialCost + timeCost + SETUP_FEE;
  const trueCost = baseCost * FAIL_RATE;
  const unroundedFinalPrice = trueCost * PROFIT_MARGIN;
  const finalPrice = Math.ceil(
    unroundedFinalPrice - Number.EPSILON * Math.max(1, Math.abs(unroundedFinalPrice)),
  );

  function createOrder(customer: string, fileName: string) {
    setOrders((currentOrders) => [
      {
        id: `YS-${1050 + currentOrders.length - initialOrders.length}`,
        customer,
        fileName,
        price: finalPrice,
        status: "Queued",
      },
      ...currentOrders,
    ]);
  }

  return (
    <main className="min-h-screen bg-[#f6f7f5] px-4 py-6 text-slate-900 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
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

        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Point of sale</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Production desk<span className="text-violet-500">.</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Estimate a print, create a new order, and keep your studio workflow moving.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <PricingCalculator
            spools={spools}
            selectedSpoolId={selectedSpoolId}
            inventoryState={inventoryState}
            inventoryMessage={inventoryMessage}
            weight={weight}
            hours={hours}
            minutes={minutes}
            materialCost={materialCost}
            timeCost={timeCost}
            finalPrice={finalPrice}
            onSpoolChange={setSelectedSpoolId}
            onWeightChange={setWeight}
            onHoursChange={setHours}
            onMinutesChange={setMinutes}
          />
          <NewOrderForm
            price={finalPrice}
            disabled={inventoryState === "loading" || spools.length === 0}
            onCreateOrder={createOrder}
          />
        </div>

        <OrderBoard orders={orders} />

        <footer className="mt-8 flex items-center justify-center gap-1.5 pb-2 text-xs text-slate-400">
          <Printer size={13} />
          <span>Made for makers</span>
        </footer>
      </div>
    </main>
  );
}
