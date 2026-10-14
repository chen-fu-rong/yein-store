"use client";

export function ReceiptActions({ orderNumber }: { orderNumber: string }) {
  function sendToTelegram() {
    const message = `မင်္ဂလာပါ၊ အော်ဒါနံပါတ် ${orderNumber} အတွက် ငွေလွှဲအတည်ပြုရန် E-Voucher: ${window.location.href}`;
    window.open(
      `https://t.me/applingg?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
      >
        Print / Save PDF
      </button>
      <button
        type="button"
        onClick={sendToTelegram}
        className="rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-700"
      >
        Send to Yein Store (Telegram)
      </button>
    </div>
  );
}
