"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function CustomPrintPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [material, setMaterial] = useState("PLA");
  const [color, setColor] = useState("Black");
  const [notes, setNotes] = useState("");

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Custom print on demand
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">Request a custom 3D print</h1>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="rounded-md border border-slate-200 px-3 py-2 outline-none"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-md border border-slate-200 px-3 py-2 outline-none"
          />
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className="rounded-md border border-slate-200 px-3 py-2 outline-none"
          >
            <option value="PLA">PLA</option>
            <option value="PETG">PETG</option>
            <option value="ABS">ABS</option>
            <option value="TPU">TPU</option>
          </select>
          <select
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="rounded-md border border-slate-200 px-3 py-2 outline-none"
          >
            <option value="Black">Black</option>
            <option value="White">White</option>
            <option value="Blue">Blue</option>
            <option value="Red">Red</option>
          </select>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Project notes, dimensions, or special instructions"
          className="mt-5 min-h-32 w-full rounded-md border border-slate-200 px-3 py-2 outline-none"
        />

        <div className="mt-6">
          <Button variant="outline" className="min-h-12 w-full sm:w-auto">
            Request quote
          </Button>
        </div>
      </div>
    </main>
  );
}
