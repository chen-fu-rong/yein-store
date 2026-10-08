"use client";

import { useMemo, useState } from "react";
import { Clock3, MessageCircle, Printer, Send, Weight } from "lucide-react";

const filaments = [
  { id: 1, name: "Standard PLA", pricePerKg: 76000 },
  { id: 2, name: "Premium PETG/Silk", pricePerKg: 90000 },
];

const formatMMK = (amount: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);

const fieldClassName =
  "mt-2 h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";

export function PrintQuoteCalculator() {
  const [filamentId, setFilamentId] = useState(String(filaments[0].id));
  const [weight, setWeight] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");

  const estimate = useMemo(() => {
    if (weight.trim() === "" || hours.trim() === "" || minutes.trim() === "") {
      return null;
    }

    const weightInGrams = Number(weight);
    const printHours = Number(hours);
    const printMinutes = Number(minutes);

    if (
      !Number.isFinite(weightInGrams) ||
      !Number.isFinite(printHours) ||
      !Number.isFinite(printMinutes) ||
      weightInGrams <= 0 ||
      printHours < 0 ||
      printMinutes < 0 ||
      printMinutes > 59
    ) {
      return null;
    }

    const selectedFilament = filaments.find(
      (filament) => filament.id === Number(filamentId),
    );

    if (!selectedFilament) {
      return null;
    }

    const costPerGram = selectedFilament.pricePerKg / 1000;
    const totalTime = printHours + printMinutes / 60;
    const materialCost = weightInGrams * costPerGram;
    const timeCost = totalTime * (45 + 300);
    const baseCost = materialCost + timeCost + 1000;
    const trueCost = baseCost * 1.1;

    const exactPrice = trueCost * 2;
    const roundedPrice = Math.ceil(exactPrice / 500) * 500;

    return roundedPrice;
  }, [filamentId, hours, minutes, weight]);

  function createOrderMessage() {
    if (estimate === null) {
      return null;
    }

    const selectedFilament = filaments.find(
      (filament) => filament.id === Number(filamentId),
    );

    if (!selectedFilament) {
      return null;
    }

    return [
      "မင်္ဂလာပါ။ 3D Print အပ်ချင်လို့ပါ။",
      `- အမျိုးအစား: ${selectedFilament.name}`,
      `- အလေးချိန်: ${weight}g`,
      `- ကြာချိန်: ${hours}h ${minutes}m`,
      `- ခန့်မှန်းကုန်ကျငွေ: ${formatMMK(estimate)} ကျပ်`,
    ].join("\n");
  }

  function orderViaTelegram() {
    const message = createOrderMessage();
    if (message === null) return;

    window.open(
      `https://t.me/applingg?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function orderViaViber() {
    const message = createOrderMessage();
    if (message === null) return;

    window.open(
      `viber://chat?number=%2B9595104519&draft=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <section
      aria-labelledby="quote-calculator-title"
      className="mb-12 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/60"
    >
      <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
        <div className="relative isolate overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <div
            aria-hidden="true"
            className="absolute -right-16 -top-16 -z-10 size-64 rounded-full bg-indigo-500/20 blur-3xl"
          />
          <div className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-indigo-200">
            <Printer aria-hidden="true" className="size-6" />
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
            Made to your idea
          </p>
          <h2
            id="quote-calculator-title"
            className="mt-3 max-w-md text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Get a quick print estimate
          </h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-300 sm:text-base">
            Enter your model&apos;s estimated material and print time to see an
            upfront price. Your final quote can be confirmed after we review the
            design.
          </p>
          <div className="mt-7 flex flex-wrap gap-2 text-xs font-medium text-slate-200 sm:text-sm">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
              Clear estimate
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
              Custom colors
            </span>
          </div>
        </div>

        <div className="min-w-0 px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <div className="space-y-5">
            <div>
              <label
                htmlFor="quote-filament"
                className="text-sm font-semibold text-slate-800"
              >
                Filament
              </label>
              <select
                id="quote-filament"
                value={filamentId}
                onChange={(event) => setFilamentId(event.target.value)}
                className={fieldClassName}
              >
                {filaments.map((filament) => (
                  <option key={filament.id} value={filament.id}>
                    {filament.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="quote-weight"
                className="flex items-center gap-2 text-sm font-semibold text-slate-800"
              >
                <Weight aria-hidden="true" className="size-4 text-slate-500" />
                Estimated weight (grams)
              </label>
              <input
                id="quote-weight"
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                placeholder="e.g. 120"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                className={fieldClassName}
              />
            </div>

            <fieldset>
              <legend className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Clock3 aria-hidden="true" className="size-4 text-slate-500" />
                Estimated print time
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="quote-hours" className="sr-only">
                    Print time in hours
                  </label>
                  <div className="relative">
                    <input
                      id="quote-hours"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      placeholder="Hours"
                      value={hours}
                      onChange={(event) => setHours(event.target.value)}
                      className={`${fieldClassName} mt-0 pr-16`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-slate-400">
                      hours
                    </span>
                  </div>
                </div>
                <div>
                  <label htmlFor="quote-minutes" className="sr-only">
                    Print time in minutes
                  </label>
                  <div className="relative">
                    <input
                      id="quote-minutes"
                      type="number"
                      min="0"
                      max="59"
                      step="1"
                      inputMode="numeric"
                      placeholder="Minutes"
                      value={minutes}
                      onChange={(event) => setMinutes(event.target.value)}
                      className={`${fieldClassName} mt-0 pr-20`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-slate-400">
                      minutes
                    </span>
                  </div>
                </div>
              </div>
              {minutes !== "" && (Number(minutes) < 0 || Number(minutes) > 59) ? (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  Enter a minute value from 0 to 59.
                </p>
              ) : null}
            </fieldset>

            <div className="sticky bottom-3 z-10 rounded-2xl border border-indigo-100 bg-indigo-50/95 p-4 shadow-lg shadow-indigo-950/10 backdrop-blur sm:p-5 lg:static lg:shadow-none">
              <p className="text-sm font-medium text-slate-600">
                Total Estimated Price
              </p>
              <p
                aria-live="polite"
                className="mt-1 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl"
              >
                {estimate === null
                  ? "Enter details to see estimate"
                  : `${formatMMK(estimate)} MMK`}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={orderViaTelegram}
                  disabled={estimate === null}
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-center text-base font-semibold text-white shadow-md shadow-sky-600/20 transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send aria-hidden="true" className="size-5" />
                  Order via Telegram
                </button>
                <button
                  type="button"
                  onClick={orderViaViber}
                  disabled={estimate === null}
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-center text-base font-semibold text-white shadow-md shadow-violet-600/20 transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MessageCircle aria-hidden="true" className="size-5" />
                  Order via Viber
                </button>
              </div>
              <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                Estimate only. We&apos;ll confirm the final price after reviewing
                your model.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
